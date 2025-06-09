// src/services/cronService.js - Trabajos programados
import cron from 'cron';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { notificationService } from './notificationService.js';

const prisma = new PrismaClient();

export const startCronJobs = () => {
  // Recordatorios de citas (cada hora)
  const appointmentReminders = new cron.CronJob('0 * * * *', async () => {
    try {
      await sendAppointmentReminders();
    } catch (error) {
      logger.error('Error en cron de recordatorios:', error);
    }
  });

  // Actualizar estados VIP expirados (diario a las 2 AM)
  const updateExpiredVIP = new cron.CronJob('0 2 * * *', async () => {
    try {
      await updateExpiredVIPStatus();
    } catch (error) {
      logger.error('Error en cron de VIP expirados:', error);
    }
  });

  // Limpiar notificaciones antiguas (semanal, domingos a las 3 AM)
  const cleanupNotifications = new cron.CronJob('0 3 * * 0', async () => {
    try {
      await notificationService.cleanupOldNotifications(30);
    } catch (error) {
      logger.error('Error en cron de limpieza:', error);
    }
  });

  // Generar reportes automáticos (mensual, primer día a las 6 AM)
  const monthlyReports = new cron.CronJob('0 6 1 * *', async () => {
    try {
      await generateMonthlyReports();
    } catch (error) {
      logger.error('Error en cron de reportes:', error);
    }
  });

  // Iniciar trabajos
  appointmentReminders.start();
  updateExpiredVIP.start();
  cleanupNotifications.start();
  monthlyReports.start();

  logger.info('✅ Trabajos cron iniciados');
};

// Enviar recordatorios de citas
const sendAppointmentReminders = async () => {
  try {
    // Buscar citas que necesitan recordatorio de 24 horas
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const appointmentsFor24h = await prisma.appointment.findMany({
      where: {
        date: {
          gte: tomorrow,
          lt: dayAfterTomorrow
        },
        status: {
          in: ['SCHEDULED', 'CONFIRMED']
        }
      },
      include: {
        user: true,
        service: true,
        clinic: true,
        notifications: {
          where: {
            type: 'APPOINTMENT_REMINDER',
            createdAt: {
              gte: new Date(Date.now() - 25 * 60 * 60 * 1000) // Últimas 25 horas
            }
          }
        }
      }
    });

    // Filtrar citas que no han recibido recordatorio en las últimas 24 horas
    const appointmentsToRemind = appointmentsFor24h.filter(
      appointment => appointment.notifications.length === 0
    );

    let remindersSent = 0;
    for (const appointment of appointmentsToRemind) {
      try {
        await notificationService.sendAppointmentReminder(appointment, 24);
        remindersSent++;
      } catch (error) {
        logger.error(`Error enviando recordatorio para cita ${appointment.id}:`, error);
      }
    }

    // Buscar citas que necesitan recordatorio de 2 horas
    const twoHoursFromNow = new Date();
    twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);

    const threeHoursFromNow = new Date();
    threeHoursFromNow.setHours(threeHoursFromNow.getHours() + 3);

    const appointmentsFor2h = await prisma.appointment.findMany({
      where: {
        date: {
          gte: twoHoursFromNow,
          lt: threeHoursFromNow
        },
        status: {
          in: ['SCHEDULED', 'CONFIRMED']
        }
      },
      include: {
        user: true,
        service: true,
        clinic: true,
        notifications: {
          where: {
            type: 'APPOINTMENT_REMINDER',
            createdAt: {
              gte: new Date(Date.now() - 3 * 60 * 60 * 1000) // Últimas 3 horas
            }
          }
        }
      }
    });

    const appointmentsToRemind2h = appointmentsFor2h.filter(
      appointment => appointment.notifications.length === 0
    );

    for (const appointment of appointmentsToRemind2h) {
      try {
        await notificationService.sendAppointmentReminder(appointment, 2);
        remindersSent++;
      } catch (error) {
        logger.error(`Error enviando recordatorio para cita ${appointment.id}:`, error);
      }
    }

    if (remindersSent > 0) {
      logger.info(`📧 ${remindersSent} recordatorios de citas enviados`);
    }

  } catch (error) {
    logger.error('Error en sendAppointmentReminders:', error);
  }
};

