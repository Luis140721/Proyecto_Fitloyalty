/**
 * lib/retos.js
 *
 * Progreso de los retos de asistencia (RQF-12).
 *
 * Un reto tiene una meta de asistencias (reto.meta_asistencias) entre
 * fecha_inicio y fecha_fin, un segmento elegible y una recompensa. Cada
 * miembro inscrito tiene su fila en reto_miembro con checkins_acumulados,
 * porcentaje_avance y estado (EN_CURSO, COMPLETADO, CANCELADO).
 *
 * Despues de cada check-in valido se llama `actualizarRetos`:
 *   1. inscribe al miembro en los retos vigentes con segmento TODOS (los demas
 *      segmentos se inscriben desde el panel o desde la app, cuando se puede
 *      comprobar que el miembro es elegible);
 *   2. recalcula el avance de cada reto en curso contando los DIAS distintos
 *      con un ingreso valido dentro de las fechas del reto (hora de Colombia),
 *      asi dos ingresos el mismo dia cuentan una sola asistencia;
 *   3. si llego a la meta lo marca COMPLETADO y deja un aviso tipo RETO en
 *      notificacion para el administrador. Al miembro se le avisa en la misma
 *      pantalla del check-in y en la app (el reto sale como completado).
 *
 * Recalcular en vez de sumar 1 hace que repetir la llamada no cambie nada.
 * Nada de esto debe frenar el check-in: `actualizarRetos` nunca lanza.
 */
const { HOY, fechaLocal } = require('./segmentos');

const TITULO_RETO_COMPLETADO = 'Reto completado';

/** Estado que corresponde a un reto segun sus fechas (sin tocar CANCELADO). */
function estadoPorFechas(reto, hoy) {
  if (reto.estado === 'CANCELADO' || reto.activo === false) return 'CANCELADO';
  const ini = String(reto.fecha_inicio).slice(0, 10);
  const fin = String(reto.fecha_fin).slice(0, 10);
  if (hoy < ini) return 'PROGRAMADO';
  if (hoy > fin) return 'COMPLETADO';
  return 'ACTIVO';
}

/**
 * Pone en ACTIVO los retos cuya fecha de inicio ya llego y en COMPLETADO los
 * que ya terminaron. Los CANCELADO no se tocan.
 */
async function sincronizarEstados(db, gymId) {
  await db.query(
    `UPDATE reto SET estado = CASE
              WHEN ${HOY} < fecha_inicio THEN 'PROGRAMADO'
              WHEN ${HOY} > fecha_fin   THEN 'COMPLETADO'
              ELSE 'ACTIVO' END
      WHERE id_gimnasio = $1 AND estado <> 'CANCELADO'
        AND estado <> CASE
              WHEN ${HOY} < fecha_inicio THEN 'PROGRAMADO'
              WHEN ${HOY} > fecha_fin   THEN 'COMPLETADO'
              ELSE 'ACTIVO' END`,
    [gymId]
  );
}

function porcentaje(acumulados, meta) {
  if (!meta || meta <= 0) return 0;
  return Math.min(100, Math.round((acumulados * 10000) / meta) / 100);
}

/**
 * Recalcula el avance de un miembro en un reto. Devuelve la fila actualizada y
 * si se acaba de completar.
 */
async function recalcularParticipacion(db, { idRetoMiembro, idReto, idMiembro, gymId }) {
  const { rows: cuenta } = await db.query(
    `SELECT COUNT(DISTINCT ${fechaLocal('c.fecha_hora')})::int AS dias
       FROM checkin c
       JOIN reto r ON r.id_reto = $2
      WHERE c.id_miembro = $1 AND c.id_gimnasio = $3 AND c.valido = TRUE
        AND ${fechaLocal('c.fecha_hora')} BETWEEN r.fecha_inicio AND r.fecha_fin`,
    [idMiembro, idReto, gymId]
  );
  const acumulados = cuenta[0] ? Number(cuenta[0].dias) : 0;

  const { rows } = await db.query(
    `UPDATE reto_miembro rm
        SET checkins_acumulados = $2::int,
            porcentaje_avance   = LEAST(100, ROUND(($2::int * 100.0) / r.meta_asistencias, 2)),
            estado              = CASE WHEN $2::int >= r.meta_asistencias THEN 'COMPLETADO' ELSE rm.estado END,
            fecha_completado    = CASE WHEN $2::int >= r.meta_asistencias THEN COALESCE(rm.fecha_completado, NOW())
                                       ELSE rm.fecha_completado END
       FROM reto r
      WHERE rm.id_reto_miembro = $1 AND r.id_reto = rm.id_reto AND rm.estado = 'EN_CURSO'
      RETURNING rm.id_reto_miembro, rm.estado, rm.checkins_acumulados, rm.porcentaje_avance, rm.fecha_completado`,
    [idRetoMiembro, acumulados]
  );
  const fila = rows[0] || null;
  return { fila, completado: !!(fila && fila.estado === 'COMPLETADO') };
}

