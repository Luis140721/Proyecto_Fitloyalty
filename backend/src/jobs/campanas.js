/**
 * jobs/campanas.js
 *
 * Ejecuta las campanas programadas (RQF-10) cuya fecha_programada ya paso.
 * Lo llama el scheduler cada 10 minutos; GET /api/admin/campanas tambien
 * ejecuta las vencidas del gimnasio al abrir la pantalla.
 * Es idempotente: una campana ya ENVIADA no se vuelve a ejecutar (la fila se
 * bloquea con FOR UPDATE y se revisa el estado dentro de la transaccion).
 */
async function runJob() {
  // Se carga aqui para no traer las rutas (y sus dependencias) al importar el scheduler.
  const { ejecutarVencidas } = require('../routes/campanas');
  const resultados = await ejecutarVencidas(null);
  return {
    ejecutadas: resultados.length,
    destinatarios: resultados.reduce((s, r) => s + r.destinatarios, 0),
    enviados: resultados.reduce((s, r) => s + r.enviados, 0),
    pendientes: resultados.reduce((s, r) => s + r.pendientes, 0),
    fallidos: resultados.reduce((s, r) => s + r.fallidos, 0),
  };
}

module.exports = { runJob };
