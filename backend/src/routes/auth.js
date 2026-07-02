/**
 * routes/auth.js -- Endpoints de autenticacion para FitLoyalty
 *
 * POST /api/auth/login     -> Iniciar sesion (devuelve JWT)
 * POST /api/auth/register  -> Crear nuevo usuario staff
 * GET  /api/auth/me        -> Ver mi perfil (requiere token)
 * POST /api/auth/logout    -> Cerrar sesion
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool    = require('../db/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Convierte el rol de PostgreSQL al formato que espera el frontend.
 * 'ADMINISTRADOR' -> 'admin'
 * 'RECEPCIONISTA' -> 'receptionist'
 */
function mapRol(rol) {
  if (rol === null || rol === undefined) return 'unknown';
  const s = String(rol).trim().toLowerCase();
  if (s === '1' || s.includes('admin') || s.includes('administrador')) return 'admin';
  if (s === '2' || s.includes('recep') || s.includes('recepcionista')) return 'receptionist';
  return s.replace(/\s+/g, '_');
}

/**
 * Genera el JWT que se envia al cliente.
 * NUNCA incluir password_hash en el token.
 */
function generarToken(usuario) {
  return jwt.sign(
    {
      id:    usuario.id_usuario,
      name:  usuario.nombre,
      email: usuario.email,
      role:  mapRol(usuario.rol_nombre || usuario.rol || usuario.id_rol),
      gymId: usuario.id_gimnasio,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

const RESET_TOKEN_EXPIRES = process.env.RESET_TOKEN_EXPIRES || '15m';

function generarResetToken(usuario) {
  return jwt.sign(
    {
      id:      usuario.id_usuario,
      email:   usuario.email,
      purpose: 'reset',
    },
    process.env.JWT_SECRET,
    { expiresIn: RESET_TOKEN_EXPIRES }
  );
}

async function invalidateUserSessions(id_usuario) {
  try {
    await pool.query(
      `UPDATE sesion SET estado = 'CERRADA', fecha_cierre = CURRENT_TIMESTAMP
       WHERE id_usuario = $1 AND estado = 'ACTIVA'`,
      [id_usuario]
    );
  } catch (err) {
    console.warn('[invalidateUserSessions] Tabla sesion no disponible o error:', err.message);
  }
}

async function createSession(id_usuario, token, ip = null, dispositivo = null) {
  try {
    await pool.query(
      `INSERT INTO sesion (id_usuario, token, ip, dispositivo)
       VALUES ($1, $2, $3, $4)`,
      [id_usuario, token, ip, dispositivo]
    );
  } catch (err) {
    console.warn('[createSession] No se pudo guardar la sesión:', err.message);
  }
}

async function closeSession(token) {
  try {
    await pool.query(
      `UPDATE sesion SET estado = 'CERRADA', fecha_cierre = CURRENT_TIMESTAMP
       WHERE token = $1 AND estado = 'ACTIVA'`,
      [token]
    );
  } catch (err) {
    console.warn('[closeSession] No se pudo cerrar la sesión:', err.message);
  }
}

/**
 * URL de avatar: usa foto_url de BD o genera una por defecto con ui-avatars.
 */
function avatarUrl(u) {
  if (u.foto_url) return u.foto_url;
  const name = encodeURIComponent(u.nombre || 'Usuario');
  return `https://ui-avatars.com/api/?name=${name}&background=f97316&color=fff&size=128`;
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').toString().trim().toLowerCase());
}

function validarContrasena(password) {
  if (!password || typeof password !== 'string') return false;
  const trimmed = password.trim();
  return trimmed.length >= 6 && trimmed === password && /\d/.test(password);
}

function validarTelefonoColombiano(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return /^[3]\d{9}$/.test(digits);
}

/**
 * Devuelve el objeto usuario sin campos sensibles.
 * Este es el objeto que llega al frontend.
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

// Normaliza un email de forma segura
function normEmail(e) {
  return (e || '').toString().toLowerCase().trim();
}

// --------------------------------------------------------------------------
// Helpers para recuperación por código
// --------------------------------------------------------------------------
function random6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

// --------------------------------------------------------------------------
// POST /api/auth/login
// --------------------------------------------------------------------------
/**
 * Recibe:   { email, password }
 * Devuelve: { message, token, user }
 *
 * Pasos:
 * 1. Valida que lleguen email y password
 * 2. Busca el usuario en PostgreSQL (tabla "usuario")
 * 3. Compara la contrasena con el hash usando bcrypt
 * 4. Si es valido, genera y devuelve el JWT
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contrasena son requeridos' });
  }
  if (!validarEmail(email)) {
    return res.status(400).json({ error: 'El email no tiene un formato valido' });
  }
  if (!validarContrasena(password)) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres, contener al menos un numero y no incluir espacios' });
  }

  const emailNorm = (email || '').toString().toLowerCase().trim();

  try {
    // $1 es el parametro seguro -- previene SQL Injection
    const resultado = await pool.query(
      `SELECT u.*, r.nombre AS rol_nombre
       FROM usuario u
       LEFT JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.email = $1 AND u.activo = TRUE`,
      [emailNorm]
    );

    const usuario = resultado.rows[0];

    // Respuesta igual si no existe o si la contrasena es incorrecta
    // (no revelar si el email existe)
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // bcrypt.compare devuelve true si la contrasena coincide con el hash
    const esValida = await bcrypt.compare(password, usuario.password_hash);
    if (!esValida) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = generarToken(usuario);

    res.json({
      message: 'Login exitoso',
      token,
      user: usuarioSeguro(usuario),
    });

  } catch (err) {
    console.error('[POST /login] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/register
// --------------------------------------------------------------------------
/**
 * Crea un nuevo usuario staff (rol RECEPCIONISTA por defecto).
 * La tabla "usuario" es para STAFF del gimnasio.
 * Los clientes del gimnasio van en la tabla "miembro".
 *
 * Recibe:   { name, email, password, gymId (opcional) }
 * Devuelve: { message, token, user }
 */
// Nota: El registro de cuentas de STAFF ahora está restringido a
// administradores. Los administradores pueden crear cuentas con rol
// RECEPCIONISTA para el personal de recepción.
router.post('/register', authenticate, async (req, res) => {
  // Aseguramos que solo administradores puedan usar este endpoint
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden crear cuentas.' });
  }

  const { name, email, password, gymId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contrasena son requeridos' });
  }
  if (!validarEmail(email)) {
    return res.status(400).json({ error: 'El email no tiene un formato valido' });
  }
  if (!validarContrasena(password)) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres, contener al menos un numero y no incluir espacios' });
  }

  const idGimnasio = gymId || req.user.gymId || 1;

  try {
    // Verificar que el email no este ya registrado
    const emailNorm = (email || '').toString().toLowerCase().trim();
    const { rows: existente } = await pool.query(
      'SELECT id_usuario FROM usuario WHERE email = $1',
      [emailNorm]
    );
    if (existente.length > 0) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // Creamos siempre con rol RECEPCIONISTA (seguridad: admins crean recepcionistas)
    const { rows } = await pool.query(
      `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol)
       VALUES ($1, $2, $3, $4, 2)
       RETURNING *`,
      [idGimnasio, name.trim(), emailNorm, password_hash]
    );

    const nuevoUsuario = rows[0];

    // No devolvemos token: la creación la hace el admin, no es login.
    res.status(201).json({
      message: 'Usuario creado correctamente',
      user: usuarioSeguro(nuevoUsuario),
    });

  } catch (err) {
    console.error('[POST /register] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/signup  -> Registro público del dueño / creación de gimnasio
// --------------------------------------------------------------------------
/**
 * Flujo SaaS básico:
 *  - Crea registro en `gimnasio` y un `usuario` con rol 'ADMINISTRADOR'
 *  - La propiedad `trial_ends_at` en `gimnasio` (si existe) marca el fin del trial (7 días por defecto)
 *  - Devuelve token JWT para el nuevo admin (inicio de sesión inmediato)
 */
router.post('/signup', async (req, res) => {
  const { gymName, gymPhone, gymEmail, ownerName, ownerEmail, password } = req.body;

  if (!gymName || !gymPhone || !ownerName || !ownerEmail || !password) {
    return res.status(400).json({ error: 'gymName, gymPhone, ownerName, ownerEmail y password son requeridos' });
  }
  if (!validarEmail(ownerEmail)) {
    return res.status(400).json({ error: 'El correo del administrador no es valido' });
  }
  if (gymEmail && !validarEmail(gymEmail)) {
    return res.status(400).json({ error: 'El correo del gimnasio no es valido' });
  }
  if (!validarTelefonoColombiano(gymPhone)) {
    return res.status(400).json({ error: 'El telefono debe tener 10 digitos colombianos y comenzar con 3' });
  }
  if (!validarContrasena(password)) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres, contener al menos un numero y no incluir espacios' });
  }

  try {
    // 1. Crear gimnasio
    const gymEmailNorm = gymEmail ? normEmail(gymEmail) : null;
    const gymPhoneNorm = gymPhone.replace(/\D/g, '');
    const { rows: gymRows } = await pool.query(
      `INSERT INTO gimnasio (nombre, telefono, email) VALUES ($1, $2, $3) RETURNING *`,
      [gymName.trim(), gymPhoneNorm, gymEmailNorm]
    );
    const gym = gymRows[0];

    // 2. Hashear password y crear usuario admin para el gym
    const password_hash = await bcrypt.hash(password, 10);
    const ownerEmailNorm = normEmail(ownerEmail);
    const { rows: userRows } = await pool.query(
      `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol)
       VALUES ($1, $2, $3, $4, 1) RETURNING *`,
      [gym.id_gimnasio, ownerName.trim(), ownerEmailNorm, password_hash]
    );
    const nuevoAdmin = userRows[0];

    // 3. Crear configuración por defecto si no existe
    try {
      await pool.query(
        `INSERT INTO configuracion_gimnasio (id_gimnasio, actualizado_por) VALUES ($1, $2)`,
        [gym.id_gimnasio, nuevoAdmin.id_usuario]
      );
    } catch (_) {
      // Ignore si ya existiera alguna configuración
    }

    // 4. Generar token y devolver información incluyendo trial_ends_at si la columna existe
    const token = generarToken(nuevoAdmin);

    // Intentar leer trial_ends_at (si la columna existe en la BD)
    let trialEnds = null;
    try {
      const { rows } = await pool.query('SELECT trial_ends_at FROM gimnasio WHERE id_gimnasio = $1', [gym.id_gimnasio]);
      trialEnds = rows[0]?.trial_ends_at || null;
    } catch (_) { /* columna puede no existir en BD ya poblada */ }

    res.status(201).json({
      message: 'Gimnasio y cuenta de administrador creados. Periodo de prueba activo.',
      token,
      user: usuarioSeguro(nuevoAdmin),
      gym: { id: gym.id_gimnasio, nombre: gym.nombre, trialEndsAt: trialEnds }
    });

  } catch (err) {
    console.error('[POST /signup] Error:', err.message);
    res.status(500).json({ error: 'Error al crear gimnasio y cuenta' });
  }
});

// --------------------------------------------------------------------------
// GET /api/auth/me
// --------------------------------------------------------------------------
/**
 * Devuelve el perfil del usuario autenticado.
 * El middleware "authenticate" verifica el JWT y adjunta req.user.
 * Requiere header: Authorization: Bearer <token>
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.*, r.nombre AS rol_nombre
       FROM usuario u
       LEFT JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = $1 AND u.activo = TRUE`,
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: usuarioSeguro(rows[0]) });

  } catch (err) {
    console.error('[GET /me] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/logout
// --------------------------------------------------------------------------
/**
 * Con JWT stateless el logout ocurre en el cliente (borra el token del localStorage).
 * Este endpoint existe para que la API sea completa y consistente.
 */
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Sesion cerrada correctamente' });
});

// --------------------------------------------------------------------------
// POST /api/auth/forgot-password  (C2 - solicitar recuperacion)
// --------------------------------------------------------------------------
/**
 * Recibe:   { email }
 * Devuelve: { message }  (+ devResetUrl/devToken solo en desarrollo)
 *
 * Genera un token de recuperacion (JWT con purpose 'reset', vence en 1h) y
 * arma el enlace que el usuario usara para cambiar su contrasena.
 *
 * El ENVIO REAL del correo es la tarea T-05 (Santiago). Mientras tanto,
 * el enlace se imprime en consola y se devuelve en la respuesta para poder
 * probar el flujo de extremo a extremo sin correo real.
 *
 * Por seguridad respondemos SIEMPRE el mismo mensaje, exista o no el email
 * (asi no se revela que correos estan registrados).
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'El correo es requerido' });

  const respuestaGenerica = {
    message: 'Si el correo esta registrado, te enviamos un codigo para recuperar tu contrasena.',
  };

  try {
    const emailNorm = normEmail(email);
    const { rows } = await pool.query(
      'SELECT id_usuario, nombre, email FROM usuario WHERE email = $1 AND activo = TRUE',
      [emailNorm]
    );
    const usuario = rows[0];

    if (!usuario) return res.json(respuestaGenerica);

    // Preparar tabla y codigo
    await ensureResetTable();
    const code = random6();
    await storeResetCode(usuario.id_usuario, code, 15); // 15 minutos

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || '"FitLoyalty Soporte" <no-reply@fitloyalty.com>',
      to: usuario.email,
      subject: 'Código de recuperación - FitLoyalty',
      text: `Hola ${usuario.nombre},\n\nUsa este código para restablecer tu contraseña. Expira en 15 minutos:\n\n${code}\n\nSi no solicitaste esto, ignora este mensaje.`,
      html: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Recuperar contraseña</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6fb;color:#102a43;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;min-height:100vh;">
      <tr>
        <td align="center" style="padding:24px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(16,42,67,.12);">
            <tr>
              <td style="background-color:#0f172a;padding:32px;text-align:center;color:#ffffff;">
                <div style="font-size:36px;line-height:1;">🏋️</div>
                <h1 style="margin:16px 0 0;font-size:28px;font-weight:700;">FitLoyalty</h1>
                <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,.75);">Restablecimiento de contraseña</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Hola <strong>${usuario.nombre}</strong>,</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">Hemos recibido tu solicitud para restablecer la contraseña. Usa el siguiente código de verificación. Caduca en 15 minutos.</p>
                <div style="display:inline-block;padding:24px 0;width:100%;text-align:center;">
                  <div style="display:inline-block;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:16px;padding:22px 32px;font-size:32px;letter-spacing:6px;font-weight:700;color:#0f172a;">${code}</div>
                </div>
                <p style="margin:28px 0 0;font-size:15px;line-height:1.7;color:#64748b;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
                <hr style="margin:30px 0;border-color:#e2e8f0;" />
                <p style="margin:0;font-size:13px;line-height:1.7;color:#94a3b8;">Si necesitas ayuda adicional, responde este correo o visita FitLoyalty.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:20px 32px 32px;text-align:center;color:#64748b;font-size:13px;">
                <p style="margin:0;">FitLoyalty &bull; Soporte de acceso</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    };

    if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      await transporter.sendMail(mailOptions);
      console.log(`[SMTP] Código de recuperación enviado a ${usuario.email}`);
    } else {
      console.log(`[SMTP] Sin credenciales. Código generado: ${code}`);
    }

    const payload = { ...respuestaGenerica, resendAfterSeconds: 60 };
    if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_USER) payload.devCode = code;
    return res.json(payload);

  } catch (err) {
    console.error('[POST /forgot-password] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/verify-reset-code  (C2 - validar OTP antes de cambiar contraseña)
// --------------------------------------------------------------------------
router.post('/verify-reset-code', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) return res.status(400).json({ error: 'Email y codigo son requeridos' });
  if (typeof code !== 'string' || code.trim().length !== 6) {
    return res.status(400).json({ error: 'Codigo invalido. Debe tener 6 digitos.' });
  }

  try {
    const emailNorm = normEmail(email);
    const { rows } = await pool.query('SELECT id_usuario, email FROM usuario WHERE email = $1 AND activo = TRUE', [emailNorm]);
    const usuario = rows[0];
    if (!usuario) return res.status(400).json({ error: 'Usuario no encontrado' });

    const ver = await verifyAndConsumeCode(usuario.id_usuario, code);
    if (!ver.ok) {
      const reason = ver.reason === 'expirado' ? 'Codigo expirado' : ver.reason === 'usado' ? 'Codigo ya usado' : 'Codigo invalido';
      return res.status(400).json({ error: reason });
    }

    const resetToken = generarResetToken(usuario);
    res.json({ message: 'Codigo verificado. Ingresa tu nueva contrasena.', resetToken });
  } catch (err) {
    console.error('[POST /verify-reset-code] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/reset-password  (C2 - restablecer contrasena)
// --------------------------------------------------------------------------
/**
 * Recibe:   { resetToken, password } o { email, code, password }
 * Devuelve: { message }
 *
 * Verifica el token de recuperacion o el codigo y actualiza la contrasena.
 */
router.post('/reset-password', async (req, res) => {
  const { email, code, password, resetToken } = req.body;

  if (!password) return res.status(400).json({ error: 'La nueva contrasena es requerida' });
  if (password.length < 6) return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres' });

  try {
    let usuarioId = null;

    if (resetToken) {
      try {
        const payload = jwt.verify(resetToken, process.env.JWT_SECRET);
        if (payload.purpose !== 'reset') throw new Error('Token de recuperacion invalido');
        usuarioId = payload.id;
      } catch (err) {
        return res.status(400).json({ error: 'Token de restablecimiento invalido o expirado' });
      }
    } else {
      if (!email || !code) return res.status(400).json({ error: 'Email y codigo son requeridos' });
      const emailNorm = normEmail(email);
      const { rows } = await pool.query('SELECT id_usuario FROM usuario WHERE email = $1 AND activo = TRUE', [emailNorm]);
      const usuario = rows[0];
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

      const ver = await verifyAndConsumeCode(usuario.id_usuario, code);
      if (!ver.ok) {
        const reason = ver.reason === 'expirado' ? 'Codigo expirado' : ver.reason === 'usado' ? 'Codigo ya usado' : 'Codigo invalido';
        return res.status(400).json({ error: reason });
      }
      usuarioId = usuario.id_usuario;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { rowCount } = await pool.query('UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2', [password_hash, usuarioId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await invalidateUserSessions(usuarioId);

    res.json({ message: 'Contrasena actualizada. Ya puedes iniciar sesion con tu nueva contrasena.' });
  } catch (err) {
    console.error('[POST /reset-password] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
