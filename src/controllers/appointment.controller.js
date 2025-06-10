// src/controllers/appointment.controller.js - Controlador optimizado para producción
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { appointmentSchema, updateAppointmentSchema } from '../validators/appointment.validators.js';
import { notificationService } from '../services/notificationService.js';

const prisma = new PrismaClient();

// Selects optimizados para consultas frecuentes
const APPOINTMENT_BASE_SELECT = {
  id: true,
  date: true,
  time: true,
  status: true,
  notes: true,
  originalPrice: true,
  finalPrice: true,
  vipDiscount: true,
  createdAt: true,
  updatedAt: true,
  cancelledAt: true,
  completedAt: true,
  cancelReason: true
};

const SERVICE_SELECT = {
  id: true,
  name: true,
  price: true,
  duration: true,
  vipDiscount: true,
  isActive: true
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true
};

const CLINIC_SELECT = {
  id: true,
  name: true,
  primaryColor: true,
  address: true,
  phone: true
};

const VIP_SUBSCRIPTION_WHERE = {
  status: 'ACTIVE',
  endDate: { gte: new Date() }
};

// Funciones de utilidad optimizadas
const buildAppointmentWhere = (filters) => {
  const where = {};
  
  if (filters.clinicId) where.clinicId = filters.clinicId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.status) where.status = filters.status;
  if (filters.serviceId) where.serviceId = filters.serviceId;
  
  if (filters.date) {
    const startDate = new Date(filters.date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    where.date = { gte: startDate, lt: endDate };
  }
  
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
  }
  
  if (filters.upcoming) {
    where.date = { gte: new Date() };
  }
  
  return where;
};

const calculateVIPPrice = (originalPrice, vipDiscount) => {
  if (!vipDiscount || vipDiscount <= 0) return { finalPrice: originalPrice, vipDiscount: 0 };
  return {
    finalPrice: originalPrice * (1 - vipDiscount / 100),
    vipDiscount
  };
};

const checkUserVIPStatus = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      vipSubscriptions: {
        where: VIP_SUBSCRIPTION_WHERE,
        select: { id: true },
        take: 1
      }
    }
  });
  return user?.vipSubscriptions?.length > 0;
};

const validateServiceExists = async (serviceId, clinicId) => {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, clinicId, isActive: true },
    select: SERVICE_SELECT
  });
  return service;
};

const checkTimeAvailability = async (date, time, clinicId, excludeId = null) => {
  const appointmentDateTime = new Date(`${date}T${time}:00`);
  
  const where = {
    date: appointmentDateTime,
    time,
    clinicId,
    status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
  };
  
  if (excludeId) where.id = { not: excludeId };
  
  const existingAppointment = await prisma.appointment.findFirst({
    where,
    select: { id: true }
  });
  
  return !existingAppointment;
};

