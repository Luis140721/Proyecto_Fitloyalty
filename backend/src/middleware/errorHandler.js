/**
 * middleware/errorHandler.js
 *
 * Handler central de errores. Siempre va al FINAL de la pila de middlewares
 * de Express (despues de todas las rutas). Reconoce:
 *
 *   - AppError: errores que las rutas lanzan con throw. Status, code y
 *     message son los que el handler definiio.
 *   - SyntaxError por body malformado de express.json(): 400.
 *   - Cualquier otro Error inesperado: 500 generico.
 *
 * En desarrollo imprime el stack completo. En produccion solo el mensaje
 * corto, para no filtrar rutas internas, nombres de tablas, etc.
 */
const { AppError } = require('../lib/errors');

function notFound(req, res, next) {
  res.status(404).json({
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // 1) Errores controlados lanzados con new AppError(...)
  if (err instanceof AppError) {
    const body = { error: err.message, code: err.code || null };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  // 2) Body malformado por express.json() (JSON invalido, body demasiado grande, etc.)
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalido en el cuerpo de la peticion.', code: 'BAD_JSON' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Cuerpo de la peticion demasiado grande.', code: 'PAYLOAD_TOO_LARGE' });
  }

  // 3) Error generico (500). En produccion NO exponemos el mensaje original.
  const IS_PROD = process.env.NODE_ENV === 'production';
  console.error(`[${req.method} ${req.originalUrl}] Error no controlado:`, err && err.stack ? err.stack : err);
  return res.status(500).json({
    error: IS_PROD ? 'Error interno del servidor' : (err && err.message) || 'Error interno del servidor',
    code: 'INTERNAL_ERROR',
  });
}

module.exports = { notFound, errorHandler };