/**
 * lib/contacto-miembro.js
 *
 * RQNF-16: la parte de la Ley 2300 que necesita la base de datos. Las reglas
 * estan en lib/contacto-legal.js (funciones puras); aqui se lee y se guarda la
 * autorizacion de mensajes comerciales y se lee el historial de contactos.
 *
 * Autorizacion de mensajes comerciales (art. 5): es la fila vigente (la
 * ultima) de autorizacion_miembro con tipo MENSAJES_COMERCIALES (migraciones
 * 019 y 017), con los canales que el miembro autorizo en canales_autorizados
 * (art. 2). Sin fila, el miembro NO acepta: asi quedan los que ya existian.
 * Cada cambio agrega otra fila (fecha, version del texto, canal PANEL, APP o
 * ENLACE y quien la registro), nunca se modifica una.
 *
 * Historial de contactos de un miembro (art. 3, frecuencia):
 *   - envio_mensaje con estado ENVIADO (RQF-09 y campañas): el canal sale de
 *     canal_comunicacion.tipo;
 *   - alerta_vencimiento_enviada (avisos automaticos de vencimiento): siempre
 *     por WhatsApp.
 *
 * Fechas: las columnas son TIMESTAMP sin zona, escritas en la zona de la
 * sesion (UTC en Neon y en Docker). Se leen y se comparan con AT TIME ZONE
 * current_setting('TimeZone'), para que pg devuelva el instante correcto aunque
 * el proceso de Node este en otra zona. Los envios se guardan con el reloj de
 * lib/contacto-legal (registrarEnvio), el mismo con que se decide.
 */
const { AppError } = require('./errors');
const { CANALES, inicioDeSemana, puedeContactar, ahora: relojAhora } = require('./contacto-legal');
const { registrarAutorizacion, VERSION_AUTORIZACIONES } = require('./autorizaciones');

const TIPO = 'MENSAJES_COMERCIALES';

/** Solo WHATSAPP y EMAIL, sin repetidos y siempre en el mismo orden. */
function normalizarCanales(canales) {
  if (!Array.isArray(canales)) return [];
  return CANALES.filter((c) => canales.includes(c));
}

/**
 * Autorizacion comercial vigente de varios miembros de un gimnasio. Devuelve
 * un Map de id_miembro a { acepta_mensajes_comerciales, canales_autorizados,
 * fecha, canal, version }. Quien no tiene fila no esta en el Map (no acepta).
 */
async function comercialesDeVarios(db, idsMiembro, gymId) {
  const mapa = new Map();
  if (!idsMiembro || idsMiembro.length === 0) return mapa;
  const { rows } = await db.query(
    `SELECT DISTINCT ON (a.id_miembro)
            a.id_miembro, a.otorgada, a.canales_autorizados, a.canal, a.version_texto,
            (a.fecha AT TIME ZONE current_setting('TimeZone')) AS fecha
       FROM autorizacion_miembro a
      WHERE a.id_miembro = ANY($1::int[]) AND a.id_gimnasio = $2 AND a.tipo = '${TIPO}'
      ORDER BY a.id_miembro, a.fecha DESC, a.id_autorizacion DESC`,
    [idsMiembro.map(Number), gymId]
  );
  for (const r of rows) {
    mapa.set(Number(r.id_miembro), {
      acepta_mensajes_comerciales: r.otorgada === true,
      canales_autorizados: r.otorgada === true ? normalizarCanales(r.canales_autorizados) : [],
      fecha: r.fecha,
      canal: r.canal,
      version: r.version_texto,
    });
  }
  return mapa;
}

const SIN_AUTORIZACION = { acepta_mensajes_comerciales: false, canales_autorizados: [], fecha: null, canal: null, version: null };

/** Autorizacion comercial vigente de un miembro (o la de "no acepta"). */
async function comercialesDe(db, idMiembro, gymId) {
  const mapa = await comercialesDeVarios(db, [idMiembro], gymId);
  return mapa.get(Number(idMiembro)) || { ...SIN_AUTORIZACION };
}

/** Forma de la API (app y panel). */
function preferenciasParaApi(c) {
  return {
    aceptaComerciales: c.acepta_mensajes_comerciales === true,
    canalesAutorizados: c.canales_autorizados || [],
    fecha: c.fecha || null,
    canal: c.canal || null,
    version: c.version || null,
  };
}

/**
 * Contactos que ya salieron para estos miembros desde `desde`. Devuelve un
 * Map de id_miembro a [{ canal, fecha }]. `db` puede ser el pool o el cliente
 * de una transaccion.
 */
async function historialDeVarios(db, idsMiembro, desde) {
  const mapa = new Map((idsMiembro || []).map((id) => [Number(id), []]));
  if (!idsMiembro || idsMiembro.length === 0) return mapa;

  const { rows: envios } = await db.query(
    `SELECT e.id_miembro, c.tipo AS canal,
            (e.fecha_envio AT TIME ZONE current_setting('TimeZone')) AS fecha
       FROM envio_mensaje e
       INNER JOIN canal_comunicacion c ON c.id_canal = e.id_canal
      WHERE e.id_miembro = ANY($1::int[])
        AND e.estado = 'ENVIADO'
        AND e.fecha_envio >= ($2::timestamptz AT TIME ZONE current_setting('TimeZone'))`,
    [idsMiembro.map(Number), desde]
  );
  for (const r of envios) mapa.get(Number(r.id_miembro))?.push({ canal: r.canal, fecha: r.fecha });

  // La tabla de los avisos automaticos es de la migracion 007. Se pregunta si
  // existe en vez de dejar fallar la consulta: dentro de una transaccion, un
  // error la deja abortada.
  const { rows: [tabla] } = await db.query(
    "SELECT to_regclass('public.alerta_vencimiento_enviada') IS NOT NULL AS existe"
  );
  if (tabla && tabla.existe) {
    const { rows: avisos } = await db.query(
      `SELECT id_miembro, 'WHATSAPP' AS canal,
              (enviado_at AT TIME ZONE current_setting('TimeZone')) AS fecha
         FROM alerta_vencimiento_enviada
        WHERE id_miembro = ANY($1::int[])
          AND enviado_at >= ($2::timestamptz AT TIME ZONE current_setting('TimeZone'))`,
      [idsMiembro.map(Number), desde]
    );
    for (const r of avisos) mapa.get(Number(r.id_miembro))?.push({ canal: r.canal, fecha: r.fecha });
  }
  return mapa;
}

