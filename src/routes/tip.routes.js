import express from 'express';
import { authenticateToken, requireStaff, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Obtener tips (público con auth opcional)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const where = {
      isActive: true,
      ...(req.clinicId && { clinicId: req.clinicId })
    };
    
    // Si no es VIP, filtrar tips VIP
    if (!req.user?.isVIP) {
      where.isVipOnly = false;
    }
    
    const tips = await prisma.tip.findMany({
      where,
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        isVipOnly: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    res.json({ success: true, data: { tips } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
