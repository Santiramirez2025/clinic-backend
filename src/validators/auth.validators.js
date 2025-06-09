import { z } from 'zod';

export const registerSchema = z.object({
 email: z.string().email('Email inválido').min(1, 'Email es requerido'),
 password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(100, 'La contraseña es demasiado larga'),
 name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'El nombre es demasiado largo').regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras y espacios'),
 phone: z.string().regex(/^[\+]?[1-9][\d]{0,15}$/, 'Número de teléfono inválido').optional(),
 clinicId: z.string().uuid('ID de clínica inválido').optional(),
 role: z.enum(['ADMIN', 'STAFF', 'CLIENTE']).default('CLIENTE')
});

export const loginSchema = z.object({
 email: z.string().email('Email inválido').min(1, 'Email es requerido'),
 password: z.string().min(1, 'Contraseña es requerida')
});