export const appointmentController = {
  create: async (req, res) => {
    try {
      const validationResult = appointmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      const { date, time, serviceId, notes } = validationResult.data;
      const { userId, clinicId } = req;

      // Validaciones paralelas
      const [service, isAvailable, isVIP] = await Promise.all([
        validateServiceExists(serviceId, clinicId),
        checkTimeAvailability(date, time, clinicId),
        checkUserVIPStatus(userId)
      ]);

      if (!service) {
        return res.status(404).json({
          success: false,
          error: 'Servicio no encontrado o no disponible'
        });
      }

      if (!isAvailable) {
        return res.status(409).json({
          success: false,
          error: 'Horario no disponible'
        });
      }

      const appointmentDateTime = new Date(`${date}T${time}:00`);
      if (appointmentDateTime <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'La fecha debe ser futura'
        });
      }

      const pricing = calculateVIPPrice(service.price, isVIP ? service.vipDiscount : 0);

      const appointment = await prisma.appointment.create({
        data: {
          date: appointmentDateTime,
          time,
          notes,
          userId,
          serviceId,
          clinicId,
          originalPrice: service.price,
          finalPrice: pricing.finalPrice,
          vipDiscount: pricing.vipDiscount
        },
        select: {
          ...APPOINTMENT_BASE_SELECT,
          service: { select: SERVICE_SELECT },
          user: { select: USER_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      // Notificación asíncrona no bloqueante
      notificationService.sendAppointmentConfirmation(appointment)
        .catch(err => logger.warn('Error enviando notificación:', err));

      logger.info(`Cita creada: ${appointment.id} para usuario ${userId}`);

      res.status(201).json({
        success: true,
        message: 'Cita creada exitosamente',
        data: { appointment }
      });

    } catch (error) {
      logger.error('Error creando cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getUserAppointments: async (req, res) => {
    try {
      const { status, upcoming, page = 1, limit = 10 } = req.query;
      const { userId, clinicId } = req;

      const where = buildAppointmentWhere({ 
        userId, 
        clinicId: clinicId || undefined, 
        status, 
        upcoming 
      });

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          select: {
            ...APPOINTMENT_BASE_SELECT,
            service: { select: SERVICE_SELECT },
            clinic: { select: CLINIC_SELECT }
          },
          orderBy: { date: 'desc' },
          skip,
          take
        }),
        prisma.appointment.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          appointments,
          pagination: {
            page: parseInt(page),
            limit: take,
            total,
            pages: Math.ceil(total / take)
          }
        }
      });

    } catch (error) {
      logger.error('Error obteniendo citas del usuario:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getAll: async (req, res) => {
    try {
      const { date, status, userId: searchUserId, page = 1, limit = 20 } = req.query;
      const { clinicId } = req;

      const where = buildAppointmentWhere({ 
        clinicId, 
        date, 
        status, 
        userId: searchUserId 
      });

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          select: {
            ...APPOINTMENT_BASE_SELECT,
            service: { select: SERVICE_SELECT },
            user: { 
              select: {
                ...USER_SELECT,
                vipSubscriptions: {
                  where: VIP_SUBSCRIPTION_WHERE,
                  select: { id: true },
                  take: 1
                }
              }
            }
          },
          orderBy: [{ date: 'asc' }, { time: 'asc' }],
          skip,
          take
        }),
        prisma.appointment.count({ where })
      ]);

      // Añadir isVIP calculado
      const appointmentsWithVIP = appointments.map(apt => ({
        ...apt,
        user: {
          ...apt.user,
          isVIP: apt.user.vipSubscriptions?.length > 0,
          vipSubscriptions: undefined
        }
      }));

      res.json({
        success: true,
        data: {
          appointments: appointmentsWithVIP,
          pagination: {
            page: parseInt(page),
            limit: take,
            total,
            pages: Math.ceil(total / take)
          }
        }
      });

    } catch (error) {
      logger.error('Error obteniendo todas las citas:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, userRole, clinicId } = req;

      const where = { id };
      if (userRole === 'CLIENTE') {
        where.userId = userId;
      } else if (clinicId) {
        where.clinicId = clinicId;
      }

      const appointment = await prisma.appointment.findFirst({
        where,
        select: {
          ...APPOINTMENT_BASE_SELECT,
          service: { select: SERVICE_SELECT },
          user: { 
            select: {
              ...USER_SELECT,
              vipSubscriptions: {
                where: VIP_SUBSCRIPTION_WHERE,
                select: { id: true },
                take: 1
              }
            }
          },
          clinic: { select: CLINIC_SELECT }
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      // Formatear respuesta
      const formattedAppointment = {
        ...appointment,
        user: {
          ...appointment.user,
          isVIP: appointment.user.vipSubscriptions?.length > 0,
          vipSubscriptions: undefined
        }
      };

      res.json({
        success: true,
        data: { appointment: formattedAppointment }
      });

    } catch (error) {
      logger.error('Error obteniendo cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, userRole } = req;

      const validationResult = updateAppointmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      const existingAppointment = await prisma.appointment.findUnique({
        where: { id },
        select: { 
          id: true, 
          userId: true, 
          clinicId: true, 
          date: true, 
          time: true,
          serviceId: true
        }
      });

      if (!existingAppointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      if (userRole === 'CLIENTE' && existingAppointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para modificar esta cita'
        });
      }

      const { date, time, serviceId, notes, status } = validationResult.data;
      const updateData = {};

      if (status && ['ADMIN', 'STAFF'].includes(userRole)) {
        updateData.status = status;
      }

      // Validaciones de fecha/hora si hay cambios
      if (date || time) {
        const newDate = date || existingAppointment.date.toISOString().split('T')[0];
        const newTime = time || existingAppointment.time;
        
        if (newDate !== existingAppointment.date.toISOString().split('T')[0] || 
            newTime !== existingAppointment.time) {
          
          const isAvailable = await checkTimeAvailability(
            newDate, 
            newTime, 
            existingAppointment.clinicId, 
            id
          );
          
          if (!isAvailable) {
            return res.status(409).json({
              success: false,
              error: 'Horario no disponible'
            });
          }
        }

        if (date) updateData.date = new Date(`${date}T${newTime}:00`);
        if (time) updateData.time = time;
      }

      // Actualizar servicio y recalcular precios
      if (serviceId && serviceId !== existingAppointment.serviceId) {
        const [service, isVIP] = await Promise.all([
          validateServiceExists(serviceId, existingAppointment.clinicId),
          checkUserVIPStatus(existingAppointment.userId)
        ]);

        if (!service) {
          return res.status(404).json({
            success: false,
            error: 'Servicio no encontrado'
          });
        }

        updateData.serviceId = serviceId;
        updateData.originalPrice = service.price;
        
        const pricing = calculateVIPPrice(service.price, isVIP ? service.vipDiscount : 0);
        updateData.finalPrice = pricing.finalPrice;
        updateData.vipDiscount = pricing.vipDiscount;
      }

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay datos para actualizar'
        });
      }

      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        select: {
          ...APPOINTMENT_BASE_SELECT,
          service: { select: SERVICE_SELECT },
          user: { select: USER_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      logger.info(`Cita actualizada: ${id} por usuario ${userId}`);

      res.json({
        success: true,
        message: 'Cita actualizada exitosamente',
        data: { appointment: updatedAppointment }
      });

    } catch (error) {
      logger.error('Error actualizando cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  cancel: async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const { userId, userRole } = req;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: {
          ...APPOINTMENT_BASE_SELECT,
          userId: true,
          status: true,
          service: { select: SERVICE_SELECT },
          user: { select: USER_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      if (userRole === 'CLIENTE' && appointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para cancelar esta cita'
        });
      }

      if (appointment.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          error: 'La cita ya está cancelada'
        });
      }

      if (appointment.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: 'No se puede cancelar una cita completada'
        });
      }

      const cancelledAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason || 'No especificado'
        },
        select: {
          ...APPOINTMENT_BASE_SELECT,
          service: { select: SERVICE_SELECT },
          user: { select: USER_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      // Notificación asíncrona
      notificationService.sendAppointmentCancellation(cancelledAppointment)
        .catch(err => logger.warn('Error enviando notificación de cancelación:', err));

      logger.info(`Cita cancelada: ${id} por usuario ${userId}`);

      res.json({
        success: true,
        message: 'Cita cancelada exitosamente',
        data: { appointment: cancelledAppointment }
      });

    } catch (error) {
      logger.error('Error cancelando cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  sendReminder: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, userRole } = req;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          status: true,
          user: { select: USER_SELECT },
          service: { select: SERVICE_SELECT },
          clinic: { select: CLINIC_SELECT },
          date: true,
          time: true
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      if (userRole === 'CLIENTE' && appointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para enviar recordatorio de esta cita'
        });
      }

      if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
        return res.status(400).json({
          success: false,
          error: 'Solo se pueden enviar recordatorios de citas programadas o confirmadas'
        });
      }

      try {
        await notificationService.sendAppointmentReminder(appointment);
        logger.info(`Recordatorio enviado para cita: ${id}`);
        
        res.json({
          success: true,
          message: 'Recordatorio enviado exitosamente'
        });
      } catch (notificationError) {
        logger.error('Error enviando recordatorio:', notificationError);
        res.status(500).json({
          success: false,
          error: 'Error enviando recordatorio'
        });
      }

    } catch (error) {
      logger.error('Error enviando recordatorio:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  search: async (req, res) => {
    try {
      const {
        query,
        status,
        dateFrom,
        dateTo,
        serviceId,
        userId: searchUserId,
        page = 1,
        limit = 20
      } = req.query;
      
      const { userId, userRole, clinicId } = req;

      const where = buildAppointmentWhere({
        clinicId,
        userId: userRole === 'CLIENTE' ? userId : searchUserId,
        status,
        serviceId,
        dateFrom,
        dateTo
      });

      if (query) {
        where.OR = [
          { service: { name: { contains: query, mode: 'insensitive' } } },
          { user: { name: { contains: query, mode: 'insensitive' } } },
          { notes: { contains: query, mode: 'insensitive' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          select: {
            ...APPOINTMENT_BASE_SELECT,
            service: { select: SERVICE_SELECT },
            user: { 
              select: {
                ...USER_SELECT,
                vipSubscriptions: {
                  where: VIP_SUBSCRIPTION_WHERE,
                  select: { id: true },
                  take: 1
                }
              }
            },
            clinic: { select: CLINIC_SELECT }
          },
          orderBy: [{ date: 'desc' }, { time: 'desc' }],
          skip,
          take
        }),
        prisma.appointment.count({ where })
      ]);

      const appointmentsWithVIP = appointments.map(apt => ({
        ...apt,
        user: {
          ...apt.user,
          isVIP: apt.user.vipSubscriptions?.length > 0,
          vipSubscriptions: undefined
        }
      }));

      res.json({
        success: true,
        data: {
          appointments: appointmentsWithVIP,
          pagination: {
            page: parseInt(page),
            limit: take,
            total,
            pages: Math.ceil(total / take)
          },
          filters: { query, status, dateFrom, dateTo, serviceId, userId: searchUserId }
        }
      });

    } catch (error) {
      logger.error('Error buscando citas:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  reschedule: async (req, res) => {
    try {
      const { id } = req.params;
      const { newDate, newTime, reason } = req.body;
      const { userId, userRole } = req;

      if (!newDate || !newTime) {
        return res.status(400).json({
          success: false,
          error: 'Nueva fecha y hora son requeridas'
        });
      }

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          clinicId: true,
          date: true,
          time: true,
          user: { select: USER_SELECT },
          service: { select: SERVICE_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      if (userRole === 'CLIENTE' && appointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para reprogramar esta cita'
        });
      }

      const newAppointmentDateTime = new Date(`${newDate}T${newTime}:00`);
      if (newAppointmentDateTime <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'La nueva fecha debe ser futura'
        });
      }

      const isAvailable = await checkTimeAvailability(newDate, newTime, appointment.clinicId, id);
      if (!isAvailable) {
        return res.status(409).json({
          success: false,
          error: 'El nuevo horario no está disponible'
        });
      }

      const rescheduledAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          date: newAppointmentDateTime,
          time: newTime,
          status: 'SCHEDULED'
        },
        select: {
          ...APPOINTMENT_BASE_SELECT,
          service: { select: SERVICE_SELECT },
          user: { select: USER_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      // Notificación asíncrona
      notificationService.sendAppointmentReschedule(rescheduledAppointment, {
        oldDate: appointment.date,
        oldTime: appointment.time
      }).catch(err => logger.warn('Error enviando notificación de reprogramación:', err));

      logger.info(`Cita reprogramada: ${id} por usuario ${userId}`);

      res.json({
        success: true,
        message: 'Cita reprogramada exitosamente',
        data: { appointment: rescheduledAppointment }
      });

    } catch (error) {
      logger.error('Error reprogramando cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  checkAvailability: async (req, res) => {
    try {
      const { date, time, serviceId } = req.body;
      const { clinicId } = req;

      if (!date || !time || !serviceId) {
        return res.status(400).json({
          success: false,
          error: 'Fecha, hora y servicio son requeridos'
        });
      }

      const [service, isAvailable] = await Promise.all([
        validateServiceExists(serviceId, clinicId),
        checkTimeAvailability(date, time, clinicId)
      ]);

      if (!service) {
        return res.status(404).json({
          success: false,
          error: 'Servicio no encontrado'
        });
      }

      let alternativeSlots = [];
      if (!isAvailable) {
        // Obtener alternativas optimizadas
        const [clinic, dayAppointments] = await Promise.all([
          prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { openTime: true, closeTime: true }
          }),
          prisma.appointment.findMany({
            where: {
              clinicId,
              date: {
                gte: new Date(date),
                lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000)
              },
              status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
            },
            select: { time: true }
          })
        ]);

        const bookedTimes = new Set(dayAppointments.map(apt => apt.time));
        const [openHour] = clinic.openTime.split(':').map(Number);
        const [closeHour] = clinic.closeTime.split(':').map(Number);

        for (let hour = openHour; hour < closeHour && alternativeSlots.length < 6; hour++) {
          for (let minute = 0; minute < 60 && alternativeSlots.length < 6; minute += 30) {
            const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            if (!bookedTimes.has(timeSlot) && timeSlot !== time) {
              alternativeSlots.push(timeSlot);
            }
          }
        }
      }

      res.json({
        success: true,
        data: {
          isAvailable,
          requestedSlot: { date, time },
          service: { name: service.name, duration: service.duration },
          ...(alternativeSlots.length > 0 && { alternativeSlots })
        }
      });

    } catch (error) {
      logger.error('Error verificando disponibilidad:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getAvailableSlots: async (req, res) => {
    try {
      const { date, serviceId } = req.query;
      const { clinicId } = req;

      if (!date || !serviceId) {
        return res.status(400).json({
          success: false,
          error: 'Fecha y servicio son requeridos'
        });
      }

      const [service, clinic, dayAppointments] = await Promise.all([
        validateServiceExists(serviceId, clinicId),
        prisma.clinic.findUnique({
          where: { id: clinicId },
          select: { 
            openTime: true, 
            closeTime: true, 
            workingDays: true 
          }
        }),
        prisma.appointment.findMany({
          where: {
            clinicId,
            date: {
              gte: new Date(date),
              lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000)
            },
            status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
          },
          select: { time: true }
        })
      ]);

      if (!service) {
        return res.status(404).json({
          success: false,
          error: 'Servicio no encontrado'
        });
      }

      const requestedDate = new Date(date);
      const dayOfWeek = requestedDate.getDay();
      const workingDays = clinic.workingDays ? 
        clinic.workingDays.split(',').map(d => parseInt(d)) : 
        [1, 2, 3, 4, 5];

      if (!workingDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek)) {
        return res.json({
          success: true,
          data: { availableSlots: [] }
        });
      }

      const bookedTimes = new Set(dayAppointments.map(apt => apt.time));
      const availableSlots = [];
      
      const openTime = clinic.openTime || "09:00";
      const closeTime = clinic.closeTime || "18:00";
      const [openHour, openMinute] = openTime.split(':').map(Number);
      const [closeHour, closeMinute] = closeTime.split(':').map(Number);
      const serviceDuration = service.duration || 60;
      const slotInterval = 30;

      let currentHour = openHour;
      let currentMinute = openMinute;

      while (currentHour < closeHour || (currentHour === closeHour && currentMinute < closeMinute)) {
        const timeSlot = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
        
        if (!bookedTimes.has(timeSlot)) {
          const slotEndMinutes = currentHour * 60 + currentMinute + serviceDuration;
          const closeMinutes = closeHour * 60 + closeMinute;
          
          if (slotEndMinutes <= closeMinutes) {
            availableSlots.push(timeSlot);
          }
        }
        
        currentMinute += slotInterval;
        if (currentMinute >= 60) {
          currentHour++;
          currentMinute = 0;
        }
      }

      res.json({
        success: true,
        data: { availableSlots }
      });

    } catch (error) {
      logger.error('Error obteniendo horarios disponibles:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getStats: async (req, res) => {
    try {
      const { period = 'month' } = req.query;
      const { userId, userRole, clinicId } = req;

      let startDate = new Date();
      switch (period) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(startDate.getMonth() - 1);
      }

      const where = {
        createdAt: { gte: startDate },
        ...(userRole === 'CLIENTE' ? { userId } : { clinicId })
      };

      const [stats, nextAppointment] = await Promise.all([
        Promise.all([
          prisma.appointment.count({ where }),
          prisma.appointment.count({ where: { ...where, status: 'COMPLETED' } }),
          prisma.appointment.count({ where: { ...where, status: 'CANCELLED' } }),
          prisma.appointment.count({ where: { ...where, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
          prisma.appointment.aggregate({
            where: { ...where, status: 'COMPLETED' },
            _sum: { finalPrice: true }
          })
        ]),
        prisma.appointment.findFirst({
          where: {
            ...(userRole === 'CLIENTE' ? { userId } : { clinicId }),
            date: { gte: new Date() },
            status: { in: ['SCHEDULED', 'CONFIRMED'] }
          },
          select: {
            ...APPOINTMENT_BASE_SELECT,
            service: { select: SERVICE_SELECT },
            ...(userRole !== 'CLIENTE' && {
              user: { select: { name: true, phone: true } }
            })
          },
          orderBy: { date: 'asc' }
        })
      ]);

      const [total, completed, cancelled, scheduled, revenue] = stats;

      res.json({
        success: true,
        data: {
          stats: {
            total,
            completed,
            cancelled,
            scheduled,
            revenue: revenue._sum.finalPrice || 0,
            completionRate: total > 0 ? (completed / total * 100).toFixed(1) : 0
          },
          nextAppointment,
          period
        }
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getDetailedStats: async (req, res) => {
    try {
      const { period = 'month', compareWith } = req.query;
      const { userId, userRole, clinicId } = req;

      let startDate = new Date();
      const endDate = new Date();

      switch (period) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(startDate.getMonth() - 1);
      }

      const where = {
        date: { gte: startDate, lte: endDate },
        ...(userRole === 'CLIENTE' ? { userId } : { clinicId })
      };

      const [totalAppointments, appointmentsByStatus, completedAppointments] = await Promise.all([
        prisma.appointment.count({ where }),
        prisma.appointment.groupBy({
          by: ['status'],
          where,
          _count: { status: true }
        }),
        prisma.appointment.findMany({
          where: { ...where, status: 'COMPLETED' },
          select: {
            finalPrice: true,
            service: { select: { name: true, price: true } }
          }
        })
      ]);

      const serviceStats = {};
      completedAppointments.forEach(apt => {
        const serviceName = apt.service.name;
        if (!serviceStats[serviceName]) {
          serviceStats[serviceName] = { count: 0, revenue: 0, name: serviceName };
        }
        serviceStats[serviceName].count++;
        serviceStats[serviceName].revenue += apt.finalPrice || 0;
      });

      const topServices = Object.values(serviceStats)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const cancelledCount = appointmentsByStatus.find(s => s.status === 'CANCELLED')?._count.status || 0;
      const completedCount = appointmentsByStatus.find(s => s.status === 'COMPLETED')?._count.status || 0;

      let comparison = null;
      if (compareWith) {
        const compareStartDate = new Date(startDate);
        const compareEndDate = new Date(endDate);
        const diff = endDate - startDate;
        
        compareEndDate.setTime(startDate.getTime());
        compareStartDate.setTime(startDate.getTime() - diff);

        const compareWhere = {
          ...where,
          date: { gte: compareStartDate, lte: compareEndDate }
        };

        const [compareTotal, compareRevenue] = await Promise.all([
          prisma.appointment.count({ where: compareWhere }),
          prisma.appointment.aggregate({
            where: { ...compareWhere, status: 'COMPLETED' },
            _sum: { finalPrice: true }
          })
        ]);

        const currentRevenue = topServices.reduce((sum, service) => sum + service.revenue, 0);
        const previousRevenue = compareRevenue._sum.finalPrice || 0;

        comparison = {
          period: compareWith,
          appointments: {
            current: totalAppointments,
            previous: compareTotal,
            change: compareTotal > 0 ? ((totalAppointments - compareTotal) / compareTotal * 100).toFixed(1) : 0
          },
          revenue: {
            current: currentRevenue,
            previous: previousRevenue,
            change: previousRevenue > 0 ? (((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1) : 0
          }
        };
      }

      res.json({
        success: true,
        data: {
          period,
          totalAppointments,
          appointmentsByStatus: appointmentsByStatus.reduce((acc, item) => {
            acc[item.status] = item._count.status;
            return acc;
          }, {}),
          topServices,
          metrics: {
            cancelationRate: totalAppointments > 0 ? (cancelledCount / totalAppointments * 100).toFixed(1) : 0,
            completionRate: completedCount,
            totalRevenue: topServices.reduce((sum, service) => sum + service.revenue, 0)
          },
          comparison
        }
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas detalladas:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  confirm: async (req, res) => {
    try {
      const { id } = req.params;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: { id: true, status: true }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      if (appointment.status !== 'SCHEDULED') {
        return res.status(400).json({
          success: false,
          error: 'Solo se pueden confirmar citas programadas'
        });
      }

      const confirmedAppointment = await prisma.appointment.update({
        where: { id },
        data: { status: 'CONFIRMED' },
        select: {
          ...APPOINTMENT_BASE_SELECT,
          service: { select: SERVICE_SELECT },
          user: { select: USER_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      notificationService.sendAppointmentConfirmation(confirmedAppointment)
        .catch(err => logger.warn('Error enviando notificación de confirmación:', err));

      res.json({
        success: true,
        message: 'Cita confirmada exitosamente',
        data: { appointment: confirmedAppointment }
      });

    } catch (error) {
      logger.error('Error confirmando cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  complete: async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: { id: true, status: true, notes: true }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      if (!['CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)) {
        return res.status(400).json({
          success: false,
          error: 'Solo se pueden completar citas confirmadas o en progreso'
        });
      }

      const completedAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          notes: notes || appointment.notes,
          completedAt: new Date()
        },
        select: {
          ...APPOINTMENT_BASE_SELECT,
          service: { select: SERVICE_SELECT },
          user: { select: USER_SELECT },
          clinic: { select: CLINIC_SELECT }
        }
      });

      logger.info(`Cita completada: ${id}`);

      res.json({
        success: true,
        message: 'Cita completada exitosamente',
        data: { appointment: completedAppointment }
      });

    } catch (error) {
      logger.error('Error completando cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getHistory: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, userRole } = req;

      const appointment = await prisma.appointment.findFirst({
        where: {
          id,
          ...(userRole === 'CLIENTE' ? { userId } : {})
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          cancelledAt: true,
          completedAt: true,
          cancelReason: true
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      const history = [{
        action: 'CREATED',
        timestamp: appointment.createdAt,
        details: 'Cita creada',
        user: 'Sistema'
      }];

      if (appointment.status === 'CANCELLED') {
        history.push({
          action: 'CANCELLED',
          timestamp: appointment.cancelledAt || appointment.updatedAt,
          details: appointment.cancelReason || 'Cita cancelada',
          user: 'Usuario'
        });
      }

      if (appointment.status === 'COMPLETED') {
        history.push({
          action: 'COMPLETED',
          timestamp: appointment.completedAt || appointment.updatedAt,
          details: 'Cita completada',
          user: 'Staff'
        });
      }

      res.json({
        success: true,
        data: {
          appointmentId: id,
          history: history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        }
      });

    } catch (error) {
      logger.error('Error obteniendo historial de cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  generateVideoLink: async (req, res) => {
    try {
      const { id } = req.params;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: {
          id: true,
          service: { select: { name: true } },
          user: { select: { name: true } }
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      const videoLink = `https://meet.clinica.com/room/${id}`;

      res.json({
        success: true,
        data: {
          videoLink,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          instructions: 'El enlace estará disponible 15 minutos antes de la cita'
        }
      });

    } catch (error) {
      logger.error('Error generando enlace de video:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  export: async (req, res) => {
    try {
      const { format = 'pdf', ...filters } = req.query;
      const { userId, userRole, clinicId } = req;

      const where = buildAppointmentWhere({
        ...(userRole === 'CLIENTE' ? { userId } : { clinicId }),
        ...filters
      });

      const appointmentCount = await prisma.appointment.count({ where });

      res.json({
        success: true,
        data: {
          downloadUrl: `/api/exports/appointments-${Date.now()}.${format}`,
          appointments: appointmentCount,
          format,
          generatedAt: new Date()
        }
      });

    } catch (error) {
      logger.error('Error exportando citas:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  test: async (req, res) => {
    try {
      const { endpoint } = req.params;

      const tests = {
        'create': 'POST /appointments - Crear cita',
        'list': 'GET /appointments - Listar citas',
        'get': 'GET /appointments/:id - Obtener cita',
        'update': 'PUT /appointments/:id - Actualizar cita',
        'cancel': 'POST /appointments/:id/cancel - Cancelar cita',
        'available': 'GET /appointments/available - Horarios disponibles',
        'stats': 'GET /appointments/stats - Estadísticas',
        'reminder': 'POST /appointments/:id/reminder - Enviar recordatorio',
        'search': 'GET /appointments/search - Buscar citas',
        'reschedule': 'POST /appointments/:id/reschedule - Reprogramar cita'
      };

      res.json({
        success: true,
        data: {
          endpoint: endpoint || 'all',
          availableEndpoints: tests,
          version: '1.0.0',
          timestamp: new Date()
        }
      });

    } catch (error) {
      logger.error('Error en test de appointments:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  }
};