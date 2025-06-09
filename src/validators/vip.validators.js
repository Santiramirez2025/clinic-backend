import { z } from 'zod';

export const vipSubscriptionSchema = z.object({
  planType: z.enum(['monthly', 'annual'], {
    errorMap: () => ({ message: 'Tipo de plan debe ser monthly o annual' })
  }),
  paymentMethod: z.string().min(1, 'Método de pago es requerido')
});
