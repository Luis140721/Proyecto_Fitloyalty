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

function claveBase() {
  // QR_DINAMICO_SECRET permite rotar solo el QR dinamico; si no esta, sale de
  // la misma clave del QR fijo (QR_ENCRYPTION_KEY) con otro proposito.
  const raiz = process.env.QR_DINAMICO_SECRET
    || process.env.QR_ENCRYPTION_KEY
    || 'FitLoyalty2024SecretKey';
  return crypto.createHmac('sha256', raiz).update('fitloyalty-qr-dinamico-v1').digest();
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
