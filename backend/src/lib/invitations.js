/**
 * lib/invitations.js
 *
 * Genera y valida tokens de invitacion para recepcionistas.
 * Un token es un string URL-safe de 32 bytes (random).
 * Se almacena hasheado en la tabla `invitacion_staff` (campo `token_hash`).
 */

const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { generateToken, hashToken };
