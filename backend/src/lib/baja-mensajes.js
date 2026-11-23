/**
 * lib/baja-mensajes.js
 *
 * RQNF-16 (Ley 2300 de 2023, art. 5): cada mensaje comercial lleva al final un
 * enlace para que el miembro deje de recibirlos, sin iniciar sesion.
 *
 * El enlace es /baja/<token> en el frontend. El token es
 *
 *     <id_miembro>.<id_gimnasio>.<firma>
 *
 * con firma = HMAC-SHA256 de "baja-mensajes:<id_miembro>:<id_gimnasio>",
 * recortada a 128 bits y en base64url. No vence (el miembro puede darse de
 * baja "en cualquier momento") y no lleva datos personales: solo los ids.
 *
 * La clave sale de BAJA_SECRET o, si no existe, de JWT_SECRET (no hace falta
 * configurar nada nuevo en Render). Si cambia la clave, los enlaces ya
 * enviados dejan de servir; el miembro igual puede darse de baja desde la app
 * o en recepcion.
 */
const crypto = require('crypto');

function clave() {
  const secreto = process.env.BAJA_SECRET || process.env.JWT_SECRET;
  if (!secreto) throw new Error('Falta BAJA_SECRET o JWT_SECRET para firmar el enlace de baja');
  // Se deriva una clave propia para no usar el mismo secreto de los JWT tal cual.
  return crypto.createHash('sha256').update(`baja-mensajes|${secreto}`).digest();
}

function firma(idMiembro, idGimnasio) {
  return crypto.createHmac('sha256', clave())
    .update(`baja-mensajes:${idMiembro}:${idGimnasio}`)
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

/** Token firmado para el enlace de baja de un miembro. */
function tokenBaja(idMiembro, idGimnasio) {
  const m = Number(idMiembro);
  const g = Number(idGimnasio);
  if (!Number.isInteger(m) || m <= 0 || !Number.isInteger(g) || g <= 0) {
    throw new TypeError('tokenBaja: ids invalidos');
  }
  return `${m}.${g}.${firma(m, g)}`;
}

/** { idMiembro, idGimnasio } si el token es valido; si no, null. */
function verificarTokenBaja(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  const [m, g, f] = partes;
  if (!/^[1-9]\d{0,9}$/.test(m) || !/^[1-9]\d{0,9}$/.test(g) || !/^[A-Za-z0-9_-]{22}$/.test(f)) return null;
  const esperada = Buffer.from(firma(m, g));
  const recibida = Buffer.from(f);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  return { idMiembro: Number(m), idGimnasio: Number(g) };
}

/**
 * URL publica del frontend. FRONTEND_URL puede traer varios origenes
 * separados por coma (index.js la usa asi para CORS): se toma el primero.
 */
function urlFrontend() {
  const primera = String(process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
  return (primera || 'http://localhost:5173').replace(/\/+$/, '');
}

function urlBaja(idMiembro, idGimnasio) {
  return `${urlFrontend()}/baja/${tokenBaja(idMiembro, idGimnasio)}`;
}

/** Texto que se agrega al final de cada mensaje comercial. */
function pieBaja(idMiembro, idGimnasio) {
  return `\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: ${urlBaja(idMiembro, idGimnasio)}`;
}

module.exports = { tokenBaja, verificarTokenBaja, urlBaja, pieBaja, urlFrontend };
