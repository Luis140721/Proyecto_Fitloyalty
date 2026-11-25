/**
 * lib/conexion.js
 *
 * conexionPerdida(err): true si lo que fallo fue la conexion con PostgreSQL (se
 * corto, el servidor la cerro o se agoto el tiempo para abrirla), no la consulta.
 * Que el servidor la rechace (ECONNREFUSED) o no exista (ENOTFOUND) no cuenta.
 */
const CODIGOS = new Set([
  '57P01', '57P02', // el servidor cerro la conexion
  '08000', '08003', '08006', // excepciones de conexion
  'ECONNRESET', 'EPIPE',
]);

function conexionPerdida(err) {
  if (!err) return false;
  return CODIGOS.has(err.code) || /Connection terminated|connection error and is not queryable/i.test(err.message || '');
}

module.exports = { conexionPerdida };
