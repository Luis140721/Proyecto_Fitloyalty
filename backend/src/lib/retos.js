/**
 * lib/retos.js
 *
 * Retos de asistencia (RQF-12): quien puede entrar a un reto y que pasa con el
 * reto en cada check-in.
 *
 * Un reto tiene meta (meta_asistencias: numero de check-ins), fechas de inicio
 * y fin, segmento elegible y recompensa. El miembro NO se inscribe a mano:
 * queda inscrito en su primer check-in dentro de las fechas del reto si en ese
 * momento es del segmento (HU-49), y desde ahi cada check-in valido le suma 1.
 * Al llegar a la meta el reto queda COMPLETADO para el, una sola vez, y se le
 * avisa al gimnasio (campana) y al miembro (bandeja de la app).
 *
 * Columnas: las de produccion (ConsultasDB). reto: meta_asistencias,
 * recompensa, segmento_elegible, estado, activo; reto_miembro: estado
 * (EN_CURSO / COMPLETADO / CANCELADO), checkins_acumulados, porcentaje_avance,
 * fecha_inscripcion, fecha_completado.
 *
 * Nada de esto debe frenar el check-in: `registrarProgresoRetos` nunca lanza.
 */
const { ULTIMO_PLAN } = require('./planes');

const ZONA_GIMNASIO = 'America/Bogota';

// El dia de hoy en Colombia. Las fechas del reto son dias del gimnasio: un
// ingreso a las 8 p. m. del ultimo dia cuenta aunque en UTC ya sea el siguiente.
const HOY = `(NOW() AT TIME ZONE '${ZONA_GIMNASIO}')::date`;

// Segmentos que se pueden elegir. Los nombres son los del CHECK de produccion
// (reto_segmento_elegible_check); ETIQUETA tambien cabe en el CHECK, pero las
// etiquetas de comportamiento no tienen pantalla, asi que no se ofrece.
const SEGMENTOS = ['TODOS', 'NUEVOS', 'INACTIVOS', 'PROXIMOS_A_VENCER'];

const DIAS_NUEVO = 30;          // NUEVOS: inscritos hace 30 dias o menos
const DIAS_POR_VENCER = 7;      // PROXIMOS_A_VENCER: el plan vence en 7 dias o menos
const UMBRAL_INACTIVO_DEFECTO = 7; // si el gimnasio no tiene configuracion_gimnasio

/** Reto que hoy cuenta: activo, no cancelado y dentro de sus fechas. */
const RETO_VIGENTE = `r.activo = TRUE AND r.estado <> 'CANCELADO'
          AND ${HOY} BETWEEN r.fecha_inicio AND r.fecha_fin`;

/**
 * Condicion SQL: el miembro `m` es del segmento del reto `r`. Necesita en el
 * FROM `cg` (LEFT JOIN configuracion_gimnasio del gimnasio del reto).
 *
 * `excluir` es el parametro ($n) con el id del check-in que se acaba de
 * registrar: para INACTIVOS se mira el ingreso anterior a este, no este.
 *
 *   TODOS              cualquier miembro activo del gimnasio
 *   NUEVOS             fecha_registro en los ultimos 30 dias
 *   INACTIVOS          sin ingreso valido en los ultimos N dias, con N el
 *                      umbral de la alerta amarilla del gimnasio (RQF-08). Como
 *                      en jobs/abandono.js, quien nunca ha venido cuenta desde
 *                      su fecha de registro.
 *   PROXIMOS_A_VENCER  ultimo plan (plan_cobro) no congelado que vence entre
 *                      hoy y dentro de 7 dias
 */
