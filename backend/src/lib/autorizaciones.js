/**
 * lib/autorizaciones.js
 *
 * RQNF-17: autorizaciones del miembro y representante legal de los menores
 * (Ley 1581 de 2012, arts. 5, 6 y 7; Decreto 1377 de 2013, arts. 6, 7 y 12,
 * compilados en el Decreto 1074 de 2015, arts. 2.2.2.25.2.3, 2.2.2.25.2.4 y
 * 2.2.2.25.2.9). RQNF-16: la aceptacion de mensajes comerciales (Ley 2300 de
 * 2023, art. 5) es el tipo MENSAJES_COMERCIALES, con sus canales (art. 2) en
 * canales_autorizados (migracion 017); la leen y la guardan
 * lib/contacto-miembro.js y las rutas de preferencias.
 *
 * Lo usan el alta y la edicion del panel (routes/miembros.js) y la app del
 * miembro (routes/cliente.js), para que las dos digan lo mismo y guarden la
 * misma prueba.
 *
 * Cada autorizacion es una fila de autorizacion_miembro (migracion 019) que
 * nunca se modifica: otorgar o revocar agrega otra fila, y la vigente de cada
 * tipo es la ultima. La fila guarda la prueba que piden los arts. 7 y 8 del Decreto
 * 1377: fecha, version del texto, canal y quien la registro.
 *
 * Los textos estan versionados: si se cambia una palabra, se sube la version
 * (VERSION_AUTORIZACIONES) y se deja el texto anterior en TEXTOS, para que la
 * app pueda mostrar lo que el miembro acepto de verdad. El panel muestra los
 * mismos textos (frontend/src/lib/autorizaciones.js); si cambian aqui, hay que
 * cambiarlos alla.
 *
 * Nota: son una implementacion tecnica de la ley; conviene que los revise un
 * abogado antes de usarlos con miembros reales.
 */
const { z } = require('zod');

// v2 (RQNF-16 y ajustes del #102): el texto del representante deja constancia
// de que escucho al menor (Decreto 1377, art. 12; Decreto 1074, art.
// 2.2.2.25.2.9) y se agrega el de mensajes comerciales. Los demas textos no
// cambian; se copian de la v1 para que cada fila tenga su texto exacto.
const VERSION_AUTORIZACIONES = 'v2';

const TIPOS = ['TERMINOS', 'TRATAMIENTO_DATOS', 'DATOS_SENSIBLES', 'REPRESENTANTE_MENOR', 'MENSAJES_COMERCIALES'];

const TEXTOS_V1 = {
  TERMINOS:
    'Acepto el contrato de membresía del gimnasio, que me informa el precio total, la forma de pago, la vigencia, '
    + 'las condiciones de renovación, congelamiento y terminación, y el canal de peticiones, quejas y reclamos. '
    + 'Recibo una copia por WhatsApp y la puedo ver en la app.',
  TRATAMIENTO_DATOS:
    'Autorizo al gimnasio, como responsable, a tratar mis datos personales (identificación, contacto, plan, pagos '
    + 'e ingresos) para gestionar mi membresía, controlar el acceso y avisarme sobre mi plan, según su política de '
    + 'tratamiento de datos. Puedo conocer, actualizar, rectificar y suprimir mis datos y revocar esta autorización '
    + '(Ley 1581 de 2012).',
  DATOS_SENSIBLES:
    'Autorizo de forma expresa al gimnasio a tratar mis datos de salud (condiciones médicas, lesiones y alergias) '
    + 'solo para cuidar mi seguridad durante el entrenamiento. Sé que son datos sensibles, que no estoy obligado(a) '
    + 'a autorizar su tratamiento ni a entregarlos y que mi membresía no depende de ello. Puedo revocar esta '
    + 'autorización en cualquier momento desde la app o en recepción, y entonces esos datos se borran.',
  REPRESENTANTE_MENOR:
    'Como representante legal del menor, autorizo el tratamiento de sus datos personales y acepto el contrato en '
    + 'su nombre, respetando su interés superior y sus derechos fundamentales. Si se marca la autorización de datos '
    + 'sensibles, la doy también como su representante.',
};

