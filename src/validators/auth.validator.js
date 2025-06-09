// src/validators/auth.validators.js - Validadores con Zod
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string()
    .email('Email inválido')
    .min(1, 'Email es requerido'),
  
  password: z.string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(100, 'La contraseña es demasiado larga'),
  
  name: z.string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras y espacios'),
  
  phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Número de teléfono inválido')
    .optional(),
  
  clinicId: z.string()
    .uuid('ID de clínica inválido')
    .optional(),
  
  role: z.enum(['ADMIN', 'STAFF', 'CLIENTE'])
    .default('CLIENTE')
});

export const loginSchema = z.object({
  email: z.string()
    .email('Email inválido')
    .min(1, 'Email es requerido'),
  
  password: z.string()
    .min(1, 'Contraseña es requerida')
});

// Validador para actualizar perfil
export const updateProfileSchema = z.object({
  name: z.string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras y espacios')
    .optional(),
  
  phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Número de teléfono inválido')
    .optional(),
  
  bio: z.string()
    .max(500, 'La biografía es demasiado larga')
    .optional(),
  
  birthday: z.string()
    .datetime('Fecha de nacimiento inválida')
    .optional(),
  
  location: z.string()
    .max(100, 'La ubicación es demasiado larga')
    .optional()
});

// Validador para cambio de contraseña
export const changePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Contraseña actual es requerida'),
  
  newPassword: z.string()
    .min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
    .max(100, 'La nueva contraseña es demasiado larga')
});

// Validadores para citas
export const appointmentSchema = z.object({
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  
  time: z.string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido (HH:MM)'),
  
  serviceId: z.string()
    .uuid('ID de servicio inválido'),
  
  notes: z.string()
    .max(500, 'Las notas son demasiado largas')
    .optional()
});

export const updateAppointmentSchema = z.object({
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional(),
  
  time: z.string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido (HH:MM)')
    .optional(),
  
  serviceId: z.string()
    .uuid('ID de servicio inválido')
    .optional(),
  
  notes: z.string()
    .max(500, 'Las notas son demasiado largas')
    .optional(),
  
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    .optional()
});

// Validadores para servicios
export const serviceSchema = z.object({
  name: z.string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  
  description: z.string()
    .max(1000, 'La descripción es demasiado larga')
    .optional(),
  
  duration: z.number()
    .int('La duración debe ser un número entero')
    .min(15, 'La duración mínima es 15 minutos')
    .max(480, 'La duración máxima es 8 horas'),
  
  price: z.number()
    .positive('El precio debe ser positivo')
    .max(999999, 'El precio es demasiado alto'),
  
  category: z.string()
    .max(50, 'La categoría es demasiado larga')
    .optional(),
  
  isVipOnly: z.boolean()
    .default(false),
  
  vipDiscount: z.number()
    .min(0, 'El descuento no puede ser negativo')
    .max(100, 'El descuento no puede ser mayor a 100%')
    .default(0)
});

// Validadores para clínicas
export const clinicSchema = z.object({
  name: z.string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  
  description: z.string()
    .max(1000, 'La descripción es demasiado larga')
    .optional(),
  
  address: z.string()
    .min(5, 'La dirección debe tener al menos 5 caracteres')
    .max(200, 'La dirección es demasiado larga'),
  
  phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Número de teléfono inválido'),
  
  email: z.string()
    .email('Email inválido'),
  
  website: z.string()
    .url('URL inválida')
    .optional(),
  
  primaryColor: z.string()
    .regex(/^#[0-9A-F]{6}$/i, 'Color primario inválido (formato hex)')
    .default('#6366f1'),
  
  secondaryColor: z.string()
    .regex(/^#[0-9A-F]{6}$/i, 'Color secundario inválido (formato hex)')
    .default('#8b5cf6'),
  
  timezone: z.string()
    .default('America/Argentina/Buenos_Aires'),
  
  currency: z.string()
    .length(3, 'Código de moneda debe tener 3 caracteres')
    .default('ARS'),
  
  openTime: z.string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido')
    .default('09:00'),
  
  closeTime: z.string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido')
    .default('18:00'),
  
  workingDays: z.string()
    .regex(/^[1-7](,[1-7])*$/, 'Días laborables inválidos')
    .default('1,2,3,4,5')
});

// Validadores para VIP
export const vipSubscriptionSchema = z.object({
  planType: z.enum(['monthly', 'annual'], {
    errorMap: () => ({ message: 'Tipo de plan debe ser monthly o annual' })
  }),
  
  paymentMethod: z.string()
    .min(1, 'Método de pago es requerido')
});

// Validadores para notificaciones
export const notificationSchema = z.object({
  title: z.string()
    .min(1, 'El título es requerido')
    .max(100, 'El título es demasiado largo'),
  
  message: z.string()
    .min(1, 'El mensaje es requerido')
    .max(500, 'El mensaje es demasiado largo'),
  
  type: z.enum(['APPOINTMENT_REMINDER', 'APPOINTMENT_CONFIRMATION', 'VIP_PROMOTION', 'GENERAL', 'SYSTEM']),
  
  userId: z.string()
    .uuid('ID de usuario inválido')
    .optional(),
  
  appointmentId: z.string()
    .uuid('ID de cita inválido')
    .optional(),
  
  sendEmail: z.boolean().default(true),
  sendSms: z.boolean().default(false),
  sendPush: z.boolean().default(true)
});

// Validadores para tips
export const tipSchema = z.object({
  title: z.string()
    .min(2, 'El título debe tener al menos 2 caracteres')
    .max(100, 'El título es demasiado largo'),
  
  content: z.string()
    .min(10, 'El contenido debe tener al menos 10 caracteres')
    .max(1000, 'El contenido es demasiado largo'),
  
  category: z.string()
    .max(50, 'La categoría es demasiado larga')
    .optional(),
  
  isVipOnly: z.boolean()
    .default(false)
});

// Validador para filtros de consulta comunes
export const queryFiltersSchema = z.object({
  page: z.string()
    .regex(/^\d+$/, 'Página debe ser un número')
    .transform(Number)
    .refine(n => n > 0, 'Página debe ser mayor a 0')
    .default('1'),
  
  limit: z.string()
    .regex(/^\d+$/, 'Límite debe ser un número')
    .transform(Number)
    .refine(n => n > 0 && n <= 100, 'Límite debe estar entre 1 y 100')
    .default('10'),
  
  search: z.string()
    .max(100, 'Búsqueda demasiado larga')
    .optional(),
  
  sortBy: z.string()
    .max(50, 'Campo de ordenamiento inválido')
    .optional(),
  
  sortOrder: z.enum(['asc', 'desc'])
    .default('desc')
});