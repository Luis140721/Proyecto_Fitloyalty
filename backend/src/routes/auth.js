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
 *   DELETE /api/auth/account         -> elimina cuenta y datos del gimnasio (cascade)
 *
 * Convenciones:
 *   - Codigos de error: 400 validacion, 401 credenciales, 403 sin permiso, 409 duplicado, 500 servidor.
 *   - Auth: JWT (HS256) emitido por helpers/auth-helpers.gererateToken.
 *   - El signup NO requiere auth previa. Toda otra ruta requiere `authenticate`.
 *   - Todos los handlers async van envueltos con asyncHandler para que los
 *     rechazos lleguen al errorHandler central con respuesta consistente.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/db');
const { authenticate } = require('../middleware/auth');
const asyncHandler     = require('../lib/asyncHandler');
const { AppError }     = require('../lib/errors');
const {
  validarEmail, validarContrasena, normEmail,
  usuarioSeguro, generarToken, generarResetToken, random6,
} = require('../lib/auth-helpers');
const { sendRecoveryCode } = require('../lib/email');
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
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
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
router.post('/signup', asyncHandler(async (req, res) => {
  const parsed = parse(signupSchema, req.body);
  if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
  const { gymName, gymPhone, gymEmail, ownerName, ownerEmail, password } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Email unico (gimnasio no estricto, pero chequeamos duplicado si viene)
    if (gymEmail) {
      const { rows } = await client.query('SELECT id_gimnasio FROM gimnasio WHERE LOWER(email) = $1', [gymEmail.toLowerCase()]);
      if (rows.length > 0) {
        await client.query('ROLLBACK');
        throw new AppError(409, 'Ya existe un gimnasio registrado con ese correo.', 'GYM_EMAIL_TAKEN');
      }
    }

    const { rows: dupUser } = await client.query('SELECT id_usuario FROM usuario WHERE LOWER(email) = $1', [ownerEmail.toLowerCase()]);
    if (dupUser.length > 0) {
      await client.query('ROLLBACK');
      throw new AppError(409, 'Ya existe un usuario con ese correo.', 'USER_EMAIL_TAKEN');
    }

    // 2. Crear gimnasio con trial_ends_at = NOW() + Nd (o TRIAL_DAYS)
    //    Si el email del owner pertenece a la lista de cuentas dev, NO tiene trial (NULL = suscrito).
    const days = trialDays();
    const isDevAccount = (process.env.DEV_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(ownerEmail.toLowerCase());
    const trialDaysParam = isDevAccount ? '0' : String(days);
    const { rows: gymRows } = await client.query(
      `INSERT INTO gimnasio (nombre, telefono, email, trial_ends_at)
       VALUES ($1, $2, $3,
         CASE WHEN $4::int = 0 THEN NULL ELSE NOW() + ($4 || ' days')::INTERVAL END)
       RETURNING id_gimnasio, nombre, telefono, email, trial_ends_at, activo`,
      [gymName.trim(), gymPhone.replace(/\D/g, ''), gymEmail || null, trialDaysParam]
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
      message: isDevAccount
        ? 'Cuenta de desarrollo creada. Trial desactivado (acceso ilimitado).'
        : `Gimnasio creado. Tienes ${days} dias de prueba gratuita.`,
      token,
      user: usuarioSeguro({ ...owner, id_rol: 1, rol_nombre: 'ADMINISTRADOR' }),
      gym: {
        id: gym.id_gimnasio,
        nombre: gym.nombre,
        trialEndsAt: gym.trial_ends_at,
        trialDays: days,
        devAccount: isDevAccount,
      },
    });
  } catch (err) {
    if (!(err instanceof AppError)) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('[POST /auth/signup] Error:', err.message, err.stack);
    }
    throw err;
  } finally {
    client.release();
  }
}));

