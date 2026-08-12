/**
 * lib/errors.js
 *
 * Tipos de error consistentes para que TODOS los endpoints respondan con
 * la misma estructura: { error, code?, details? }.
 *
 * Antes cada ruta hacia `res.status(500).json({ error: 'Error interno...' })`
 * por su cuenta, sin contexto. Con AppError, los handlers solo hacen
 * `throw new AppError(400, 'Email invalido', 'BAD_EMAIL', { field: 'email' })`
 * y el handler central decide el status, el body y el log.
 */
class AppError extends Error {
  /**
   * @param {number} status  codigo HTTP (400, 401, 403, 404, 409, 402, 500, ...)
   * @param {string} message mensaje user-facing (en espanol)
   * @param {string} [code]   codigo maquina para que el front reaccione
   * @param {object} [details] payload adicional opcional
   */
  constructor(status, message, code, details) {
    super(message);
    this.name    = 'AppError';
    this.status  = status;
    this.code    = code || null;
    this.details = details || null;
    this.expose  = status < 500; // los 5xx NO se exponen al cliente con detalle
  }
}

module.exports = { AppError };