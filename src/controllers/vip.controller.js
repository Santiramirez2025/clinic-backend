// src/controllers/vip.controller.js - COMPLETO Y COMPATIBLE CON FRONTEND
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { vipSubscriptionSchema } from '../validators/vip.validators.js';
import { notificationService } from '../services/notificationService.js';

const prisma = new PrismaClient();

export const vipController = {
  // ✅ Obtener estado VIP del usuario - OPTIMIZADO PARA FRONTEND
  getStatus: async (req, res) => {
    try {
      const userId = req.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          vipSubscriptions: {
            where: {
              status: 'ACTIVE',
              endDate: { gte: new Date() }
            },
            orderBy: { endDate: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      const activeSubscription = user.vipSubscriptions[0];
      const isVIP = !!activeSubscription;

      // ✅ Calcular estadísticas VIP COMPATIBLES CON FRONTEND
      let stats = null;
      if (isVIP) {
        const subscriptionStart = activeSubscription.startDate;
        
        // 1. Total de ahorros VIP
        const totalSavingsResult = await prisma.appointment.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            vipDiscount: { gt: 0 },
            createdAt: { gte: subscriptionStart }
          },
          _sum: {
            vipDiscount: true
          }
        });

        // 2. Citas completadas totales desde VIP
        const completedAppointments = await prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: subscriptionStart }
          }
        });

        // 3. ✅ Citas este mes (compatible con frontend)
        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);
        
        const appointmentsThisMonth = await prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: currentMonth }
          }
        });

        // 4. Días restantes
        const daysRemaining = Math.max(0, Math.ceil((activeSubscription.endDate - new Date()) / (1000 * 60 * 60 * 24)));

        // ✅ ESTRUCTURA 100% COMPATIBLE CON FRONTEND
        stats = {
          totalSavings: totalSavingsResult._sum.vipDiscount || 0,
          appointmentsThisMonth: appointmentsThisMonth,     // ✅ Frontend compatible
          completedAppointments: completedAppointments,     // ✅ Frontend compatible  
          daysRemaining: daysRemaining,                     // ✅ Frontend compatible
          memberSince: subscriptionStart                    // ✅ Info adicional
        };
      }

      res.json({
        success: true,
        data: {
          isVIP,
          subscription: activeSubscription,
          stats
        }
      });

    } catch (error) {
      logger.error('Error obteniendo estado VIP:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  // ✅ Obtener estadísticas VIP detalladas - NUEVO ENDPOINT
  getStats: async (req, res) => {
    try {
      const userId = req.userId;
      const { period = 'all' } = req.query;

      // Verificar si es VIP
      const activeSubscription = await prisma.vipSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

      if (!activeSubscription) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no tiene suscripción VIP activa'
        });
      }

      const subscriptionStart = activeSubscription.startDate;
      let periodStart = subscriptionStart;

      // Configurar período
      if (period !== 'all') {
        periodStart = new Date();
        switch (period) {
          case 'week':
            periodStart.setDate(periodStart.getDate() - 7);
            break;
          case 'month':
            periodStart.setMonth(periodStart.getMonth() - 1);
            break;
          case 'year':
            periodStart.setFullYear(periodStart.getFullYear() - 1);
            break;
        }
      }

      // Stats detalladas
      const [
        totalSavings,
        completedAppointments,
        appointmentsThisMonth,
        avgRating,
        totalSpent,
        vipAppointments
      ] = await Promise.all([
        // Total ahorros VIP
        prisma.appointment.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            vipDiscount: { gt: 0 },
            createdAt: { gte: periodStart }
          },
          _sum: { vipDiscount: true }
        }),
        
        // Citas completadas en período
        prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: periodStart }
          }
        }),
        
        // Citas este mes
        prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { 
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
          }
        }),
        
        // Rating promedio (si tienes campo rating)
        prisma.appointment.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: periodStart }
          },
          _avg: { finalPrice: true } // Usamos precio como proxy si no hay rating
        }),
        
        // Total gastado
        prisma.appointment.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: periodStart }
          },
          _sum: { finalPrice: true }
        }),

        // Citas con descuento VIP
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
      const daysSinceMember = Math.ceil((new Date() - subscriptionStart) / (1000 * 60 * 60 * 24));

      res.json({
        success: true,
        data: {
          stats: {
            // ✅ Stats básicas (100% compatibles con frontend)
            totalSavings: totalSavings._sum.vipDiscount || 0,
            appointmentsThisMonth: appointmentsThisMonth,
            completedAppointments: completedAppointments,
            daysRemaining: daysRemaining,
            
            // ✅ Stats adicionales para analytics
            memberSince: subscriptionStart,
            daysSinceMember: daysSinceMember,
            totalSpent: totalSpent._sum.finalPrice || 0,
            vipAppointments: vipAppointments,
            savingsRate: totalSpent._sum.finalPrice > 0 ? 
              ((totalSavings._sum.vipDiscount || 0) / totalSpent._sum.finalPrice * 100).toFixed(1) : 0,
            period: period
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

  // ✅ Suscribirse a VIP - MEJORADO
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
      const userId = req.userId;

      // Verificar si ya tiene una suscripción activa
      const activeSubscription = await prisma.vipSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

      if (activeSubscription) {
        return res.status(409).json({
          success: false,
          error: 'Ya tienes una suscripción VIP activa'
        });
      }

      // Calcular fechas y precio
      const startDate = new Date();
      const endDate = new Date(startDate);
      
      let price, originalPrice, discount = 0;

      if (planType === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
        price = parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500;
        originalPrice = price;
      } else if (planType === 'annual') {
        endDate.setFullYear(endDate.getFullYear() + 1);
        const monthlyPrice = parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500;
        originalPrice = monthlyPrice * 12;
        price = parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000;
        discount = ((originalPrice - price) / originalPrice) * 100;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Tipo de plan inválido'
        });
      }

      // Simular procesamiento de pago
      const paymentSuccess = await simulatePayment(paymentMethod, price);
      
      if (!paymentSuccess) {
        return res.status(400).json({
          success: false,
          error: 'Error procesando el pago'
        });
      }

      // Crear suscripción
      const subscription = await prisma.vipSubscription.create({
        data: {
          userId,
          status: 'ACTIVE',
          planType,
          startDate,
          endDate,
          price,
          discount
        }
      });

      // Actualizar estado VIP del usuario
      await prisma.user.update({
        where: { id: userId },
        data: {
          isVIP: true,
          vipExpiry: endDate
        }
      });

      // Enviar notificación de bienvenida VIP
      await notificationService.sendVIPWelcome(userId, subscription);

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

  // ✅ Cancelar suscripción VIP
  cancel: async (req, res) => {
    try {
      const userId = req.userId;
      const { reason } = req.body;

      const activeSubscription = await prisma.vipSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

      if (!activeSubscription) {
        return res.status(404).json({
          success: false,
          error: 'No tienes una suscripción VIP activa'
        });
      }

      // Cancelar suscripción (permanece activa hasta la fecha de vencimiento)
      const cancelledSubscription = await prisma.vipSubscription.update({
        where: { id: activeSubscription.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason || 'Usuario canceló'
        }
      });

      // Enviar notificación de cancelación
      await notificationService.sendVIPCancellation(userId, cancelledSubscription);

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

  // ✅ Obtener beneficios VIP - MEJORADO
  getBenefits: async (req, res) => {
    try {
      const clinicId = req.clinicId;
      const userId = req.userId;

      // Verificar si el usuario es VIP
      const isVIP = await prisma.vipSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

      // Obtener servicios con descuentos VIP
      const services = await prisma.service.findMany({
        where: {
          clinicId,
          isActive: true,
          vipDiscount: { gt: 0 }
        },
        select: {
          id: true,
          name: true,
          price: true,
          vipDiscount: true,
          category: true,
          description: true,
          duration: true
        }
      });

      // Calcular precios con descuento
      const servicesWithVipPricing = services.map(service => ({
        ...service,
        originalPrice: service.price,
        vipPrice: Math.round(service.price * (1 - service.vipDiscount / 100)),
        savings: Math.round(service.price * (service.vipDiscount / 100)),
        discountPercentage: service.vipDiscount
      }));

      // Beneficios generales compatibles con frontend
      const generalBenefits = [
        {
          id: 'discounts',
          title: 'Descuentos Exclusivos',
          description: 'Hasta 25% OFF en todos los servicios premium',
          icon: 'star',
          active: !!isVIP,
          highlight: '25% OFF',
          color: 'from-yellow-400 to-orange-500'
        },
        {
          id: 'priority_booking',
          title: 'Reservas Prioritarias',
          description: 'Acceso preferencial a los mejores horarios',
          icon: 'calendar',
          active: !!isVIP,
          highlight: 'Prioridad VIP',
          color: 'from-blue-400 to-indigo-500'
        },
        {
          id: 'free_consultations',
          title: 'Consultas Gratuitas',
          description: 'Evaluaciones completas sin costo adicional',
          icon: 'gift',
          active: !!isVIP,
          highlight: 'Sin costo',
          color: 'from-green-400 to-emerald-500'
        },
        {
          id: 'premium_treatments',
          title: 'Tratamientos Premium',
          description: 'Tecnología exclusiva para miembros VIP',
          icon: 'zap',
          active: !!isVIP,
          highlight: 'Exclusivo',
          color: 'from-purple-400 to-pink-500'
        },
        {
          id: 'personal_followup',
          title: 'Seguimiento Personalizado',
          description: 'Plan de cuidado diseñado especialmente para ti',
          icon: 'heart',
          active: !!isVIP,
          highlight: 'Personalizado',
          color: 'from-red-400 to-pink-500'
        },
        {
          id: 'exclusive_community',
          title: 'Soporte Prioritario',
          description: 'Atención preferencial 24/7',
          icon: 'users',
          active: !!isVIP,
          highlight: 'Solo VIP',
          color: 'from-teal-400 to-cyan-500'
        }
      ];

      res.json({
        success: true,
        data: {
          benefits: generalBenefits,
          services: servicesWithVipPricing,
          plans: {
            monthly: {
              id: 'monthly',
              name: 'Mensual',
              price: parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500,
              originalPrice: parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500,
              period: 'mes',
              discount: 0,
              features: ['Todos los beneficios VIP', 'Soporte prioritario', 'Cancelación flexible']
            },
            annual: {
              id: 'annual',
              name: 'Anual',
              price: parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000,
              originalPrice: (parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500) * 12,
              period: 'año',
              discount: 33,
              savings: ((parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500) * 12) - (parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000),
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

  // ✅ Obtener historial de suscripciones
  getHistory: async (req, res) => {
    try {
      const userId = req.userId;
      const { page = 1, limit = 10 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [subscriptions, total] = await Promise.all([
        prisma.vipSubscription.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit),
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        }),
        prisma.vipSubscription.count({ where: { userId } })
      ]);

      res.json({
        success: true,
        data: {
          history: subscriptions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
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

  // ✅ Actualizar plan VIP - NUEVO
  updatePlan: async (req, res) => {
    try {
      const userId = req.userId;
      const { planType } = req.body;

      if (!['monthly', 'annual'].includes(planType)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo de plan inválido'
        });
      }

      const activeSubscription = await prisma.vipSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

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

      // Calcular nuevo precio y fecha
      const newEndDate = new Date();
      let newPrice;

      if (planType === 'monthly') {
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        newPrice = parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500;
      } else {
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
        newPrice = parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000;
      }

      // Actualizar suscripción
      const updatedSubscription = await prisma.vipSubscription.update({
        where: { id: activeSubscription.id },
        data: {
          planType,
          endDate: newEndDate,
          price: newPrice
        }
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

  // ✅ Reactivar suscripción VIP - NUEVO
  reactivate: async (req, res) => {
    try {
      const userId = req.userId;
      const { planType = 'monthly' } = req.body;

      // Verificar que no tenga suscripción activa
      const activeSubscription = await prisma.vipSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

      if (activeSubscription) {
        return res.status(409).json({
          success: false,
          error: 'Ya tienes una suscripción VIP activa'
        });
      }

      // Crear nueva suscripción
      const startDate = new Date();
      const endDate = new Date(startDate);
      let price;

      if (planType === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
        price = parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500;
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1);
        price = parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000;
      }

      const newSubscription = await prisma.vipSubscription.create({
        data: {
          userId,
          status: 'ACTIVE',
          planType,
          startDate,
          endDate,
          price
        }
      });

      // Actualizar usuario
      await prisma.user.update({
        where: { id: userId },
        data: {
          isVIP: true,
          vipExpiry: endDate
        }
      });

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

  // ✅ Extender suscripción VIP (para admin)
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

      const activeSubscription = await prisma.vipSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

      if (!activeSubscription) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no tiene suscripción VIP activa'
        });
      }

      // Extender fecha de vencimiento
      const newEndDate = new Date(activeSubscription.endDate);
      newEndDate.setMonth(newEndDate.getMonth() + parseInt(months));

      const extendedSubscription = await prisma.vipSubscription.update({
        where: { id: activeSubscription.id },
        data: { endDate: newEndDate }
      });

      // Actualizar usuario
      await prisma.user.update({
        where: { id: userId },
        data: { vipExpiry: newEndDate }
      });

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

  // ✅ Obtener estadísticas VIP para admin
  getAdminStats: async (req, res) => {
    try {
      const { period = 'month' } = req.query;
      const clinicId = req.clinicId;

      let startDate = new Date();
      switch (period) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      const [
        totalVipUsers,
        newVipSubscriptions,
        cancelledSubscriptions,
        vipRevenue,
        expiringSoon,
        vipUsersInClinic
      ] = await Promise.all([
        // Total usuarios VIP activos
        prisma.vipSubscription.count({
          where: {
            status: 'ACTIVE',
            endDate: { gte: new Date() }
          }
        }),
        // Nuevas suscripciones en el período
        prisma.vipSubscription.count({
          where: {
            createdAt: { gte: startDate },
            status: 'ACTIVE'
          }
        }),
        // Cancelaciones en el período
        prisma.vipSubscription.count({
          where: {
            cancelledAt: { gte: startDate },
            status: 'CANCELLED'
          }
        }),
        // Ingresos VIP en el período
        prisma.vipSubscription.aggregate({
          where: {
            createdAt: { gte: startDate },
            status: 'ACTIVE'
          },
          _sum: { price: true }
        }),
        // VIP que expiran en los próximos 30 días
        prisma.vipSubscription.count({
          where: {
            status: 'ACTIVE',
            endDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        // Usuarios VIP en la clínica específica
        clinicId ? prisma.user.count({
          where: {
            clinicId,
            isVIP: true
          }
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
            conversionRate: '15.2', // Placeholder - calcular según tus métricas
            averageLifetime: '8.5'   // Placeholder - calcular según tus métricas
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

// ✅ Función auxiliar para simular procesamiento de pago - MEJORADA
async function simulatePayment(paymentMethod, amount) {
  // En un entorno real, aquí integrarías con:
  // - Stripe: stripe.paymentIntents.create()
  // - MercadoPago: mercadopago.payment.create()
  // - PayPal: paypal.payment.create()
  
  console.log(`💳 Processing payment: ${paymentMethod} - ${amount}`);
  
  // Simulación más realista
  return new Promise((resolve) => {
    setTimeout(() => {
      // 95% de éxito en la simulación, fallos aleatorios para testing
      const success = Math.random() > 0.05;
      
      if (success) {
        console.log('✅ Payment successful');
      } else {
        console.log('❌ Payment failed');
      }
      
      resolve(success);
    }, 2000); // Simular delay de procesamiento
  });
}

export default vipController;