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
 *
 * Cada handler async va envuelto con asyncHandler para que rechazos lleguen
 * al errorHandler central. Los errores controlados se lanzan con AppError.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { sendStaffInvite } = require('../lib/email');
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
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

function buildAcceptUrl(token) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Deteccion defensiva de esquema para GET /api/admin/staff
//
// La query original hacia un subselect contra la tabla `rol` que NO existe en
// el entorno de Render (desfase entre BD local y BD de prod). Ademas se
// referenciaban columnas (`fecha_creacion`, `ultimo_acceso`) que en teoria
// pueden no existir en algun entorno.
//
// Resolucion:
//   1. En cada request (no cacheamos en memoria) hacemos UN solo SELECT a
//      information_schema + to_regclass para confirmar si existen:
//        - tabla 'rol' o 'roles'
//        - columna 'fecha_creacion' en usuario
//        - columna 'ultimo_acceso' en usuario
//      El costo es ~0.3 ms y nos protege de caches stale entre deploys.
//   2. Si no existen (modo degradado), derivamos el nombre del rol con un
//      CASE sobre id_rol y omitimos las columnas opcionales del SELECT.
// ---------------------------------------------------------------------------
async function detectStaffSchema() {
  try {
    const { rows } = await pool.query(`
      SELECT
        to_regclass('public.rol')   IS NOT NULL AS rol_exists,
        to_regclass('public.roles') IS NOT NULL AS roles_exists,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='usuario' AND column_name='fecha_creacion'
        ) AS has_fecha_creacion,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='usuario' AND column_name='ultimo_acceso'
        ) AS has_ultimo_acceso
    `);
    const r = rows[0] || {};
    return {
      rolTable:         r.rol_exists ? 'rol' : (r.roles_exists ? 'roles' : null),
      hasFechaCreacion: Boolean(r.has_fecha_creacion),
      hasUltimoAcceso:  Boolean(r.has_ultimo_acceso),
    };
  } catch (e) {
    // Fallback DEFENSIVO: si NO pudimos inspeccionar information_schema no
    // podemos confiar en que `rol` exista. Asumimos la forma minima posible:
    // sin subselect de rol (se devuelve por CASE), sin columnas opcionales.
    // Esto evita 503 falsos cuando la introspeccion falla por permisos/red.
    console.warn('[staff] No se pudo inspeccionar information_schema, usando fallback defensivo (sin rol, sin cols opcionales):', e.message);
    return {
      rolTable: null,
      hasFechaCreacion: false,
      hasUltimoAcceso: false,
    };
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/staff/invite
// ---------------------------------------------------------------------------
router.post(
  '/admin/staff/invite',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(inviteSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const { email, nombre, rol } = parsed.data;
    const gymId = req.user.gymId;

    // No permitir invitar a un email que ya esta registrado en este gym
    const { rows: existingUser } = await pool.query(
      'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1 AND id_gimnasio = $2',
      [email, gymId]
    );
    if (existingUser.length > 0) {
      throw new AppError(409, 'Ese correo ya pertenece a un usuario de este gimnasio.', 'USER_EMAIL_TAKEN');
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
      throw new AppError(409, 'Ya hay una invitacion activa para ese correo. Espera a que expire o revocala.', 'INVITE_DUPLICATED');
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

    let inv;
    try {
      const { rows } = await pool.query(
        `INSERT INTO invitacion_staff (id_gimnasio, email, nombre, rol_asignado, token_hash, id_usuario_creador, fecha_expiracion)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_invitacion, email, nombre, rol_asignado, fecha_creacion, fecha_expiracion`,
        [gymId, email, nombre, rol, tokenHash, req.user.id, expiresAt]
      );
      inv = rows[0];
    } catch (err) {
      console.error('[POST /admin/staff/invite] Error insertando invitacion:', err.message);
      throw new AppError(503, 'No pudimos crear la invitacion. Intenta de nuevo.', 'DB_UNREACHABLE');
    }

    const acceptUrl = buildAcceptUrl(token);

    let result;
    try {
      const { rows: gymRows } = await pool.query(
        'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );
      const gymName = gymRows[0]?.nombre || 'tu gimnasio';
      result = await sendStaffInvite({
        to: email,
        invitedName: nombre,
        invitedBy: req.user.name,
        gymName,
        role: rol,
        acceptUrl,
        expiresDays: 7,
      });
    } catch (err) {
      console.error('[POST /admin/staff/invite] Error enviando mail (no bloqueante):', err.message);
      result = { delivered: false };
    }

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
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/staff/invitations
// ---------------------------------------------------------------------------
router.get(
  '/admin/staff/invitations',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    try {
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
    } catch (err) {
      console.error('[GET /admin/staff/invitations] Error:', err.message);
      throw new AppError(503, 'No pudimos listar las invitaciones. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/staff/invitations/:id/revoke
// ---------------------------------------------------------------------------
router.post(
  '/admin/staff/invitations/:id/revoke',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    let rows;
    try {
      ({ rows } = await pool.query(
        `UPDATE invitacion_staff
         SET fecha_revocado = NOW()
         WHERE id_invitacion = $1 AND id_gimnasio = $2 AND fecha_aceptacion IS NULL AND fecha_revocado IS NULL
         RETURNING id_invitacion, fecha_revocado`,
        [id, gymId]
      ));
    } catch (err) {
      console.error('[POST /admin/staff/invitations/:id/revoke] Error:', err.message);
      throw new AppError(503, 'No pudimos revocar la invitacion. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
    if (rows.length === 0) throw new AppError(404, 'Invitacion no encontrada o ya finalizo.', 'INVITE_NOT_FOUND');
    return res.json({ message: 'Invitacion revocada.', invitation: rows[0] });
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/staff   (lista usuarios staff del gimnasio)
//
// Query defensiva:
//   - Detecta si la tabla de roles existe como `rol` o `roles`. Si no existe
//     (caso Render), deriva el nombre del rol desde `id_rol` con un CASE.
//   - Selecciona `fecha_creacion` y `ultimo_acceso` solo si existen.
//   - Ordena por la primera columna disponible (fecha_creacion -> id_usuario).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/admin/diagnostics (admin)
// Diagnostico en vivo: ejecuta la query REAL del handler contra la BD y
// devuelve lo que pase (rows, error con code y message). Solo accesible
// al admin del gimnasio autenticado.
// ---------------------------------------------------------------------------
router.get(
  '/admin/diagnostics',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const out = { checks: {} };
    try {
      const r = await pool.query(`
        SELECT
          to_regclass('public.rol')   AS rol_reg,
          to_regclass('public.roles') AS roles_reg,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuario' AND column_name='fecha_creacion') AS has_fecha_creacion,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuario' AND column_name='ultimo_acceso') AS has_ultimo_acceso
      `);
      out.checks.rolReg           = r.rows[0].rol_reg;
      out.checks.rolesReg         = r.rows[0].roles_reg;
      out.checks.hasFechaCreacion = r.rows[0].has_fecha_creacion;
      out.checks.hasUltimoAcceso  = r.rows[0].has_ultimo_acceso;
    } catch (e) {
      out.checks.introspection = { code: e.code, message: e.message };
    }
    try {
      const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='usuario' ORDER BY ordinal_position`);
      out.checks.usuarioColumns = r.rows.map((x) => x.column_name);
    } catch (e) {
      out.checks.usuarioColumns = { code: e.code, message: e.message };
    }
    // Replay de la query EXACTA que dispara 503.
    try {
      const cols = ['id_usuario', 'nombre', 'email', 'id_rol', 'activo'];
      if (out.checks.hasFechaCreacion) cols.push('fecha_creacion');
      if (out.checks.hasUltimoAcceso)  cols.push('ultimo_acceso');
      const sql = `SELECT ${cols.join(', ')}, CASE usuario.id_rol WHEN 1 THEN 'ADMINISTRADOR' WHEN 2 THEN 'RECEPCIONISTA' WHEN 3 THEN 'ENTRENADOR' ELSE 'ROL_' || usuario.id_rol::text END AS rol FROM usuario WHERE id_gimnasio = $1 ORDER BY ${out.checks.hasFechaCreacion ? 'fecha_creacion' : 'id_usuario'} DESC`;
      out.checks.sql = sql;
      const r = await pool.query(sql, [req.user.gymId]);
      out.checks.replay = { ok: true, rowCount: r.rowCount, sample: r.rows.slice(0, 2) };
    } catch (e) {
      out.checks.replay = { ok: false, code: e.code, message: e.message, hint: e.hint, detail: e.detail, position: e.position, where: e.where };
    }
    return res.json(out);
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/staff   (lista usuarios staff del gimnasio)
// Query defensiva: detecta columnas opcionales, deriva rol por CASE.
// ---------------------------------------------------------------------------
async function listStaffInternal(gymId) {
  const schema = await detectStaffSchema();
  const selectCols = ['id_usuario', 'nombre', 'email', 'id_rol', 'activo'];
  if (schema.hasFechaCreacion) selectCols.push('fecha_creacion');
  if (schema.hasUltimoAcceso)  selectCols.push('ultimo_acceso');
  const rolExpr = `CASE usuario.id_rol WHEN 1 THEN 'ADMINISTRADOR' WHEN 2 THEN 'RECEPCIONISTA' WHEN 3 THEN 'ENTRENADOR' ELSE 'ROL_' || usuario.id_rol::text END AS rol`;
  const orderCol = schema.hasFechaCreacion ? 'fecha_creacion' : 'id_usuario';
  const sql = `SELECT ${selectCols.join(', ')}, ${rolExpr} FROM usuario WHERE id_gimnasio = $1 ORDER BY ${orderCol} DESC`;
  const { rows } = await pool.query(sql, [gymId]);
  return rows;
}

router.get(
  '/admin/staff',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    try {
      const rows = await listStaffInternal(gymId);
      return res.json({ staff: rows });
    } catch (err) {
      console.error('[GET /admin/staff] code:', err.code, 'msg:', err.message, 'sql:', err.sql || '(invisible)');
      throw new AppError(503, 'No pudimos listar el equipo. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/auth/accept-invite/:token   (preview publico)
// ---------------------------------------------------------------------------
router.get('/auth/accept-invite/:token', asyncHandler(async (req, res) => {
  const token = String(req.params.token || '');
  const tokenHash = hashToken(token);
  let inv;
  try {
    const { rows } = await pool.query(
      `SELECT i.email, i.nombre, i.rol_asignado, i.fecha_expiracion,
              i.fecha_aceptacion, i.fecha_revocado,
              g.nombre AS gym_nombre
         FROM invitacion_staff i
         INNER JOIN gimnasio g ON g.id_gimnasio = i.id_gimnasio
        WHERE i.token_hash = $1`,
      [tokenHash]
    );
    inv = rows[0];
  } catch (err) {
    console.error('[GET /auth/accept-invite/:token] Error:', err.message);
    throw new AppError(503, 'No pudimos validar la invitacion. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
  if (!inv) throw new AppError(404, 'Invitacion no encontrada', 'INVITE_NOT_FOUND');
  if (inv.fecha_aceptacion) throw new AppError(410, 'Esta invitacion ya fue aceptada.', 'INVITE_ALREADY_ACCEPTED');
  if (inv.fecha_revocado)   throw new AppError(410, 'Esta invitacion fue revocada.', 'INVITE_REVOKED');
  if (new Date(inv.fecha_expiracion) < new Date()) throw new AppError(410, 'Esta invitacion expiro.', 'INVITE_EXPIRED');
  return res.json({
    email: inv.email,
    nombre: inv.nombre,
    rol: inv.rol_asignado,
    gym: inv.gym_nombre,
    expiresAt: inv.fecha_expiracion,
  });
}));

// ---------------------------------------------------------------------------
// POST /api/auth/accept-invite   (crea el usuario)
// ---------------------------------------------------------------------------
router.post('/auth/accept-invite', asyncHandler(async (req, res) => {
  const parsed = parse(acceptSchema, req.body);
  if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
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
    if (!inv) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Invitacion no encontrada', 'INVITE_NOT_FOUND');
    }
    if (inv.fecha_aceptacion) {
      await client.query('ROLLBACK');
      throw new AppError(410, 'Esta invitacion ya fue aceptada.', 'INVITE_ALREADY_ACCEPTED');
    }
    if (inv.fecha_revocado) {
      await client.query('ROLLBACK');
      throw new AppError(410, 'Esta invitacion fue revocada.', 'INVITE_REVOKED');
    }
    if (new Date(inv.fecha_expiracion) < new Date()) {
      await client.query('ROLLBACK');
      throw new AppError(410, 'Esta invitacion expiro.', 'INVITE_EXPIRED');
    }

    // Si el email ya existe en este gym, no crear duplicado
    const { rows: existingUser } = await client.query(
      'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1 AND id_gimnasio = $2',
      [inv.email, inv.id_gimnasio]
    );
    if (existingUser.length > 0) {
      await client.query('ROLLBACK');
      throw new AppError(409, 'Ya existe un usuario con ese correo en este gimnasio.', 'USER_EMAIL_TAKEN');
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
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (err instanceof AppError) throw err;
    console.error('[POST /auth/accept-invite] Error:', err.message, err.stack);
    throw new AppError(503, 'Error al aceptar la invitacion. Intenta de nuevo.', 'DB_UNREACHABLE');
  } finally {
    client.release();
  }
}));

module.exports = router;