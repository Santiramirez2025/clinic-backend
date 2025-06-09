import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { vipController } from '../controllers/vip.controller.js';

const router = express.Router();

// Rutas VIP
router.get('/status', authenticateToken, vipController.getStatus);
router.post('/subscribe', authenticateToken, vipController.subscribe);
router.post('/cancel', authenticateToken, vipController.cancel);
router.get('/benefits', authenticateToken, vipController.getBenefits);
router.get('/history', authenticateToken, vipController.getHistory);
router.post('/extend/:userId', authenticateToken, requireAdmin, vipController.extend);
router.get('/admin/stats', authenticateToken, requireAdmin, vipController.getAdminStats);

export default router;