function condicionSegmento(excluir) {
  const umbral = `COALESCE(cg.umbral_alerta_amarilla, ${UMBRAL_INACTIVO_DEFECTO})`;
  return `(CASE r.segmento_elegible
            WHEN 'TODOS' THEN TRUE
            WHEN 'NUEVOS' THEN m.fecha_registro >= NOW() - INTERVAL '${DIAS_NUEVO} days'
            WHEN 'INACTIVOS' THEN
                  m.fecha_registro <= NOW() - make_interval(days => ${umbral})
              AND NOT EXISTS (
                    SELECT 1 FROM checkin c
                     WHERE c.id_miembro = m.id_miembro AND c.id_gimnasio = m.id_gimnasio
                       AND c.valido = TRUE AND c.id_checkin <> ${excluir}
                       AND c.fecha_hora > NOW() - make_interval(days => ${umbral}))
            WHEN 'PROXIMOS_A_VENCER' THEN EXISTS (
                    SELECT 1 FROM ${ULTIMO_PLAN} pc
                     WHERE pc.id_miembro = m.id_miembro AND pc.congelado_desde IS NULL
                       AND pc.fecha_fin BETWEEN ${HOY} AND ${HOY} + ${DIAS_POR_VENCER})
            ELSE FALSE
          END)`;
}

const TITULO_AVISO_GIMNASIO = 'Reto completado';
const TITULO_AVISO_MIEMBRO = '¡Completaste un reto!';

/** Textos de los avisos al completar. La recompensa es opcional en el esquema. */
function textosCompletado({ nombre, reto, recompensa }) {
  return {
    gimnasio: `${nombre} completó el reto «${reto}».`
      + (recompensa ? ` Recompensa: ${recompensa}.` : ''),
    miembro: `¡Completaste el reto «${reto}»!`
      + (recompensa ? ` Tu recompensa: ${recompensa}. Reclámala en recepción.` : ''),
  };
}

/** Mensaje de la pantalla de check-in cuando se completa uno o mas retos. */
function mensajeCheckin(completados) {
  if (completados.length === 0) return null;
  if (completados.length === 1) return `¡Completaste el reto «${completados[0].nombre}»!`;
  return `¡Completaste los retos ${completados.map((r) => `«${r.nombre}»`).join(' y ')}!`;
}

const SIN_RETOS = Object.freeze({ inscritos: [], progreso: [], completados: [], mensaje: null });

/**
 * Despues de un check-in valido: inscribe al miembro en los retos vigentes de
 * su segmento, le suma el ingreso en todos los que tiene en curso y, si llego a
 * la meta, marca el reto como COMPLETADO y deja los dos avisos.
 *
 * Todo va en una transaccion: o quedan la inscripcion, el progreso, el
 * completado y los avisos, o nada (y el check-in sigue igual). El completado
 * pasa una sola vez porque el UPDATE solo toca filas EN_CURSO: si dos ingresos
 * llegan a la vez, el segundo espera el bloqueo de la fila, la vuelve a leer ya
 * COMPLETADO y no la toca.
 *
 * Los check-in rechazados (vencido, congelado, sin plan) y los repetidos de la
 * ventana antirrebote no llegan aqui: checkin.js responde antes.
 *
 * @returns {Promise<object|null>} { inscritos, progreso, completados, mensaje },
 *   o null si algo fallo.
 */
