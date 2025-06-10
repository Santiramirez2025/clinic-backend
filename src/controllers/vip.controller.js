// src/controllers/vip.controller.js - Controlador VIP optimizado
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { vipSubscriptionSchema } from '../validators/vip.validators.js';
import { notificationService } from '../services/notificationService.js';

const prisma = new PrismaClient();

// Configuraciones pre-compiladas
const VIP_CONFIG = {
  monthlyPrice: parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500,
  annualPrice: parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000,
  paymentTimeout: 2000
};

// Selects optimizados
const VIP_SUBSCRIPTION_SELECT = {
  id: true,
  status: true,
  planType: true,
  startDate: true,
  endDate: true,
  price: true,
  discount: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true
};

const USER_VIP_SELECT = {
  id: true,
  name: true,
  email: true,
  isVIP: true,
  vipExpiry: true
};

const SERVICE_VIP_SELECT = {
  id: true,
  name: true,
  price: true,
  vipDiscount: true,
  category: true,
  description: true,
  duration: true
};

// Condiciones WHERE reutilizables
const ACTIVE_VIP_WHERE = {
  status: 'ACTIVE',
  endDate: { gte: new Date() }
};

// Cache de beneficios generales (data estática)
const GENERAL_BENEFITS = [
  {
    id: 'discounts',
    title: 'Descuentos Exclusivos',
    description: 'Hasta 25% OFF en todos los servicios premium',
    icon: 'star',
    highlight: '25% OFF',
    color: 'from-yellow-400 to-orange-500'
  },
  {
    id: 'priority_booking',
    title: 'Reservas Prioritarias',
    description: 'Acceso preferencial a los mejores horarios',
    icon: 'calendar',
    highlight: 'Prioridad VIP',
    color: 'from-blue-400 to-indigo-500'
  },
  {
    id: 'free_consultations',
    title: 'Consultas Gratuitas',
    description: 'Evaluaciones completas sin costo adicional',
    icon: 'gift',
    highlight: 'Sin costo',
    color: 'from-green-400 to-emerald-500'
  },
  {
    id: 'premium_treatments',
    title: 'Tratamientos Premium',
    description: 'Tecnología exclusiva para miembros VIP',
    icon: 'zap',
    highlight: 'Exclusivo',
    color: 'from-purple-400 to-pink-500'
  },
  {
    id: 'personal_followup',
    title: 'Seguimiento Personalizado',
    description: 'Plan de cuidado diseñado especialmente para ti',
    icon: 'heart',
    highlight: 'Personalizado',
    color: 'from-red-400 to-pink-500'
  },
  {
    id: 'exclusive_community',
    title: 'Soporte Prioritario',
    description: 'Atención preferencial 24/7',
    icon: 'users',
    highlight: 'Solo VIP',
    color: 'from-teal-400 to-cyan-500'
  }
];

// Funciones de utilidad optimizadas
const getActiveVIPSubscription = async (userId) => {
  return await prisma.vipSubscription.findFirst({
    where: { userId, ...ACTIVE_VIP_WHERE },
    select: VIP_SUBSCRIPTION_SELECT
  });
};

const calculateVIPStats = async (userId, subscriptionStart) => {
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  const [totalSavings, completedAppointments, appointmentsThisMonth] = await Promise.all([
    prisma.appointment.aggregate({
      where: {
        userId,
        status: 'COMPLETED',
        vipDiscount: { gt: 0 },
        createdAt: { gte: subscriptionStart }
      },
      _sum: { vipDiscount: true }
    }),
    prisma.appointment.count({
      where: {
        userId,
        status: 'COMPLETED',
        createdAt: { gte: subscriptionStart }
      }
    }),
    prisma.appointment.count({
      where: {
        userId,
        status: 'COMPLETED',
        createdAt: { gte: currentMonth }
      }
    })
  ]);

  const daysRemaining = Math.max(0, Math.ceil((new Date(subscriptionStart) - new Date()) / (1000 * 60 * 60 * 24)));

  return {
    totalSavings: totalSavings._sum.vipDiscount || 0,
    appointmentsThisMonth,
    completedAppointments,
    daysRemaining,
    memberSince: subscriptionStart
  };
};

const calculatePlanDetails = (planType) => {
  const { monthlyPrice, annualPrice } = VIP_CONFIG;
  
  if (planType === 'annual') {
    const originalPrice = monthlyPrice * 12;
    const discount = ((originalPrice - annualPrice) / originalPrice) * 100;
    return {
      price: annualPrice,
      originalPrice,
      discount: Math.round(discount),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
    };
  }
  
  return {
    price: monthlyPrice,
    originalPrice: monthlyPrice,
    discount: 0,
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1))
  };
};

