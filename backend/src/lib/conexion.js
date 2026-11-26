/**
 * lib/conexion.js
 *
 * conexionPerdida(err): true si lo que fallo fue la conexion con PostgreSQL (se
 * corto o el servidor la cerro), no la consulta. Que no se pueda abrir una
 * conexion nueva (ECONNREFUSED, ENOTFOUND, ETIMEDOUT) no cuenta.
 *
 * Un corte puede llegar con otros codigos (08P01 de un pooler, 57P05, ETIMEDOUT
 * con la conexion abierta...). Dentro de una transaccion lo delata que el
 * ROLLBACK tambien falla: db/migrate.js lo marca en err.conexionPerdida.
 */
const CODIGOS = new Set([
  '57P01', '57P02', // el servidor cerro la conexion
  '08000', '08003', '08006', // excepciones de conexion
  'ECONNRESET', 'EPIPE',
]);

function conexionPerdida(err) {
  if (!err) return false;
  if (err.conexionPerdida) return true;
  return CODIGOS.has(err.code) || /Connection terminated|connection error and is not queryable/i.test(err.message || '');
}

module.exports = { conexionPerdida };
