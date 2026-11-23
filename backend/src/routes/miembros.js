/**
 * routes/miembros.js
 *
 * CRUD de miembros (socios) del gimnasio del usuario autenticado.
 * Multi-tenant: todas las queries filtran por id_gimnasio.
 *
 *   GET    /api/admin/miembros        -> lista paginada + busqueda por nombre/doc
 *   POST   /api/admin/miembros        -> crea un miembro (genera codigo_qr)
 *   GET    /api/admin/miembros/:id    -> detalle
 *   PUT    /api/admin/miembros/:id    -> actualiza nombre/telefono/email/activo
 *   DELETE /api/admin/miembros/:id    -> soft-delete (activo = false)
 *   GET    /api/admin/miembros/lookup -> busqueda por codigo_qr/documento (para checkin)
 *   POST   /api/admin/miembros/:id/congelar    -> congela la membresia vigente (RQF-04)
 *   POST   /api/admin/miembros/:id/descongelar -> la descongela y corre el vencimiento
 *
 * Handlers async con asyncHandler para que cualquier rechazo llegue al
 * errorHandler central con respuesta consistente.
 */
const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { z } = require('zod');
const { formatZodError, largoEnCaracteres } = require('../lib/validators');
const { ULTIMO_PLAN } = require('../lib/planes');
const { telefonoWhatsapp, mensajeParaMiembro, enPalabras } = require('../lib/mensajes');
const {
  esMenorDeEdad, fechaNacimientoValida, representanteSchema, datosRepresentante,
  CAMPOS_REPRESENTANTE, leerVigentes, leerHistorial, otorgada, registrarAutorizacion,
  resumenAutorizaciones, edadEnAnios,
} = require('../lib/autorizaciones');
const { sendMemberQR } = require('../lib/email');
const { sendWhatsAppQR } = require('../lib/whatsapp'); // <-- NUEVO: Importado el servicio de WhatsApp
const QRCode = require('qrcode');

const router = express.Router();

// Topes de las columnas que escriben el alta y el PUT del plan (migraciones 002
// y 004). Sin ellos un dato que no cabe llegaba a PostgreSQL y la ruta respondia
// 500 o 503 DB_UNREACHABLE (hallazgo de la integracion de la semana 6).
//   - MAX_VALOR_PLAN: plan_cobro.valor_total y valor_pagado son NUMERIC(10,2).
//   - Los VARCHAR(n) se miden en caracteres con hasta(), mas abajo.
//   - valorQueCabe: el alta recibe los valores como texto y los lee con parseFloat.
const MAX_VALOR_PLAN = 99999999.99;
const MENSAJE_VALOR_PLAN = 'El valor del plan no puede pasar de 99.999.999,99';
const valorQueCabe = () => [(texto) => !(parseFloat(texto) > MAX_VALOR_PLAN), { message: MENSAJE_VALOR_PLAN }];

// El id de un miembro en la URL, en todas las rutas de este archivo: un entero
// escrito completo que cabe en miembro.id_miembro, INTEGER (hasta 2147483647).
// Sin esto, un id como "abc" llegaba a PostgreSQL (500 con su mensaje en las
// rutas del plan) y uno como 2147483648 tambien (22003, y la ruta respondia
// 503 "intenta de nuevo").
const ID_MAXIMO = 2147483647;
const esIdDeMiembro = (texto) => /^\d+$/.test(String(texto)) && Number(texto) <= ID_MAXIMO;
function idDeMiembro(texto) {
  if (!esIdDeMiembro(texto)) throw new AppError(400, 'Id inválido', 'VALIDATION_ERROR');
  return Number(texto);
}

// La BD no responde: un error de red de Node, una de las clases de conexion de
// PostgreSQL (08, 57P01 a 57P03 y 53300) o lo que pg lanza sin codigo cuando se
// corta la conexion o el pool no la consigue a tiempo. Solo eso es 503 "intenta
// de nuevo"; cualquier otro error (un dato, una columna, un fallo del codigo) es
// real y sigue al errorHandler (500).
const CODIGOS_DE_RED = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN']);
const PG_SIN_CONEXION = /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error/i;
function esErrorDeConexion(err) {
  const codigo = err && err.code;
  if (codigo) return CODIGOS_DE_RED.has(codigo) || /^08/.test(codigo) || /^57P0[1-3]$/.test(codigo) || codigo === '53300';
  return PG_SIN_CONEXION.test((err && err.message) || '');
}

// Clave secreta para cifrar QR (en producción debería estar en variables de entorno)
const QR_ENCRYPTION_KEY = process.env.QR_ENCRYPTION_KEY || 'FitLoyalty2024SecretKey';

// scryptSync es deliberadamente lento y la clave solo depende de
// QR_ENCRYPTION_KEY: se deriva una vez al cargar el modulo, igual que en
// checkin.js. Es la misma clave de antes, asi que los QR ya cifrados siguen
// descifrando igual.
const QR_KEY = crypto.scryptSync(QR_ENCRYPTION_KEY, 'salt', 32);

// Función para cifrar el código QR
function encryptQrCode(qrCode) {
  const algorithm = 'aes-256-cbc';
  const key = QR_KEY;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(qrCode, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Función para descifrar el código QR
function decryptQrCode(encrypted) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = QR_KEY;
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    // Si falla el descifrado, retornar el texto original (para compatibilidad con QRs antiguos)
    return encrypted;
  }
}

/**
 * Largo maximo de una columna VARCHAR(n) de miembro. Con uno mas
 * la BD rechaza el INSERT (22001) y el API respondia 500 DB_UNREACHABLE
 * (hallazgo de la integracion de la semana 6, restricciones-miembro.test.js).
 *
 * No se usa .max() de zod: cuenta unidades UTF-16 (un emoji vale 2) y
 * PostgreSQL cuenta caracteres, asi que un nombre que cabe en la columna
 * quedaba rechazado. largoEnCaracteres mide igual que la BD.
 */
const hasta = (schema, n, campo) =>
  schema.refine((v) => largoEnCaracteres(v) <= n, { message: `${campo} admite máximo ${n} caracteres` });

