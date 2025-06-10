// routes/vip.routes.js - COMPLETO CON NUEVAS RUTAS
import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { vipController } from '../controllers/vip.controller.js';

const router = express.Router();

// ===============================
// RUTAS VIP BÁSICAS
// ===============================

// ✅ Obtener estado VIP del usuario
router.get('/status', authenticateToken, vipController.getStatus);

// ✅ Obtener estadísticas VIP detalladas (NUEVA)
router.get('/stats', authenticateToken, vipController.getStats);

// ✅ Suscribirse a VIP
router.post('/subscribe', authenticateToken, vipController.subscribe);

// ✅ Cancelar suscripción VIP
router.post('/cancel', authenticateToken, vipController.cancel);

// ✅ Obtener beneficios VIP
router.get('/benefits', authenticateToken, vipController.getBenefits);

// ✅ Obtener historial de suscripciones
router.get('/history', authenticateToken, vipController.getHistory);

// ===============================
// RUTAS VIP AVANZADAS (NUEVAS)
// ===============================

// ✅ Actualizar plan VIP (monthly <-> annual)
router.post('/update', authenticateToken, vipController.updatePlan);

// ✅ Reactivar suscripción VIP
router.post('/reactivate', authenticateToken, vipController.reactivate);

// ===============================
// RUTAS VIP ADMIN
// ===============================

// ✅ Extender suscripción VIP de un usuario (admin)
router.post('/extend/:userId', authenticateToken, requireAdmin, vipController.extend);

// ✅ Obtener estadísticas VIP para admin
router.get('/admin/stats', authenticateToken, requireAdmin, vipController.getAdminStats);

// ===============================
// RUTAS VIP PÚBLICAS (sin auth)
// ===============================

// ✅ Obtener beneficios VIP (versión pública para marketing)
router.get('/benefits/public', vipController.getBenefits);

// ===============================
// MIDDLEWARE DE VALIDACIÓN ESPECÍFICO
// ===============================

// Middleware para validar que el usuario puede gestionar VIP
const canManageVip = async (req, res, next) => {
  try {
    const userId = req.userId;
    
    // Verificar si el usuario existe
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    // Verificar si puede gestionar VIP (no está baneado, cuenta activa, etc.)
    if (user.status === 'BANNED' || user.status === 'INACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'Usuario no puede gestionar suscripciones VIP'
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error verificando permisos VIP'
    });
  }
};

// ===============================
// RUTAS CON VALIDACIÓN ADICIONAL
// ===============================

// ✅ Rutas que requieren validación adicional de VIP
router.use('/subscribe', canManageVip);
router.use('/update', canManageVip);
router.use('/reactivate', canManageVip);

export default router;