/** Textos que se le muestran al titular, por version. */
const TEXTOS = {
  v0: {
    TERMINOS: 'Acepto los términos y condiciones del gimnasio.',
    TRATAMIENTO_DATOS: 'Autorizo el uso de mis datos para fines administrativos y de contacto.',
  },
  v1: TEXTOS_V1,
  v2: {
    ...TEXTOS_V1,
    REPRESENTANTE_MENOR:
      'Como representante legal del menor, autorizo el tratamiento de sus datos personales y acepto el contrato en '
      + 'su nombre, respetando su interés superior y sus derechos fundamentales. Antes de autorizar escuché al menor '
      + 'y tuve en cuenta su opinión según su madurez, autonomía y capacidad para entender el asunto. Si se marca la '
      + 'autorización de datos sensibles o la de mensajes comerciales, la doy también como su representante.',
    MENSAJES_COMERCIALES:
      'Acepto recibir del gimnasio mensajes comerciales y de publicidad (promociones, campañas y mensajes para que '
      + 'vuelva a entrenar) por los canales que marco: WhatsApp, correo o los dos. Sé que no estoy obligado(a) a '
      + 'aceptarlos y que mi membresía no depende de ello. Solo me escribirán de lunes a viernes de 7:00 a. m. a '
      + '7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos, no más de una vez '
      + 'al día ni por varios canales en la misma semana. Puedo cancelarlos en cualquier momento desde la app, con el '
      + 'enlace que va al final de cada mensaje comercial o en recepción (Ley 2300 de 2023).',
  },
};

/** Texto de un tipo en una version (null si no existe). */
function textoAutorizacion(tipo, version = VERSION_AUTORIZACIONES) {
  return (TEXTOS[version] && TEXTOS[version][tipo]) || null;
}

// ---------------------------------------------------------------------------
// Edad y menores
// ---------------------------------------------------------------------------

/** Hoy en Colombia como 'AAAA-MM-DD' (el servidor corre en UTC). */
function hoyEnBogota(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

/**
 * Pasa una fecha a 'AAAA-MM-DD'. pg entrega las columnas DATE como Date a la
 * medianoche local, por eso se leen sus partes locales y no las UTC.
 */
function aTextoFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${p(valor.getMonth() + 1)}-${p(valor.getDate())}`;
  }
  const texto = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

/** Edad cumplida en anos a la fecha `hoy` (null si no hay fecha valida). */
function edadEnAnios(fechaNacimiento, hoy = hoyEnBogota()) {
  const f = aTextoFecha(fechaNacimiento);
  if (!f) return null;
  const [y, m, d] = f.split('-').map(Number);
  const [hy, hm, hd] = hoy.split('-').map(Number);
  let edad = hy - y;
  if (hm < m || (hm === m && hd < d)) edad -= 1;
  return edad;
}

/**
 * Menor de edad: menos de 18 anos segun la fecha de nacimiento. Sin fecha, la
 * tarjeta de identidad (TI) solo la tienen los menores, asi que tambien cuenta.
 */
function esMenorDeEdad({ fecha_nacimiento: fecha, tipo_documento: tipoDoc } = {}, hoy) {
  const edad = edadEnAnios(fecha, hoy);
  if (edad !== null) return edad < 18;
  return tipoDoc === 'TI';
}

/**
 * Fecha de nacimiento valida: texto AAAA-MM-DD de un dia que exista, desde
 * 1900 y que no sea futuro. Sin esto, una fecha mal escrita haria que un
 * menor pasara por adulto (edadEnAnios devolveria null).
 */
function fechaNacimientoValida(valor, hoy = hoyEnBogota()) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const dt = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== valor) return false;
  return valor >= '1900-01-01' && valor <= hoy;
}

// ---------------------------------------------------------------------------
// Representante legal
// ---------------------------------------------------------------------------

const CAMPOS_REPRESENTANTE = [
  'representante_nombre', 'representante_tipo_documento', 'representante_documento',
  'representante_parentesco', 'representante_telefono',
];

/** Datos obligatorios del representante de un menor (Decreto 1377, art. 12). */
const representanteSchema = z.object({
  representante_nombre: z.string({ required_error: 'Falta el nombre del representante legal.', invalid_type_error: 'Falta el nombre del representante legal.' })
    .trim().min(3, 'Escribe el nombre completo del representante legal.').max(100),
  representante_tipo_documento: z.enum(['CC', 'CE', 'PP'], {
    errorMap: () => ({ message: 'Indica el tipo de documento del representante legal (CC, CE o PP).' }),
  }),
  representante_documento: z.string({ required_error: 'Falta el documento del representante legal.', invalid_type_error: 'Falta el documento del representante legal.' })
    .trim().min(4, 'El documento del representante legal parece incompleto.').max(20),
  representante_parentesco: z.string({ required_error: 'Indica el parentesco del representante con el menor.', invalid_type_error: 'Indica el parentesco del representante con el menor.' })
    .trim().min(3, 'Indica el parentesco del representante con el menor.').max(40),
  representante_telefono: z.string({ required_error: 'Falta el teléfono del representante legal.', invalid_type_error: 'Falta el teléfono del representante legal.' })
    .trim().regex(/^\d{7,15}$/, 'El teléfono del representante debe tener entre 7 y 15 dígitos.'),
});

/** Toma solo los campos del representante de un objeto. */
function datosRepresentante(obj = {}) {
  const r = {};
  for (const k of CAMPOS_REPRESENTANTE) r[k] = obj[k] ?? null;
  return r;
}

// ---------------------------------------------------------------------------
// Lectura y escritura del historial
// ---------------------------------------------------------------------------

/**
 * Autorizacion vigente de cada tipo (la ultima fila). `db` es el pool o un
 * cliente dentro de una transaccion. Filtra por miembro Y gimnasio.
 */
async function leerVigentes(db, idMiembro, gymId) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (a.tipo)
            a.id_autorizacion, a.tipo, a.otorgada, a.version_texto, a.canal, a.fecha, a.detalle,
            a.canales_autorizados, u.nombre AS registrada_por
       FROM autorizacion_miembro a
       LEFT JOIN usuario u ON u.id_usuario = a.registrada_por
      WHERE a.id_miembro = $1 AND a.id_gimnasio = $2
      ORDER BY a.tipo, a.fecha DESC, a.id_autorizacion DESC`,
    [idMiembro, gymId]
  );
  const vigentes = {};
  for (const r of rows) vigentes[r.tipo] = r;
  return vigentes;
}

