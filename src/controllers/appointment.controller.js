// src/controllers/appointment.controller.js - CONTROLADOR COMPLETO PARA PRODUCCIÓN
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { appointmentSchema, updateAppointmentSchema } from '../validators/appointment.validators.js';
import { notificationService } from '../services/notificationService.js';

const prisma = new PrismaClient();

export const appointmentController = {
  // ===============================
  // MÉTODOS BÁSICOS
  // ===============================

  // Crear nueva cita
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
      const userId = req.userId;
      const clinicId = req.clinicId;

      // Verificar que el servicio existe y pertenece a la clínica
      const service = await prisma.service.findFirst({
        where: {
          id: serviceId,
          clinicId: clinicId,
          isActive: true
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          error: 'Servicio no encontrado o no disponible'
        });
      }

      // Verificar disponibilidad del horario
      const appointmentDateTime = new Date(`${date}T${time}:00`);
      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          date: appointmentDateTime,
          time: time,
          clinicId: clinicId,
          status: {
            in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']
          }
        }
      });

      if (existingAppointment) {
        return res.status(409).json({
          success: false,
          error: 'Horario no disponible'
        });
      }

      // Verificar que la fecha sea futura
      if (appointmentDateTime <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'La fecha debe ser futura'
        });
      }

      // Calcular precios
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          vipSubscriptions: {
            where: {
              status: 'ACTIVE',
              endDate: { gte: new Date() }
            }
          }
        }
      });

      const isVIP = user.vipSubscriptions.length > 0;
      const originalPrice = service.price;
      let finalPrice = originalPrice;
      let vipDiscount = 0;

      if (isVIP && service.vipDiscount > 0) {
        vipDiscount = service.vipDiscount;
        finalPrice = originalPrice * (1 - vipDiscount / 100);
      }

      // Crear la cita
      const appointment = await prisma.appointment.create({
        data: {
          date: appointmentDateTime,
          time,
          notes,
          userId,
          serviceId,
          clinicId,
          originalPrice,
          finalPrice,
          vipDiscount
        },
        include: {
          service: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          clinic: true
        }
      });

      // Enviar notificación de confirmación
      try {
        await notificationService.sendAppointmentConfirmation(appointment);
      } catch (notificationError) {
        logger.warn('Error enviando notificación:', notificationError);
      }

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

  // Obtener citas del usuario
  getUserAppointments: async (req, res) => {
    try {
      const { status, upcoming, page = 1, limit = 10 } = req.query;
      const userId = req.userId;

      const where = {
        userId,
        ...(req.clinicId && { clinicId: req.clinicId })
      };

      // Filtros
      if (status) {
        where.status = status;
      }

      if (upcoming === 'true') {
        where.date = { gte: new Date() };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          include: {
            service: true,
            clinic: {
              select: {
                id: true,
                name: true,
                primaryColor: true
              }
            }
          },
          orderBy: { date: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.appointment.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          appointments,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
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

  // Obtener todas las citas (para staff/admin)
  getAll: async (req, res) => {
    try {
      const { date, status, userId, page = 1, limit = 20 } = req.query;
      const clinicId = req.clinicId;

      const where = {
        clinicId
      };

      // Filtros
      if (date) {
        const startDate = new Date(date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        
        where.date = {
          gte: startDate,
          lt: endDate
        };
      }

      if (status) {
        where.status = status;
      }

      if (userId) {
        where.userId = userId;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          include: {
            service: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isVIP: true
              }
            }
          },
          orderBy: [
            { date: 'asc' },
            { time: 'asc' }
          ],
          skip,
          take: parseInt(limit)
        }),
        prisma.appointment.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          appointments,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
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

  // Obtener cita por ID
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;

      const where = { id };

      // Si es cliente, solo puede ver sus propias citas
      if (userRole === 'CLIENTE') {
        where.userId = userId;
      } else if (req.clinicId) {
        where.clinicId = req.clinicId;
      }

      const appointment = await prisma.appointment.findFirst({
        where,
        include: {
          service: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isVIP: true
            }
          },
          clinic: true
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      res.json({
        success: true,
        data: { appointment }
      });

    } catch (error) {
      logger.error('Error obteniendo cita:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  // Actualizar cita
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;

      const validationResult = updateAppointmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      // Verificar que la cita existe
      const existingAppointment = await prisma.appointment.findUnique({
        where: { id }
      });

      if (!existingAppointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      // Verificar permisos
      if (userRole === 'CLIENTE' && existingAppointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para modificar esta cita'
        });
      }

      const { date, time, serviceId, notes, status } = validationResult.data;
      const updateData = {};

      // Solo staff/admin pueden cambiar el estado
      if (status && ['ADMIN', 'STAFF'].includes(userRole)) {
        updateData.status = status;
      }

      // Validaciones para cambios de fecha/hora
      if (date || time) {
        const newDate = date ? new Date(`${date}T${time || existingAppointment.time}:00`) : 
                              new Date(`${existingAppointment.date.toISOString().split('T')[0]}T${time}:00`);

        // Verificar disponibilidad si hay cambio de fecha/hora
        if (date !== existingAppointment.date.toISOString().split('T')[0] || 
            time !== existingAppointment.time) {
          
          const conflictingAppointment = await prisma.appointment.findFirst({
            where: {
              id: { not: id },
              date: newDate,
              time: time || existingAppointment.time,
              clinicId: existingAppointment.clinicId,
              status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
            }
          });

          if (conflictingAppointment) {
            return res.status(409).json({
              success: false,
              error: 'Horario no disponible'
            });
          }
        }

        if (date) updateData.date = newDate;
        if (time) updateData.time = time;
      }

      if (serviceId) {
        // Verificar que el servicio existe
        const service = await prisma.service.findFirst({
          where: {
            id: serviceId,
            clinicId: existingAppointment.clinicId,
            isActive: true
          }
        });

        if (!service) {
          return res.status(404).json({
            success: false,
            error: 'Servicio no encontrado'
          });
        }

        updateData.serviceId = serviceId;
        
        // Recalcular precios si cambia el servicio
        const user = await prisma.user.findUnique({
          where: { id: existingAppointment.userId },
          include: {
            vipSubscriptions: {
              where: {
                status: 'ACTIVE',
                endDate: { gte: new Date() }
              }
            }
          }
        });

        const isVIP = user.vipSubscriptions.length > 0;
        updateData.originalPrice = service.price;
        updateData.finalPrice = service.price;
        updateData.vipDiscount = 0;

        if (isVIP && service.vipDiscount > 0) {
          updateData.vipDiscount = service.vipDiscount;
          updateData.finalPrice = service.price * (1 - service.vipDiscount / 100);
        }
      }

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      // Actualizar cita
      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: {
          service: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          clinic: true
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

  // Cancelar cita
  cancel: async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.userId;
      const userRole = req.userRole;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          user: true,
          service: true,
          clinic: true
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      // Verificar permisos
      if (userRole === 'CLIENTE' && appointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para cancelar esta cita'
        });
      }

      // Verificar que la cita se puede cancelar
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

      // Cancelar cita
      const cancelledAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason || 'No especificado'
        },
        include: {
          service: true,
          user: true,
          clinic: true
        }
      });

      // Enviar notificación de cancelación
      try {
        await notificationService.sendAppointmentCancellation(cancelledAppointment);
      } catch (notificationError) {
        logger.warn('Error enviando notificación de cancelación:', notificationError);
      }

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

  // ===============================
  // MÉTODOS AVANZADOS
  // ===============================

  // 🔔 Enviar recordatorio de cita
  sendReminder: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          user: true,
          service: true,
          clinic: true
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      // Verificar permisos
      if (userRole === 'CLIENTE' && appointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para enviar recordatorio de esta cita'
        });
      }

      // Verificar que la cita esté programada o confirmada
      if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
        return res.status(400).json({
          success: false,
          error: 'Solo se pueden enviar recordatorios de citas programadas o confirmadas'
        });
      }

      // Enviar notificación
      try {
        await notificationService.sendAppointmentReminder(appointment);
      } catch (notificationError) {
        logger.error('Error enviando recordatorio:', notificationError);
        return res.status(500).json({
          success: false,
          error: 'Error enviando recordatorio'
        });
      }

      logger.info(`Recordatorio enviado para cita: ${id}`);

      res.json({
        success: true,
        message: 'Recordatorio enviado exitosamente'
      });

    } catch (error) {
      logger.error('Error enviando recordatorio:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  // 🔍 Buscar citas con filtros avanzados
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
      
      const userId = req.userId;
      const userRole = req.userRole;
      const clinicId = req.clinicId;

      const where = {};

      // Filtrar por clínica si no es super admin
      if (clinicId) {
        where.clinicId = clinicId;
      }

      // Si es cliente, solo puede ver sus citas
      if (userRole === 'CLIENTE') {
        where.userId = userId;
      } else if (searchUserId) {
        where.userId = searchUserId;
      }

      // Filtros adicionales
      if (status) {
        where.status = status;
      }

      if (serviceId) {
        where.serviceId = serviceId;
      }

      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = new Date(dateFrom);
        if (dateTo) where.date.lte = new Date(dateTo);
      }

      // Búsqueda por texto
      if (query) {
        where.OR = [
          {
            service: {
              name: {
                contains: query,
                mode: 'insensitive'
              }
            }
          },
          {
            user: {
              name: {
                contains: query,
                mode: 'insensitive'
              }
            }
          },
          {
            notes: {
              contains: query,
              mode: 'insensitive'
            }
          }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          include: {
            service: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isVIP: true
              }
            },
            clinic: {
              select: {
                id: true,
                name: true,
                primaryColor: true
              }
            }
          },
          orderBy: [
            { date: 'desc' },
            { time: 'desc' }
          ],
          skip,
          take: parseInt(limit)
        }),
        prisma.appointment.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          appointments,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          },
          filters: {
            query,
            status,
            dateFrom,
            dateTo,
            serviceId,
            userId: searchUserId
          }
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

  // 🔄 Reprogramar cita
  reschedule: async (req, res) => {
    try {
      const { id } = req.params;
      const { newDate, newTime, reason } = req.body;
      const userId = req.userId;
      const userRole = req.userRole;

      if (!newDate || !newTime) {
        return res.status(400).json({
          success: false,
          error: 'Nueva fecha y hora son requeridas'
        });
      }

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          user: true,
          service: true,
          clinic: true
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      // Verificar permisos
      if (userRole === 'CLIENTE' && appointment.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para reprogramar esta cita'
        });
      }

      // Verificar que la nueva fecha sea futura
      const newAppointmentDateTime = new Date(`${newDate}T${newTime}:00`);
      if (newAppointmentDateTime <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'La nueva fecha debe ser futura'
        });
      }

      // Verificar disponibilidad del nuevo horario
      const conflictingAppointment = await prisma.appointment.findFirst({
        where: {
          id: { not: id },
          date: newAppointmentDateTime,
          time: newTime,
          clinicId: appointment.clinicId,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
        }
      });

      if (conflictingAppointment) {
        return res.status(409).json({
          success: false,
          error: 'El nuevo horario no está disponible'
        });
      }

      // Actualizar cita
      const rescheduledAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          date: newAppointmentDateTime,
          time: newTime,
          status: 'SCHEDULED' // Reset to scheduled
        },
        include: {
          service: true,
          user: true,
          clinic: true
        }
      });

      // Enviar notificación de reprogramación
      try {
        await notificationService.sendAppointmentReschedule(rescheduledAppointment, {
          oldDate: appointment.date,
          oldTime: appointment.time
        });
      } catch (notificationError) {
        logger.warn('Error enviando notificación de reprogramación:', notificationError);
      }

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

  // 📊 Verificar disponibilidad en tiempo real
  checkAvailability: async (req, res) => {
    try {
      const { date, time, serviceId } = req.body;
      const clinicId = req.clinicId;

      if (!date || !time || !serviceId) {
        return res.status(400).json({
          success: false,
          error: 'Fecha, hora y servicio son requeridos'
        });
      }

      // Verificar que el servicio existe
      const service = await prisma.service.findFirst({
        where: {
          id: serviceId,
          clinicId,
          isActive: true
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          error: 'Servicio no encontrado'
        });
      }

      // Verificar disponibilidad
      const appointmentDateTime = new Date(`${date}T${time}:00`);
      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          date: appointmentDateTime,
          time,
          clinicId,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
        }
      });

      const isAvailable = !existingAppointment;
      
      // Obtener horarios alternativos si no está disponible
      let alternativeSlots = [];
      if (!isAvailable) {
        const startOfDay = new Date(date);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const dayAppointments = await prisma.appointment.findMany({
          where: {
            clinicId,
            date: {
              gte: startOfDay,
              lt: endOfDay
            },
            status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
          },
          select: { time: true }
        });

        const bookedTimes = dayAppointments.map(apt => apt.time);
        
        // Generar horarios alternativos (simplificado)
        const clinic = await prisma.clinic.findUnique({
          where: { id: clinicId }
        });
        
        const [openHour] = clinic.openTime.split(':').map(Number);
        const [closeHour] = clinic.closeTime.split(':').map(Number);
        
        for (let hour = openHour; hour < closeHour; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            if (!bookedTimes.includes(timeSlot) && timeSlot !== time) {
              alternativeSlots.push(timeSlot);
              if (alternativeSlots.length >= 6) break;
            }
          }
          if (alternativeSlots.length >= 6) break;
        }
      }

      res.json({
        success: true,
        data: {
          isAvailable,
          requestedSlot: { date, time },
          service: {
            name: service.name,
            duration: service.duration
          },
          ...(alternativeSlots.length > 0 && {
            alternativeSlots: alternativeSlots.slice(0, 6)
          })
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

  // Obtener horarios disponibles (MEJORADO)
  getAvailableSlots: async (req, res) => {
    try {
      const { date, serviceId } = req.query;
      const clinicId = req.clinicId;

      if (!date || !serviceId) {
        return res.status(400).json({
          success: false,
          error: 'Fecha y servicio son requeridos'
        });
      }

      // Verificar que el servicio existe
      const service = await prisma.service.findFirst({
        where: {
          id: serviceId,
          clinicId,
          isActive: true
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          error: 'Servicio no encontrado'
        });
      }

      // Obtener configuración de la clínica
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId }
      });

      // Generar horarios disponibles
      const requestedDate = new Date(date);
      const dayOfWeek = requestedDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Verificar si workingDays existe, si no, usar días de lunes a viernes por defecto
      const workingDays = clinic.workingDays ? 
        clinic.workingDays.split(',').map(d => parseInt(d)) : 
        [1, 2, 3, 4, 5]; // Lunes a Viernes por defecto
      
      // Verificar si el día es laborable
      if (!workingDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek)) {
        return res.json({
          success: true,
          data: { availableSlots: [] }
        });
      }

      // Obtener citas existentes para esa fecha
      const startOfDay = new Date(date);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const existingAppointments = await prisma.appointment.findMany({
        where: {
          clinicId,
          date: {
            gte: startOfDay,
            lt: endOfDay
          },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] }
        },
        select: { time: true }
      });

      const bookedTimes = existingAppointments.map(apt => apt.time);

      // Generar horarios disponibles
      const availableSlots = [];
      const openTime = clinic.openTime || "09:00"; // Default si no está definido
      const closeTime = clinic.closeTime || "18:00"; // Default si no está definido
      
      const [openHour, openMinute] = openTime.split(':').map(Number);
      const [closeHour, closeMinute] = closeTime.split(':').map(Number);
      
      const serviceDuration = service.duration || 60; // minutos
      const slotInterval = 30; // intervalos de 30 minutos
      
      let currentHour = openHour;
      let currentMinute = openMinute;
      
      while (currentHour < closeHour || (currentHour === closeHour && currentMinute < closeMinute)) {
        const timeSlot = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
        
        // Verificar si el horario no está ocupado
        if (!bookedTimes.includes(timeSlot)) {
          // Verificar que hay tiempo suficiente para el servicio antes del cierre
          const slotEndMinutes = currentHour * 60 + currentMinute + serviceDuration;
          const closeMinutes = closeHour * 60 + closeMinute;
          
          if (slotEndMinutes <= closeMinutes) {
            availableSlots.push(timeSlot);
          }
        }
        
        // Avanzar al siguiente slot
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

  // Obtener estadísticas de citas (MEJORADO)
  getStats: async (req, res) => {
    try {
      const { period = 'month' } = req.query;
      const userId = req.userId;
      const userRole = req.userRole;
      const clinicId = req.clinicId;

      let startDate = new Date();
      
      // Configurar período
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
        createdAt: { gte: startDate }
      };

      // Filtrar por usuario si es cliente
      if (userRole === 'CLIENTE') {
        where.userId = userId;
      } else if (clinicId) {
        where.clinicId = clinicId;
      }

      const [
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        scheduledAppointments,
        totalRevenue
      ] = await Promise.all([
        prisma.appointment.count({ where }),
        prisma.appointment.count({ 
          where: { ...where, status: 'COMPLETED' } 
        }),
        prisma.appointment.count({ 
          where: { ...where, status: 'CANCELLED' } 
        }),
        prisma.appointment.count({ 
          where: { ...where, status: { in: ['SCHEDULED', 'CONFIRMED'] } } 
        }),
        prisma.appointment.aggregate({
          where: { ...where, status: 'COMPLETED' },
          _sum: { finalPrice: true }
        })
      ]);

      // Obtener próxima cita
      const nextAppointment = await prisma.appointment.findFirst({
        where: {
          ...(userRole === 'CLIENTE' ? { userId } : { clinicId }),
          date: { gte: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] }
        },
        include: {
          service: true,
          ...(userRole !== 'CLIENTE' && {
            user: {
              select: { name: true, phone: true }
            }
          })
        },
        orderBy: { date: 'asc' }
      });

      res.json({
        success: true,
        data: {
          stats: {
            total: totalAppointments,
            completed: completedAppointments,
            cancelled: cancelledAppointments,
            scheduled: scheduledAppointments,
            revenue: totalRevenue._sum.finalPrice || 0,
            completionRate: totalAppointments > 0 ? (completedAppointments / totalAppointments * 100).toFixed(1) : 0
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

  // 📊 Estadísticas detalladas
  getDetailedStats: async (req, res) => {
    try {
      const { period = 'month', compareWith } = req.query;
      const userId = req.userId;
      const userRole = req.userRole;
      const clinicId = req.clinicId;

      let startDate = new Date();
      let endDate = new Date();
      
      // Configurar período actual
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
        date: { gte: startDate, lte: endDate }
      };

      // Filtrar por usuario si es cliente
      if (userRole === 'CLIENTE') {
        where.userId = userId;
      } else if (clinicId) {
        where.clinicId = clinicId;
      }

      // Obtener estadísticas principales
      const [
        totalAppointments,
        appointmentsByStatus,
        appointmentsByService,
        cancelationRate
      ] = await Promise.all([
        // Total de citas
        prisma.appointment.count({ where }),
        
        // Citas por estado
        prisma.appointment.groupBy({
          by: ['status'],
          where,
          _count: { status: true }
        }),
        
        // Citas por servicio con ingresos
        prisma.appointment.findMany({
          where: { ...where, status: 'COMPLETED' },
          include: {
            service: {
              select: { name: true, price: true }
            }
          }
        }).then(appointments => {
          const serviceStats = {};
          appointments.forEach(apt => {
            const serviceName = apt.service.name;
            if (!serviceStats[serviceName]) {
              serviceStats[serviceName] = {
                count: 0,
                revenue: 0,
                name: serviceName
              };
            }
            serviceStats[serviceName].count++;
            serviceStats[serviceName].revenue += apt.finalPrice || 0;
          });
          return Object.values(serviceStats).sort((a, b) => b.count - a.count);
        }),
        
        // Tasa de cancelación
        prisma.appointment.count({
          where: { ...where, status: 'CANCELLED' }
        }).then(cancelled => 
          totalAppointments > 0 ? (cancelled / totalAppointments * 100).toFixed(1) : 0
        )
      ]);

      // Estadísticas de comparación si se solicita
      let comparison = null;
      if (compareWith) {
        const compareStartDate = new Date(startDate);
        const compareEndDate = new Date(endDate);
        
        // Ajustar fechas de comparación según el período
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
        
        const currentRevenue = appointmentsByService.reduce((sum, service) => sum + service.revenue, 0);
        
        comparison = {
          period: compareWith,
          appointments: {
            current: totalAppointments,
            previous: compareTotal,
            change: compareTotal > 0 ? ((totalAppointments - compareTotal) / compareTotal * 100).toFixed(1) : 0
          },
          revenue: {
            current: currentRevenue,
            previous: compareRevenue._sum.finalPrice || 0,
            change: compareRevenue._sum.finalPrice > 0 ? 
              (((currentRevenue - compareRevenue._sum.finalPrice) / compareRevenue._sum.finalPrice) * 100).toFixed(1) : 0
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
          topServices: appointmentsByService.slice(0, 5),
          metrics: {
            cancelationRate: parseFloat(cancelationRate),
            completionRate: appointmentsByStatus.find(s => s.status === 'COMPLETED')?._count.status || 0,
            totalRevenue: appointmentsByService.reduce((sum, service) => sum + service.revenue, 0)
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

  // Confirmar cita (para staff)
  confirm: async (req, res) => {
    try {
      const { id } = req.params;
      
      const appointment = await prisma.appointment.findUnique({
        where: { id }
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
        include: {
          service: true,
          user: true,
          clinic: true
        }
      });

      // Enviar notificación de confirmación
      try {
        await notificationService.sendAppointmentConfirmation(confirmedAppointment);
      } catch (notificationError) {
        logger.warn('Error enviando notificación de confirmación:', notificationError);
      }

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

  // Completar cita (para staff)
  complete: async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      
      const appointment = await prisma.appointment.findUnique({
        where: { id }
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
        include: {
          service: true,
          user: true,
          clinic: true
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

  // ===============================
  // MÉTODOS ADICIONALES PARA PRODUCCIÓN
  // ===============================

  // 📊 Obtener historial de cambios de una cita
  getHistory: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;

      // Verificar que la cita existe y el usuario tiene permisos
      const appointment = await prisma.appointment.findFirst({
        where: {
          id,
          ...(userRole === 'CLIENTE' ? { userId } : {})
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      // En una implementación real, tendrías una tabla de historial
      // Por ahora, devolvemos información básica
      const history = [
        {
          action: 'CREATED',
          timestamp: appointment.createdAt,
          details: 'Cita creada',
          user: 'Sistema'
        }
      ];

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

  // 📱 Generar enlace de videollamada (placeholder)
  generateVideoLink: async (req, res) => {
    try {
      const { id } = req.params;
      
      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          service: true,
          user: true
        }
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Cita no encontrada'
        });
      }

      // En una implementación real, integrarías con Zoom, Teams, etc.
      const videoLink = `https://meet.clinica.com/room/${id}`;
      
      res.json({
        success: true,
        data: {
          videoLink,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
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

  // 📄 Exportar citas (placeholder)
  export: async (req, res) => {
    try {
      const { format = 'pdf', ...filters } = req.query;
      const userId = req.userId;
      const userRole = req.userRole;
      const clinicId = req.clinicId;

      // Construir filtros para la consulta
      const where = {};
      
      if (userRole === 'CLIENTE') {
        where.userId = userId;
      } else if (clinicId) {
        where.clinicId = clinicId;
      }

      // Aplicar filtros adicionales
      if (filters.dateFrom) {
        where.date = { ...where.date, gte: new Date(filters.dateFrom) };
      }
      if (filters.dateTo) {
        where.date = { ...where.date, lte: new Date(filters.dateTo) };
      }
      if (filters.status) {
        where.status = filters.status;
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          service: true,
          user: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          },
          clinic: true
        },
        orderBy: { date: 'desc' }
      });

      // En una implementación real, generarías el archivo PDF/Excel
      res.json({
        success: true,
        data: {
          downloadUrl: `/api/exports/appointments-${Date.now()}.${format}`,
          appointments: appointments.length,
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

  // 🚀 Método de prueba para verificar endpoints
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