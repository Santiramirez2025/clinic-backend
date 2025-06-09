// src/services/notificationService.js - Servicio de notificaciones
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

// Configurar email transporter solo si las credenciales están configuradas
let emailTransporter = null;
if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

// Configurar Twilio solo si las credenciales están configuradas Y son válidas
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_AUTH_TOKEN && 
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
  try {
    const twilio = await import('twilio');
    twilioClient = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (error) {
    logger.warn('No se pudo inicializar Twilio:', error.message);
  }
}

export const notificationService = {
  // Crear notificación en base de datos
  createNotification: async (data) => {
    try {
      const notification = await prisma.notification.create({
        data: {
          title: data.title,
          message: data.message,
          type: data.type,
          userId: data.userId,
          clinicId: data.clinicId,
          appointmentId: data.appointmentId || null
        }
      });
      return notification;
    } catch (error) {
      logger.error('Error creando notificación:', error);
      throw error;
    }
  },

  // Enviar email
  sendEmail: async (to, subject, html, text = null) => {
    try {
      if (!emailTransporter) {
        logger.warn('Email no configurado, saltando envío');
        return false;
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '')
      };

      await emailTransporter.sendMail(mailOptions);
      logger.info(`Email enviado a ${to}: ${subject}`);
      return true;
    } catch (error) {
      logger.error('Error enviando email:', error);
      return false;
    }
  },

  // Enviar SMS
  sendSMS: async (to, message) => {
    try {
      if (!twilioClient) {
        logger.warn('SMS no configurado, saltando envío');
        return false;
      }

      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });

      logger.info(`SMS enviado a ${to}`);
      return true;
    } catch (error) {
      logger.error('Error enviando SMS:', error);
      return false;
    }
  },

  // Obtener notificaciones del usuario
  getUserNotifications: async (userId, { page = 1, limit = 20, unreadOnly = false }) => {
    const where = { userId };
    
    if (unreadOnly) {
      where.isRead = false;
    }

    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          appointment: {
            include: {
              service: true
            }
          }
        }
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ 
        where: { userId, isRead: false } 
      })
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    };
  },

  // Marcar como leída
  markAsRead: async (notificationId, userId) => {
    return await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
  },

  // Marcar todas como leídas
  markAllAsRead: async (userId) => {
    return await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
  }
};
