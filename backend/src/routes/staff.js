/**
 * routes/staff.js
 *
 * Gestion del staff (recepcionistas) por parte del admin del gimnasio.
 *
 *   POST  /api/admin/staff/invite            -> admin: envia una invitacion por email
 *   GET   /api/admin/staff/invitations       -> admin: lista invitaciones pendientes/usadas
 *   POST  /api/admin/staff/invitations/:id/revoke -> admin: revoca una invitacion pendiente
 *   POST  /api/auth/accept-invite            -> publico: completa el registro con el token
 *   GET   /api/auth/accept-invite/:token     -> publico: devuelve datos de la invitacion (preview)
 *   GET   /api/admin/staff                   -> admin: lista usuarios staff del gimnasio
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireActiveTrial } = require('../lib/trial');
const { sendMail } = require('../lib/email');
const { generateToken, hashToken } = require('../lib/invitations');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');

const router = express.Router();

const inviteSchema = z.object({
  email:    z.string().email().transform((v) => v.trim().toLowerCase()),
  nombre:   z.string().min(2, 'El nombre es requerido'),
  rol:      z.enum(['RECEPCIONISTA', 'ADMINISTRADOR']).default('RECEPCIONISTA'),
});

const acceptSchema = z.object({
  token:    z.string().min(20),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
  nombre:   z.string().min(2).optional(),
});

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error) };
  return { ok: true, data: result.data };
}

function buildAcceptUrl(token) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// POST /api/admin/staff/invite
// ---------------------------------------------------------------------------
router.post(
  '/admin/staff/invite',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  async (req, res) => {
    const parsed = parse(inviteSchema, req.body);
    if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
    const { email, nombre, rol } = parsed.data;
    const gymId = req.user.gymId;

    // No permitir invitar a un email que ya esta registrado en este gym
    const { rows: existingUser } = await pool.query(
      'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1 AND id_gimnasio = $2',
      [email, gymId]
    );
    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Ese correo ya pertenece a un usuario de este gimnasio.' });
    }

    // No duplicar invitaciones pendientes activas
    const { rows: existingInv } = await pool.query(
      `SELECT id_invitacion FROM invitacion_staff
       WHERE LOWER(email) = $1 AND id_gimnasio = $2
         AND fecha_aceptacion IS NULL AND fecha_revocado IS NULL
         AND fecha_expiracion > NOW()`,
      [email, gymId]
    );
    if (existingInv.length > 0) {
      return res.status(409).json({ error: 'Ya hay una invitacion activa para ese correo. Espera a que expire o revocala.' });
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

    const { rows } = await pool.query(
      `INSERT INTO invitacion_staff (id_gimnasio, email, nombre, rol_asignado, token_hash, id_usuario_creador, fecha_expiracion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_invitacion, email, nombre, rol_asignado, fecha_creacion, fecha_expiracion`,
      [gymId, email, nombre, rol, tokenHash, req.user.id, expiresAt]
    );

    const inv = rows[0];
    const acceptUrl = buildAcceptUrl(token);

    const result = await sendMail({
      to: email,
      subject: 'Te invitaron a FitLoyalty',
      text: `Hola ${nombre},\n\n${req.user.name} te invito a unirte a FitLoyalty como ${rol}. Crea tu contrasena aqui (link valido 7 dias):\n\n${acceptUrl}\n`,
      html: `<p>Hola <strong>${nombre}</strong>,</p><p><strong>${req.user.name}</strong> te invito a FitLoyalty como <strong>${rol}</strong>.</p><p><a href="${acceptUrl}" style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;border-radius:8px;text-decoration:none;">Aceptar invitacion</a></p><p>El link expira en 7 dias.</p>`,
    });

    const payload = {
      message: 'Invitacion creada.',
      invitation: inv,
      acceptUrl,
      emailDelivered: result.delivered,
    };
    if (!result.delivered) {
      payload.devAcceptToken = token;
    }
    return res.status(201).json(payload);
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/staff/invitations
// ---------------------------------------------------------------------------
router.get(
  '/admin/staff/invitations',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  async (req, res) => {
    const gymId = req.user.gymId;
    const { rows } = await pool.query(
      `SELECT id_invitacion, email, nombre, rol_asignado, fecha_creacion, fecha_expiracion,
              fecha_aceptacion, fecha_revocado,
              (fecha_aceptacion IS NULL AND fecha_revocado IS NULL AND fecha_expiracion > NOW()) AS pendiente
       FROM invitacion_staff
       WHERE id_gimnasio = $1
       ORDER BY fecha_creacion DESC
       LIMIT 100`,
      [gymId]
    );
    return res.json({ invitations: rows });
  }
);

// ---------------------------------------------------------------------------
// POST /api/admin/staff/invitations/:id/revoke
// ---------------------------------------------------------------------------
router.post(
  '/admin/staff/invitations/:id/revoke',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  async (req, res) => {
    const gymId = req.user.gymId;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Id invalido' });

    const { rows } = await pool.query(
      `UPDATE invitacion_staff
       SET fecha_revocado = NOW()
       WHERE id_invitacion = $1 AND id_gimnasio = $2 AND fecha_aceptacion IS NULL AND fecha_revocado IS NULL
       RETURNING id_invitacion, fecha_revocado`,
      [id, gymId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invitacion no encontrada o ya finalizo.' });
    return res.json({ message: 'Invitacion revocada.', invitation: rows[0] });
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/staff   (lista usuarios staff del gimnasio)
// ---------------------------------------------------------------------------
router.get(
  '/admin/staff',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  async (req, res) => {
    const gymId = req.user.gymId;
    const { rows } = await pool.query(
      `SELECT id_usuario, nombre, email, id_rol, activo, fecha_creacion, ultimo_acceso,
              (SELECT nombre FROM rol WHERE rol.id_rol = usuario.id_rol) AS rol
       FROM usuario
       WHERE id_gimnasio = $1
       ORDER BY fecha_creacion DESC`,
      [gymId]
    );
    return res.json({ staff: rows });
  }
);

// ---------------------------------------------------------------------------
// GET /api/auth/accept-invite/:token   (preview publico)
// ---------------------------------------------------------------------------
router.get('/auth/accept-invite/:token', async (req, res) => {
  const token = String(req.params.token || '');
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT i.email, i.nombre, i.rol_asignado, i.fecha_expiracion,
            i.fecha_aceptacion, i.fecha_revocado,
            g.nombre AS gym_nombre
       FROM invitacion_staff i
       INNER JOIN gimnasio g ON g.id_gimnasio = i.id_gimnasio
      WHERE i.token_hash = $1`,
    [tokenHash]
  );
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'Invitacion no encontrada' });
  if (inv.fecha_aceptacion) return res.status(410).json({ error: 'Esta invitacion ya fue aceptada.' });
  if (inv.fecha_revocado) return res.status(410).json({ error: 'Esta invitacion fue revocada.' });
  if (new Date(inv.fecha_expiracion) < new Date()) return res.status(410).json({ error: 'Esta invitacion expiro.' });
  return res.json({
    email: inv.email,
    nombre: inv.nombre,
    rol: inv.rol_asignado,
    gym: inv.gym_nombre,
    expiresAt: inv.fecha_expiracion,
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/accept-invite   (crea el usuario)
// ---------------------------------------------------------------------------
router.post('/auth/accept-invite', async (req, res) => {
  const parsed = parse(acceptSchema, req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
  const { token, password, nombre } = parsed.data;
  const tokenHash = hashToken(token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id_invitacion, id_gimnasio, email, nombre, rol_asignado,
              fecha_expiracion, fecha_aceptacion, fecha_revocado
         FROM invitacion_staff
        WHERE token_hash = $1
        FOR UPDATE`,
      [tokenHash]
    );
    const inv = rows[0];
    if (!inv) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invitacion no encontrada' }); }
    if (inv.fecha_aceptacion) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'Esta invitacion ya fue aceptada.' }); }
    if (inv.fecha_revocado) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'Esta invitacion fue revocada.' }); }
    if (new Date(inv.fecha_expiracion) < new Date()) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'Esta invitacion expiro.' }); }

    // Si el email ya existe en este gym, no crear duplicado
    const { rows: existingUser } = await client.query(
      'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1 AND id_gimnasio = $2',
      [inv.email, inv.id_gimnasio]
    );
    if (existingUser.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo en este gimnasio.' });
    }

    const finalName = (nombre || inv.nombre).trim();
    const password_hash = await bcrypt.hash(password, 10);

    const { rows: userRows } = await client.query(
      `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol, debe_cambiar_clave)
       VALUES ($1, $2, $3, $4,
         (SELECT id_rol FROM rol WHERE nombre = $5),
         FALSE)
       RETURNING id_usuario, nombre, email, id_gimnasio, id_rol`,
      [inv.id_gimnasio, finalName, inv.email, password_hash, inv.rol_asignado]
    );
    const newUser = userRows[0];

    await client.query(
      `UPDATE invitacion_staff
         SET fecha_aceptacion = NOW(), id_usuario_creador = $1
       WHERE id_invitacion = $2`,
      [newUser.id_usuario, inv.id_invitacion]
    );

    await client.query('COMMIT');

    const { generarToken, mapRol } = require('../lib/auth-helpers');
    const jwt = generarToken({
      id_usuario: newUser.id_usuario,
      nombre: newUser.nombre,
      email: newUser.email,
      rol: mapRol(inv.rol_asignado),
      id_gimnasio: newUser.id_gimnasio,
    });

    return res.status(201).json({
      message: 'Cuenta creada. Bienvenido a FitLoyalty.',
      token: jwt,
      user: {
        id: newUser.id_usuario,
        name: newUser.nombre,
        email: newUser.email,
        role: mapRol(inv.rol_asignado),
        gymId: newUser.id_gimnasio,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /auth/accept-invite] Error:', err.message);
    return res.status(500).json({ error: 'Error al aceptar la invitacion.' });
  } finally {
    client.release();
  }
});

module.exports = router;
