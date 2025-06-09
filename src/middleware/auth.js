// src/middleware/auth.js - Middleware de autenticación y autorización
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

// Middleware para verificar JWT
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token de acceso requerido'
      });
    }

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuario en la base de datos
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        clinic: true,
        vipSubscriptions: {
          where: {
            status: 'ACTIVE',
            endDate: {
              gte: new Date()
            }
          },
          orderBy: { endDate: 'desc' },
          take: 1
        }
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no válido o inactivo'
      });
    }

    // Actualizar último login si ha pasado más de 1 hora
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!user.lastLogin || user.lastLogin < oneHourAgo) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });
    }

    // Verificar estado VIP
    user.isVIP = user.vipSubscriptions.length > 0;
    if (user.isVIP) {
      user.vipExpiry = user.vipSubscriptions[0].endDate;
    }

    // Agregar usuario a request
    req.user = user;
    req.userId = user.id;
    req.userRole = user.role;
    
    // Si no hay clinicId en headers, usar el del usuario
    if (!req.clinicId && user.clinicId) {
      req.clinicId = user.clinicId;
    }

    next();
  } catch (error) {
    logger.error('Error en authenticateToken:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token inválido'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expirado'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

// Middleware para verificar roles
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'No autenticado'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para realizar esta acción'
      });
    }

    next();
  };
};

// Middleware para verificar que es admin o staff
export const requireStaff = requireRole('ADMIN', 'STAFF');

// Middleware para verificar que es admin
export const requireAdmin = requireRole('ADMIN');

// Middleware para verificar que es cliente
export const requireClient = requireRole('CLIENTE');

// Middleware para verificar que el usuario pertenece a la clínica
export const requireClinicAccess = async (req, res, next) => {
  try {
    const { clinicId } = req.params;
    const userClinicId = req.user.clinicId;

    // Admin puede acceder a cualquier clínica
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Verificar que el usuario pertenece a la clínica
    if (!userClinicId || userClinicId !== clinicId) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta clínica'
      });
    }

    next();
  } catch (error) {
    logger.error('Error en requireClinicAccess:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

// Middleware para verificar que es el propietario del recurso o staff
export const requireOwnershipOrStaff = (resourceOwnerField = 'userId') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Admin y staff pueden acceder a todo
      if (['ADMIN', 'STAFF'].includes(userRole)) {
        return next();
      }

      // Para clientes, verificar que son propietarios del recurso
      // Esto requiere que cada controller implemente su propia lógica
      req.requireOwnership = true;
      req.resourceOwnerField = resourceOwnerField;
      
      next();
    } catch (error) {
      logger.error('Error en requireOwnershipOrStaff:', error);
      return res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  };
};

// Middleware para verificar estado VIP
export const requireVIP = (req, res, next) => {
  if (!req.user.isVIP) {
    return res.status(403).json({
      success: false,
      error: 'Esta función requiere una suscripción VIP activa'
    });
  }
  next();
};

// Middleware opcional de autenticación (no falla si no hay token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        clinic: true,
        vipSubscriptions: {
          where: {
            status: 'ACTIVE',
            endDate: { gte: new Date() }
          },
          take: 1
        }
      }
    });

    if (user && user.isActive) {
      user.isVIP = user.vipSubscriptions.length > 0;
      req.user = user;
      req.userId = user.id;
      req.userRole = user.role;
      
      if (!req.clinicId && user.clinicId) {
        req.clinicId = user.clinicId;
      }
    }

    next();
  } catch (error) {
    // En caso de error, simplemente continuar sin usuario
    next();
  }
};

// Middleware para limitar requests por usuario
export const userRateLimit = (maxRequests = 50, windowMs = 15 * 60 * 1000) => {
  const userRequestCounts = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Limpiar entradas antiguas
    for (const [key, data] of userRequestCounts.entries()) {
      if (data.firstRequest < windowStart) {
        userRequestCounts.delete(key);
      }
    }

    // Verificar límite para el usuario actual
    const userRequests = userRequestCounts.get(userId);
    
    if (!userRequests) {
      userRequestCounts.set(userId, {
        count: 1,
        firstRequest: now
      });
      return next();
    }

    if (userRequests.firstRequest < windowStart) {
      // Reset contador si la ventana ha expirado
      userRequestCounts.set(userId, {
        count: 1,
        firstRequest: now
      });
      return next();
    }

    if (userRequests.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Demasiadas solicitudes, intenta más tarde',
        retryAfter: Math.ceil((userRequests.firstRequest + windowMs - now) / 1000)
      });
    }

    userRequests.count++;
    next();
  };
};