/** Aviso para el administrador en la campana. No lanza. */
async function avisarRetoCompletado(db, { gymId, idMiembro, nombreMiembro, nombreReto, recompensa }) {
  try {
    await db.query(
      `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje)
       VALUES ($1, $2, 'RETO', $3, $4)`,
      [gymId, idMiembro, TITULO_RETO_COMPLETADO,
       `${nombreMiembro || 'Un miembro'} completó el reto «${nombreReto}».`
       + (recompensa ? ` Recompensa: ${recompensa}.` : '')]
    );
  } catch (err) {
    console.error('[retos] No se pudo avisar el reto completado:', err.message);
  }
}

/**
 * Inscribe, recalcula y avisa despues de un check-in. Devuelve lo que muestra
 * la pantalla del check-in: [{ id_reto, nombre, meta, acumulados, porcentaje,
 * completado, recompensa }]. Nunca lanza: si algo falla devuelve [].
 */
async function actualizarRetos(db, { gymId, idMiembro, nombreMiembro }) {
  try {
    await sincronizarEstados(db, gymId);

    await db.query(
      `INSERT INTO reto_miembro (id_reto, id_miembro)
       SELECT r.id_reto, $2 FROM reto r
        WHERE r.id_gimnasio = $1 AND r.activo = TRUE AND r.estado = 'ACTIVO'
          AND r.segmento_elegible = 'TODOS'
          AND ${HOY} BETWEEN r.fecha_inicio AND r.fecha_fin
       ON CONFLICT (id_reto, id_miembro) DO NOTHING`,
      [gymId, idMiembro]
    );

    const { rows: enCurso } = await db.query(
      `SELECT rm.id_reto_miembro, r.id_reto, r.nombre, r.meta_asistencias, r.recompensa
         FROM reto_miembro rm
         JOIN reto r ON r.id_reto = rm.id_reto
        WHERE rm.id_miembro = $2 AND rm.estado = 'EN_CURSO'
          AND r.id_gimnasio = $1 AND r.activo = TRUE AND r.estado = 'ACTIVO'
          AND ${HOY} BETWEEN r.fecha_inicio AND r.fecha_fin
        ORDER BY r.fecha_fin, r.id_reto`,
      [gymId, idMiembro]
    );

    const resultado = [];
    for (const r of enCurso) {
      const { fila, completado } = await recalcularParticipacion(db, {
        idRetoMiembro: r.id_reto_miembro, idReto: r.id_reto, idMiembro, gymId,
      });
      if (!fila) continue;
      if (completado) {
        await avisarRetoCompletado(db, {
          gymId, idMiembro, nombreMiembro, nombreReto: r.nombre, recompensa: r.recompensa,
        });
      }
      resultado.push({
        id_reto: r.id_reto,
        nombre: r.nombre,
        meta: r.meta_asistencias,
        acumulados: Number(fila.checkins_acumulados),
        porcentaje: Number(fila.porcentaje_avance),
        completado,
        recompensa: r.recompensa || null,
      });
    }
    return resultado;
  } catch (err) {
    console.error('[retos] No se pudo actualizar el progreso:', err.message);
    return [];
  }
}

/** Mensaje corto para la pantalla del check-in. */
function mensajeRetos(retos) {
  const hechos = retos.filter((r) => r.completado);
  if (hechos.length > 0) {
    return hechos.map((r) => `¡Completaste el reto «${r.nombre}»!${r.recompensa ? ` Recompensa: ${r.recompensa}.` : ''}`).join(' ');
  }
  if (retos.length === 0) return null;
  return retos.slice(0, 3).map((r) => {
    const faltan = Math.max(0, r.meta - r.acumulados);
    return `Reto «${r.nombre}»: ${r.acumulados} de ${r.meta} asistencias (te ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`}).`;
  }).join(' ');
}

module.exports = {
  TITULO_RETO_COMPLETADO,
  estadoPorFechas,
  sincronizarEstados,
  porcentaje,
  recalcularParticipacion,
  avisarRetoCompletado,
  actualizarRetos,
  mensajeRetos,
};
