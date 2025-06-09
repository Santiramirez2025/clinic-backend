// src/utils/logger.js - Sistema de logging con Winston
import winston from 'winston';
import path from 'path';

// Configurar niveles personalizados
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// Formato personalizado
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` | Meta: ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// Formato para consola (desarrollo)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// Crear directorio de logs si no existe
const logsDir = 'logs';

// Configurar transports
const transports = [
  // Console transport para desarrollo
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: process.env.NODE_ENV === 'production' ? customFormat : consoleFormat
  })
];

// File transports solo en producción o si se especifica
if (process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true') {
  transports.push(
    // Error log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: customFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    
    // Combined log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: customFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    
    // HTTP requests log
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      format: customFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3
    })
  );
}

// Crear logger
export const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: customFormat,
  transports,
  exitOnError: false,
  
  // Manejar excepciones no capturadas
  exceptionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({ 
        filename: path.join(logsDir, 'exceptions.log'),
        format: customFormat
      })
    ] : [])
  ],
  
  // Manejar rechazos de promesas no capturadas
  rejectionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({ 
        filename: path.join(logsDir, 'rejections.log'),
        format: customFormat
      })
    ] : [])
  ]
});

// Stream para Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Funciones auxiliares para diferentes tipos de logs
export const logApiRequest = (req, res, duration) => {
  logger.http('API Request', {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.userId || null
  });
};

export const logAuthAttempt = (email, success, ip, userAgent) => {
  logger.info('Auth attempt', {
    email,
    success,
    ip,
    userAgent
  });
};

export const logBusinessEvent = (event, data) => {
  logger.info('Business event', {
    event,
    ...data
  });
};

export const logSecurityEvent = (event, details) => {
  logger.warn('Security event', {
    event,
    ...details
  });
};

export const logPerformance = (operation, duration, metadata = {}) => {
  const level = duration > 1000 ? 'warn' : 'debug';
  logger[level]('Performance metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Funciones de conveniencia
export const logUserAction = (userId, action, details = {}) => {
  logger.info('User action', {
    userId,
    action,
    ...details
  });
};

export const logError = (error, context = {}) => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
};

export const logDatabaseQuery = (query, duration, recordCount = null) => {
  logger.debug('Database query', {
    query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
    duration: `${duration}ms`,
    recordCount
  });
};

export const logSystemEvent = (event, details = {}) => {
  logger.info('System event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Wrapper para medir tiempo de ejecución
export const timeFunction = async (fn, label) => {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logPerformance(label, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logPerformance(label, duration, { error: error.message });
    throw error;
  }
};

// Configurar limpieza automática de logs antiguos (opcional)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    // Implementar limpieza de logs antiguos si es necesario
    // Por ahora Winston maneja esto con maxFiles
  }, 24 * 60 * 60 * 1000); // Cada 24 horas
}

export default logger;