const createSchema = z.object({
  // Datos personales
  nombre:     hasta(z.string().min(2, 'El nombre es requerido'), 100, 'El nombre'),
  tipo_documento: z.enum(['CC', 'TI', 'NIT', 'CE', 'PP']).default('CC'),
  documento: hasta(z.string().min(4, 'El documento es requerido'), 20, 'El documento'),
  fecha_nacimiento: z.string().optional(),
  // El select de genero puede quedar en "Seleccionar...", que llega como
  // cadena vacia: se traduce a "sin dato" en vez de romper la validacion.
  genero: z.enum(['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  telefono:  hasta(z.string().min(7, 'El telefono es requerido'), 20, 'El teléfono'),
  email:     hasta(z.string().email(), 150, 'El correo').optional().or(z.literal('').transform(() => undefined)),
  direccion: z.string().optional(),
  // Salud y emergencia
  contacto_emergencia: hasta(z.string(), 100, 'El contacto de emergencia').optional(),
  telefono_emergencia: hasta(z.string(), 20, 'El teléfono de emergencia').optional(),
  condiciones_medicas: z.string().optional(),
  alergias: z.string().optional(),
  // Plan y cobros
  tipo_plan: z.enum(['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CLASES_SUELTAS', 'ILIMITADO', 'OTRO']).default('MENSUAL'),
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional(),
  valor_total: z.string().refine(...valorQueCabe()).optional(),
  valor_pagado: z.string().refine(...valorQueCabe()).default('0'),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'PSE', 'NEQUI', 'DAVIPLATA', 'OTRO']).default('EFECTIVO'),
  referencia_pago: hasta(z.string(), 100, 'La referencia del pago').optional(),
  estado_pago: z.enum(['PENDIENTE', 'PAGADO', 'PARCIAL']).default('PENDIENTE'),
  proxima_fecha_cobro: z.string().optional(),
  activar_recordatorio: z.boolean().default(false),
  dias_recordatorio: z.number().default(7),
  // Info adicional
  objetivo: hasta(z.string(), 50, 'El objetivo').optional(),
  nivel_experiencia: hasta(z.string(), 30, 'El nivel de experiencia').optional(),
  observaciones: z.string().optional(),
  // Términos
  acepto_terminos: z.boolean().default(false),
  autorizo_datos: z.boolean().default(false),
  // RQNF-17: autorizacion expresa, separada y opcional para los datos
  // sensibles. Sin ella no se guardan condiciones_medicas ni alergias.
  autorizo_datos_sensibles: z.boolean().default(false),
  // Representante legal: obligatorio si el miembro es menor de edad
  // (validarMenorEnAlta, abajo).
  representante_nombre:         z.string().max(100).nullable().optional(),
  representante_tipo_documento: z.string().max(10).nullable().optional(),
  representante_documento:      z.string().max(20).nullable().optional(),
  representante_parentesco:     z.string().max(40).nullable().optional(),
  representante_telefono:       z.string().max(20).nullable().optional(),
  autoriza_representante: z.boolean().default(false),
  activo: z.boolean().default(true),
  qr_imagen: z.string().optional(), // Imagen del QR en base64
  // Contrasena para la app movil del cliente. Si viene vacia/null, no se
  // asigna (el miembro no podra entrar a la app hasta que se la asignen).
  // Se guarda hasheada con bcrypt en password_hash.
  password: z.string().min(6, 'La contrasena debe tener minimo 6 caracteres').optional().or(z.literal('').transform(() => undefined)),
  app_acceso: z.boolean().default(true),
}).superRefine(validarMenorEnAlta);

/**
 * RQNF-17 (Decreto 1377 de 2013, art. 12): si el miembro es menor de edad,
 * los datos de su representante legal y la autorizacion de este son
 * obligatorios. Tambien rechaza una fecha de nacimiento mal escrita o futura,
 * que de otro modo haria pasar a un menor por adulto.
 */
function validarMenorEnAlta(d, ctx) {
  if (d.fecha_nacimiento && !fechaNacimientoValida(d.fecha_nacimiento)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fecha_nacimiento'],
      message: 'La fecha de nacimiento no es válida: usa AAAA-MM-DD y una fecha que no sea futura.',
    });
    return;
  }
  if (!esMenorDeEdad(d)) return;
  const rep = representanteSchema.safeParse(datosRepresentante(d));
  if (!rep.success) rep.error.issues.forEach((issue) => ctx.addIssue(issue));
  if (!d.autoriza_representante) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['autoriza_representante'],
      message: 'El miembro es menor de edad: falta la autorización de su representante legal.',
    });
  }
}

/** Codigo de error: si falla algo del menor, el front lo distingue. */
function codigoValidacion(issues = []) {
  const delMenor = issues.some((i) => [...CAMPOS_REPRESENTANTE, 'autoriza_representante'].includes(i.path?.[0]));
  return delMenor ? 'REPRESENTANTE_REQUERIDO' : 'VALIDATION_ERROR';
}

/**
 * Campos editables de un miembro.
 *
 * Antes solo aceptaba nombre, telefono, email, activo y qr_imagen: el resto
 * del formulario se enviaba pero zod lo descartaba en silencio, asi que el
 * usuario creia haber guardado y no se guardaba nada. Ahora se aceptan todas
 * las columnas de datos del miembro.
 *
 * Quedan FUERA a proposito:
 *   - id_miembro / id_gimnasio: identidad, no se tocan.
 *   - codigo_qr: lo genera el servidor; cambiarlo invalidaria el QR impreso
 *     que el miembro ya tiene.
 *   - fecha_registro: es un hecho historico.
 *
 * Las cadenas vacias se convierten a null para no guardar "" en columnas
 * opcionales.
 */
const vacioANull = (schema) =>
  z.literal('').transform(() => null).or(schema.optional()).nullable();

const updateSchema = z.object({
  nombre:    hasta(z.string().min(2), 100, 'El nombre').optional(),
  documento: hasta(z.string().min(3), 20, 'El documento').optional(),
  telefono:  hasta(z.string().min(7), 20, 'El teléfono').optional(),
  email:     hasta(z.string().email(), 150, 'El correo').optional().or(z.literal('').transform(() => null)).nullable(),
  activo:    z.boolean().optional(),
  qr_imagen: z.string().optional(),

  // Datos personales
  tipo_documento:      vacioANull(hasta(z.string(), 10, 'El tipo de documento')),
  fecha_nacimiento:    vacioANull(z.string()),
  genero:              vacioANull(hasta(z.string(), 20, 'El género')),
  codigo_pais_telefono: vacioANull(hasta(z.string(), 5, 'El código de país')),
  ciudad:              vacioANull(hasta(z.string(), 100, 'La ciudad')),
  direccion:           vacioANull(z.string()),

  // Salud y emergencia
  contacto_emergencia:  vacioANull(hasta(z.string(), 100, 'El contacto de emergencia')),
  telefono_emergencia:  vacioANull(hasta(z.string(), 20, 'El teléfono de emergencia')),
  condiciones_medicas:  vacioANull(z.string()),
  alergias:             vacioANull(z.string()),

  // Perfil de entrenamiento
  objetivo:             vacioANull(hasta(z.string(), 50, 'El objetivo')),
  nivel_experiencia:    vacioANull(hasta(z.string(), 30, 'El nivel de experiencia')),
  observaciones:        vacioANull(z.string()),

  // App móvil del cliente
  // password: si llega string >=6 chars, se hashea y se guarda en password_hash.
  //           si llega '', se interpreta como "borrar contrasena" (null en BD).
  //           si no viene, NO se toca el password_hash existente.
  // app_acceso: booleano para apagar/encender acceso a la app del miembro.
  password: z.string().min(6, 'La contrasena debe tener minimo 6 caracteres').optional(),
  app_acceso: z.boolean().optional(),

  // RQNF-17: autorizaciones y representante legal. No son columnas sueltas:
  // las procesa actualizarConAutorizaciones (abajo), que deja constancia en
  // autorizacion_miembro.
  //   autorizo_datos_sensibles: true otorga, false revoca y borra los datos.
  //   autoriza_representante:   true registra la autorizacion del
  //                             representante (obligatoria para un menor).
  autorizo_datos_sensibles:     z.boolean().optional(),
  autoriza_representante:       z.boolean().optional(),
  representante_nombre:         vacioANull(z.string().max(100)),
  representante_tipo_documento: vacioANull(z.string().max(10)),
  representante_documento:      vacioANull(z.string().max(20)),
  representante_parentesco:     vacioANull(z.string().max(40)),
  representante_telefono:       vacioANull(z.string().max(20)),
});

