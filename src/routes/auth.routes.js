// src/routes/auth.routes.js - Rutas de autenticación
import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticateToken, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Rutas públicas (sin autenticación)
router.post('/register', userRateLimit(5, 15 * 60 * 1000), authController.register);
router.post('/login', userRateLimit(10, 15 * 60 * 1000), authController.login);

// Rutas protegidas (requieren autenticación)
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, authController.updateProfile);
router.post('/change-password', authenticateToken, authController.changePassword);
router.get('/verify', authenticateToken, authController.verifyToken);
router.post('/logout', authenticateToken, authController.logout);

export default router;