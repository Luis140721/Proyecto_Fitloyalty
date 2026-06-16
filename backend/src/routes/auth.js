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
  const mapa = { ADMINISTRADOR: 'admin', RECEPCIONISTA: 'receptionist' };
  return mapa[rol] || rol.toLowerCase();
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
      role:  mapRol(usuario.rol),
      gymId: usuario.id_gimnasio,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

/**
 * URL de avatar: usa foto_url de BD o genera una por defecto con ui-avatars.
 */
function avatarUrl(u) {
  if (u.foto_url) return u.foto_url;
  const name = encodeURIComponent(u.nombre || 'Usuario');
  return `https://ui-avatars.com/api/?name=${name}&background=f97316&color=fff&size=128`;
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
    role:     mapRol(u.rol),
    gymId:    u.id_gimnasio,
    photoUrl: avatarUrl(u),
  };
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

  try {
    // $1 es el parametro seguro -- previene SQL Injection
    const resultado = await pool.query(
      'SELECT * FROM usuario WHERE email = $1 AND activo = TRUE',
      [email.toLowerCase().trim()]
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
router.post('/register', async (req, res) => {
  const { name, email, password, gymId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contrasena son requeridos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres' });
  }

  const idGimnasio = gymId || 1; // Default: FitZone Bogota (gimnasio ID 1)

  try {
    // Verificar que el email no este ya registrado
    const { rows: existente } = await pool.query(
      'SELECT id_usuario FROM usuario WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existente.length > 0) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    // Hashear la contrasena: "mipass123" -> "$2b$10$xyz..."
    // El 10 es el numero de rondas de hashing (balance seguridad/velocidad)
    const password_hash = await bcrypt.hash(password, 10);

    // INSERT ... RETURNING * devuelve el registro recien creado
    const { rows } = await pool.query(
      `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'RECEPCIONISTA')
       RETURNING *`,
      [idGimnasio, name.trim(), email.toLowerCase().trim(), password_hash]
    );

    const nuevoUsuario = rows[0];
    const token = generarToken(nuevoUsuario);

    res.status(201).json({
      message: 'Registro exitoso',
      token,
      user: usuarioSeguro(nuevoUsuario),
    });

  } catch (err) {
    console.error('[POST /register] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
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
      'SELECT * FROM usuario WHERE id_usuario = $1 AND activo = TRUE',
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

  if (!email) {
    return res.status(400).json({ error: 'El correo es requerido' });
  }

  const respuestaGenerica = {
    message: 'Si el correo esta registrado, te enviamos un enlace para recuperar tu contrasena.',
  };

  try {
    const { rows } = await pool.query(
      'SELECT id_usuario, nombre, email FROM usuario WHERE email = $1 AND activo = TRUE',
      [email.toLowerCase().trim()]
    );
    const usuario = rows[0];

    // Si no existe, respondemos igual (sin pistas) y no generamos token.
    if (!usuario) {
      return res.json(respuestaGenerica);
    }

    // Token de un solo proposito: 'reset'. Vence en 1 hora.
    const resetToken = jwt.sign(
      { id: usuario.id_usuario, purpose: 'reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // T-05 (Santiago): Enviar correo de recuperación real con Nodemailer
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
      subject: 'Recuperación de Contraseña - FitLoyalty',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 40px;">🏋️</span>
            <h1 style="color: #1e293b; margin: 10px 0 0 0; font-size: 24px;">FitLoyalty</h1>
          </div>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">Hola <strong>${usuario.nombre}</strong>,</p>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">Has solicitado restablecer tu contraseña para tu cuenta de personal en FitLoyalty. Haz clic en el siguiente botón para continuar:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #f97316; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
          </div>
          <p style="color: #64748b; font-size: 14px; line-height: 1.6;">Este enlace expirará en 1 hora por razones de seguridad.</p>
          <p style="color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px; text-align: center;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
        </div>
      `,
    };

    if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      await transporter.sendMail(mailOptions);
      console.log(`[SMTP] Correo de recuperación enviado a ${usuario.email}`);
    } else {
      console.log(`[SMTP] Sin credenciales configuradas. Enlace generado: ${resetUrl}`);
    }

    const payload = { ...respuestaGenerica };

    // Solo en desarrollo (sin SMTP) devolvemos el enlace para pruebas locales
    if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_USER) {
      payload.devResetUrl = resetUrl;
    }

    return res.json(payload);

  } catch (err) {
    console.error('[POST /forgot-password] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --------------------------------------------------------------------------
// POST /api/auth/reset-password  (C2 - restablecer contrasena)
// --------------------------------------------------------------------------
/**
 * Recibe:   { token, password }
 * Devuelve: { message }
 *
 * Verifica el token de recuperacion y, si es valido, guarda la nueva
 * contrasena (hasheada con bcrypt).
 */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token y nueva contrasena son requeridos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres' });
  }

  // 1. Verificar el token (firma + vencimiento)
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'El enlace es invalido o ya expiro. Solicita uno nuevo.' });
  }

  // 2. Asegurar que es un token de recuperacion, no un token de sesion normal
  if (payload.purpose !== 'reset') {
    return res.status(400).json({ error: 'Token invalido' });
  }

  try {
    // 3. Hashear la nueva contrasena y guardarla
    const password_hash = await bcrypt.hash(password, 10);
    const { rowCount } = await pool.query(
      'UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2 AND activo = TRUE',
      [password_hash, payload.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Contrasena actualizada. Ya puedes iniciar sesion con tu nueva contrasena.' });

  } catch (err) {
    console.error('[POST /reset-password] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
