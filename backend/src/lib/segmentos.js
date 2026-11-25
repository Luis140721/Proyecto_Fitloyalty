/**
 * lib/segmentos.js
 *
 * Segmentos de miembros para las campanas (RQF-10) y los retos (RQF-12).
 * Son los mismos valores que admiten los CHECK de campana.segmento y
 * reto.segmento_elegible en produccion, menos ETIQUETA (no hay pantalla de
 * etiquetas, asi que no se ofrece):
 *
 *   TODOS              miembros activos del gimnasio.
 *   INACTIVOS          sin ingresar hace `dias` dias o mas (o nunca, si se
 *                      registraron hace `dias` dias o mas). Sin congelados: no
 *                      vienen porque no pueden.
 *   NUEVOS             registrados en los ultimos `dias` dias.
 *   PROXIMOS_A_VENCER  su ultimo plan vence entre hoy y dentro de `dias` dias,
 *                      sin congelados.
 *
 * Los dias se cuentan en hora de Colombia: la base guarda TIMESTAMP sin zona en
 * la hora del servidor, igual que en lib/gamificacion.js.
 */
const { ULTIMO_PLAN } = require('./planes');

const ZONA = 'America/Bogota';
const SEGMENTOS = ['TODOS', 'INACTIVOS', 'NUEVOS', 'PROXIMOS_A_VENCER'];
const DIAS_POR_DEFECTO = { TODOS: null, INACTIVOS: 7, NUEVOS: 30, PROXIMOS_A_VENCER: 7 };
const ETIQUETAS = {
  TODOS: 'Todos los miembros activos',
  INACTIVOS: 'Inactivos',
  NUEVOS: 'Nuevos',
  PROXIMOS_A_VENCER: 'Próximos a vencer',
};

// Fecha de hoy en Colombia y fecha local de una columna TIMESTAMP.
const HOY = `(NOW() AT TIME ZONE '${ZONA}')::date`;
const fechaLocal = (col) => `((${col} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE '${ZONA}')::date`;
// Inicio de hoy en Colombia, en la zona de la sesion: se compara directo con una
// columna TIMESTAMP sin zona (p. ej. checkin.fecha_hora).
const INICIO_HOY = `(((${HOY})::timestamp AT TIME ZONE '${ZONA}') AT TIME ZONE current_setting('TimeZone'))`;

function diasDe(segmento, dias) {
  const n = Number.parseInt(dias, 10);
  if (Number.isInteger(n) && n >= 0) return n;
  return DIAS_POR_DEFECTO[segmento];
}

/**
 * SQL y parametros de los miembros de un segmento. $1 es el gimnasio y $2 los
 * dias; con `idMiembro` se agrega $3 y se limita a ese miembro (para saber si
 * es elegible).
 */
function consultaSegmento(gymId, segmento, { dias, idMiembro } = {}) {
  if (!SEGMENTOS.includes(segmento)) {
    const err = new Error(`Segmento no soportado: ${segmento}`);
    err.code = 'SEGMENTO_INVALIDO';
    throw err;
  }
  const n = diasDe(segmento, dias);
  const params = [gymId, n];

  let filtro = 'TRUE';
  if (segmento === 'INACTIVOS') {
    filtro = `pc.congelado_desde IS NULL AND (
                (u.ultima IS NULL AND ${HOY} - ${fechaLocal('m.fecha_registro')} >= $2)
             OR (u.ultima IS NOT NULL AND ${HOY} - ${fechaLocal('u.ultima')} >= $2))`;
  } else if (segmento === 'NUEVOS') {
    filtro = `${HOY} - ${fechaLocal('m.fecha_registro')} <= $2`;
  } else if (segmento === 'PROXIMOS_A_VENCER') {
    filtro = `pc.congelado_desde IS NULL AND pc.fecha_fin >= ${HOY} AND pc.fecha_fin <= ${HOY} + $2::int`;
  }

  let soloUno = '';
  if (idMiembro !== undefined) {
    params.push(idMiembro);
    soloUno = 'AND m.id_miembro = $3';
  }

  const sql = `
    SELECT m.id_miembro, m.nombre, m.telefono, m.codigo_pais_telefono, m.email,
           pc.fecha_fin, u.ultima AS ultima_visita,
           CASE WHEN u.ultima IS NULL THEN NULL ELSE (${HOY} - ${fechaLocal('u.ultima')})::int END AS dias_sin_venir
      FROM miembro m
      LEFT JOIN ${ULTIMO_PLAN} pc ON pc.id_miembro = m.id_miembro
      LEFT JOIN LATERAL (
        SELECT MAX(c.fecha_hora) AS ultima
          FROM checkin c
         WHERE c.id_miembro = m.id_miembro AND c.valido = TRUE
      ) u ON TRUE
     WHERE m.id_gimnasio = $1 AND m.activo = TRUE
       AND ($2::int IS NULL OR $2::int >= 0)
       AND ${filtro}
       ${soloUno}
     ORDER BY m.nombre`;
  return { sql, params, dias: n };
}

/** Miembros del segmento. */
async function miembrosDelSegmento(db, gymId, segmento, opciones = {}) {
  const { sql, params } = consultaSegmento(gymId, segmento, opciones);
  const { rows } = await db.query(sql, params);
  return rows;
}

/** true si el miembro cae hoy en el segmento. */
async function esElegible(db, gymId, idMiembro, segmento, opciones = {}) {
  const { sql, params } = consultaSegmento(gymId, segmento, { ...opciones, idMiembro });
  const { rows } = await db.query(sql, params);
  return rows.length > 0;
}

module.exports = {
  ZONA,
  HOY,
  INICIO_HOY,
  fechaLocal,
  SEGMENTOS,
  DIAS_POR_DEFECTO,
  ETIQUETAS,
  diasDe,
  consultaSegmento,
  miembrosDelSegmento,
  esElegible,
};
