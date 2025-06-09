// src/middleware/notFoundHandler.js
export const notFoundHandler = (req, res, next) => {
 const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
 res.status(404).json({
   success: false,
   error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
 });
};
