/**
 * routes/admin.js
 *
 * Endpoints de administracion interna del sistema FitLoyalty.
 * Pensados para ejecutar tareas de mantenimiento (seed, fix de usuarios, etc.)
 * contra la base de datos de produccion sin necesidad de abrir un tunel SSH.
 *
 * Proteccion: requieren la cabecera `X-Admin-Token` y que coincida con
 * `process.env.ADMIN_TOKEN`. Render recibe este token via env var (NO commitear).
 *
 * IMPORTANTE: el seed_supremo es idempotente: correlo 2 veces y queda igual.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

function requireAdminToken(req, res, next) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Esta ruta solo está disponible en desarrollo.' });
  }
  const token = req.get('X-Admin-Token');
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: 'ADMIN_TOKEN no configurado en el servidor.' });
  }
  if (token !== expected) {
    return res.status(401).json({ error: 'Token invalido.' });
  }
  next();
}

const seedSupremoSchema = z.object({
  gymName: z.string().trim().min(1).max(120).optional(),
  ownerName: z.string().trim().min(1).max(120).optional(),
}).strict();

const seedSupremoConfigSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(12),
});

async function ensureRole(client, name) {
  const { rows } = await client.query(
    'SELECT id_rol FROM rol WHERE LOWER(nombre) = $1 LIMIT 1',
    [name.toLowerCase()]
  );
  if (rows[0]) return rows[0].id_rol;
  const { rows: inserted } = await client.query(
    'INSERT INTO rol (nombre, descripcion) VALUES ($1, $2) RETURNING id_rol',
    [name.toUpperCase(), `Rol ${name}`]
  );
  return inserted[0].id_rol;
}

// POST /api/admin/seed-supremo
// Crea o resetea una cuenta admin sin suscripcion (trial_ends_at = NULL).
//
// Solo desarrollo. El correo y la clave deben venir de SEED_ADMIN_EMAIL y
// SEED_ADMIN_PASSWORD; el body solo puede personalizar nombres no sensibles.
router.post('/seed-supremo', requireAdminToken, asyncHandler(async (req, res) => {
  const config = seedSupremoConfigSchema.safeParse({
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  });
  if (!config.success) {
    return res.status(503).json({
      error: 'SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD deben estar configurados correctamente.',
      code: 'SEED_CONFIG_MISSING',
    });
  }
  const input = seedSupremoSchema.safeParse(req.body || {});
  if (!input.success) {
    return res.status(400).json({
      error: 'Datos inválidos para crear la cuenta semilla.',
      code: 'VALIDATION_ERROR',
    });
  }

  const email = config.data.email.toLowerCase();
  const password = config.data.password;
  const gymName = input.data.gymName || 'FitLoyalty Supremo';
  const ownerName = input.data.ownerName || 'Administrador de desarrollo';

  const pool = require('../db/db');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const adminRol = await ensureRole(client, 'ADMINISTRADOR');

    // 1) Gimnasio sin trial (NULL = suscrito, sin expiracion).
    const { rows: existingGym } = await client.query(
      'SELECT id_gimnasio FROM gimnasio WHERE LOWER(nombre) = $1 ORDER BY id_gimnasio ASC LIMIT 1',
      [gymName.toLowerCase()]
    );
    let gymId;
    if (existingGym.length > 0) {
      gymId = existingGym[0].id_gimnasio;
      await client.query(
        `UPDATE gimnasio SET trial_ends_at = NULL, activo = TRUE WHERE id_gimnasio = $1`,
        [gymId]
      );
    } else {
      // En Neon la columna trial_ends_at es NOT NULL (a diferencia de local).
      // Para una cuenta suprema (sin suscripcion) usamos un valor muy lejano en
      // el futuro (anio 2099) para evitar el NOT NULL y a la vez no activar el trial.
      const { rows: gymRows } = await client.query(
        `INSERT INTO gimnasio (nombre, telefono, email, trial_ends_at, activo, plan_activo)
         VALUES ($1, '3000000000', $2, '2099-12-31 00:00:00+00', TRUE, 'SUSCRITO')
         RETURNING id_gimnasio`,
        [gymName, email]
      );
      gymId = gymRows[0].id_gimnasio;
    }

    // 2) Usuario admin. Rellenamos AMBAS columnas (rol legacy varchar + id_rol FK)
    //    para no toparnos con el not-null de Neon.
    const hash = await bcrypt.hash(password, 10);
    const { rows: existingUser } = await client.query(
      'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1',
      [email]
    );
    let userId, created;
    if (existingUser.length > 0) {
      userId = existingUser[0].id_usuario;
      await client.query(
        `UPDATE usuario
         SET password_hash = $1, id_gimnasio = $2, id_rol = $3, rol = $4, activo = TRUE, nombre = $5
         WHERE id_usuario = $6`,
        [hash, gymId, adminRol, 'ADMINISTRADOR', ownerName, userId]
      );
      created = false;
    } else {
      const { rows: userRows } = await client.query(
        `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol, rol, activo)
         VALUES ($1, $2, $3, $4, $5, 'ADMINISTRADOR', TRUE)
         RETURNING id_usuario`,
        [gymId, ownerName, email, hash, adminRol]
      );
      userId = userRows[0].id_usuario;
      created = true;
    }

    // 3) Configuracion por defecto del gimnasio (idempotente).
    await client.query(
      `INSERT INTO configuracion_gimnasio (id_gimnasio, actualizado_por)
       VALUES ($1, $2) ON CONFLICT (id_gimnasio) DO NOTHING`,
      [gymId, userId]
    );

    await client.query('COMMIT');

    return res.json({
      ok: true,
      message: created ? 'Cuenta suprema creada.' : 'Cuenta suprema actualizada.',
      account: { email, gymName, ownerName },
      ids: { id_usuario: userId, id_gimnasio: gymId, id_rol: adminRol },
      trial_ends_at: null,
      plan: 'ilimitado',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /admin/seed-supremo] Error:', err.code, err.message);
    return res.status(500).json({
      error: 'Error al crear/actualizar cuenta suprema.',
      code: 'SEED_FAILED',
    });
  } finally {
    client.release();
  }
}));

module.exports = router;
