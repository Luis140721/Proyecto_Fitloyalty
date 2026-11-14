/**
 * jobs/abandono.js
 *
 * Motor diario de abandono (RQF-08). Cada dia mira cuanto lleva cada miembro
 * sin venir y deja una alerta en `alerta_abandono`:
 *
 *   AMARILLA  al llegar a `umbral_alerta_amarilla` dias sin ingresar (7 por defecto)
 *   ROJA      al llegar a `umbral_alerta_roja` dias (15 por defecto)
 *
 * Los umbrales los edita cada gimnasio en Configuracion
 * (`configuracion_gimnasio`). La campana del administrador muestra las alertas
 * PENDIENTE (routes/notificaciones.js).
 *
 * Reglas:
 *   - Solo se evalua a quien tiene una membresia vigente y no congelada: un plan
 *     vencido es un tema de renovacion (aviso de vencimiento) y uno congelado
 *     no esta obligado a venir.
 *   - Quien nunca ha ingresado cuenta desde su fecha de registro.
 *   - Un miembro tiene a lo sumo una alerta PENDIENTE: si cruza de AMARILLA a
 *     ROJA se actualiza la misma, y si vuelve a ingresar se cierra como
 *     GESTIONADA. Si deja de aplicar (congelo, vencio, se dio de baja) se cierra
 *     como IGNORADA.
 *   - Es idempotente: correrlo dos veces el mismo dia no duplica nada.
 */

const pool = require('../db/db');
const { ULTIMO_PLAN } = require('../lib/planes');

const POR_DEFECTO = { amarilla: 7, roja: 15 };

/**
 * Nivel de alerta para un numero de dias sin venir, o null si no llega a la
 * amarilla.
 */
function nivelPara(dias, amarilla, roja) {
  if (dias >= roja) return 'ROJA';
  if (dias >= amarilla) return 'AMARILLA';
  return null;
}

/** Miembros activos con membresia vigente y no congelada, con sus dias sin venir. */
async function candidatos(gymId) {
  const params = [];
  let filtroGym = '';
  if (gymId) {
    params.push(gymId);
    filtroGym = 'AND m.id_gimnasio = $1';
  }
  const { rows } = await pool.query(
    `SELECT m.id_miembro, m.id_gimnasio,
            (CURRENT_DATE - COALESCE(ult.ultima, m.fecha_registro)::date)::int AS dias,
            COALESCE(cg.umbral_alerta_amarilla, ${POR_DEFECTO.amarilla})::int AS amarilla,
            COALESCE(cg.umbral_alerta_roja, ${POR_DEFECTO.roja})::int AS roja
       FROM miembro m
       INNER JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
       INNER JOIN ${ULTIMO_PLAN} pc ON pc.id_miembro = m.id_miembro
       LEFT JOIN configuracion_gimnasio cg ON cg.id_gimnasio = m.id_gimnasio
       LEFT JOIN LATERAL (
         SELECT MAX(c.fecha_hora) AS ultima
           FROM checkin c
          WHERE c.id_miembro = m.id_miembro AND c.valido = TRUE
       ) ult ON TRUE
      WHERE m.activo = TRUE
        AND g.activo = TRUE
        AND pc.congelado_desde IS NULL
        AND pc.fecha_fin >= CURRENT_DATE
        ${filtroGym}`,
    params
  );
  return rows;
}

/** Alertas PENDIENTE (de un gimnasio o de todos), de la mas vieja a la mas nueva. */
async function pendientes(gymId) {
  const params = [];
  let filtroGym = '';
  if (gymId) {
    params.push(gymId);
    filtroGym = 'AND id_gimnasio = $1';
  }
  const { rows } = await pool.query(
    `SELECT id_alerta, id_miembro, nivel, dias_inactivo
       FROM alerta_abandono
      WHERE estado = 'PENDIENTE' ${filtroGym}
      ORDER BY id_alerta`,
    params
  );
  return rows;
}

/**
 * Logica principal. Llamable desde el cron o desde el endpoint admin.
 *
 *   { gymId }          -> solo ese gimnasio (el endpoint manual); sin el, todos.
 *   { dryRun: true }   -> calcula y cuenta, pero no escribe.
 */
async function runJob({ gymId = null, dryRun = false } = {}) {
  const resumen = {
    evaluados: 0,
    creadas: 0,
    escaladas: 0,
    actualizadas: 0,
    cerradas: 0,
    sinCambio: 0,
    dryRun,
  };

  const [lista, abiertas] = await Promise.all([candidatos(gymId), pendientes(gymId)]);

  // Por miembro, la alerta pendiente mas reciente; las anteriores sobran.
  const abierta = new Map();
  const sobrantes = [];
  for (const a of abiertas) {
    if (abierta.has(a.id_miembro)) sobrantes.push(abierta.get(a.id_miembro).id_alerta);
    abierta.set(a.id_miembro, a);
  }

  const cerrar = async (ids, estado) => {
    if (ids.length === 0) return;
    resumen.cerradas += ids.length;
    if (dryRun) return;
    await pool.query(
      `UPDATE alerta_abandono
          SET estado = $2, fecha_gestion = NOW()
        WHERE id_alerta = ANY($1::int[]) AND estado = 'PENDIENTE'`,
      [ids, estado]
    );
  };

  await cerrar(sobrantes, 'IGNORADA');

  const vistos = new Set();
  const regresaron = [];

  for (const m of lista) {
    vistos.add(m.id_miembro);
    resumen.evaluados += 1;

    const nivel = nivelPara(m.dias, m.amarilla, m.roja);
    const previa = abierta.get(m.id_miembro);

    if (!nivel) {
      // Volvio a venir (o ya no llega al umbral): la alerta pendiente se cierra.
      if (previa) regresaron.push(previa.id_alerta);
      else resumen.sinCambio += 1;
      continue;
    }

    if (!previa) {
      resumen.creadas += 1;
      if (!dryRun) {
        await pool.query(
          `INSERT INTO alerta_abandono (id_miembro, id_gimnasio, dias_inactivo, nivel, estado)
           VALUES ($1, $2, $3, $4, 'PENDIENTE')`,
          [m.id_miembro, m.id_gimnasio, m.dias, nivel]
        );
      }
      continue;
    }

    if (previa.nivel === nivel && previa.dias_inactivo === m.dias) {
      resumen.sinCambio += 1;
      continue;
    }

    if (previa.nivel !== nivel) resumen.escaladas += 1;
    else resumen.actualizadas += 1;
    if (!dryRun) {
      await pool.query(
        'UPDATE alerta_abandono SET nivel = $2, dias_inactivo = $3 WHERE id_alerta = $1',
        [previa.id_alerta, nivel, m.dias]
      );
    }
  }

  await cerrar(regresaron, 'GESTIONADA');

  // Alertas de quien ya no se evalua (congelo, vencio su plan, se dio de baja).
  const yaNoAplican = [...abierta.values()]
    .filter((a) => !vistos.has(a.id_miembro))
    .map((a) => a.id_alerta);
  await cerrar(yaNoAplican, 'IGNORADA');

  return resumen;
}

module.exports = { runJob, nivelPara, POR_DEFECTO };
