/**
 * jobs/campanas.js
 *
 * Lo llama el scheduler cada 10 minutos (y al arrancar):
 *   1. ejecuta las campanas programadas (RQF-10) cuya fecha_programada ya
 *      paso, de todos los gimnasios (la consulta filtra por gimnasio cuando se
 *      le pasa uno);
 *   2. reintenta los destinatarios PENDIENTE que quedaron de un proceso que se
 *      cayo o de una franja que se cerro (solo correo, o WhatsApp si el modulo
 *      del servidor esta activo; los de WhatsApp a mano siguen en el panel).
 *
 * RQNF-16: fuera del horario de la Ley 2300 (domingos, festivos, antes de las
 * 7:00 a. m. o despues de las 7:00 p. m., y los sabados fuera de 8:00 a. m. a
 * 3:00 p. m.) no envia nada: lo deja para la siguiente corrida en horario.
 *
 * Es idempotente: una campana ya ENVIADA no se vuelve a ejecutar (la fila se
 * bloquea con FOR UPDATE y se revisa el estado dentro de la transaccion), y un
 * destinatario solo se envia si sigue PENDIENTE con su fila bloqueada.
 * GET /api/admin/campanas ya no ejecuta nada.
 */
async function runJob() {
  // Se carga aqui para no traer las rutas (y sus dependencias) al importar el scheduler.
  const { ejecutarVencidas, reanudarPendientes } = require('../routes/campanas');
  const resultados = await ejecutarVencidas(null);
  const reintentos = await reanudarPendientes(null);
  const suma = (lista, k) => lista.reduce((s, r) => s + (r[k] || 0), 0);
  return {
    ejecutadas: resultados.length,
    reintentadas: reintentos.length,
    destinatarios: suma(resultados, 'destinatarios'),
    enviados: suma(resultados, 'enviados') + suma(reintentos, 'enviados'),
    pendientes: suma(resultados, 'pendientes'),
    fallidos: suma(resultados, 'fallidos'),
    omitidos: suma(resultados, 'omitidos'),
  };
}

module.exports = { runJob };
