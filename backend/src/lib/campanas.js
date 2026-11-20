/**
 * lib/campanas.js
 *
 * Ejecucion de campanas de mensajes (RQF-10).
 *
 * Una campana tiene un segmento (lib/segmentos.js), un mensaje (escrito a mano
 * o copiado de una plantilla_mensaje), un canal (WHATSAPP o EMAIL) y un tipo de
 * disparo: MANUAL (se ejecuta cuando el administrador la lanza) o PROGRAMADO
 * (la ejecuta el scheduler cuando llega fecha_programada).
 *
 * Ejecutar una campana:
 *   1. En una transaccion, con la fila bloqueada (FOR UPDATE) para que dos
 *      ejecuciones a la vez no la manden dos veces: calcula los miembros del
 *      segmento en ese momento, los guarda en campana_destinatario como
 *      PENDIENTE y pasa la campana a ENVIADA con fecha_ejecucion.
 *   2. Fuera de la transaccion, intenta la entrega:
 *      - EMAIL: un correo por miembro con correo (Brevo). Sin correo o si
 *        Brevo falla, el destinatario queda FALLIDO.
 *      - WHATSAPP: si el modulo de WhatsApp esta activo en el servidor, lo
 *        envia solo; si no esta listo (Render no tiene Chrome), los
 *        destinatarios quedan PENDIENTE y el panel los muestra con el boton de
 *        WhatsApp (wa.me) para enviarlos uno a uno, como los recordatorios.
 *   3. Cada entrega deja constancia en envio_mensaje (id_campana, canal, texto
 *      personalizado, estado y fecha), igual que RQF-09.
 *
 * El texto admite variables: {nombre}, {primer_nombre}, {gimnasio},
 * {dias_sin_venir} y {fecha_vencimiento}.
 */
const { miembrosDelSegmento } = require('./segmentos');
const { telefonoWhatsapp } = require('./mensajes');

const VARIABLES = ['nombre', 'primer_nombre', 'gimnasio', 'dias_sin_venir', 'fecha_vencimiento'];

function fmtFecha(f) {
  if (!f) return '';
  const s = f instanceof Date ? f.toISOString().slice(0, 10) : String(f).slice(0, 10);
  const [a, m, d] = s.split('-');
  return a && m && d ? `${d}/${m}/${a}` : s;
}

/** Reemplaza las variables del texto con los datos del miembro. */
function personalizar(texto, { nombre, gimnasio, dias_sin_venir: dias, fecha_fin: fechaFin } = {}) {
  const valores = {
    nombre: nombre || '',
    primer_nombre: String(nombre || '').trim().split(/\s+/)[0] || '',
    gimnasio: gimnasio || 'tu gimnasio',
    dias_sin_venir: dias === null || dias === undefined ? 'varios' : String(dias),
    fecha_vencimiento: fmtFecha(fechaFin),
  };
  return String(texto || '').replace(/\{(\w+)\}/g, (todo, clave) => (
    Object.prototype.hasOwnProperty.call(valores, clave) ? valores[clave] : todo
  ));
}

/**
 * Pasa la campana a ENVIADA y guarda sus destinatarios. Devuelve null si la
 * campana no esta lista para ejecutarse (ya enviada, cancelada o inactiva).
 */
