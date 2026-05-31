const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateToken(user) {
  return jwt.sign(
    {
      id:    user.id,
      email: user.email,
      role:  user.role,
      gymId: user.gym_id,
      name:  user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function safeUser(user) {
  // Nunca devolver el hash de la contraseña
  const { password, ...safe } = user;
  return safe;
}

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());

  if (!user) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = generateToken(user);

  res.json({
    message: 'Login exitoso',
    token,
    user: safeUser(user),
  });
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────
// Solo admins pueden crear usuarios con roles especiales.
// Registro público solo crea miembros.
router.post('/register', (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'El email ya está registrado' });
  }

  const hash = bcrypt.hashSync(password, 10);

  const stmt = db.prepare(`
    INSERT INTO users (name, email, password, role, phone)
    VALUES (?, ?, ?, 'member', ?)
  `);

  const result = stmt.run(name.trim(), email.toLowerCase().trim(), hash, phone || null);
  const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = generateToken(newUser);

  res.status(201).json({
    message: 'Registro exitoso',
    token,
    user: safeUser(newUser),
  });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json({ user: safeUser(user) });
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// Con JWT stateless el logout se maneja en el cliente eliminando el token.
// Este endpoint existe para consistencia de la API.
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Sesión cerrada correctamente' });
});

module.exports = router;