// El mensaje por defecto de zod para el correo es "Invalid email" y el front lo
// muestra tal cual. Se cambia por el mismo texto del formulario (MiembrosPage.jsx,
// EMAIL_RE), que deja pasar correos que zod rechaza, como "ana..perez@correo.co".
// Va en parse() y no en cada .email() de los esquemas: vale para el alta y la
// edicion, y un mensaje puesto en el esquema sigue ganando.
const CORREO_INVALIDO = 'Este correo no tiene un formato válido.';

function mensajesDeValidacion(issue, ctx) {
  if (issue.code === 'invalid_string' && issue.validation === 'email') return { message: CORREO_INVALIDO };
  return { message: ctx.defaultError };
}

/** Claves de updateSchema que no son columnas de miembro. */
const NO_COLUMNAS = new Set(['autorizo_datos_sensibles', 'autoriza_representante']);

/**
 * ¿La edicion toca algo de RQNF-17? Entonces hay que mirar el estado actual
 * del miembro (edad, representante, autorizaciones) dentro de una
 * transaccion. Si no, la edicion sigue el camino simple de siempre.
 */
function tocaAutorizaciones(d) {
  return d.autorizo_datos_sensibles !== undefined
    || d.autoriza_representante !== undefined
    || CAMPOS_REPRESENTANTE.some((k) => d[k] !== undefined)
    || d.condiciones_medicas !== undefined
    || d.alergias !== undefined
    || (d.fecha_nacimiento !== undefined && d.fecha_nacimiento !== null)
    || d.tipo_documento === 'TI';
}

function parse(schema, payload) {
  const result = schema.safeParse(payload || {}, { errorMap: mensajesDeValidacion });
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

function genQrCode(gymId) {
  // 8 chars legibles, sin ambiguedades (sin 0/O/1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `FL-${gymId}-${out}`;
}

function calcularFechaFin(tipoPlan, fechaInicio) {
  if (!fechaInicio) return null;
  const inicio = new Date(fechaInicio);
  let dias = 30; // Por defecto mensual
  
  switch (tipoPlan.toUpperCase()) {
    case 'MENSUAL':
      dias = 30;
      break;
    case 'TRIMESTRAL':
      dias = 90;
      break;
    case 'SEMESTRAL':
      dias = 180;
      break;
    case 'ANUAL':
      dias = 365;
      break;
    case 'CLASES_SUELTAS':
    case 'ILIMITADO':
    default:
      dias = 30;
  }
  
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + dias);
  return fin.toISOString().split('T')[0];
}

function determinarEstadoPago(valorTotal, valorPagado) {
  const total = parseFloat(valorTotal) || 0;
  const pagado = parseFloat(valorPagado) || 0;
  
  if (pagado >= total) return 'PAGADO';
  if (pagado > 0) return 'PARCIAL';
  return 'PENDIENTE';
}

function calcularProximaFechaCobro(fechaFin) {
  if (!fechaFin) return null;
  const fin = new Date(fechaFin);
  const proxima = new Date(fin);
  proxima.setDate(proxima.getDate() + 1); // Un día después de que vence
  return proxima.toISOString().split('T')[0];
}

/**
 * RQNF-17: prueba de las autorizaciones del alta (Decreto 1377, arts. 7 y 8).
 * Se guarda una fila por cada autorizacion, otorgada o no, con la version del
 * texto, el canal PANEL y el usuario que registro al miembro. Si es menor, las
 * da su representante y se guarda ademas la autorizacion de este con la foto
 * de sus datos.
 */
async function registrarAutorizacionesAlta(db, { idMiembro, gymId, usuario, data, menor, rep }) {
  const base = { idMiembro, gymId, canal: 'PANEL', registradaPor: usuario };
  const porRepresentante = menor ? { otorgada_por: 'REPRESENTANTE_LEGAL' } : null;
  const filas = [];
  filas.push(await registrarAutorizacion(db, { ...base, tipo: 'TERMINOS', otorgada: data.acepto_terminos, detalle: porRepresentante }));
  filas.push(await registrarAutorizacion(db, { ...base, tipo: 'TRATAMIENTO_DATOS', otorgada: data.autorizo_datos, detalle: porRepresentante }));
  filas.push(await registrarAutorizacion(db, { ...base, tipo: 'DATOS_SENSIBLES', otorgada: data.autorizo_datos_sensibles, detalle: porRepresentante }));
  if (menor) {
    filas.push(await registrarAutorizacion(db, {
      ...base,
      tipo: 'REPRESENTANTE_MENOR',
      otorgada: true,
      detalle: { ...rep, edad_miembro: edadEnAnios(data.fecha_nacimiento) },
    }));
  }
  return filas;
}

/** Normaliza un texto para comparar datos del representante. */
const norm = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * PUT con cambios de RQNF-17 (autorizacion de datos sensibles, edad,
 * representante o datos de salud). Corre en una transaccion con el miembro
 * bloqueado:
 *   - Si al final el miembro es menor de edad, el representante tiene que
 *     quedar completo (zod) y su autorizacion registrada; si sus datos
 *     cambian, se pide de nuevo.
 *   - autorizo_datos_sensibles: true otorga, false revoca; cada cambio deja
 *     una fila en el historial.
 *   - Si al final no hay autorizacion de datos sensibles, condiciones_medicas
 *     y alergias quedan en NULL (tambien las que venian de antes de RQNF-17).
 * Devuelve { miembro, autorizaciones, sensiblesBorrados, revocada }.
 */
