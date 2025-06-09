// src/server.js - Servidor principal CORREGIDO
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Importar middlewares personalizados
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { logger } from './utils/logger.js';

// Importar rutas
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import clinicRoutes from './routes/clinic.routes.js';
import serviceRoutes from './routes/service.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import vipRoutes from './routes/vip.routes.js';
import tipRoutes from './routes/tip.routes.js';
import initRoutes from './routes/init.routes.js';

// Importar servicios
import { startCronJobs } from './services/cronService.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURACIÓN PARA PROXY
// ===============================

// ✅ CRÍTICO: Configurar trust proxy para Render
app.set('trust proxy', 1);

// ===============================
// MIDDLEWARES DE SEGURIDAD
// ===============================

// Helmet para headers de seguridad
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting MEJORADO
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200, // ✅ Aumentado de 100 a 200
  message: {
    success: false,
    error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Skip rate limiting para health checks
  skip: (req) => {
    return req.url === '/health' || req.url === '/';
  }
});

// ✅ Solo aplicar rate limiting a rutas de API
app.use('/api/', limiter);

// CORS configurado MEJORADO
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'https://clinic-saas-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    } else {
      logger.warn(`CORS blocked for origin: ${origin}`);
      return callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Clinic-ID']
}));

// ===============================
// MIDDLEWARES GENERALES
// ===============================

// Compresión
app.use(compression());

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging MEJORADO
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    },
    // ✅ Skip logging para health checks frecuentes
    skip: (req) => req.url === '/health'
  }));
} else {
  app.use(morgan('dev'));
}

// Middleware para extraer clinicId de headers
app.use((req, res, next) => {
  const clinicId = req.headers['x-clinic-id'];
  if (clinicId) {
    req.clinicId = clinicId;
  }
  next();
});

// ===============================
// RUTAS
// ===============================

// Health check MEJORADO
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    database: 'connected' // Se podría hacer un check real aquí
  });
});

// Ruta raíz
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Clinic Backend API',
    version: '1.0.0',
    status: 'active',
    documentation: '/health'
  });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clinics', clinicRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/vip', vipRoutes);
app.use('/api/tips', tipRoutes);
app.use('/api/init', initRoutes);

// Servir archivos estáticos
app.use('/uploads', express.static('uploads'));

// ===============================
// MANEJO DE ERRORES
// ===============================

// 404 handler
app.use(notFoundHandler);

// Error handler global MEJORADO
app.use((error, req, res, next) => {
  // Log del error
  logger.error(`Error: ${error.message}`, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null
  });

  // Error de CORS
  if (error.message === 'No permitido por CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS: Origin no permitido'
    });
  }

  // Error de rate limiting
  if (error.status === 429) {
    return res.status(429).json({
      success: false,
      error: 'Demasiadas solicitudes'
    });
  }

  // Error genérico
  return errorHandler(error, req, res, next);
});

// ===============================
// INICIO DEL SERVIDOR
// ===============================

const startServer = async () => {
  try {
    // Verificar conexión a la base de datos
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    await prisma.$connect();
    logger.info('✅ Conexión a PostgreSQL establecida');
    
    // Iniciar trabajos cron
    startCronJobs();
    logger.info('✅ Trabajos cron iniciados');
    
    // Iniciar servidor
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Servidor ejecutándose en puerto ${PORT}`);
      logger.info(`🌍 Entorno: ${process.env.NODE_ENV}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 Allowed origins: ${allowedOrigins.join(', ')}`);
      
      if (process.env.NODE_ENV === 'development') {
        logger.info(`📚 API Docs: http://localhost:${PORT}/api`);
      }
    });
    
  } catch (error) {
    logger.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
};

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT recibido, cerrando servidor...');
  process.exit(0);
});

// Iniciar servidor
startServer();