/**
 * lib/qr-dinamico.js
 *
 * QR dinamico del miembro: un codigo que cambia cada 30 segundos, al estilo de
 * los codigos de verificacion en dos pasos (TOTP, RFC 6238).
 *
 * Por que: el QR fijo (miembro.codigo_qr) se puede fotografiar, imprimir o
 * mandar por WhatsApp, y cualquiera con la foto entra como ese miembro. El
 * dinamico vence a los pocos segundos, asi que una captura deja de servir.
 *
 * Como funciona:
 *   1. Cada miembro tiene un secreto que solo conocen el servidor y su app:
 *        secreto = HMAC-SHA256(claveBase, "<id_miembro>:<codigo_qr>")
 *      No hay que guardarlo: se recalcula. Si al miembro se le regenera el
 *      codigo_qr, el secreto cambia y los codigos viejos dejan de servir.
 *   2. La app lo recibe una vez (GET /api/cliente/qr) y calcula sola, sin
 *      internet, el codigo del paso actual:
 *        paso   = floor(segundos_unix / 30)
 *        codigo = 8 digitos de HMAC-SHA256(secreto, paso) (truncado RFC 4226)
 *      y muestra el QR con el texto  FLD<id_miembro>T<codigo>.
 *   3. El check-in recibe ese texto (por el lector HID, la camara o pegado),
 *      recalcula el codigo con el secreto y lo acepta si coincide con el paso
 *      actual o con uno cercano (ver VENTANA_*), para tolerar que el reloj del
 *      telefono no este exacto y el tiempo que tarda la lectura.
 *
 * El formato usa solo letras y numeros a proposito: los lectores HID escriben
 * como un teclado, y simbolos como ':' o '-' salen distinto segun la
 * distribucion del teclado del computador (en espanol ':' sale como 'Ñ').
 *
 * La clave del servidor: el QR dinamico solo protege si la clave es secreta.
 * Sin QR_DINAMICO_SECRET sale de QR_ENCRYPTION_KEY y, si tampoco esta, de la
 * clave de respaldo ('FitLoyalty2024SecretKey'), que esta en el repositorio:
 * con ella cualquiera que fotografie el QR fijo puede descifrarlo, sacar el
 * secreto del miembro y calcular sus codigos. Por eso, en produccion
 * (NODE_ENV=production) y sin un QR_DINAMICO_SECRET propio:
 *   - el gimnasio no puede activar «Exigir QR dinamico» (routes/config.js
 *     responde 409 QR_DINAMICO_SIN_SECRETO), y
 *   - el servidor lo avisa al arrancar (avisarSecretoAlArrancar, index.js).
 * El QR fijo no cambia: sigue con QR_ENCRYPTION_KEY, como antes.
 */
const crypto = require('crypto');

const PASO_SEG = 30;
const DIGITOS = 8;
const PREFIJO = 'FLD';
// Pasos aceptados alrededor del actual: 2 hacia atras (hasta ~90 s de
// antiguedad, por si la lectura tarda o el reloj del telefono va atrasado) y
// 1 hacia adelante (reloj adelantado).
const VENTANA_ATRAS = 2;
const VENTANA_ADELANTE = 1;

const FORMATO = new RegExp(`^${PREFIJO}(\\d{1,10})T(\\d{${DIGITOS}})$`, 'i');

// Clave de respaldo del codigo: esta en el repositorio, asi que no es secreta.
const CLAVE_DEL_REPO = 'FitLoyalty2024SecretKey';

function claveBase() {
  // QR_DINAMICO_SECRET permite rotar solo el QR dinamico; si no esta, sale de
  // la misma clave del QR fijo (QR_ENCRYPTION_KEY) con otro proposito.
  const raiz = process.env.QR_DINAMICO_SECRET
    || process.env.QR_ENCRYPTION_KEY
    || CLAVE_DEL_REPO;
  return crypto.createHmac('sha256', raiz).update('fitloyalty-qr-dinamico-v1').digest();
}

/** true si QR_DINAMICO_SECRET tiene un valor propio (ni vacio ni la clave del repo). */
function secretoPropio() {
  const s = String(process.env.QR_DINAMICO_SECRET || '').trim();
  return s.length > 0 && s !== CLAVE_DEL_REPO;
}

/**
 * Si el gimnasio puede exigir el QR dinamico. Fuera de produccion siempre (la
 * clave del repo sirve para probar); en produccion solo con QR_DINAMICO_SECRET.
 */
function puedeExigirse() {
  return process.env.NODE_ENV !== 'production' || secretoPropio();
}