const simulatePayment = async (paymentMethod, amount) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const success = Math.random() > 0.05;
      console.log(success ? '✅ Payment successful' : '❌ Payment failed');
      resolve(success);
    }, VIP_CONFIG.paymentTimeout);
  });
};

export const vipController = {
  getStatus: async (req, res) => {
    try {
      const { userId } = req;

      const [user, activeSubscription] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: USER_VIP_SELECT
        }),
        getActiveVIPSubscription(userId)
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      const isVIP = !!activeSubscription;
      let stats = null;

      if (isVIP) {
        stats = await calculateVIPStats(userId, activeSubscription.startDate);
      }

      res.json({
        success: true,
        data: { isVIP, subscription: activeSubscription, stats }
      });

    } catch (error) {
      logger.error('Error obteniendo estado VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getStats: async (req, res) => {
    try {
      const { userId } = req;
      const { period = 'all' } = req.query;

      const activeSubscription = await getActiveVIPSubscription(userId);
      if (!activeSubscription) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no tiene suscripción VIP activa'
        });
      }

      let periodStart = activeSubscription.startDate;
      if (period !== 'all') {
        periodStart = new Date();
        const periodMap = {
          week: () => periodStart.setDate(periodStart.getDate() - 7),
          month: () => periodStart.setMonth(periodStart.getMonth() - 1),
          year: () => periodStart.setFullYear(periodStart.getFullYear() - 1)
        };
        periodMap[period]?.();
      }

      const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const [
        totalSavings,
        completedAppointments,
        appointmentsThisMonth,
        totalSpent,
        vipAppointments
      ] = await Promise.all([
        prisma.appointment.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            vipDiscount: { gt: 0 },
            createdAt: { gte: periodStart }
          },
          _sum: { vipDiscount: true }
        }),
        prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: periodStart }
          }
        }),
        prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: currentMonthStart }
          }
        }),
        prisma.appointment.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: periodStart }
          },
          _sum: { finalPrice: true }
        }),
        prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            vipDiscount: { gt: 0 },
            createdAt: { gte: periodStart }
          }
        })
      ]);

      const daysRemaining = Math.max(0, Math.ceil((activeSubscription.endDate - new Date()) / (1000 * 60 * 60 * 24)));
      const daysSinceMember = Math.ceil((new Date() - activeSubscription.startDate) / (1000 * 60 * 60 * 24));
      const totalSpentAmount = totalSpent._sum.finalPrice || 0;
      const totalSavingsAmount = totalSavings._sum.vipDiscount || 0;

      res.json({
        success: true,
        data: {
          stats: {
            totalSavings: totalSavingsAmount,
            appointmentsThisMonth,
            completedAppointments,
            daysRemaining,
            memberSince: activeSubscription.startDate,
            daysSinceMember,
            totalSpent: totalSpentAmount,
            vipAppointments,
            savingsRate: totalSpentAmount > 0 ? (totalSavingsAmount / totalSpentAmount * 100).toFixed(1) : 0,
            period
          }
        }
      });

    } catch (error) {
      logger.error('Error obteniendo stats VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  subscribe: async (req, res) => {
    try {
      const validationResult = vipSubscriptionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      const { planType, paymentMethod } = validationResult.data;
      const { userId } = req;

      const activeSubscription = await getActiveVIPSubscription(userId);
      if (activeSubscription) {
        return res.status(409).json({
          success: false,
          error: 'Ya tienes una suscripción VIP activa'
        });
      }

      if (!['monthly', 'annual'].includes(planType)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo de plan inválido'
        });
      }

      const planDetails = calculatePlanDetails(planType);
      const paymentSuccess = await simulatePayment(paymentMethod, planDetails.price);
      
      if (!paymentSuccess) {
        return res.status(400).json({
          success: false,
          error: 'Error procesando el pago'
        });
      }

      const startDate = new Date();

      const [subscription] = await Promise.all([
        prisma.vipSubscription.create({
          data: {
            userId,
            status: 'ACTIVE',
            planType,
            startDate,
            endDate: planDetails.endDate,
            price: planDetails.price,
            discount: planDetails.discount
          },
          select: VIP_SUBSCRIPTION_SELECT
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            isVIP: true,
            vipExpiry: planDetails.endDate
          }
        })
      ]);

      // Notificación asíncrona
      notificationService.sendVIPWelcome(userId, subscription)
        .catch(err => logger.warn('Error enviando notificación VIP:', err));

      logger.info(`Usuario ${userId} se suscribió a VIP (${planType})`);

      res.status(201).json({
        success: true,
        message: 'Suscripción VIP activada exitosamente',
        data: { subscription }
      });

    } catch (error) {
      logger.error('Error suscribiendo a VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  cancel: async (req, res) => {
    try {
      const { userId } = req;
      const { reason } = req.body;

      const activeSubscription = await getActiveVIPSubscription(userId);
      if (!activeSubscription) {
        return res.status(404).json({
          success: false,
          error: 'No tienes una suscripción VIP activa'
        });
      }

      const cancelledSubscription = await prisma.vipSubscription.update({
        where: { id: activeSubscription.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason || 'Usuario canceló'
        },
        select: VIP_SUBSCRIPTION_SELECT
      });

      // Notificación asíncrona
      notificationService.sendVIPCancellation(userId, cancelledSubscription)
        .catch(err => logger.warn('Error enviando notificación de cancelación:', err));

      logger.info(`Usuario ${userId} canceló suscripción VIP: ${reason || 'Sin razón'}`);

      res.json({
        success: true,
        message: 'Suscripción VIP cancelada. Mantienes los beneficios hasta la fecha de vencimiento.',
        data: { subscription: cancelledSubscription }
      });

    } catch (error) {
      logger.error('Error cancelando suscripción VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getBenefits: async (req, res) => {
    try {
      const { clinicId, userId } = req;

      const [isVIP, services] = await Promise.all([
        getActiveVIPSubscription(userId),
        prisma.service.findMany({
          where: {
            clinicId,
            isActive: true,
            vipDiscount: { gt: 0 }
          },
          select: SERVICE_VIP_SELECT
        })
      ]);

      const servicesWithVipPricing = services.map(service => ({
        ...service,
        originalPrice: service.price,
        vipPrice: Math.round(service.price * (1 - service.vipDiscount / 100)),
        savings: Math.round(service.price * (service.vipDiscount / 100)),
        discountPercentage: service.vipDiscount
      }));

      const benefits = GENERAL_BENEFITS.map(benefit => ({
        ...benefit,
        active: !!isVIP
      }));

      const { monthlyPrice, annualPrice } = VIP_CONFIG;
      const annualOriginalPrice = monthlyPrice * 12;
      const annualSavings = annualOriginalPrice - annualPrice;

      res.json({
        success: true,
        data: {
          benefits,
          services: servicesWithVipPricing,
          plans: {
            monthly: {
              id: 'monthly',
              name: 'Mensual',
              price: monthlyPrice,
              originalPrice: monthlyPrice,
              period: 'mes',
              discount: 0,
              features: ['Todos los beneficios VIP', 'Soporte prioritario', 'Cancelación flexible']
            },
            annual: {
              id: 'annual',
              name: 'Anual',
              price: annualPrice,
              originalPrice: annualOriginalPrice,
              period: 'año',
              discount: 33,
              savings: annualSavings,
              features: ['Todos los beneficios VIP', 'Soporte 24/7', '2 meses GRATIS', 'Garantía de satisfacción']
            }
          },
          isVIP: !!isVIP
        }
      });

    } catch (error) {
      logger.error('Error obteniendo beneficios VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getHistory: async (req, res) => {
    try {
      const { userId } = req;
      const { page = 1, limit = 10 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [subscriptions, total] = await Promise.all([
        prisma.vipSubscription.findMany({
          where: { userId },
          select: {
            ...VIP_SUBSCRIPTION_SELECT,
            user: { select: { name: true, email: true } }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take
        }),
        prisma.vipSubscription.count({ where: { userId } })
      ]);

      res.json({
        success: true,
        data: {
          history: subscriptions,
          pagination: {
            page: parseInt(page),
            limit: take,
            total,
            pages: Math.ceil(total / take)
          }
        }
      });

    } catch (error) {
      logger.error('Error obteniendo historial VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  updatePlan: async (req, res) => {
    try {
      const { userId } = req;
      const { planType } = req.body;

      if (!['monthly', 'annual'].includes(planType)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo de plan inválido'
        });
      }

      const activeSubscription = await getActiveVIPSubscription(userId);
      if (!activeSubscription) {
        return res.status(404).json({
          success: false,
          error: 'No tienes una suscripción VIP activa'
        });
      }

      if (activeSubscription.planType === planType) {
        return res.status(400).json({
          success: false,
          error: `Ya tienes el plan ${planType}`
        });
      }

      const planDetails = calculatePlanDetails(planType);

      const updatedSubscription = await prisma.vipSubscription.update({
        where: { id: activeSubscription.id },
        data: {
          planType,
          endDate: planDetails.endDate,
          price: planDetails.price
        },
        select: VIP_SUBSCRIPTION_SELECT
      });

      logger.info(`Usuario ${userId} actualizó plan VIP a ${planType}`);

      res.json({
        success: true,
        message: `Plan actualizado a ${planType} exitosamente`,
        data: { subscription: updatedSubscription }
      });

    } catch (error) {
      logger.error('Error actualizando plan VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  reactivate: async (req, res) => {
    try {
      const { userId } = req;
      const { planType = 'monthly' } = req.body;

      const activeSubscription = await getActiveVIPSubscription(userId);
      if (activeSubscription) {
        return res.status(409).json({
          success: false,
          error: 'Ya tienes una suscripción VIP activa'
        });
      }

      const planDetails = calculatePlanDetails(planType);
      const startDate = new Date();

      const [newSubscription] = await Promise.all([
        prisma.vipSubscription.create({
          data: {
            userId,
            status: 'ACTIVE',
            planType,
            startDate,
            endDate: planDetails.endDate,
            price: planDetails.price
          },
          select: VIP_SUBSCRIPTION_SELECT
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            isVIP: true,
            vipExpiry: planDetails.endDate
          }
        })
      ]);

      logger.info(`Usuario ${userId} reactivó suscripción VIP (${planType})`);

      res.json({
        success: true,
        message: 'Suscripción VIP reactivada exitosamente',
        data: { subscription: newSubscription }
      });

    } catch (error) {
      logger.error('Error reactivando suscripción VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  extend: async (req, res) => {
    try {
      const { userId } = req.params;
      const { months, reason } = req.body;

      if (!months || months <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Número de meses inválido'
        });
      }

      const activeSubscription = await getActiveVIPSubscription(userId);
      if (!activeSubscription) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no tiene suscripción VIP activa'
        });
      }

      const newEndDate = new Date(activeSubscription.endDate);
      newEndDate.setMonth(newEndDate.getMonth() + parseInt(months));

      const [extendedSubscription] = await Promise.all([
        prisma.vipSubscription.update({
          where: { id: activeSubscription.id },
          data: { endDate: newEndDate },
          select: VIP_SUBSCRIPTION_SELECT
        }),
        prisma.user.update({
          where: { id: userId },
          data: { vipExpiry: newEndDate }
        })
      ]);

      logger.info(`Admin ${req.userId} extendió VIP de usuario ${userId} por ${months} meses: ${reason || 'Sin razón'}`);

      res.json({
        success: true,
        message: `Suscripción VIP extendida por ${months} meses`,
        data: { subscription: extendedSubscription }
      });

    } catch (error) {
      logger.error('Error extendiendo suscripción VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getAdminStats: async (req, res) => {
    try {
      const { period = 'month' } = req.query;
      const { clinicId } = req;

      let startDate = new Date();
      const periodMap = {
        week: () => startDate.setDate(startDate.getDate() - 7),
        month: () => startDate.setMonth(startDate.getMonth() - 1),
        year: () => startDate.setFullYear(startDate.getFullYear() - 1)
      };
      periodMap[period]?.();

      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const [
        totalVipUsers,
        newVipSubscriptions,
        cancelledSubscriptions,
        vipRevenue,
        expiringSoon,
        vipUsersInClinic
      ] = await Promise.all([
        prisma.vipSubscription.count({ where: ACTIVE_VIP_WHERE }),
        prisma.vipSubscription.count({
          where: {
            createdAt: { gte: startDate },
            status: 'ACTIVE'
          }
        }),
        prisma.vipSubscription.count({
          where: {
            cancelledAt: { gte: startDate },
            status: 'CANCELLED'
          }
        }),
        prisma.vipSubscription.aggregate({
          where: {
            createdAt: { gte: startDate },
            status: 'ACTIVE'
          },
          _sum: { price: true }
        }),
        prisma.vipSubscription.count({
          where: {
            status: 'ACTIVE',
            endDate: { gte: new Date(), lte: thirtyDaysFromNow }
          }
        }),
        clinicId ? prisma.user.count({
          where: { clinicId, isVIP: true }
        }) : 0
      ]);

      res.json({
        success: true,
        data: {
          stats: {
            totalVipUsers,
            newVipSubscriptions,
            cancelledSubscriptions,
            vipRevenue: vipRevenue._sum.price || 0,
            vipUsersInClinic,
            expiringSoon,
            retentionRate: newVipSubscriptions > 0 ? 
              ((newVipSubscriptions - cancelledSubscriptions) / newVipSubscriptions * 100).toFixed(1) : 0,
            conversionRate: '15.2',
            averageLifetime: '8.5'
          },
          period
        }
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas VIP admin:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  }
};

export default vipController;