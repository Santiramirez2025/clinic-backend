import express from 'express';
import { authenticateToken, requireStaff } from '../middleware/auth.js';
import { appointmentController } from '../controllers/appointment.controller.js';

const router = express.Router();

// Rutas existentes (las tuyas están bien)
router.post('/', authenticateToken, appointmentController.create);
router.get('/', authenticateToken, appointmentController.getUserAppointments);
router.get('/all', authenticateToken, requireStaff, appointmentController.getAll);
router.get('/available', authenticateToken, appointmentController.getAvailableSlots);
router.get('/stats', authenticateToken, appointmentController.getStats);
router.get('/:id', authenticateToken, appointmentController.getById);
router.put('/:id', authenticateToken, appointmentController.update);
router.delete('/:id', authenticateToken, appointmentController.cancel);
router.post('/:id/confirm', authenticateToken, requireStaff, appointmentController.confirm);
router.post('/:id/complete', authenticateToken, requireStaff, appointmentController.complete);

// ✅ AGREGAR ESTAS 4 LÍNEAS NUEVAS:
router.post('/:id/reminder', authenticateToken, appointmentController.sendReminder);
router.get('/search', authenticateToken, appointmentController.search);
router.post('/:id/reschedule', authenticateToken, appointmentController.reschedule);
router.post('/check-availability', authenticateToken, appointmentController.checkAvailability);

export default router;