const MENSAJE_SIN_SECRETO = 'No se puede exigir el QR dinámico: falta configurar la clave '
  + 'QR_DINAMICO_SECRET en el servidor. Pide a quien lo administra que la defina; mientras '
  + 'tanto, el QR fijo y el documento siguen funcionando.';

/**
 * Aviso al arrancar el servidor. En produccion sin QR_DINAMICO_SECRET escribe
 * una advertencia (con cuantos gimnasios ya lo tienen activado, si la base
 * responde) y devuelve el texto; si no hay nada que avisar devuelve null.
 * Nunca lanza.
 */
async function avisarSecretoAlArrancar(pool, log = console) {
  if (puedeExigirse()) return null;
  let activos = null;
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM gimnasio WHERE qr_dinamico_obligatorio = TRUE'
    );
    activos = rows[0] ? rows[0].n : 0;
  } catch (_) {
    activos = null;
  }
  const texto = '[qr-dinamico] ADVERTENCIA: NODE_ENV=production sin QR_DINAMICO_SECRET: '
    + 'ningun gimnasio podra activar «Exigir QR dinamico» hasta definirla'
    + (activos ? `; ${activos} gimnasio(s) ya lo tienen activado, define la clave cuanto antes.` : '.');
  log.warn(texto);
  return texto;
}

/** Secreto del miembro (Buffer de 32 bytes). */
function secretoMiembro(idMiembro, codigoQr) {
  return crypto.createHmac('sha256', claveBase())
    .update(`${Number(idMiembro)}:${String(codigoQr || '')}`)
    .digest();
}

/** Paso de tiempo para un instante en milisegundos. */
function pasoDe(ms) {
  return Math.floor(ms / 1000 / PASO_SEG);
}

/** Codigo de 8 digitos del secreto en un paso (truncado dinamico, RFC 4226). */
function codigoEnPaso(secreto, paso) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = crypto.createHmac('sha256', secreto).update(contador).digest();
  const offset = h[h.length - 1] & 0x0f;
  const num = ((h[offset] & 0x7f) << 24)
    | (h[offset + 1] << 16)
    | (h[offset + 2] << 8)
    | h[offset + 3];
  return String(num % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/** Texto que va dentro del QR en un instante. */
function tokenEn(idMiembro, codigoQr, ms = Date.now()) {
  return `${PREFIJO}${Number(idMiembro)}T${codigoEnPaso(secretoMiembro(idMiembro, codigoQr), pasoDe(ms))}`;
}

/**
 * Si el texto leido tiene la forma del QR dinamico devuelve { idMiembro, codigo };
 * si no (es el QR fijo o cualquier otra cosa), null.
 */
function leerToken(texto) {
  const m = FORMATO.exec(String(texto || '').trim());
  if (!m) return null;
  return { idMiembro: Number(m[1]), codigo: m[2] };
}

/**
 * Comprueba el codigo contra el secreto del miembro en la ventana de pasos.
 * Compara en tiempo constante para no filtrar digitos por el tiempo de respuesta.
 */
function codigoValido({ idMiembro, codigoQr, codigo, ms = Date.now() }) {
  const secreto = secretoMiembro(idMiembro, codigoQr);
  const actual = pasoDe(ms);
  const recibido = Buffer.from(String(codigo));
  let ok = false;
  for (let d = -VENTANA_ATRAS; d <= VENTANA_ADELANTE; d += 1) {
    const esperado = Buffer.from(codigoEnPaso(secreto, actual + d));
    if (esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido)) ok = true;
  }
  return ok;
}

/** Lo que la app necesita para calcular el codigo sin internet. */
function datosParaApp(idMiembro, codigoQr, ms = Date.now()) {
  return {
    version: 1,
    algoritmo: 'HMAC-SHA256',
    secreto: secretoMiembro(idMiembro, codigoQr).toString('hex'),
    paso_seg: PASO_SEG,
    digitos: DIGITOS,
    prefijo: PREFIJO,
    id: Number(idMiembro),
    // Para que la app corrija la diferencia entre su reloj y el del servidor.
    hora_servidor_ms: ms,
    codigo_actual: tokenEn(idMiembro, codigoQr, ms),
  };
}

module.exports = {
  CLAVE_DEL_REPO,
  MENSAJE_SIN_SECRETO,
  secretoPropio,
  puedeExigirse,
  avisarSecretoAlArrancar,
  PASO_SEG,
  DIGITOS,
  PREFIJO,
  VENTANA_ATRAS,
  VENTANA_ADELANTE,
  secretoMiembro,
  pasoDe,
  codigoEnPaso,
  tokenEn,
  leerToken,
  codigoValido,
  datosParaApp,
};