/** Historial completo (lo mas reciente primero), con el texto de cada version. */
async function leerHistorial(db, idMiembro, gymId, limite = 100) {
  const { rows } = await db.query(
    `SELECT a.id_autorizacion, a.tipo, a.otorgada, a.version_texto, a.canal, a.fecha, a.detalle,
            a.canales_autorizados, u.nombre AS registrada_por
       FROM autorizacion_miembro a
       LEFT JOIN usuario u ON u.id_usuario = a.registrada_por
      WHERE a.id_miembro = $1 AND a.id_gimnasio = $2
      ORDER BY a.fecha DESC, a.id_autorizacion DESC
      LIMIT $3`,
    [idMiembro, gymId, limite]
  );
  return rows;
}

/** ¿Esta otorgada hoy la autorizacion de ese tipo? */
function otorgada(vigentes, tipo) {
  return Boolean(vigentes && vigentes[tipo] && vigentes[tipo].otorgada);
}

/**
 * Agrega una fila al historial. Devuelve la fila creada. `canales` solo se
 * usa en MENSAJES_COMERCIALES (WHATSAPP y/o EMAIL, migracion 017).
 */
async function registrarAutorizacion(db, {
  idMiembro, gymId, tipo, otorgada: valor, canal, registradaPor = null, detalle = null,
  version = VERSION_AUTORIZACIONES, canales = null,
}) {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de autorizacion desconocido: ${tipo}`);
  const { rows } = await db.query(
    `INSERT INTO autorizacion_miembro
       (id_miembro, id_gimnasio, tipo, otorgada, version_texto, canal, registrada_por, detalle, canales_autorizados)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar(20)[])
     RETURNING id_autorizacion, tipo, otorgada, version_texto, canal, fecha, canales_autorizados`,
    [idMiembro, gymId, tipo, Boolean(valor), version, canal, registradaPor,
     detalle ? JSON.stringify(detalle) : null,
     Array.isArray(canales) && canales.length > 0 ? canales : null]
  );
  return rows[0];
}

/**
 * Forma publica de las autorizaciones para el panel y la app: un resumen por
 * tipo con el texto que se acepto, mas el historial.
 */
function resumenAutorizaciones(vigentes, historial) {
  const conTexto = (r) => r && ({
    tipo: r.tipo,
    otorgada: r.otorgada,
    version: r.version_texto,
    canal: r.canal,
    fecha: r.fecha,
    registrada_por: r.registrada_por || null,
    texto: textoAutorizacion(r.tipo, r.version_texto),
    detalle: r.detalle || null,
    canales: Array.isArray(r.canales_autorizados) ? r.canales_autorizados : null,
  });
  const resumen = {};
  for (const tipo of TIPOS) resumen[tipo] = vigentes[tipo] ? conTexto(vigentes[tipo]) : null;
  return {
    version_actual: VERSION_AUTORIZACIONES,
    // Textos de la version actual, para mostrarlos antes de otorgar una.
    textos_actuales: TEXTOS[VERSION_AUTORIZACIONES],
    vigentes: resumen,
    historial: (historial || []).map(conTexto),
  };
}

module.exports = {
  VERSION_AUTORIZACIONES,
  TIPOS,
  TEXTOS,
  textoAutorizacion,
  hoyEnBogota,
  aTextoFecha,
  edadEnAnios,
  esMenorDeEdad,
  fechaNacimientoValida,
  CAMPOS_REPRESENTANTE,
  representanteSchema,
  datosRepresentante,
  leerVigentes,
  leerHistorial,
  otorgada,
  registrarAutorizacion,
  resumenAutorizaciones,
};
