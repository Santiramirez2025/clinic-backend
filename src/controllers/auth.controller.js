// src/controllers/auth.controller.js - Controlador de autenticación
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { registerSchema, loginSchema } from '../validators/auth.validators.js';

const prisma = new PrismaClient();

// Generar JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Formatear respuesta de usuario
const formatUserResponse = (user) => {
  const { password, ...userWithoutPassword } = user;
  return {
    ...userWithoutPassword,
    isVIP: user.vipSubscriptions?.length > 0 || false,
    vipExpiry: user.vipSubscriptions?.[0]?.endDate || null
  };
};

export const authController = {
  // Registro de usuario
  register: async (req, res) => {
    try {
      // Validar datos de entrada
      const validationResult = registerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      const { email, password, name, phone, clinicId, role = 'CLIENTE' } = validationResult.data;

      // Verificar si el usuario ya existe
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'El email ya está registrado'
        });
      }

      // Verificar si la clínica existe (si se proporciona)
      if (clinicId) {
        const clinic = await prisma.clinic.findUnique({
          where: { id: clinicId }
        });

        if (!clinic) {
          return res.status(400).json({
            success: false,
            error: 'Clínica no encontrada'
          });
        }
      }

      // Hash de la contraseña
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Crear usuario
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
        include: {
          clinic: true,
          vipSubscriptions: {
            where: {
              status: 'ACTIVE',
              endDate: { gte: new Date() }
            }
          }
        }
      });

      // Generar token
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

  // Login de usuario
  login: async (req, res) => {
    try {
      // Validar datos de entrada
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: validationResult.error.errors
        });
      }

      const { email, password } = validationResult.data;

      // Buscar usuario por email
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          clinic: true,
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
        return res.status(401).json({
          success: false,
          error: 'Credenciales inválidas'
        });
      }

      // Verificar si el usuario está activo
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Cuenta desactivada. Contacta al administrador.'
        });
      }

      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Credenciales inválidas'
        });
      }

      // Actualizar último login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      // Generar token
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

  // Obtener perfil de usuario actual
  getProfile: async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        include: {
          clinic: true,
          vipSubscriptions: {
            where: {
              status: 'ACTIVE',
              endDate: { gte: new Date() }
            },
            orderBy: { endDate: 'desc' },
            take: 1
          },
          appointments: {
            where: {
              date: { gte: new Date() }
            },
            orderBy: { date: 'asc' },
            take: 5,
            include: {
              service: true
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

  // Actualizar perfil
  updateProfile: async (req, res) => {
    try {
      const { name, phone, bio, birthday, location } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: req.userId },
        data: {
          ...(name && { name }),
          ...(phone && { phone }),
          ...(bio !== undefined && { bio }),
          ...(birthday && { birthday: new Date(birthday) }),
          ...(location && { location })
        },
        include: {
          clinic: true,
          vipSubscriptions: {
            where: {
              status: 'ACTIVE',
              endDate: { gte: new Date() }
            }
          }
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

  // Cambiar contraseña
  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Contraseña actual y nueva son requeridas'
        });
      }

      // Obtener usuario actual
      const user = await prisma.user.findUnique({
        where: { id: req.userId }
      });

      // Verificar contraseña actual
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: 'Contraseña actual incorrecta'
        });
      }

      // Validar nueva contraseña
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'La nueva contraseña debe tener al menos 6 caracteres'
        });
      }

      // Hash nueva contraseña
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Actualizar contraseña
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

  // Verificar token
  verifyToken: async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        include: {
          clinic: true,
          vipSubscriptions: {
            where: {
              status: 'ACTIVE',
              endDate: { gte: new Date() }
            }
          }
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

  // Logout (invalidar token del lado del cliente)
  logout: async (req, res) => {
    try {
      // En un sistema más avanzado, aquí podrías:
      // - Agregar el token a una blacklist
      // - Limpiar refresh tokens
      // - Registrar el logout en logs

      logger.info(`Usuario deslogueado: ${req.user.email}`);

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