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
 * Devuelve el objeto usuario sin campos sensibles.
 * Este es el objeto que llega al frontend.
 */
function usuarioSeguro(u) {
  return {
    id:    u.id_usuario,
    name:  u.nombre,
    email: u.email,
    role:  mapRol(u.rol),
    gymId: u.id_gimnasio,
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

module.exports = router;
