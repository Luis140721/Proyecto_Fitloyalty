/**
 * lib/auth-helpers.js
 *
 * Funciones PURAS (sin acceso a BD, sin SMTP, sin JWT real) relacionadas con
 * autenticación. Se extraen del monolítico `routes/auth.js` para poder
 * testearlas de forma aislada y poder reutilizarlas desde otros routers.
 *
 * Reglas:
 *   - No requieren acceso a variables de entorno.
 *   - No abren conexiones ni escriben en BD.
 *   - Solo dependen de `jsonwebtoken` para firmar/verificar tokens.
 */

const jwt = require('jsonwebtoken');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COL_PHONE_DIGITS_RE = /^[3]\d{9}$/;

/**
 * Convierte el rol de PostgreSQL al formato que espera el frontend.
 * 'ADMINISTRADOR' -> 'admin'
 * 'RECEPCIONISTA' -> 'receptionist'
 * Acepta tanto el nombre del rol como su id numérico (1 = admin, 2 = recep).
 */
function mapRol(rol) {
  if (rol === null || rol === undefined) return 'unknown';
  const s = String(rol).trim().toLowerCase();
  if (s === '1' || s.includes('admin') || s.includes('administrador')) return 'admin';
  if (s === '2' || s.includes('recep') || s.includes('recepcionista')) return 'receptionist';
  return s.replace(/\s+/g, '_');
}

/** Valida formato básico de email (post-normalización). */
function validarEmail(email) {
  return EMAIL_RE.test((email || '').toString().trim().toLowerCase());
}

/**
 * Política de contraseña:
 *  - Mínimo 6 caracteres
 *  - Al menos un dígito
 *  - Sin espacios
 *  - No debe tener sido trimmeada (trim === original)
 */
function validarContrasena(password) {
  if (!password || typeof password !== 'string') return false;
  const trimmed = password.trim();
  return trimmed.length >= 6 && trimmed === password && /\d/.test(password);
}

/** Teléfono colombiano: 10 dígitos que empiezan con 3 (móvil). */
function validarTelefonoColombiano(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return COL_PHONE_DIGITS_RE.test(digits);
}

/** Normaliza email: lowercase + trim. */
function normEmail(email) {
  return (email || '').toString().toLowerCase().trim();
}

/**
 * Devuelve un código OTP numérico de 6 dígitos como string.
 *  - Usa Math.random (NO criptográficamente seguro) — suficiente para un OTP
 *    de 6 dígitos con expiración de 15 min y un solo uso.
 *  - Centralizado aquí para poder mockearlo en tests si fuera necesario.
 */
function random6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * URL de avatar: usa foto_url de BD o genera una por defecto con ui-avatars.
 * Mantiene exactamente el mismo contrato que la versión inline previa.
 */
function avatarUrl(u) {
  if (u && u.foto_url) return u.foto_url;
  const name = encodeURIComponent((u && u.nombre) || 'Usuario');
  return `https://ui-avatars.com/api/?name=${name}&background=f97316&color=fff&size=128`;
}

/**
 * Proyecta una fila de `usuario` al objeto seguro que se devuelve al frontend.
 * NUNCA incluye password_hash.
 */
function usuarioSeguro(u) {
  return {
    id:       u.id_usuario,
    name:     u.nombre,
    email:    u.email,
    role:     mapRol(u.rol_nombre || u.rol || u.id_rol),
    gymId:    u.id_gimnasio,
    photoUrl: avatarUrl(u),
  };
}

/**
 * Genera el JWT de sesión que se devuelve al cliente.
 * Si `secret` o `expiresIn` son null, usa los valores de `process.env`.
 */
function generarToken(usuario, { secret, expiresIn } = {}) {
  const payload = {
    id:    usuario.id_usuario,
    name:  usuario.nombre,
    email: usuario.email,
    role:  mapRol(usuario.rol_nombre || usuario.rol || usuario.id_rol),
    gymId: usuario.id_gimnasio,
  };
  const opts = {};
  if (expiresIn) opts.expiresIn = expiresIn;
  return jwt.sign(payload, secret || process.env.JWT_SECRET, opts);
}

/**
 * Genera el JWT de recuperación de contraseña (purpose='reset').
 */
function generarResetToken(usuario, { secret, expiresIn } = {}) {
  const payload = {
    id:      usuario.id_usuario,
    email:   usuario.email,
    purpose: 'reset',
  };
  const opts = { expiresIn: expiresIn || process.env.RESET_TOKEN_EXPIRES || '15m' };
  return jwt.sign(payload, secret || process.env.JWT_SECRET, opts);
}

module.exports = {
  mapRol,
  validarEmail,
  validarContrasena,
  validarTelefonoColombiano,
  normEmail,
  random6,
  avatarUrl,
  usuarioSeguro,
  generarToken,
  generarResetToken,
};