// --------------------------------------------------------------------------
// POST /api/auth/login
// --------------------------------------------------------------------------
router.post('/login', asyncHandler(async (req, res) => {
  const parsed = parse(loginSchema, req.body);
  if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
  const { email, password } = parsed.data;

  console.log('[POST /auth/login] intento:', email);

  let usuario;
  try {
    const { rows } = await pool.query(
      `SELECT u.id_usuario, u.nombre, u.email, u.password_hash, u.id_gimnasio, u.activo,
              g.activo AS gym_activo, g.trial_ends_at,
              CASE WHEN u.id_rol = 1 THEN 'ADMINISTRADOR'
                   WHEN u.id_rol = 2 THEN 'RECEPCIONISTA'
                   WHEN u.id_rol = 3 THEN 'ENTRENADOR'
                   ELSE 'RECEPCIONISTA' END AS rol_nombre
       FROM usuario u
       INNER JOIN gimnasio g ON g.id_gimnasio = u.id_gimnasio
       WHERE LOWER(u.email) = $1 AND u.activo = TRUE`,
      [email.toLowerCase()]
    );
    usuario = rows[0];
  } catch (err) {
    console.error('[POST /auth/login] Error consultando usuario:', err.message);
    throw new AppError(503, 'No pudimos validar tus credenciales. Intenta de nuevo.', 'DB_UNREACHABLE');
  }

  if (!usuario) throw new AppError(401, 'Credenciales incorrectas', 'BAD_CREDENTIALS');

  let ok = false;
  try {
    ok = await bcrypt.compare(password, usuario.password_hash);
  } catch (err) {
    console.error('[POST /auth/login] Error comparando password:', err.message);
    throw new AppError(500, 'Error validando la contrasena', 'PASSWORD_CHECK_FAILED');
  }
  if (!ok) throw new AppError(401, 'Credenciales incorrectas', 'BAD_CREDENTIALS');

  let token;
  try {
    token = generarToken(usuario);
  } catch (tokenErr) {
    console.error('[POST /auth/login] Error firmando JWT:', tokenErr.message, tokenErr.stack);
    throw new AppError(500, 'Error generando token de sesion', 'TOKEN_SIGN_FAILED');
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
}));

// --------------------------------------------------------------------------
// GET /api/auth/me
// --------------------------------------------------------------------------
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.*, g.activo AS gym_activo, g.trial_ends_at
       FROM usuario u
       INNER JOIN gimnasio g ON g.id_gimnasio = u.id_gimnasio
       WHERE u.id_usuario = $1 AND u.activo = TRUE`,
      [req.user.id]
    );
    const u = rows[0];
    if (!u) throw new AppError(404, 'Usuario no encontrado', 'USER_NOT_FOUND');
    return res.json({
      user: usuarioSeguro(u),
      gym: { id: u.id_gimnasio, active: u.gym_activo, trialEndsAt: u.trial_ends_at },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /auth/me] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tu perfil. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

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
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const parsed = parse(forgotPasswordSchema, req.body);
  if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
  const email = parsed.data.email.toLowerCase();

  const generic = { message: 'Si el correo esta registrado, te enviamos un codigo para recuperar tu contrasena.' };

  let usuario;
  try {
    const { rows } = await pool.query(
      'SELECT id_usuario, nombre, email FROM usuario WHERE LOWER(email) = $1 AND activo = TRUE',
      [email]
    );
    usuario = rows[0];
  } catch (err) {
    console.error('[POST /auth/forgot-password] Error consultando usuario:', err.message);
    throw new AppError(503, 'No pudimos procesar la solicitud. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
  if (!usuario) return res.json({ ...generic, resendAfterSeconds: 60 });

  try {
    await ensureResetTable();
    const code = random6();
    await storeResetCode(usuario.id_usuario, code, 15);

    const result = await sendRecoveryCode({
      to: usuario.email,
      name: usuario.nombre,
      code,
      expiresMinutes: 15,
    });

    const payload = { ...generic, resendAfterSeconds: 60 };
    if (!result.delivered) {
      payload.devCode = code;
    }
    return res.json(payload);
  } catch (err) {
    console.error('[POST /auth/forgot-password] Error:', err.message);
    // Si falla el envio de mail, devolvemos OK generico igual (no filtramos existencia)
    // y dejamos que el front sepa por consola / siguiente intento.
    return res.json({ ...generic, resendAfterSeconds: 60 });
  }
}));

// --------------------------------------------------------------------------
// POST /api/auth/verify-reset-code
// --------------------------------------------------------------------------
router.post('/verify-reset-code', asyncHandler(async (req, res) => {
  const parsed = parse(verifyResetCodeSchema, req.body);
  if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
  const { email, code } = parsed.data;

  let usuario;
  try {
    const { rows } = await pool.query(
      'SELECT id_usuario, nombre FROM usuario WHERE LOWER(email) = $1 AND activo = TRUE',
      [email.toLowerCase()]
    );
    usuario = rows[0];
  } catch (err) {
    console.error('[POST /auth/verify-reset-code] Error consultando usuario:', err.message);
    throw new AppError(503, 'No pudimos validar el codigo. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
  if (!usuario) throw new AppError(400, 'Codigo invalido', 'BAD_CODE');

  let ver;
  try {
    ver = await verifyAndConsumeCode(usuario.id_usuario, code);
  } catch (err) {
    console.error('[POST /auth/verify-reset-code] Error verificando codigo:', err.message);
    throw new AppError(503, 'No pudimos validar el codigo. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
  if (!ver.ok) {
    const reason = ver.reason === 'expirado' ? 'Codigo expirado'
      : ver.reason === 'usado' ? 'Codigo ya usado'
      : 'Codigo invalido';
    throw new AppError(400, reason, 'BAD_CODE');
  }

  const resetToken = generarResetToken(usuario);
  return res.json({ message: 'Codigo verificado. Define tu nueva contrasena.', resetToken });
}));

// --------------------------------------------------------------------------
// POST /api/auth/reset-password
// --------------------------------------------------------------------------
router.post('/reset-password', asyncHandler(async (req, res) => {
  const parsed = parse(resetPasswordSchema, req.body);
  if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
  const { email, code, password, resetToken } = parsed.data;

  let usuarioId = null;

  if (resetToken) {
    try {
      const payload = jwt.verify(resetToken, process.env.JWT_SECRET);
      if (payload.purpose !== 'reset') throw new Error('Token invalido');
      usuarioId = payload.id;
    } catch (_) {
      throw new AppError(400, 'Token de restablecimiento invalido o expirado', 'BAD_RESET_TOKEN');
    }
  } else {
    if (!email || !code) throw new AppError(400, 'Email y codigo son requeridos', 'VALIDATION_ERROR');
    let u;
    try {
      const { rows } = await pool.query(
        'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1 AND activo = TRUE',
        [email.toLowerCase()]
      );
      u = rows[0];
    } catch (err) {
      console.error('[POST /auth/reset-password] Error consultando usuario:', err.message);
      throw new AppError(503, 'No pudimos procesar la solicitud. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
    if (!u) throw new AppError(404, 'Usuario no encontrado', 'USER_NOT_FOUND');

    let ver;
    try {
      ver = await verifyAndConsumeCode(u.id_usuario, code);
    } catch (err) {
      console.error('[POST /auth/reset-password] Error verificando codigo:', err.message);
      throw new AppError(503, 'No pudimos procesar la solicitud. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
    if (!ver.ok) {
      const reason = ver.reason === 'expirado' ? 'Codigo expirado'
        : ver.reason === 'usado' ? 'Codigo ya usado'
        : 'Codigo invalido';
      throw new AppError(400, reason, 'BAD_CODE');
    }
    usuarioId = u.id_usuario;
  }

  let rowCount;
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const r = await pool.query('UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2', [password_hash, usuarioId]);
    rowCount = r.rowCount;
  } catch (err) {
    console.error('[POST /auth/reset-password] Error actualizando password:', err.message);
    throw new AppError(503, 'No pudimos actualizar la contrasena. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
  if (rowCount === 0) throw new AppError(404, 'Usuario no encontrado', 'USER_NOT_FOUND');

  await invalidateUserSessions(usuarioId);

  return res.json({ message: 'Contrasena actualizada. Ya puedes iniciar sesion.' });
}));

// --------------------------------------------------------------------------
// DELETE /api/auth/account
//
// Derecho de supresion (Ley 1581 de 2012, art. 15).
// Elimina TODOS los datos del gimnasio del usuario autenticado:
//   - gimnasio
//   - usuarios (admin + staff) y sus sesiones
//   - miembros, membresias, pagos, congelaciones, checkins
//   - invitaciones de staff
//   - configuration, canales, plantillas, campanas, envios
//   - alertas, hitos, retos, notificaciones, etiquetas, retos_miembro
//
// La mayoria de las tablas hijas tiene FK con ON DELETE CASCADE hacia gimnasio
// o a usuario; donde no existe cascade, se borra explicitamente antes de
// gimnasio para no violar constraints.
//
// Solo el ADMIN puede ejecutar esta accion. Staff y miembros NO pueden
// eliminar el gimnasio.
// --------------------------------------------------------------------------
router.delete('/account', authenticate, asyncHandler(async (req, res) => {
  const gymId = req.user.gymId;
  const userId = req.user.id;
  const userRole = (req.user.role || '').toLowerCase();

  if (!gymId) throw new AppError(400, 'Cuenta sin gimnasio asociado.', 'NO_GYM');
  if (userRole !== 'admin') {
    throw new AppError(403, 'Solo el administrador del gimnasio puede eliminar la cuenta.', 'NOT_ADMIN');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Borrado en orden: tablas dependientes primero, gimnasio al final.
    // Cada delete hace idempotente: si una tabla no existe, la omitimos.
    const safe = async (sql, params) => {
      try {
        await client.query(sql, params);
      } catch (err) {
        // 42P01 = undefined_table. Si la tabla no existe, no es bloqueante.
        if (err.code !== '42P01') throw err;
      }
    };

    // Hijos del gimnasio (FK con id_gimnasio)
    await safe(`DELETE FROM envio_mensaje     WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM campana_destinatario WHERE id_campana IN (SELECT id_campana FROM campana WHERE id_gimnasio = $1)`, [gymId]);
    await safe(`DELETE FROM campana          WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM plantilla_mensaje WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM canal_comunicacion WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM alerta_abandono  WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM hito_miembro     WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = $1)`, [gymId]);
    await safe(`DELETE FROM hito_gamificacion WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM etiqueta_comportamiento WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM reto_miembro     WHERE id_reto IN (SELECT id_reto FROM reto WHERE id_gimnasio = $1)`, [gymId]);
    await safe(`DELETE FROM reto            WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM notificacion    WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM configuracion_gimnasio WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM invitacion_staff WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM plan_membresia  WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM auditoria       WHERE id_gimnasio = $1`, [gymId]);

    // Hijos de miembro (que ya vamos a borrar, pero sus hijos primero)
    await safe(`DELETE FROM pago             WHERE id_membresia IN (SELECT id_membresia FROM membresia WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = $1))`, [gymId]);
    await safe(`DELETE FROM congelacion_membresia WHERE id_membresia IN (SELECT id_membresia FROM membresia WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = $1))`, [gymId]);
    await safe(`DELETE FROM checkin         WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM miembro_etiqueta WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = $1)`, [gymId]);
    await safe(`DELETE FROM membresia       WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = $1)`, [gymId]);
    await safe(`DELETE FROM password_reset  WHERE id_usuario IN (SELECT id_usuario FROM usuario WHERE id_gimnasio = $1)`, [gymId]);
    await safe(`DELETE FROM sesion          WHERE id_usuario IN (SELECT id_usuario FROM usuario WHERE id_gimnasio = $1)`, [gymId]);
    await safe(`DELETE FROM miembro         WHERE id_gimnasio = $1`, [gymId]);
    await safe(`DELETE FROM usuario         WHERE id_gimnasio = $1`, [gymId]);

    // Auditoria: registre la eliminacion ANTES de borrar gimnasio (FK).
    try {
      await client.query(
        `INSERT INTO auditoria (id_gimnasio, tabla_afectada, id_registro, accion, id_usuario, detalle, fecha_evento)
         VALUES ($1, 'gimnasio', $1::text::int, 'DELETE', $2, $3, NOW())`,
        [gymId, userId, JSON.stringify({ descripcion: 'Cuenta eliminada por solicitud ARCO (Ley 1581/2012)' })]
      );
    } catch (err) {
      if (err.code !== '42P01') console.warn('[DELETE /auth/account] Warning auditoria:', err.message);
    }

    // Eliminar el gimnasio (trigger CASCADE lo arrastra si existe)
    await client.query(`DELETE FROM gimnasio WHERE id_gimnasio = $1`, [gymId]);

    await client.query('COMMIT');

    return res.json({
      message: 'Cuenta eliminada. Todos los datos del gimnasio fueron borrados de forma permanente.',
      deleted: { gymId },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[DELETE /auth/account] Error:', err.code, err.message);
    throw new AppError(500, 'No pudimos eliminar la cuenta. Intenta de nuevo o escribe a datos@fitloyalty.co.', 'DELETE_FAILED');
  } finally {
    client.release();
  }
}));

module.exports = router;