async function actualizarConAutorizaciones(client, { id, gymId, usuario, d }) {
  const { rows: actualRows } = await client.query(
    `SELECT id_miembro, tipo_documento, to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            condiciones_medicas, alergias,
            representante_nombre, representante_tipo_documento, representante_documento,
            representante_parentesco, representante_telefono
       FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2
       FOR UPDATE`,
    [id, gymId]
  );
  if (actualRows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
  const actual = actualRows[0];
  const vigentes = await leerVigentes(client, id, gymId);

  if (d.fecha_nacimiento && !fechaNacimientoValida(d.fecha_nacimiento)) {
    throw new AppError(400, 'La fecha de nacimiento no es válida: usa AAAA-MM-DD y una fecha que no sea futura.', 'VALIDATION_ERROR');
  }

  const final = {
    tipo_documento: d.tipo_documento !== undefined ? d.tipo_documento : actual.tipo_documento,
    fecha_nacimiento: d.fecha_nacimiento !== undefined ? d.fecha_nacimiento : actual.fecha_nacimiento,
  };
  for (const k of CAMPOS_REPRESENTANTE) final[k] = d[k] !== undefined ? d[k] : actual[k];
  const menor = esMenorDeEdad(final);
  const base = { idMiembro: id, gymId, canal: 'PANEL', registradaPor: usuario };
  const sets = {};

  if (menor) {
    const rep = representanteSchema.safeParse(datosRepresentante(final));
    if (!rep.success) {
      throw new AppError(400, rep.error.issues[0].message, 'REPRESENTANTE_REQUERIDO', { issues: rep.error.issues });
    }
    const cambio = CAMPOS_REPRESENTANTE.some((k) => d[k] !== undefined && norm(d[k]) !== norm(actual[k]));
    const falta = !otorgada(vigentes, 'REPRESENTANTE_MENOR') || cambio;
    if (falta && d.autoriza_representante !== true) {
      throw new AppError(400, cambio
        ? 'Cambiaron los datos del representante legal: marca de nuevo su autorización.'
        : 'El miembro es menor de edad: falta la autorización de su representante legal.', 'REPRESENTANTE_REQUERIDO');
    }
    if (falta) {
      await registrarAutorizacion(client, {
        ...base,
        tipo: 'REPRESENTANTE_MENOR',
        otorgada: true,
        detalle: { ...rep.data, edad_miembro: edadEnAnios(final.fecha_nacimiento) },
      });
    }
    Object.assign(sets, rep.data);
  } else {
    for (const k of CAMPOS_REPRESENTANTE) if (d[k] !== undefined) sets[k] = d[k] === null ? null : norm(d[k]) || null;
  }

  // Datos sensibles.
  const antes = otorgada(vigentes, 'DATOS_SENSIBLES');
  let despues = antes;
  if (d.autorizo_datos_sensibles !== undefined && d.autorizo_datos_sensibles !== antes) {
    despues = d.autorizo_datos_sensibles;
    await registrarAutorizacion(client, {
      ...base,
      tipo: 'DATOS_SENSIBLES',
      otorgada: despues,
      detalle: menor ? { otorgada_por: 'REPRESENTANTE_LEGAL' } : null,
    });
  }
  let sensiblesBorrados = false;
  if (despues) {
    if (d.condiciones_medicas !== undefined) sets.condiciones_medicas = d.condiciones_medicas;
    if (d.alergias !== undefined) sets.alergias = d.alergias;
  } else {
    sensiblesBorrados = Boolean(actual.condiciones_medicas || actual.alergias || d.condiciones_medicas || d.alergias);
    sets.condiciones_medicas = null;
    sets.alergias = null;
  }

  // El resto de campos, igual que el camino simple.
  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || NO_COLUMNAS.has(k) || k in sets) continue;
    if (CAMPOS_REPRESENTANTE.includes(k) || k === 'condiciones_medicas' || k === 'alergias') continue;
    if (k === 'password') {
      params.push(await bcrypt.hash(String(v), 10));
      campos.push(`password_hash = $${params.length}`, 'password_set_at = CURRENT_TIMESTAMP');
      continue;
    }
    params.push(k === 'email' && v ? v.toLowerCase() : v);
    campos.push(`${k} = $${params.length}`);
  }
  for (const [k, v] of Object.entries(sets)) {
    params.push(v);
    campos.push(`${k} = $${params.length}`);
  }
  params.push(id, gymId);
  const { rows } = await client.query(
    `UPDATE miembro SET ${campos.join(', ')}
      WHERE id_miembro = $${params.length - 1} AND id_gimnasio = $${params.length}
      RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen,
                activo, fecha_registro, app_acceso,
                (password_hash IS NOT NULL) AS password_asignada`,
    params
  );
  const autorizaciones = resumenAutorizaciones(
    await leerVigentes(client, id, gymId),
    await leerHistorial(client, id, gymId, 20)
  );
  return { miembro: rows[0], autorizaciones, sensiblesBorrados, revocada: antes && !despues, menor };
}