/** Contactos de esta semana (desde el lunes, hora de Colombia) de un miembro. */
async function historialDeLaSemana(db, idMiembro, instante) {
  const mapa = await historialDeVarios(db, [idMiembro], inicioDeSemana(instante));
  return mapa.get(Number(idMiembro)) || [];
}

/**
 * Bloqueo por miembro dentro de una transaccion: dos envios a la vez al mismo
 * miembro esperan su turno, y el segundo ya ve en el historial el primero. Se
 * suelta solo con el COMMIT o el ROLLBACK.
 */
async function bloquearContacto(client, idMiembro) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('contacto_miembro'), $1)", [Number(idMiembro)]);
}

/**
 * Lee la autorizacion comercial y el historial de la semana y decide si se
 * puede contactar. `miembro` trae id_miembro y nombre.
 */
async function evaluarContacto(db, { miembro, gymId, canal, clase, instante = relojAhora() }) {
  const comerciales = clase === 'AVISO' ? SIN_AUTORIZACION : await comercialesDe(db, miembro.id_miembro, gymId);
  const historial = await historialDeLaSemana(db, miembro.id_miembro, instante);
  return puedeContactar({ ...miembro, ...comerciales }, canal, instante, historial, { clase });
}

/**
 * Deja constancia de un envio en envio_mensaje dentro de la transaccion de
 * `client`, con la hora del reloj de la Ley 2300 (`fecha`), para que el
 * historial compare con la misma hora con que se decidio.
 * Devuelve { id_envio, estado, fecha_envio }.
 */
async function registrarEnvio(client, {
  gymId, idMiembro, idCanal, mensaje, estado = 'ENVIADO',
  idAlerta = null, idCampana = null, idPlantilla = null, enviadoPor = null, fecha,
}) {
  const { rows } = await client.query(
    `INSERT INTO envio_mensaje (id_gimnasio, id_miembro, id_canal, id_alerta, id_campana, id_plantilla,
                                mensaje_copiado, estado, fecha_envio, enviado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             ($9::timestamptz AT TIME ZONE current_setting('TimeZone')), $10)
     RETURNING id_envio, estado,
               (fecha_envio AT TIME ZONE current_setting('TimeZone')) AS fecha_envio`,
    [gymId, idMiembro, idCanal, idAlerta, idCampana, idPlantilla, mensaje, estado,
     fecha || relojAhora(), enviadoPor]
  );
  return rows[0];
}

/**
 * Guarda la decision del miembro sobre los mensajes comerciales: agrega una
 * fila de MENSAJES_COMERCIALES si algo cambio (si no, no escribe nada).
 *
 *   acepta    true / false; undefined deja lo que habia
 *   canales   ['WHATSAPP', 'EMAIL']; undefined deja los que habia
 *   origen    'PANEL' | 'APP' | 'ENLACE' (canal de la constancia)
 *   detalle   p. ej. { otorgada_por: 'REPRESENTANTE_LEGAL' }
 *
 * Aceptar sin ningun canal no se admite (400 SIN_CANAL). Al darse de baja se
 * guarda la fila sin canales. Devuelve { cambio, antes, despues }.
 */
async function guardarComerciales(db, {
  idMiembro, gymId, acepta, canales, origen, registradaPor = null, detalle = null,
}) {
  const antes = await comercialesDe(db, idMiembro, gymId);
  const nuevaAcepta = acepta === undefined ? antes.acepta_mensajes_comerciales : acepta === true;
  let nuevosCanales = canales === undefined ? antes.canales_autorizados : normalizarCanales(canales);
  if (nuevaAcepta && nuevosCanales.length === 0) {
    throw new AppError(400, 'Para aceptar mensajes comerciales elige al menos un canal (WhatsApp o correo).', 'SIN_CANAL');
  }
  if (!nuevaAcepta) nuevosCanales = [];

  const igual = nuevaAcepta === antes.acepta_mensajes_comerciales
    && JSON.stringify(nuevosCanales) === JSON.stringify(antes.canales_autorizados);
  // Sin fila previa, "no acepta" ya es lo que hay: no se inventa una constancia.
  if (igual) return { cambio: false, antes, despues: antes };

  const fila = await registrarAutorizacion(db, {
    idMiembro, gymId, tipo: TIPO, otorgada: nuevaAcepta, canal: origen, registradaPor,
    canales: nuevaAcepta ? nuevosCanales : null, detalle, version: VERSION_AUTORIZACIONES,
  });
  const despues = {
    acepta_mensajes_comerciales: nuevaAcepta,
    canales_autorizados: nuevosCanales,
    fecha: fila ? fila.fecha : null,
    canal: origen,
    version: VERSION_AUTORIZACIONES,
  };
  return { cambio: true, antes, despues };
}

module.exports = {
  TIPO_COMERCIAL: TIPO,
  normalizarCanales,
  comercialesDeVarios,
  comercialesDe,
  preferenciasParaApi,
  historialDeVarios,
  historialDeLaSemana,
  bloquearContacto,
  evaluarContacto,
  registrarEnvio,
  guardarComerciales,
};
