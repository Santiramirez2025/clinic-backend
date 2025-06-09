import express from 'express';
import { authenticateToken, requireStaff, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Obtener servicios (público con auth opcional)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const where = {
      isActive: true,
      ...(req.clinicId && { clinicId: req.clinicId })
    };
    
    const services = await prisma.service.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        duration: true,
        price: true,
        category: true,
        vipDiscount: true,
        isVipOnly: true
      }
    });
    
    res.json({ success: true, data: { services } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
