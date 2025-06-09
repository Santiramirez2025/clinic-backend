import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { notificationService } from '../services/notificationService.js';

const router = express.Router();

// Obtener notificaciones del usuario
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const result = await notificationService.getUserNotifications(
      req.userId, 
      { page: parseInt(page), limit: parseInt(limit), unreadOnly: unreadOnly === 'true' }
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Marcar como leída
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await notificationService.markAsRead(req.params.id, req.userId);
    res.json({ success: true, message: 'Notificación marcada como leída' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Marcar todas como leídas
router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.userId);
    res.json({ success: true, message: 'Todas las notificaciones marcadas como leídas' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
