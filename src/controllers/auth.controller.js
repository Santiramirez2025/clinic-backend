// src/controllers/auth.controller.js - Controlador de autenticación optimizado
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { registerSchema, loginSchema } from '../validators/auth.validators.js';

const prisma = new PrismaClient();

// Pre-compilar configuración JWT
const JWT_CONFIG = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '7d'
};

// Configuración de bcrypt
const BCRYPT_ROUNDS = 12;

// Selects optimizados para queries frecuentes
const USER_BASE_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  clinicId: true,
  isActive: true,
  bio: true,
  birthday: true,
  location: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true
};

const USER_WITH_RELATIONS_INCLUDE = {
  clinic: {
    select: {
      id: true,
      name: true,
      address: true,
      phone: true
    }
  },
  vipSubscriptions: {
    where: {
      status: 'ACTIVE',
      endDate: { gte: new Date() }
    },
    select: {
      id: true,
      status: true,
      endDate: true,
      planType: true
    },
    orderBy: { endDate: 'desc' },
    take: 1
  }
};

// Generar JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_CONFIG.secret, { expiresIn: JWT_CONFIG.expiresIn });
};

// Formatear respuesta de usuario optimizada
const formatUserResponse = (user) => {
  const { password, ...userWithoutPassword } = user;
  return {
    ...userWithoutPassword,
    isVIP: user.vipSubscriptions?.length > 0,
    vipExpiry: user.vipSubscriptions?.[0]?.endDate || null
  };
};

// Validar existencia de clínica (cache potencial)
const validateClinic = async (clinicId) => {
  if (!clinicId) return true;
  
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true }
  });
  
  return !!clinic;
};

export const authController = {
  register: async (req, res) => {
    try {
      const validationResult = registerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      const { email, password, name, phone, clinicId, role = 'CLIENTE' } = validationResult.data;

      // Verificaciones paralelas
      const [existingUser, isValidClinic] = await Promise.all([
        prisma.user.findUnique({
          where: { email },
          select: { id: true }
        }),
        validateClinic(clinicId)
      ]);

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'El email ya está registrado'
        });
      }

      if (!isValidClinic) {
        return res.status(400).json({
          success: false,
          error: 'Clínica no encontrada'
        });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone,
          role,
          clinicId,
          lastLogin: new Date()
        },
        select: {
          ...USER_BASE_SELECT,
          clinic: USER_WITH_RELATIONS_INCLUDE.clinic,
          vipSubscriptions: USER_WITH_RELATIONS_INCLUDE.vipSubscriptions
        }
      });

      const token = generateToken(user.id);
      logger.info(`Usuario registrado: ${email} (${role})`);

      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          user: formatUserResponse(user),
          token
        }
      });

    } catch (error) {
      logger.error('Error en registro:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  login: async (req, res) => {
    try {
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      const { email, password } = validationResult.data;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          ...USER_BASE_SELECT,
          password: true,
          clinic: USER_WITH_RELATIONS_INCLUDE.clinic,
          vipSubscriptions: USER_WITH_RELATIONS_INCLUDE.vipSubscriptions
        }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: user?.isActive === false ? 'Cuenta desactivada. Contacta al administrador.' : 'Credenciales inválidas'
        });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Credenciales inválidas'
        });
      }

      // Actualización de lastLogin en paralelo (no blocking)
      prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      }).catch(err => logger.error('Error updating lastLogin:', err));

      const token = generateToken(user.id);
      logger.info(`Usuario logueado: ${email}`);

      res.json({
        success: true,
        message: 'Login exitoso',
        data: {
          user: formatUserResponse(user),
          token
        }
      });

    } catch (error) {
      logger.error('Error en login:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  getProfile: async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          ...USER_BASE_SELECT,
          clinic: USER_WITH_RELATIONS_INCLUDE.clinic,
          vipSubscriptions: USER_WITH_RELATIONS_INCLUDE.vipSubscriptions,
          appointments: {
            where: {
              date: { gte: new Date() }
            },
            orderBy: { date: 'asc' },
            take: 5,
            select: {
              id: true,
              date: true,
              status: true,
              service: {
                select: {
                  id: true,
                  name: true,
                  duration: true,
                  price: true
                }
              }
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      res.json({
        success: true,
        data: {
          user: formatUserResponse(user)
        }
      });

    } catch (error) {
      logger.error('Error obteniendo perfil:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const { name, phone, bio, birthday, location } = req.body;

      // Construir data object dinámicamente
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (bio !== undefined) updateData.bio = bio;
      if (birthday !== undefined) updateData.birthday = new Date(birthday);
      if (location !== undefined) updateData.location = location;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay datos para actualizar'
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id: req.userId },
        data: updateData,
        select: {
          ...USER_BASE_SELECT,
          clinic: USER_WITH_RELATIONS_INCLUDE.clinic,
          vipSubscriptions: USER_WITH_RELATIONS_INCLUDE.vipSubscriptions
        }
      });

      res.json({
        success: true,
        message: 'Perfil actualizado exitosamente',
        data: {
          user: formatUserResponse(updatedUser)
        }
      });

    } catch (error) {
      logger.error('Error actualizando perfil:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Contraseña actual y nueva son requeridas'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'La nueva contraseña debe tener al menos 6 caracteres'
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, password: true }
      });

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: 'Contraseña actual incorrecta'
        });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await prisma.user.update({
        where: { id: req.userId },
        data: { password: hashedNewPassword }
      });

      logger.info(`Contraseña cambiada para usuario: ${user.email}`);

      res.json({
        success: true,
        message: 'Contraseña cambiada exitosamente'
      });

    } catch (error) {
      logger.error('Error cambiando contraseña:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  verifyToken: async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          ...USER_BASE_SELECT,
          clinic: USER_WITH_RELATIONS_INCLUDE.clinic,
          vipSubscriptions: USER_WITH_RELATIONS_INCLUDE.vipSubscriptions
        }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Token inválido'
        });
      }

      res.json({
        success: true,
        data: {
          user: formatUserResponse(user)
        }
      });

    } catch (error) {
      logger.error('Error verificando token:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  },

  logout: async (req, res) => {
    try {
      logger.info(`Usuario deslogueado: ${req.user?.email || 'Unknown'}`);

      res.json({
        success: true,
        message: 'Logout exitoso'
      });

    } catch (error) {
      logger.error('Error en logout:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  }
};