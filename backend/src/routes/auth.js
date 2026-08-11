/**
 * routes/auth.js
 *
 * Endpoints de autenticacion del SaaS FitLoyalty (MVP reescrito).
 *
 *   POST /api/auth/signup        -> publico: crea gimnasio + admin owner (trial 7d)
 *   POST /api/auth/login         -> login de cualquier usuario (admin/staff)
 *   GET  /api/auth/me            -> perfil del usuario autenticado
 *   POST /api/auth/logout        -> invalida sesion (cliente borra token)
 *   POST /api/auth/forgot-password  -> genera OTP de recuperacion
 *   POST /api/auth/verify-reset-code -> valida OTP, devuelve resetToken
 *   POST /api/auth/reset-password    -> aplica nuevo password con resetToken
 *
 * Convenciones:
 *   - Codigos de error: 400 validacion, 401 credenciales, 403 sin permiso, 409 duplicado, 500 servidor.
 *   - Auth: JWT (HS256) emitido por helpers/auth-helpers.gererateToken.
 *   - El signup NO requiere auth previa. Toda otra ruta requiere `authenticate`.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/db');
const { authenticate } = require('../middleware/auth');
const {
  validarEmail, validarContrasena, normEmail,
  usuarioSeguro, generarToken, generarResetToken, random6,
} = require('../lib/auth-helpers');
const { sendMail } = require('../lib/email');
const { trialDays } = require('../lib/trial');
const {
  signupSchema, loginSchema,
  forgotPasswordSchema, verifyResetCodeSchema, resetPasswordSchema,
  formatZodError,
} = require('../lib/validators');

const router = express.Router();
const _v = { validarEmail, validarContrasena, normEmail };

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error) };
  return { ok: true, data: result.data };
}

async function ensureResetTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset (
      id_reset SERIAL PRIMARY KEY,
      id_usuario INTEGER NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
    )
  `);
}

async function storeResetCode(id_usuario, code, ttlMinutes = 15) {
  const expires = new Date(Date.now() + ttlMinutes * 60000);
  await pool.query(
    `INSERT INTO password_reset (id_usuario, code, expires_at) VALUES ($1, $2, $3)`,
    [id_usuario, code, expires]
  );
}

async function verifyAndConsumeCode(id_usuario, code) {
  const { rows } = await pool.query(
    `SELECT id_reset, expires_at, used FROM password_reset
     WHERE id_usuario = $1 AND code = $2 ORDER BY created_at DESC LIMIT 1`,
    [id_usuario, code]
  );
  const rec = rows[0];
  if (!rec) return { ok: false, reason: 'no_existe' };
  if (rec.used) return { ok: false, reason: 'usado' };
  if (new Date(rec.expires_at) < new Date()) return { ok: false, reason: 'expirado' };
  await pool.query('UPDATE password_reset SET used = TRUE WHERE id_reset = $1', [rec.id_reset]);
  return { ok: true };
}

async function invalidateUserSessions(id_usuario) {
  try {
    await pool.query(
      `UPDATE sesion SET estado = 'CERRADA', fecha_cierre = CURRENT_TIMESTAMP
       WHERE id_usuario = $1 AND estado = 'ACTIVA'`,
      [id_usuario]
    );
  } catch (_) { /* tabla no disponible en algunos seeds */ }
}