// Actualizar estados VIP expirados
const updateExpiredVIPStatus = async () => {
  try {
    const now = new Date();

    // Buscar suscripciones VIP expiradas
    const expiredSubscriptions = await prisma.vipSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          lt: now
        }
      },
      include: {
        user: true
      }
    });

    let updatedCount = 0;

    for (const subscription of expiredSubscriptions) {
      try {
        // Actualizar suscripción a expirada
        await prisma.vipSubscription.update({
          where: { id: subscription.id },
          data: { status: 'EXPIRED' }
        });

        // Verificar si el usuario tiene otras suscripciones activas
        const otherActiveSubscriptions = await prisma.vipSubscription.findMany({
          where: {
            userId: subscription.userId,
            status: 'ACTIVE',
            endDate: { gte: now }
          }
        });

        // Si no tiene otras suscripciones activas, actualizar usuario
        if (otherActiveSubscriptions.length === 0) {
          await prisma.user.update({
            where: { id: subscription.userId },
            data: {
              isVIP: false,
              vipExpiry: null
            }
          });

          // Enviar notificación de expiración
          await notificationService.sendNotification({
            userId: subscription.userId,
            clinicId: subscription.user.clinicId,
            type: 'VIP_PROMOTION',
            title: '⏰ Tu plan VIP ha expirado',
            message: `Tu suscripción VIP ha expirado. ¡Renueva ahora y continúa disfrutando de todos los beneficios exclusivos!`,
            sendEmail: true,
            sendSms: false
          });
        }

        updatedCount++;
      } catch (error) {
        logger.error(`Error actualizando suscripción ${subscription.id}:`, error);
      }
    }

    if (updatedCount > 0) {
      logger.info(`🔄 ${updatedCount} suscripciones VIP expiradas actualizadas`);
    }

  } catch (error) {
    logger.error('Error en updateExpiredVIPStatus:', error);
  }
};

// Generar reportes mensuales
const generateMonthlyReports = async () => {
  try {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const startOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const endOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

    // Obtener todas las clínicas
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true }
    });

    for (const clinic of clinics) {
      try {
        // Generar reporte para cada clínica
        const report = await generateClinicMonthlyReport(clinic.id, startOfLastMonth, endOfLastMonth);
        
        // Enviar reporte a administradores de la clínica
        const adminUsers = await prisma.user.findMany({
          where: {
            clinicId: clinic.id,
            role: 'ADMIN',
            isActive: true
          }
        });

        for (const admin of adminUsers) {
          await notificationService.sendNotification({
            userId: admin.id,
            clinicId: clinic.id,
            type: 'SYSTEM',
            title: `📊 Reporte Mensual - ${lastMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`,
            message: formatReportMessage(report),
            sendEmail: true,
            sendSms: false
          });
        }

      } catch (error) {
        logger.error(`Error generando reporte para clínica ${clinic.id}:`, error);
      }
    }

    logger.info('📊 Reportes mensuales generados y enviados');

  } catch (error) {
    logger.error('Error en generateMonthlyReports:', error);
  }
};

// Generar reporte mensual para una clínica
const generateClinicMonthlyReport = async (clinicId, startDate, endDate) => {
  try {
    const [
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      newUsers,
      vipSubscriptions,
      revenue,
      topServices
    ] = await Promise.all([
      // Total de citas
      prisma.appointment.count({
        where: {
          clinicId,
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      // Citas completadas
      prisma.appointment.count({
        where: {
          clinicId,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      // Citas canceladas
      prisma.appointment.count({
        where: {
          clinicId,
          status: 'CANCELLED',
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      // Nuevos usuarios
      prisma.user.count({
        where: {
          clinicId,
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      // Nuevas suscripciones VIP
      prisma.vipSubscription.count({
        where: {
          user: { clinicId },
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      // Ingresos
      prisma.appointment.aggregate({
        where: {
          clinicId,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lte: endDate }
        },
        _sum: { finalPrice: true }
      }),
      // Servicios más populares
      prisma.appointment.groupBy({
        by: ['serviceId'],
        where: {
          clinicId,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lte: endDate }
        },
        _count: { serviceId: true },
        orderBy: { _count: { serviceId: 'desc' } },
        take: 5
      })
    ]);

    // Obtener nombres de servicios más populares
    const serviceIds = topServices.map(s => s.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true }
    });

    const topServicesWithNames = topServices.map(ts => ({
      name: services.find(s => s.id === ts.serviceId)?.name || 'Servicio eliminado',
      count: ts._count.serviceId
    }));

    return {
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      completionRate: totalAppointments > 0 ? ((completedAppointments / totalAppointments) * 100).toFixed(1) : 0,
      newUsers,
      vipSubscriptions,
      revenue: revenue._sum.finalPrice || 0,
      topServices: topServicesWithNames
    };

  } catch (error) {
    logger.error('Error generando reporte de clínica:', error);
    throw error;
  }
};

// Formatear mensaje del reporte
const formatReportMessage = (report) => {
  return `
📈 Resumen del mes anterior:

👥 Nuevos pacientes: ${report.newUsers}
📅 Total de citas: ${report.totalAppointments}
✅ Citas completadas: ${report.completedAppointments} (${report.completionRate}%)
❌ Citas canceladas: ${report.cancelledAppointments}
💰 Ingresos totales: $${report.revenue.toLocaleString()}
⭐ Nuevas suscripciones VIP: ${report.vipSubscriptions}

🏆 Servicios más populares:
${report.topServices.map((service, index) => 
  `${index + 1}. ${service.name} (${service.count} citas)`
).join('\n')}

¡Sigue así! 🚀
  `.trim();
};