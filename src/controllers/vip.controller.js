// src/controllers/vip.controller.js - Controlador VIP
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { vipSubscriptionSchema } from '../validators/vip.validators.js';
import { notificationService } from '../services/notificationService.js';

const prisma = new PrismaClient();

export const vipController = {
  // Obtener estado VIP del usuario
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

      // Calcular estadísticas VIP
      let stats = null;
      if (isVIP) {
        const subscriptionStart = activeSubscription.startDate;
        const totalSavings = await prisma.appointment.aggregate({
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

        const appointmentCount = await prisma.appointment.count({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: subscriptionStart }
          }
        });

        stats = {
          totalSavings: totalSavings._sum.vipDiscount || 0,
          appointmentCount,
          memberSince: subscriptionStart,
          daysRemaining: Math.ceil((activeSubscription.endDate - new Date()) / (1000 * 60 * 60 * 24))
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

  // Suscribirse a VIP
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
      // En un entorno real, aquí integrarías con Stripe, MercadoPago, etc.
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

  // Cancelar suscripción VIP
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
          cancelledAt: new Date()
        }
      });

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

  // Obtener beneficios VIP
  getBenefits: async (req, res) => {
    try {
      const clinicId = req.clinicId;

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
          category: true
        }
      });

      // Calcular precios con descuento
      const servicesWithVipPricing = services.map(service => ({
        ...service,
        originalPrice: service.price,
        vipPrice: service.price * (1 - service.vipDiscount / 100),
        savings: service.price * (service.vipDiscount / 100)
      }));

      // Beneficios generales
      const generalBenefits = [
        {
          title: 'Descuentos Exclusivos',
          description: 'Hasta 25% OFF en todos los servicios premium',
          icon: 'star'
        },
        {
          title: 'Reservas Prioritarias',
          description: 'Acceso preferencial a los mejores horarios',
          icon: 'calendar'
        },
        {
          title: 'Consultas Gratuitas',
          description: 'Evaluaciones completas sin costo adicional',
          icon: 'gift'
        },
        {
          title: 'Tratamientos Premium',
          description: 'Tecnología exclusiva para miembros VIP',
          icon: 'zap'
        },
        {
          title: 'Seguimiento Personalizado',
          description: 'Plan de cuidado diseñado especialmente para ti',
          icon: 'heart'
        },
        {
          title: 'Soporte Prioritario',
          description: 'Atención preferencial 24/7',
          icon: 'users'
        }
      ];

      res.json({
        success: true,
        data: {
          services: servicesWithVipPricing,
          generalBenefits,
          plans: {
            monthly: {
              price: parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500,
              features: ['Todos los beneficios VIP', 'Soporte prioritario', 'Cancelación flexible']
            },
            annual: {
              price: parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000,
              originalPrice: (parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500) * 12,
              savings: ((parseFloat(process.env.VIP_MONTHLY_PRICE) || 1500) * 12) - (parseFloat(process.env.VIP_ANNUAL_PRICE) || 12000),
              features: ['Todos los beneficios VIP', 'Soporte 24/7', '2 meses GRATIS', 'Garantía de satisfacción']
            }
          }
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

  // Obtener historial de suscripciones
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
          take: parseInt(limit)
        }),
        prisma.vipSubscription.count({ where: { userId } })
      ]);

      res.json({
        success: true,
        data: {
          subscriptions,
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

  // Extender suscripción VIP (para admin)
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

  // Obtener estadísticas VIP (para admin)
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
        avgSubscriptionLength,
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
        // Duración promedio de suscripción
        prisma.vipSubscription.aggregate({
          where: {
            status: { in: ['ACTIVE', 'EXPIRED'] }
          },
          _avg: {
            // Esto requeriría un campo calculado, simplificamos
            price: true
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
            retentionRate: newVipSubscriptions > 0 ? 
              ((newVipSubscriptions - cancelledSubscriptions) / newVipSubscriptions * 100).toFixed(1) : 0
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

// Función auxiliar para simular procesamiento de pago
async function simulatePayment(paymentMethod, amount) {
  // En un entorno real, aquí integrarías con:
  // - Stripe: stripe.paymentIntents.create()
  // - MercadoPago: mercadopago.payment.create()
  // - PayPal: paypal.payment.create()
  
  // Simulación simple
  return new Promise((resolve) => {
    setTimeout(() => {
      // 95% de éxito en la simulación
      resolve(Math.random() > 0.05);
    }, 1000);
  });
}