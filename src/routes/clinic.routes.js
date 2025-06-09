import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Obtener clínicas
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const clinics = await prisma.clinic.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        isActive: true
      }
    });
    
    res.json({ success: true, data: { clinics } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
