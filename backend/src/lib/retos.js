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
 *   3. si llego a la meta lo marca COMPLETADO y deja dos filas tipo RETO en
 *      notificacion: una para el administrador (destinatario GIMNASIO, la
 *      campana del panel) y otra para el miembro (destinatario MIEMBRO, la
 *      bandeja de la app, GET /api/cliente/mensajes; migracion 016).
 *
 * Recalcular en vez de sumar 1 hace que repetir la llamada no cambie nada.
 * Nada de esto debe frenar el check-in: `actualizarRetos` nunca lanza.
 *
 * Un reto se completa por cuatro caminos y todos pasan por `recalcularYAvisar`:
 * el check-in (actualizarRetos), «Unirme» en la app (routes/cliente.js),
 * «Inscribir elegibles» y bajar la meta o mover las fechas en el panel
 * (routes/retos.js). Los avisos salen una sola vez por miembro y reto: solo se
 * dejan cuando el UPDATE pasa la fila de EN_CURSO a COMPLETADO, y ese UPDATE no
 * toca filas que ya no estan EN_CURSO. El recalculo y los avisos van en la
 * misma transaccion: o quedan los dos o ninguno (si el aviso falla, el reto
 * sigue EN_CURSO y se completa en el siguiente intento, con su aviso).
 */
const { HOY, fechaLocal } = require('./segmentos');

// Titulos de las filas de notificacion. La campana del panel busca el del
// gimnasio (routes/notificaciones.js).
const TITULO_RETO_COMPLETADO = 'Reto completado';
const TITULO_MENSAJE_COMPLETADO = '¡Completaste un reto!';
const TITULO_MENSAJE_CANCELADO = 'Reto cancelado';

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

/** Textos de los dos avisos al completar. La recompensa es opcional. */
function textosCompletado({ nombreMiembro, nombreReto, recompensa }) {
  return {
    gimnasio: `${nombreMiembro || 'Un miembro'} completó el reto «${nombreReto}».`
      + (recompensa ? ` Recompensa: ${recompensa}.` : ''),
    miembro: `¡Completaste el reto «${nombreReto}»!`
      + (recompensa ? ` Tu recompensa: ${recompensa}. Reclámala en recepción.` : ''),
  };
}

/** Texto del mensaje al miembro cuando el gimnasio cancela un reto en curso. */
function textoCancelado(nombreReto) {
  return `El gimnasio canceló el reto «${nombreReto}». Tu avance en ese reto ya no cuenta, `
    + 'pero tus ingresos siguen sumando en tu racha y tus logros.';
}

/**
 * Deja los dos avisos de un reto completado: el del administrador
 * (destinatario GIMNASIO, campana del panel) y el del miembro (destinatario
 * MIEMBRO, bandeja de la app). Los nombres salen de la base, filtrando por el
 * gimnasio, para que todos los caminos escriban lo mismo.
 *
 * Lanza si no puede escribir: se llama dentro de la transaccion de
 * `recalcularYAvisar`, que deshace el completado para no perder el aviso.
 */
async function avisarRetoCompletado(db, { gymId, idMiembro, idReto }) {
  const { rows } = await db.query(
    `SELECT r.nombre AS nombre_reto, r.recompensa, m.nombre AS nombre_miembro
       FROM reto r
       JOIN miembro m ON m.id_miembro = $2 AND m.id_gimnasio = r.id_gimnasio
      WHERE r.id_reto = $1 AND r.id_gimnasio = $3`,
    [idReto, idMiembro, gymId]
  );
  const d = rows[0] || {};
  const textos = textosCompletado({
    nombreMiembro: d.nombre_miembro, nombreReto: d.nombre_reto || 'del gimnasio', recompensa: d.recompensa,
  });
  await db.query(
    `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje, destinatario)
     VALUES ($1, $2, 'RETO', $3, $4, 'GIMNASIO'),
            ($1, $2, 'RETO', $5, $6, 'MIEMBRO')`,
    [gymId, idMiembro, TITULO_RETO_COMPLETADO, textos.gimnasio, TITULO_MENSAJE_COMPLETADO, textos.miembro]
  );
}

/**
 * Recalcula el avance de un inscrito y, si con eso completa el reto, deja los
 * dos avisos. Es lo que llaman todos los caminos que pueden completar un reto.
 *
 * Con un pool abre su propia transaccion; con un cliente del pool (tiene
 * release) usa la transaccion de quien llama. Lanza si algo falla.
 */
async function recalcularYAvisar(db, { idRetoMiembro, idReto, idMiembro, gymId }) {
  const conTransaccion = typeof db.connect === 'function' && typeof db.release !== 'function';
  const client = conTransaccion ? await db.connect() : db;
  try {
    if (conTransaccion) await client.query('BEGIN');
    const r = await recalcularParticipacion(client, { idRetoMiembro, idReto, idMiembro, gymId });
    if (r.completado) await avisarRetoCompletado(client, { gymId, idMiembro, idReto });
    if (conTransaccion) await client.query('COMMIT');
    return r;
  } catch (err) {
    if (conTransaccion) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (conTransaccion) client.release();
  }
}

/**
 * Al cancelar un reto: pasa a CANCELADO las participaciones EN_CURSO y le deja
 * a cada uno de esos miembros un mensaje en su bandeja. Las COMPLETADO no se
 * tocan (la recompensa ya es suya). Es un solo UPDATE con su INSERT, asi que
 * cancelar dos veces no repite el mensaje. Devuelve a cuantos se aviso.
 */
async function cancelarParticipaciones(db, { idReto, gymId, nombreReto }) {
  const { rowCount } = await db.query(
    `WITH cancelados AS (
       UPDATE reto_miembro rm SET estado = 'CANCELADO'
         FROM reto r
        WHERE rm.id_reto = $1 AND r.id_reto = rm.id_reto AND r.id_gimnasio = $2
          AND rm.estado = 'EN_CURSO'
        RETURNING rm.id_miembro
     )
     INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje, destinatario)
     SELECT $2, c.id_miembro, 'RETO', $3, $4, 'MIEMBRO' FROM cancelados c`,
    [idReto, gymId, TITULO_MENSAJE_CANCELADO, textoCancelado(nombreReto)]
  );
  return rowCount;
}

/**
 * Inscribe, recalcula y avisa despues de un check-in. Devuelve lo que muestra
 * la pantalla del check-in: [{ id_reto, nombre, meta, acumulados, porcentaje,
 * completado, recompensa }]. Nunca lanza: si algo falla devuelve [].
 * (Los nombres de los avisos salen de la base, en avisarRetoCompletado.)
 */
async function actualizarRetos(db, { gymId, idMiembro }) {
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
      // Recalcula y, si se completo, avisa al gimnasio y al miembro (una vez).
      const { fila, completado } = await recalcularYAvisar(db, {
        idRetoMiembro: r.id_reto_miembro, idReto: r.id_reto, idMiembro, gymId,
      });
      if (!fila) continue;
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
  TITULO_MENSAJE_COMPLETADO,
  TITULO_MENSAJE_CANCELADO,
  estadoPorFechas,
  sincronizarEstados,
  porcentaje,
  recalcularParticipacion,
  textosCompletado,
  textoCancelado,
  avisarRetoCompletado,
  recalcularYAvisar,
  cancelarParticipaciones,
  actualizarRetos,
  mensajeRetos,
};