async function congelarDestinatarios(pool, { idCampana, gymId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT c.id_campana, c.id_gimnasio, c.nombre, c.segmento, c.mensaje, c.canal,
              c.dias_inactividad, c.estado, c.activa, c.id_plantilla, g.nombre AS gimnasio
         FROM campana c
         JOIN gimnasio g ON g.id_gimnasio = c.id_gimnasio
        WHERE c.id_campana = $1 AND c.id_gimnasio = $2
        FOR UPDATE OF c`,
      [idCampana, gymId]
    );
    const campana = rows[0];
    if (!campana || campana.estado !== 'PROGRAMADA' || !campana.activa) {
      await client.query('ROLLBACK');
      return null;
    }

    const miembros = await miembrosDelSegmento(client, gymId, campana.segmento, { dias: campana.dias_inactividad });
    for (const m of miembros) {
      await client.query(
        `INSERT INTO campana_destinatario (id_campana, id_miembro, estado_envio)
         VALUES ($1, $2, 'PENDIENTE')
         ON CONFLICT (id_campana, id_miembro) DO NOTHING`,
        [idCampana, m.id_miembro]
      );
    }
    await client.query(
      `UPDATE campana SET estado = 'ENVIADA', fecha_ejecucion = NOW() WHERE id_campana = $1`,
      [idCampana]
    );
    await client.query('COMMIT');
    return { campana, miembros };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Deja constancia de una entrega en envio_mensaje y campana_destinatario. */
async function registrarEntrega(pool, { gymId, idCampana, idPlantilla, idMiembro, canal, mensaje, estado, usuarioId, canalDelGimnasio }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const idCanal = await canalDelGimnasio(client, gymId, canal);
    await client.query(
      `INSERT INTO envio_mensaje (id_gimnasio, id_miembro, id_canal, id_campana, id_plantilla,
                                  mensaje_copiado, estado, fecha_envio, enviado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
      [gymId, idMiembro, idCanal, idCampana, idPlantilla || null, mensaje, estado, usuarioId || null]
    );
    const { rows } = await client.query(
      `UPDATE campana_destinatario SET estado_envio = $3, fecha_envio = NOW()
        WHERE id_campana = $1 AND id_miembro = $2
        RETURNING id_campana_destinatario, estado_envio, fecha_envio`,
      [idCampana, idMiembro, estado]
    );
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ejecuta una campana. `deps` permite inyectar los envios (pruebas):
 *   { canalDelGimnasio, enviarCorreo(to, asunto, texto) -> {delivered},
 *     enviarWhatsapp(telefono, texto), whatsappActivo() -> bool }
 * Devuelve el resumen o null si la campana no estaba lista.
 */
async function ejecutarCampana(pool, { idCampana, gymId, usuarioId }, deps) {
  const congelada = await congelarDestinatarios(pool, { idCampana, gymId });
  if (!congelada) return null;
  const { campana, miembros } = congelada;

  const resumen = { destinatarios: miembros.length, enviados: 0, fallidos: 0, pendientes: 0, canal: campana.canal };
  let whatsappDisponible = campana.canal === 'WHATSAPP' && deps.whatsappActivo();

  for (const m of miembros) {
    const texto = personalizar(campana.mensaje, { ...m, gimnasio: campana.gimnasio });
    const base = {
      gymId, idCampana, idPlantilla: campana.id_plantilla, idMiembro: m.id_miembro,
      canal: campana.canal, mensaje: texto, usuarioId, canalDelGimnasio: deps.canalDelGimnasio,
    };

    if (campana.canal === 'EMAIL') {
      let ok = false;
      if (m.email) {
        try {
          const r = await deps.enviarCorreo(m.email, campana.nombre, texto);
          ok = !!(r && r.delivered);
        } catch (_) { ok = false; }
      }
      await registrarEntrega(pool, { ...base, estado: ok ? 'ENVIADO' : 'FALLIDO' });
      if (ok) resumen.enviados += 1; else resumen.fallidos += 1;
      continue;
    }

    // WHATSAPP
    const telefono = telefonoWhatsapp(m.telefono, m.codigo_pais_telefono);
    if (!telefono) {
      await registrarEntrega(pool, { ...base, estado: 'FALLIDO' });
      resumen.fallidos += 1;
      continue;
    }
    if (whatsappDisponible) {
      try {
        await deps.enviarWhatsapp(telefono, texto);
        await registrarEntrega(pool, { ...base, estado: 'ENVIADO' });
        resumen.enviados += 1;
        continue;
      } catch (err) {
        // Si el cliente no esta listo no tiene sentido seguir intentando: el
        // resto queda para enviarlo a mano desde el panel.
        if (err && (err.code === 'WHATSAPP_NO_LISTO' || err.code === 'WHATSAPP_DESHABILITADO')) {
          whatsappDisponible = false;
        } else {
          await registrarEntrega(pool, { ...base, estado: 'FALLIDO' });
          resumen.fallidos += 1;
          continue;
        }
      }
    }
    resumen.pendientes += 1;
  }
  return resumen;
}

/** Ids de las campanas programadas cuya hora ya llego (de todos los gimnasios). */
async function campanasVencidas(pool) {
  const { rows } = await pool.query(
    `SELECT id_campana, id_gimnasio, creada_por FROM campana
      WHERE activa = TRUE AND estado = 'PROGRAMADA' AND tipo_disparo = 'PROGRAMADO'
        AND fecha_programada IS NOT NULL AND fecha_programada <= NOW()
      ORDER BY fecha_programada
      LIMIT 50`
  );
  return rows;
}

module.exports = {
  VARIABLES,
  personalizar,
  congelarDestinatarios,
  registrarEntrega,
  ejecutarCampana,
  campanasVencidas,
};