// --------------------------------------------------------------------------
// POST /api/auth/signup
// Crea un gimnasio + admin owner. Inicia trial de 7 dias.
// --------------------------------------------------------------------------
router.post('/signup', async (req, res) => {
  const parsed = parse(signupSchema, req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
  const { gymName, gymPhone, gymEmail, ownerName, ownerEmail, password } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Email unico (gimnasio no estricto, pero chequeamos duplicado si viene)
    if (gymEmail) {
      const { rows } = await client.query('SELECT id_gimnasio FROM gimnasio WHERE LOWER(email) = $1', [gymEmail.toLowerCase()]);
      if (rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Ya existe un gimnasio registrado con ese correo.' });
      }
    }

    const { rows: dupUser } = await client.query('SELECT id_usuario FROM usuario WHERE LOWER(email) = $1', [ownerEmail.toLowerCase()]);
    if (dupUser.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    }

    // 2. Crear gimnasio con trial_ends_at = NOW() + 7d (o TRIAL_DAYS)
    const days = trialDays();
    const { rows: gymRows } = await client.query(
      `INSERT INTO gimnasio (nombre, telefono, email, trial_ends_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' days')::INTERVAL)
       RETURNING id_gimnasio, nombre, telefono, email, trial_ends_at, activo`,
      [gymName.trim(), gymPhone.replace(/\D/g, ''), gymEmail || null, String(days)]
    );
    const gym = gymRows[0];

    // 3. Crear admin owner
    const password_hash = await bcrypt.hash(password, 10);
    const { rows: userRows } = await client.query(
      `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol)
       VALUES ($1, $2, $3, $4, (SELECT id_rol FROM rol WHERE nombre='ADMINISTRADOR' LIMIT 1))
       RETURNING id_usuario, nombre, email, id_gimnasio`,
      [gym.id_gimnasio, ownerName.trim(), ownerEmail.toLowerCase(), password_hash]
    );
    const owner = userRows[0];

    // 4. Configuracion por defecto del gimnasio
    await client.query(
      `INSERT INTO configuracion_gimnasio (id_gimnasio, actualizado_por)
       VALUES ($1, $2)
       ON CONFLICT (id_gimnasio) DO NOTHING`,
      [gym.id_gimnasio, owner.id_usuario]
    );

    await client.query('COMMIT');

    const token = generarToken({
      id_usuario: owner.id_usuario,
      nombre: owner.nombre,
      email: owner.email,
      rol: 'ADMINISTRADOR',
      id_gimnasio: gym.id_gimnasio,
    });

    return res.status(201).json({
      message: `Gimnasio creado. Tienes ${days} dias de prueba gratuita.`,
      token,
      user: usuarioSeguro({ ...owner, id_rol: 1, rol_nombre: 'ADMINISTRADOR' }),
      gym: {
        id: gym.id_gimnasio,
        nombre: gym.nombre,
        trialEndsAt: gym.trial_ends_at,
        trialDays: days,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /auth/signup] Error:', err.message);
    return res.status(500).json({ error: 'Error al crear el gimnasio y la cuenta.' });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/login
// --------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  const parsed = parse(loginSchema, req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
  const { email, password } = parsed.data;

  console.log('[POST /auth/login] intento:', email);

  try {
    const { rows } = await pool.query(
      `SELECT u.id_usuario, u.nombre, u.email, u.password_hash, u.id_gimnasio, u.activo,
              g.activo AS gym_activo, g.trial_ends_at,
              CASE WHEN u.id_rol = 1 THEN 'ADMINISTRADOR'
                   WHEN u.id_rol = 2 THEN 'RECEPCIONISTA'
                   ELSE COALESCE(u.rol, 'RECEPCIONISTA') END AS rol_nombre
       FROM usuario u
       INNER JOIN gimnasio g ON g.id_gimnasio = u.id_gimnasio
       WHERE LOWER(u.email) = $1 AND u.activo = TRUE`,
      [email.toLowerCase()]
    );
    const usuario = rows[0];
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const ok = await bcrypt.compare(password, usuario.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    let token;
    try {
      token = generarToken(usuario);
    } catch (tokenErr) {
      console.error('[POST /auth/login] Error firmando JWT:', tokenErr.message, tokenErr.stack);
      return res.status(500).json({ error: 'Error generando token de sesion' });
    }

    return res.json({
      message: 'Inicio de sesion exitoso',
      token,
      user: usuarioSeguro(usuario),
      gym: {
        id: usuario.id_gimnasio,
        trialEndsAt: usuario.trial_ends_at,
        active: usuario.gym_activo,
      },
    });
  } catch (err) {
    console.error('[POST /auth/login] Error:', err.message, err.stack);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// GET /api/auth/me
// --------------------------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.*, g.activo AS gym_activo, g.trial_ends_at
       FROM usuario u
       INNER JOIN gimnasio g ON g.id_gimnasio = u.id_gimnasio
       WHERE u.id_usuario = $1 AND u.activo = TRUE`,
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({
      user: usuarioSeguro(u),
      gym: { id: u.id_gimnasio, active: u.gym_activo, trialEndsAt: u.trial_ends_at },
    });
  } catch (err) {
    console.error('[GET /auth/me] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/logout
// --------------------------------------------------------------------------
router.post('/logout', authenticate, (req, res) => {
  // JWT es stateless: el logout efectivo lo hace el cliente borrando el token.
  // Devolvemos 200 para que el front confirme la accion.
  return res.json({ message: 'Sesion cerrada' });
});

// --------------------------------------------------------------------------
// POST /api/auth/forgot-password
// --------------------------------------------------------------------------
router.post('/forgot-password', async (req, res) => {
  const parsed = parse(forgotPasswordSchema, req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
  const email = parsed.data.email.toLowerCase();

  const generic = { message: 'Si el correo esta registrado, te enviamos un codigo para recuperar tu contrasena.' };

  try {
    const { rows } = await pool.query(
      'SELECT id_usuario, nombre, email FROM usuario WHERE LOWER(email) = $1 AND activo = TRUE',
      [email]
    );
    const usuario = rows[0];
    if (!usuario) return res.json({ ...generic, resendAfterSeconds: 60 });

    await ensureResetTable();
    const code = random6();
    await storeResetCode(usuario.id_usuario, code, 15);

    const result = await sendMail({
      to: usuario.email,
      subject: 'Codigo de recuperacion - FitLoyalty',
      text: `Hola ${usuario.nombre},\n\nUsa este codigo para restablecer tu contrasena. Expira en 15 minutos:\n\n${code}\n\nSi no solicitaste esto, ignora este mensaje.`,
      html: `<p>Hola <strong>${usuario.nombre}</strong>,</p><p>Tu codigo de recuperacion es: <strong style="font-size:24px;letter-spacing:4px;">${code}</strong></p><p>Expira en 15 minutos.</p>`,
    });

    const payload = { ...generic, resendAfterSeconds: 60 };
    if (!result.delivered) {
      payload.devCode = code;
    }
    return res.json(payload);
  } catch (err) {
    console.error('[POST /auth/forgot-password] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/verify-reset-code
// --------------------------------------------------------------------------
router.post('/verify-reset-code', async (req, res) => {
  const parsed = parse(verifyResetCodeSchema, req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
  const { email, code } = parsed.data;

  try {
    const { rows } = await pool.query(
      'SELECT id_usuario, nombre FROM usuario WHERE LOWER(email) = $1 AND activo = TRUE',
      [email.toLowerCase()]
    );
    const usuario = rows[0];
    if (!usuario) return res.status(400).json({ error: 'Usuario no encontrado' });

    const ver = await verifyAndConsumeCode(usuario.id_usuario, code);
    if (!ver.ok) {
      const reason = ver.reason === 'expirado' ? 'Codigo expirado'
        : ver.reason === 'usado' ? 'Codigo ya usado'
        : 'Codigo invalido';
      return res.status(400).json({ error: reason });
    }

    const resetToken = generarResetToken(usuario);
    return res.json({ message: 'Codigo verificado. Define tu nueva contrasena.', resetToken });
  } catch (err) {
    console.error('[POST /auth/verify-reset-code] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/reset-password
// --------------------------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  const parsed = parse(resetPasswordSchema, req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
  const { email, code, password, resetToken } = parsed.data;

  try {
    let usuarioId = null;

    if (resetToken) {
      try {
        const payload = jwt.verify(resetToken, process.env.JWT_SECRET);
        if (payload.purpose !== 'reset') throw new Error('Token invalido');
        usuarioId = payload.id;
      } catch (_) {
        return res.status(400).json({ error: 'Token de restablecimiento invalido o expirado' });
      }
    } else {
      if (!email || !code) return res.status(400).json({ error: 'Email y codigo son requeridos' });
      const { rows } = await pool.query(
        'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1 AND activo = TRUE',
        [email.toLowerCase()]
      );
      const u = rows[0];
      if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
      const ver = await verifyAndConsumeCode(u.id_usuario, code);
      if (!ver.ok) {
        const reason = ver.reason === 'expirado' ? 'Codigo expirado'
          : ver.reason === 'usado' ? 'Codigo ya usado'
          : 'Codigo invalido';
        return res.status(400).json({ error: reason });
      }
      usuarioId = u.id_usuario;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { rowCount } = await pool.query('UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2', [password_hash, usuarioId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await invalidateUserSessions(usuarioId);

    return res.json({ message: 'Contrasena actualizada. Ya puedes iniciar sesion.' });
  } catch (err) {
    console.error('[POST /auth/reset-password] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
