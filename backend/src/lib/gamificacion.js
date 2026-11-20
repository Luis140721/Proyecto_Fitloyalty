/**
 * lib/gamificacion.js
 *
 * Rachas e hitos del check-in (RQF-11).
 *
 * Despues de registrar una asistencia se calcula:
 *   - la racha: dias seguidos (hora de Colombia) con al menos un ingreso valido,
 *     contados hacia atras desde el dia del ingreso;
 *   - el total de asistencias validas;
 * y se otorgan los hitos activos del gimnasio (tabla hito_gamificacion) que el
 * miembro acaba de alcanzar, guardandolos en hito_miembro. El par
 * (id_hito, id_miembro) es UNIQUE: un hito se otorga una sola vez.
 *
 * Nada de esto debe frenar el check-in: quien llama lo envuelve en try/catch
 * (ver `calcularGamificacion`, que nunca lanza).
 */

const ZONA_GIMNASIO = 'America/Bogota';

/**
 * Cuenta los dias seguidos de una lista de fechas 'YYYY-MM-DD' ordenadas de la
 * mas reciente a la mas antigua y sin repetidos. La racha parte de la primera
 * (el dia del ingreso) y se corta en el primer hueco.
 */
function contarRacha(dias) {
  if (!dias.length) return 0;
  const aMs = (d) => Date.UTC(...d.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  let racha = 1;
  for (let i = 1; i < dias.length; i += 1) {
    if (aMs(dias[i - 1]) - aMs(dias[i]) === 24 * 60 * 60 * 1000) racha += 1;
    else break;
  }
  return racha;
}

/**
 * Mensaje de la pantalla de check-in. Si hay hito nuevo, el mensaje es el que
 * configuro el gimnasio; si no, uno segun la racha, con lo que falta para el
 * siguiente hito.
 */
function armarMensaje({ racha, nuevos, proximo }) {
  if (nuevos.length > 0) return nuevos[0].mensaje;
  let base;
  if (racha >= 2) base = `¡Llevas ${racha} días seguidos entrenando! Sigue así.`;
  else base = '¡Buen entrenamiento! Vuelve mañana y empieza tu racha.';
  if (proximo) base += ` Te faltan ${proximo.faltan} para «${proximo.nombre}».`;
  return base;
}

/**
 * Calcula racha y total, otorga los hitos nuevos y devuelve lo que muestra el
 * check-in. Nunca lanza: si algo falla devuelve null y el ingreso queda igual.
 */
async function calcularGamificacion(pool, { gymId, idMiembro }) {
  try {
    const { rows: diasRows } = await pool.query(
      `SELECT DISTINCT to_char(
                ((fecha_hora AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE '${ZONA_GIMNASIO}')::date,
                'YYYY-MM-DD') AS dia
         FROM checkin
        WHERE id_miembro = $1 AND id_gimnasio = $2 AND valido = TRUE
        ORDER BY dia DESC
        LIMIT 400`,
      [idMiembro, gymId]
    );
    const racha = contarRacha(diasRows.map((r) => r.dia));

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM checkin
        WHERE id_miembro = $1 AND id_gimnasio = $2 AND valido = TRUE`,
      [idMiembro, gymId]
    );
    const total = totalRows[0].total;

    // Hitos activos del gimnasio que el miembro todavia no tiene.
    const { rows: pendientes } = await pool.query(
      `SELECT h.id_hito, h.nombre, h.tipo_hito, h.valor_objetivo, h.mensaje
         FROM hito_gamificacion h
        WHERE h.id_gimnasio = $1 AND h.activo = TRUE
          AND NOT EXISTS (SELECT 1 FROM hito_miembro hm
                           WHERE hm.id_hito = h.id_hito AND hm.id_miembro = $2)
        ORDER BY h.valor_objetivo ASC`,
      [gymId, idMiembro]
    );

    const valorDe = (h) => (h.tipo_hito === 'RACHA' ? racha : total);
    const alcanzados = pendientes.filter((h) => valorDe(h) >= h.valor_objetivo);
    const nuevos = [];
    for (const h of alcanzados) {
      // ON CONFLICT: dos check-in a la vez no otorgan el hito dos veces.
      const { rows } = await pool.query(
        `INSERT INTO hito_miembro (id_hito, id_miembro, mostrado_en_checkin)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (id_hito, id_miembro) DO NOTHING
         RETURNING id_hito_miembro`,
        [h.id_hito, idMiembro]
      );
      if (rows.length > 0) {
        nuevos.push({ id: h.id_hito, nombre: h.nombre, tipo: h.tipo_hito, valor: h.valor_objetivo, mensaje: h.mensaje });
      }
    }

    // Siguiente hito: el que menos le falta.
    const restantes = pendientes.filter((h) => valorDe(h) < h.valor_objetivo)
      .map((h) => ({ nombre: h.nombre, tipo: h.tipo_hito, faltan: h.valor_objetivo - valorDe(h) }))
      .sort((a, b) => a.faltan - b.faltan);
    const proximo = restantes[0] || null;

    return {
      racha,
      totalAsistencias: total,
      hitosNuevos: nuevos,
      proximoHito: proximo,
      mensaje: armarMensaje({ racha, nuevos, proximo }),
    };
  } catch (err) {
    console.error('[gamificacion] No se pudo calcular la racha:', err.message);
    return null;
  }
}

module.exports = { calcularGamificacion, contarRacha, armarMensaje };
