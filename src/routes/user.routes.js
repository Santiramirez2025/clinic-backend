import express from 'express';
import { authenticateToken, requireStaff, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Obtener usuarios (staff/admin)
router.get('/', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const users = await prisma.user.findMany({
      where: { clinicId: req.clinicId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVIP: true,
        createdAt: true
      }
    });
    
    res.json({ success: true, data: { users } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
