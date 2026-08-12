/**
 * lib/asyncHandler.js
 *
 * Wrapper para handlers de Express async/await que NO usan try/catch inline.
 * Captura cualquier rechazo y lo delega al error handler central (siguiente
 * middleware de 4 argumentos). Asi NO queda un endpoint con la promesa
 * rechazada colgando, ni un "ERR_HTTP_HEADERS_SENT" porque alguien mando
 * res.json dos veces.
 *
 * Uso:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 *
 * Tambien maneja errores sincronos (lanzados con throw dentro del handler).
 */
function asyncHandler(fn) {
  return function asyncWrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;