// ---------------------------------------------------------------------------
// GET /api/admin/miembros  (paginado + busqueda)
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
    const q = (req.query.q || '').trim();
    const includeInactive = req.query.includeInactive === 'true';

    const where = ['m.id_gimnasio = $1'];
    const params = [gymId];
    if (!includeInactive) {
      where.push('m.activo = TRUE');
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const i = params.length;
      where.push(`(LOWER(m.nombre) LIKE $${i} OR LOWER(m.documento) LIKE $${i} OR LOWER(COALESCE(m.email,'')) LIKE $${i} OR LOWER(m.codigo_qr) = LOWER($${i + 1}))`);
      params.push(q);
    }

    const offset = page * pageSize;
    try {
      const { rows: cfg } = await pool.query(
        `SELECT
            COALESCE(cg.dias_recordatorio_default, cn.dias_aviso_vencimiento, 7)::int AS dias_aviso,
            COALESCE(cn.umbral_alerta_amarilla, 15)::int AS dias_riesgo
           FROM (SELECT 1) x
           LEFT JOIN config_gimnasio cg       ON cg.id_gimnasio = $1
           LEFT JOIN configuracion_gimnasio cn ON cn.id_gimnasio = $1`,
        [gymId]
      );
      const diasAviso  = cfg[0]?.dias_aviso  ?? 7;
      const diasRiesgo = cfg[0]?.dias_riesgo ?? 15;

      const { rows } = await pool.query(
        `SELECT m.id_miembro, m.nombre, m.documento, m.telefono, m.email,
                m.codigo_qr, m.activo, m.fecha_registro,
                pc.tipo_plan, pc.fecha_fin, pc.estado_pago, pc.congelado_desde,
                -- Una membresia congelada no se cuenta como vencida ni por vencer:
                -- su vencimiento se corre al descongelarla (RQF-04).
                (pc.congelado_desde IS NOT NULL) AS congelada,
                (pc.congelado_desde IS NULL AND pc.fecha_fin IS NOT NULL AND pc.fecha_fin < CURRENT_DATE) AS vencido,
                (pc.congelado_desde IS NULL AND pc.fecha_fin IS NOT NULL
                  AND pc.fecha_fin >= CURRENT_DATE
                  AND pc.fecha_fin <= CURRENT_DATE + ($${params.length + 1} || ' days')::interval) AS "vencePronto",
                (ult.ultima IS NULL
                  OR ult.ultima < NOW() - ($${params.length + 2} || ' days')::interval) AS "enRiesgo",
                ult.ultima AS ultimo_ingreso,
                (CURRENT_DATE - pc.fecha_fin)::int          AS dias_vencido,
                (pc.fecha_fin - CURRENT_DATE)::int          AS dias_para_vencer,
                (CURRENT_DATE - ult.ultima::date)::int      AS dias_sin_venir,
                m.codigo_pais_telefono
           FROM miembro m
           LEFT JOIN LATERAL (
             SELECT p.tipo_plan, p.fecha_fin, p.estado_pago, p.congelado_desde
               FROM plan_cobro p
              WHERE p.id_miembro = m.id_miembro AND p.activo = TRUE
              ORDER BY p.fecha_fin DESC NULLS LAST, p.id_plan_cobro DESC
              LIMIT 1
           ) pc ON TRUE
           LEFT JOIN LATERAL (
             SELECT MAX(c.fecha_hora) AS ultima
               FROM checkin c WHERE c.id_miembro = m.id_miembro
           ) ult ON TRUE
          WHERE ${where.join(' AND ')}
          ORDER BY m.nombre ASC
          LIMIT ${pageSize} OFFSET ${offset}`,
        [...params, diasAviso, diasRiesgo]
      );
      const totalQ = await pool.query(
        `SELECT COUNT(*)::int AS total FROM miembro m WHERE ${where.join(' AND ')}`,
        params
      );

      const { rows: gimnasio } = await pool.query(
        'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );
      const nombreGym = gimnasio[0]?.nombre || 'tu gimnasio';

      const miembros = rows.map((m) => {
        // Con la membresia congelada no se sugiere mensaje: no viene a proposito.
        const motivo = m.congelada ? null
          : m.vencido ? 'vencida' : m.vencePronto ? 'por-vencer' : m.enRiesgo ? 'riesgo' : null;
        if (!motivo) return { ...m, whatsapp: null };

        const dato = motivo === 'vencida'    ? enPalabras(m.dias_vencido, 'pasado')
                   : motivo === 'por-vencer' ? enPalabras(m.dias_para_vencer, 'futuro')
                   :                           enPalabras(m.dias_sin_venir, 'plano');

        return {
          ...m,
          whatsapp: {
            motivo,
            telefono: telefonoWhatsapp(m.telefono, m.codigo_pais_telefono),
            mensaje: mensajeParaMiembro(motivo, nombreGym, m.nombre, dato),
          },
        };
      });

      return res.json({ miembros, total: totalQ.rows[0].total, page, pageSize });
    } catch (err) {
      console.error('[GET /admin/miembros] Error:', err.message);
      throw new AppError(503, 'No pudimos listar los miembros. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/miembros
// ---------------------------------------------------------------------------
router.post(
  '/admin/miembros',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(createSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, codigoValidacion(parsed.issues), { issues: parsed.issues });

    const data = parsed.data;
    const gymId = req.user.gymId;

    try {
      const { rows: dupDoc } = await pool.query(
        'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND documento = $2 AND activo = TRUE',
        [gymId, data.documento]
      );
      if (dupDoc.length > 0) throw new AppError(409, 'Ya existe un miembro activo con ese documento.', 'MEMBER_DOC_TAKEN');

      if (data.email) {
        const { rows: dupMail } = await pool.query(
          'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND LOWER(email) = $2 AND activo = TRUE',
          [gymId, data.email.toLowerCase()]
        );
        if (dupMail.length > 0) throw new AppError(409, 'Ya existe un miembro activo con ese correo.', 'MEMBER_EMAIL_TAKEN');
      }

      let codigo_qr;
      for (let i = 0; i < 5; i += 1) {
        const candidate = genQrCode(gymId);
        const { rows } = await pool.query('SELECT 1 FROM miembro WHERE codigo_qr = $1', [candidate]);
        if (rows.length === 0) { codigo_qr = candidate; break; }
      }
      if (!codigo_qr) throw new AppError(500, 'No se pudo generar un codigo QR unico. Reintenta.', 'QR_GENERATION_FAILED');

      const codigo_qr_cifrado = encryptQrCode(codigo_qr);

      const fechaInicio = data.fecha_inicio || new Date().toISOString().split('T')[0];
      const fechaFin = data.fecha_fin || calcularFechaFin(data.tipo_plan, fechaInicio);
      const estadoPago = data.estado_pago || determinarEstadoPago(data.valor_total, data.valor_pagado);
      const proximaFechaCobro = data.proxima_fecha_cobro || calcularProximaFechaCobro(fechaFin);
      
      // Hashear contrasena si viene (bcrypt). Si no viene, queda NULL = miembro
      // todavia sin contrasena (no podra loguearse a la app hasta que se asigne).
      const password_hash = data.password ? await bcrypt.hash(data.password, 10) : null;

      // RQNF-17: sin la autorizacion de datos sensibles, las condiciones
      // medicas y las alergias no se guardan (quedan en NULL). Los datos del
      // representante solo se guardan si el miembro es menor (ya validados).
      const menor = esMenorDeEdad(data);
      const sensibles = data.autorizo_datos_sensibles === true;
      const sensiblesDescartados = !sensibles && Boolean(data.condiciones_medicas || data.alergias);
      const rep = menor ? representanteSchema.parse(datosRepresentante(data)) : datosRepresentante({});

      const valorTotal = parseFloat(data.valor_total) || 0;
      const valorPagado = parseFloat(data.valor_pagado) || 0;

      // Miembro, plan y autorizaciones van en una transaccion: o queda todo
      // (incluida la prueba de cada autorizacion) o no queda nada.
      let miembroRows;
      let autorizaciones;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO miembro (
            id_gimnasio, nombre, tipo_documento, documento, fecha_nacimiento, genero,
            telefono, email, direccion,
            contacto_emergencia, telefono_emergencia, condiciones_medicas, alergias,
            objetivo, nivel_experiencia, observaciones,
            acepto_terminos, autorizo_datos, codigo_qr, qr_imagen,
            password_hash, password_set_at, app_acceso,
            representante_nombre, representante_tipo_documento, representante_documento,
            representante_parentesco, representante_telefono
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                    $24, $25, $26, $27, $28)
          RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen,
                    activo, fecha_registro, app_acceso,
                    (password_hash IS NOT NULL) AS password_asignada`,
          [
            gymId,
            data.nombre.trim(),
            data.tipo_documento,
            data.documento,
            data.fecha_nacimiento || null,
            data.genero || null,
            data.telefono,
            data.email || null,
            data.direccion || null,
            data.contacto_emergencia || null,
            data.telefono_emergencia || null,
            sensibles ? (data.condiciones_medicas || null) : null,
            sensibles ? (data.alergias || null) : null,
            data.objetivo || null,
            data.nivel_experiencia || null,
            data.observaciones || null,
            data.acepto_terminos,
            data.autorizo_datos,
            codigo_qr_cifrado,
            data.qr_imagen || null,
            password_hash,
            password_hash ? new Date() : null,
            data.app_acceso !== false, // default true
            rep.representante_nombre,
            rep.representante_tipo_documento,
            rep.representante_documento,
            rep.representante_parentesco,
            rep.representante_telefono,
          ]
        );
        miembroRows = result.rows;

        await client.query(
          `INSERT INTO plan_cobro (
            id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin,
            valor_total, valor_pagado, metodo_pago, referencia_pago, estado_pago,
            proxima_fecha_cobro, activar_recordatorio, dias_recordatorio
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            miembroRows[0].id_miembro,
            gymId,
            data.tipo_plan,
            fechaInicio,
            fechaFin,
            valorTotal,
            valorPagado,
            data.metodo_pago,
            data.referencia_pago || null,
            estadoPago,
            proximaFechaCobro,
            data.activar_recordatorio,
            data.dias_recordatorio
          ]
        );

        autorizaciones = await registrarAutorizacionesAlta(client, {
          idMiembro: miembroRows[0].id_miembro, gymId, usuario: req.user.id || null, data, menor, rep,
        });
        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK').catch(() => {});
        if (dbErr instanceof AppError) throw dbErr;
        if (dbErr.code === '23505') {
          throw new AppError(409, 'Ya existe un miembro con ese documento, correo o código en este gimnasio (puede estar desactivado).', 'MEMBER_DUPLICATED');
        }
        console.error('[POST /admin/miembros] Error al guardar el miembro:', dbErr);
        // 503 como el resto del API cuando la BD falla (#92); develop decia 500.
        throw new AppError(503, 'No pudimos crear el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
      } finally {
        client.release();
      }

      const { rows: gymRows } = await pool.query(
        'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );
      const gymName = gymRows[0]?.nombre || 'tu gimnasio';

      let qrImageUrl = null;
      try {
        qrImageUrl = await QRCode.toDataURL(codigo_qr);
      } catch (qrErr) {
        console.error('[POST /admin/miembros] Error generando imagen QR:', qrErr.message);
      }

      if (data.email) {
        try {
          await sendMemberQR({
            to: data.email,
            memberName: data.nombre,
            gymName,
            qrCode: codigo_qr,
            qrImageUrl: qrImageUrl
          });
        } catch (emailErr) {
          console.error('[POST /admin/miembros] Error enviando email:', emailErr.message);
        }
      }

      if (data.telefono) {
        try {
          await sendWhatsAppQR(
            data.telefono,
            data.nombre,
            gymName,
            codigo_qr,
            qrImageUrl
          );
        } catch (waErr) {
          console.error('[POST /admin/miembros] Error enviando WhatsApp:', waErr.message);
        }
      }

      return res.status(201).json({
        message: sensiblesDescartados
          ? 'Miembro creado. No se guardaron las condiciones médicas ni las alergias porque no se autorizó el tratamiento de datos sensibles.'
          : 'Miembro creado.',
        miembro: miembroRows[0],
        autorizaciones,
        datos_sensibles_descartados: sensiblesDescartados,
        menor_de_edad: menor,
        qr_data: codigo_qr_cifrado,
        plan_cobro: {
          tipo_plan: data.tipo_plan,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          valor_total: valorTotal,
          valor_pagado: valorPagado,
          estado_pago: estadoPago,
          proxima_fecha_cobro: proximaFechaCobro
        }
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/miembros] Error:', err.message);
      throw new AppError(503, 'No pudimos crear el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/miembros/lookup?codigo=QR-FL-1-XXXX  (para checkin)
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros/lookup',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const codigo = (req.query.codigo || '').trim();
    const documento = (req.query.documento || '').trim();
    if (!codigo && !documento) throw new AppError(400, 'codigo o documento requerido', 'VALIDATION_ERROR');

    const where = ['id_gimnasio = $1', 'activo = TRUE'];
    const params = [gymId];
    if (codigo)    { params.push(codigo);    where.push(`codigo_qr = $${params.length}`); }
    if (documento) { params.push(documento); where.push(`documento = $${params.length}`); }

    try {
      const { rows } = await pool.query(
        `SELECT id_miembro, nombre, documento, telefono, email, codigo_qr
         FROM miembro WHERE ${where.join(' AND ')} LIMIT 1`,
        params
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

      const { rows: mem } = await pool.query(
        `SELECT estado_pago AS estado, fecha_inicio, fecha_fin,
                INITCAP(LOWER(tipo_plan)) AS plan
           FROM ${ULTIMO_PLAN} pc
          WHERE pc.id_miembro = $1`,
        [rows[0].id_miembro]
      );

      return res.json({ miembro: rows[0], membresia: mem[0] || null });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[GET /admin/miembros/lookup] Error:', err.message);
      throw new AppError(503, 'No pudimos buscar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/miembros/:id
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const id = idDeMiembro(req.params.id);

    try {
      const { rows } = await pool.query(
        `SELECT id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen,
                activo, fecha_registro, tipo_documento, fecha_nacimiento, genero,
                codigo_pais_telefono, ciudad, direccion, contacto_emergencia,
                telefono_emergencia, condiciones_medicas, alergias, objetivo,
                nivel_experiencia, observaciones,
                acepto_terminos, autorizo_datos,
                representante_nombre, representante_tipo_documento, representante_documento,
                representante_parentesco, representante_telefono
           FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2`,
        [id, gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      // RQNF-17: autorizaciones vigentes e historial, para la edicion.
      const vigentes = await leerVigentes(pool, id, gymId);
      const historial = await leerHistorial(pool, id, gymId, 20);
      const m = rows[0];
      const sensibles = otorgada(vigentes, 'DATOS_SENSIBLES');
      return res.json({
        miembro: {
          ...m,
          autorizo_datos_sensibles: sensibles,
          menor_de_edad: esMenorDeEdad(m),
          // Datos de salud guardados sin autorizacion separada (miembros de
          // antes de RQNF-17): el panel lo avisa; se borran al guardar sin
          // marcar la autorizacion.
          datos_sensibles_sin_autorizacion: !sensibles && Boolean(m.condiciones_medicas || m.alergias),
        },
        autorizaciones: resumenAutorizaciones(vigentes, historial),
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[GET /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/admin/miembros/:id
// ---------------------------------------------------------------------------
router.put(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(updateSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const id = idDeMiembro(req.params.id);

    // RQNF-17: si la edicion toca autorizaciones, edad, representante o datos
    // de salud, va por la transaccion que lo valida y deja constancia.
    if (tocaAutorizaciones(parsed.data)) {
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const r = await actualizarConAutorizaciones(client, {
          id, gymId: req.user.gymId, usuario: req.user.id || null, d: parsed.data,
        });
        await client.query('COMMIT');
        let message = 'Miembro actualizado.';
        if (r.revocada) message = 'Miembro actualizado. Se revocó la autorización de datos sensibles y se borraron las condiciones médicas y las alergias.';
        else if (r.sensiblesBorrados) message = 'Miembro actualizado. Sin autorización de datos sensibles no se guardan condiciones médicas ni alergias.';
        return res.json({
          message,
          miembro: r.miembro,
          autorizaciones: r.autorizaciones,
          datos_sensibles_borrados: r.sensiblesBorrados,
          menor_de_edad: r.menor,
        });
      } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (err instanceof AppError) throw err;
        console.error('[PUT /admin/miembros/:id] Error:', err.message);
        throw new AppError(503, 'No pudimos actualizar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
      } finally {
        if (client) client.release();
      }
    }

    const campos = [];
    const params = [];
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;

      // Caso especial: 'password' -> hashear y guardar en password_hash.
      if (k === 'password') {
        const hashed = await bcrypt.hash(String(v), 10);
        params.push(hashed);
        campos.push(`password_hash = $${params.length}`);
        campos.push(`password_set_at = CURRENT_TIMESTAMP`);
        continue;
      }

      params.push(k === 'email' && v ? v.toLowerCase() : v);
      campos.push(`${k} = $${params.length}`);
    }
    if (campos.length === 0) throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');

    params.push(id);
    const idIdx = params.length;
    params.push(req.user.gymId);
    const gymIdx = params.length;

    try {
      const { rows } = await pool.query(
        `UPDATE miembro SET ${campos.join(', ')}
         WHERE id_miembro = $${idIdx} AND id_gimnasio = $${gymIdx}
         RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen,
                   activo, fecha_registro, app_acceso,
                   (password_hash IS NOT NULL) AS password_asignada`,
        params
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      return res.json({ message: 'Miembro actualizado.', miembro: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[PUT /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos actualizar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/admin/miembros/:id  (soft delete)
// ---------------------------------------------------------------------------
router.delete(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = idDeMiembro(req.params.id);

    try {
      const { rows } = await pool.query(
        `UPDATE miembro SET activo = FALSE
         WHERE id_miembro = $1 AND id_gimnasio = $2 AND activo = TRUE
         RETURNING id_miembro`,
        [id, req.user.gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado o ya estaba inactivo', 'MEMBER_NOT_FOUND');
      return res.json({ message: 'Miembro desactivado.' });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[DELETE /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos desactivar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/admin/miembros/:id/permanent (hard delete - eliminación permanente)
// ---------------------------------------------------------------------------
router.delete(
  '/admin/miembros/:id/permanent',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = idDeMiembro(req.params.id);
    const gymId = req.user.gymId;

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      // envio_mensaje apunta al miembro sin ON DELETE CASCADE (en produccion y,
      // desde la migracion 014, en Docker): sus envios (RQF-09) se borran antes,
      // en la misma transaccion. Si el miembro no es de este gimnasio no se
      // borra nada: el filtro por gimnasio y el ROLLBACK del 404 lo aseguran.
      await client.query(
        'DELETE FROM envio_mensaje WHERE id_miembro = $1 AND id_gimnasio = $2',
        [id, gymId]
      );
      const { rows } = await client.query(
        'DELETE FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2 RETURNING id_miembro',
        [id, gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      await client.query('COMMIT');
      return res.json({ message: 'Miembro eliminado permanentemente.' });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err instanceof AppError) throw err;
      console.error('[DELETE /admin/miembros/:id/permanent] Error:', err.message);
      throw new AppError(503, 'No pudimos eliminar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    } finally {
      if (client) client.release();
    }
  })
);

// ---------------------------------------------------------------------------
// GET  /api/admin/miembros/:id/plan   -> plan vigente del miembro
// PUT  /api/admin/miembros/:id/plan   -> cambia o renueva el plan
// ---------------------------------------------------------------------------

// valor_total lleva el tope de NUMERIC(10,2) (MAX_VALOR_PLAN, arriba).
// valor_pagado no necesita uno propio: la ruta exige que no supere a valor_total.
const planSchema = z.object({
  tipo_plan: z.enum(['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CLASES_SUELTAS', 'ILIMITADO', 'OTRO']),
  fecha_inicio: z.string().min(10),
  fecha_fin: z.string().min(10),
  valor_total: z.coerce.number().min(0).max(MAX_VALOR_PLAN, MENSAJE_VALOR_PLAN),
  valor_pagado: z.coerce.number().min(0),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'PSE', 'NEQUI', 'DAVIPLATA', 'OTRO']),
  referencia_pago: z.string().max(80).optional().or(z.literal('')),
  proxima_fecha_cobro: z.string().optional().or(z.literal('')),
});

router.get(
  '/admin/miembros/:id/plan',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    if (!esIdDeMiembro(req.params.id)) throw new AppError(400, 'Id inválido', 'VALIDATION_ERROR');
    try {
      const { rows } = await pool.query(
        `SELECT pc.id_plan_cobro, pc.tipo_plan, pc.fecha_inicio, pc.fecha_fin,
                pc.valor_total, pc.valor_pagado, pc.metodo_pago, pc.referencia_pago,
                pc.estado_pago, pc.proxima_fecha_cobro, pc.congelado_desde,
                (CURRENT_DATE - pc.congelado_desde)::int AS dias_congelado
           FROM plan_cobro pc
           INNER JOIN miembro m ON m.id_miembro = pc.id_miembro
          WHERE pc.id_miembro = $1 AND m.id_gimnasio = $2 AND pc.activo = TRUE
          ORDER BY pc.fecha_fin DESC NULLS LAST, pc.id_plan_cobro DESC
          LIMIT 1`,
        [req.params.id, req.user.gymId]
      );
      // Ultimos congelamientos del miembro (HU-39: fecha y responsable de cada uno).
      const { rows: congelaciones } = await pool.query(
        `SELECT cp.id_congelacion, cp.fecha_inicio, cp.fecha_fin, cp.dias, cp.motivo,
                uc.nombre AS congelada_por, ud.nombre AS descongelada_por
           FROM congelacion_plan cp
           LEFT JOIN usuario uc ON uc.id_usuario = cp.congelada_por
           LEFT JOIN usuario ud ON ud.id_usuario = cp.descongelada_por
          WHERE cp.id_miembro = $1 AND cp.id_gimnasio = $2
          ORDER BY cp.creada_en DESC
          LIMIT 5`,
        [req.params.id, req.user.gymId]
      );
      return res.json({ plan: rows[0] || null, congelaciones });
    } catch (err) {
      if (!esErrorDeConexion(err)) throw err;
      console.error('[GET /admin/miembros/:id/plan] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar el plan. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/miembros/:id/congelar     -> congela la membresia vigente
// POST /api/admin/miembros/:id/descongelar  -> la descongela y corre el vencimiento
// ---------------------------------------------------------------------------
// Solo el administrador. Mientras esta congelada, la membresia no cuenta como
// vencida ni por vencer; al descongelarla, fecha_fin (y la proxima fecha de
// cobro, si hay) se corren tantos dias como estuvo congelada (RQF-04, HU-39).

const congelarSchema = z.object({
  motivo: z.string().trim().max(200).optional().or(z.literal('')),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD').optional().or(z.literal('')),
});

/** Bloquea y devuelve el plan vigente del miembro dentro de una transaccion. */
async function planVigenteParaActualizar(client, idMiembro, gymId) {
  const { rows } = await client.query(
    `SELECT pc.id_plan_cobro, pc.fecha_inicio, pc.fecha_fin, pc.congelado_desde
       FROM plan_cobro pc
       INNER JOIN miembro m ON m.id_miembro = pc.id_miembro
      WHERE pc.id_miembro = $1 AND m.id_gimnasio = $2 AND pc.activo = TRUE
      ORDER BY pc.fecha_fin DESC NULLS LAST, pc.id_plan_cobro DESC
      LIMIT 1
      FOR UPDATE OF pc`,
    [idMiembro, gymId]
  );
  if (rows.length === 0) throw new AppError(404, 'Este miembro no tiene un plan vigente para congelar.', 'PLAN_NOT_FOUND');
  return rows[0];
}

router.post(
  '/admin/miembros/:id/congelar',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(congelarSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const id = idDeMiembro(req.params.id);
    const { motivo, fecha_inicio: fechaPedida } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const plan = await planVigenteParaActualizar(client, id, req.user.gymId);
      if (plan.congelado_desde) throw new AppError(409, 'La membresía ya está congelada.', 'ALREADY_FROZEN');

      // La fecha de inicio es hoy, salvo que se indique otra: no puede ser futura,
      // ni anterior al inicio del plan, ni posterior a su vencimiento.
      // Las fechas del plan se leen de la fila (no se pasan desde JS) para no
      // depender de la zona horaria del servidor de Node.
      const { rows: f } = await client.query(
        `SELECT COALESCE($1::date, CURRENT_DATE) AS inicio,
                COALESCE($1::date, CURRENT_DATE) > CURRENT_DATE AS futura,
                COALESCE($1::date, CURRENT_DATE) < pc.fecha_inicio AS antes_del_plan,
                COALESCE($1::date, CURRENT_DATE) > pc.fecha_fin AS vencida
           FROM plan_cobro pc WHERE pc.id_plan_cobro = $2`,
        [fechaPedida || null, plan.id_plan_cobro]
      );
      if (f[0].futura) throw new AppError(400, 'La fecha de inicio del congelamiento no puede ser futura.', 'VALIDATION_ERROR');
      if (f[0].antes_del_plan) throw new AppError(400, 'La fecha de inicio no puede ser anterior al inicio del plan.', 'VALIDATION_ERROR');
      if (f[0].vencida) throw new AppError(409, 'La membresía ya estaba vencida en esa fecha: renuévala en lugar de congelarla.', 'PLAN_EXPIRED');

      await client.query(
        `UPDATE plan_cobro
            SET congelado_desde = $1, actualizado_por = $2, fecha_actualizacion = NOW()
          WHERE id_plan_cobro = $3`,
        [f[0].inicio, req.user.id, plan.id_plan_cobro]
      );
      const { rows: cong } = await client.query(
        `INSERT INTO congelacion_plan (id_plan_cobro, id_miembro, id_gimnasio, fecha_inicio, motivo, congelada_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_congelacion, fecha_inicio, motivo`,
        [plan.id_plan_cobro, id, req.user.gymId, f[0].inicio, motivo || null, req.user.id]
      );
      await client.query('COMMIT');
      return res.json({ message: 'Membresía congelada.', congelacion: cong[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/miembros/:id/congelar] Error:', err.message);
      throw new AppError(503, 'No pudimos congelar la membresía. Intenta de nuevo.', 'DB_UNREACHABLE');
    } finally {
      client.release();
    }
  })
);

router.post(
  '/admin/miembros/:id/descongelar',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = idDeMiembro(req.params.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const plan = await planVigenteParaActualizar(client, id, req.user.gymId);
      if (!plan.congelado_desde) throw new AppError(409, 'La membresía no está congelada.', 'NOT_FROZEN');

      // Dias congelada = de congelado_desde a hoy. Se corren el vencimiento y la
      // proxima fecha de cobro (si existe) esos mismos dias.
      const { rows: d } = await client.query(
        'SELECT GREATEST(CURRENT_DATE - congelado_desde, 0)::int AS dias FROM plan_cobro WHERE id_plan_cobro = $1',
        [plan.id_plan_cobro]
      );
      const dias = d[0].dias;
      const { rows: upd } = await client.query(
        `UPDATE plan_cobro
            SET fecha_fin = fecha_fin + $1::int,
                proxima_fecha_cobro = proxima_fecha_cobro + $1::int,
                congelado_desde = NULL,
                actualizado_por = $2, fecha_actualizacion = NOW()
          WHERE id_plan_cobro = $3
        RETURNING fecha_fin, proxima_fecha_cobro`,
        [dias, req.user.id, plan.id_plan_cobro]
      );
      await client.query(
        `UPDATE congelacion_plan
            SET fecha_fin = CURRENT_DATE, dias = $1, descongelada_por = $2
          WHERE id_plan_cobro = $3 AND fecha_fin IS NULL`,
        [dias, req.user.id, plan.id_plan_cobro]
      );
      await client.query('COMMIT');
      return res.json({
        message: dias > 0
          ? `Membresía descongelada. El vencimiento se corrió ${dias} ${dias === 1 ? 'día' : 'días'}.`
          : 'Membresía descongelada. No pasó ningún día, el vencimiento no cambia.',
        dias,
        fecha_fin: upd[0].fecha_fin,
        proxima_fecha_cobro: upd[0].proxima_fecha_cobro,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/miembros/:id/descongelar] Error:', err.message);
      throw new AppError(503, 'No pudimos descongelar la membresía. Intenta de nuevo.', 'DB_UNREACHABLE');
    } finally {
      client.release();
    }
  })
);

router.put(
  '/admin/miembros/:id/plan',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    if (!esIdDeMiembro(req.params.id)) throw new AppError(400, 'Id inválido', 'VALIDATION_ERROR');
    const parsed = parse(planSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const d = parsed.data;
    const gymId = req.user.gymId;

    if (new Date(d.fecha_fin) < new Date(d.fecha_inicio)) {
      throw new AppError(400, 'El vencimiento no puede ser anterior al inicio.', 'VALIDATION_ERROR');
    }
    if (d.valor_pagado > d.valor_total) {
      throw new AppError(400, 'Lo pagado no puede superar el valor del plan.', 'VALIDATION_ERROR');
    }

    let plan;
    try {
      const { rows: duenio } = await pool.query(
        'SELECT id_miembro FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
        [req.params.id, gymId]
      );
      if (duenio.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

      const estado = d.valor_pagado >= d.valor_total && d.valor_total > 0
        ? 'PAGADO'
        : d.valor_pagado > 0 ? 'PARCIAL' : 'PENDIENTE';

      const { rows: actual } = await pool.query(
        `SELECT id_plan_cobro FROM plan_cobro
          WHERE id_miembro = $1 AND activo = TRUE
          ORDER BY fecha_fin DESC NULLS LAST, id_plan_cobro DESC LIMIT 1`,
        [req.params.id]
      );

      if (actual.length > 0) {
        const { rows } = await pool.query(
          `UPDATE plan_cobro
              SET tipo_plan = $1, fecha_inicio = $2, fecha_fin = $3, valor_total = $4,
                  valor_pagado = $5, metodo_pago = $6, referencia_pago = $7,
                  estado_pago = $8, proxima_fecha_cobro = $9,
                  actualizado_por = $10, fecha_actualizacion = NOW()
            WHERE id_plan_cobro = $11
          RETURNING *`,
          [d.tipo_plan, d.fecha_inicio, d.fecha_fin, d.valor_total, d.valor_pagado,
           d.metodo_pago, d.referencia_pago || null, estado, d.proxima_fecha_cobro || null,
           req.user.id, actual[0].id_plan_cobro]
        );
        plan = rows[0];
      } else {
        const { rows } = await pool.query(
          `INSERT INTO plan_cobro
             (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, valor_total,
              valor_pagado, metodo_pago, referencia_pago, estado_pago, proxima_fecha_cobro,
              activo, actualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12)
          RETURNING *`,
          [req.params.id, gymId, d.tipo_plan, d.fecha_inicio, d.fecha_fin, d.valor_total,
           d.valor_pagado, d.metodo_pago, d.referencia_pago || null, estado,
           d.proxima_fecha_cobro || null, req.user.id]
        );
        plan = rows[0];
      }
    } catch (err) {
      if (err instanceof AppError || !esErrorDeConexion(err)) throw err;
      console.error('[PUT /admin/miembros/:id/plan] Error:', err.message);
      throw new AppError(503, 'No pudimos guardar el plan. Intenta de nuevo.', 'DB_UNREACHABLE');
    }

    return res.json({ message: 'Plan actualizado.', plan });
  })
);

// LÍNEA OBLIGATORIA PARA EXPORTAR EL ROUTER Y EVITAR EL ERROR DE EXPRESS
module.exports = router;
// Los esquemas, para que los tests lean de aqui las listas (por ejemplo, los
// tipo_plan que acepta el alta) en vez de copiarlas.
module.exports.createSchema = createSchema;
module.exports.updateSchema = updateSchema;