async function registrarProgresoRetos(pool, { gymId, idMiembro, idCheckin, nombre }) {
  let client;
  try {
    // Lo normal es que el gimnasio no tenga retos vigentes: una consulta y listo,
    // sin abrir transaccion (el check-in tiene que ser rapido, RQNF-01).
    const { rows: hay } = await pool.query(
      `SELECT 1 FROM reto r WHERE r.id_gimnasio = $1 AND ${RETO_VIGENTE} LIMIT 1`,
      [gymId]
    );
    if (hay.length === 0) return SIN_RETOS;

    client = await pool.connect();
    await client.query('BEGIN');

    // 1) Inscripcion en los retos vigentes de su segmento. ON CONFLICT: dos
    //    ingresos a la vez no lo inscriben dos veces (UNIQUE id_reto, id_miembro).
    const { rows: nuevas } = await client.query(
      `INSERT INTO reto_miembro (id_reto, id_miembro, estado, checkins_acumulados, porcentaje_avance)
       SELECT r.id_reto, m.id_miembro, 'EN_CURSO', 0, 0
         FROM reto r
         INNER JOIN miembro m ON m.id_miembro = $2 AND m.id_gimnasio = r.id_gimnasio AND m.activo = TRUE
         LEFT JOIN configuracion_gimnasio cg ON cg.id_gimnasio = r.id_gimnasio
        WHERE r.id_gimnasio = $1 AND ${RETO_VIGENTE}
          AND NOT EXISTS (SELECT 1 FROM reto_miembro rm
                           WHERE rm.id_reto = r.id_reto AND rm.id_miembro = m.id_miembro)
          AND ${condicionSegmento('$3')}
        -- Siempre en el mismo orden: dos ingresos a la vez esperan uno al otro
        -- en la misma fila en vez de bloquearse en cruz.
        ORDER BY r.id_reto
       ON CONFLICT (id_reto, id_miembro) DO NOTHING
       RETURNING id_reto`,
      // Sin id de check-in (0) no se excluye ninguno; con NULL, el <> de
      // INACTIVOS daria NULL y cualquiera pareceria inactivo.
      [gymId, idMiembro, idCheckin || 0]
    );

    // 2) Este ingreso suma en todos los retos vigentes que tiene en curso
    //    (tambien en los que se acaba de inscribir).
    const { rows: avance } = await client.query(
      `UPDATE reto_miembro rm
          SET checkins_acumulados = rm.checkins_acumulados + 1,
              porcentaje_avance = LEAST(100, ROUND((rm.checkins_acumulados + 1) * 100.0 / r.meta_asistencias, 2)),
              estado = CASE WHEN rm.checkins_acumulados + 1 >= r.meta_asistencias
                            THEN 'COMPLETADO' ELSE rm.estado END,
              fecha_completado = CASE WHEN rm.checkins_acumulados + 1 >= r.meta_asistencias
                                      THEN NOW() ELSE rm.fecha_completado END
         FROM reto r
        WHERE r.id_reto = rm.id_reto AND r.id_gimnasio = $1
          AND rm.id_miembro = $2 AND rm.estado = 'EN_CURSO'
          AND ${RETO_VIGENTE}
        RETURNING r.id_reto, r.nombre, r.recompensa, r.meta_asistencias,
                  rm.checkins_acumulados, rm.porcentaje_avance::float AS porcentaje_avance, rm.estado`,
      [gymId, idMiembro]
    );

    // 3) Avisos de los que se acaban de completar: al gimnasio y al miembro.
    const completados = avance.filter((r) => r.estado === 'COMPLETADO');
    for (const r of completados) {
      const textos = textosCompletado({ nombre: nombre || 'Un miembro', reto: r.nombre, recompensa: r.recompensa });
      await client.query(
        `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje, destinatario)
         VALUES ($1, $2, 'RETO', $3, $4, 'GIMNASIO'),
                ($1, $2, 'RETO', $5, $6, 'MIEMBRO')`,
        [gymId, idMiembro, TITULO_AVISO_GIMNASIO, textos.gimnasio, TITULO_AVISO_MIEMBRO, textos.miembro]
      );
    }

    await client.query('COMMIT');

    const resumen = (r) => ({
      id: r.id_reto,
      nombre: r.nombre,
      acumulados: r.checkins_acumulados,
      meta: r.meta_asistencias,
      porcentaje: r.porcentaje_avance,
      completado: r.estado === 'COMPLETADO',
      recompensa: r.recompensa,
    });
    return {
      inscritos: nuevas.map((r) => r.id_reto),
      progreso: avance.map(resumen),
      completados: completados.map(resumen),
      mensaje: mensajeCheckin(completados),
    };
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[retos] No se pudo registrar el progreso:', err.message);
    return null;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  registrarProgresoRetos,
  condicionSegmento,
  textosCompletado,
  mensajeCheckin,
  HOY,
  RETO_VIGENTE,
  SEGMENTOS,
  ZONA_GIMNASIO,
  TITULO_AVISO_GIMNASIO,
  TITULO_AVISO_MIEMBRO,
};
