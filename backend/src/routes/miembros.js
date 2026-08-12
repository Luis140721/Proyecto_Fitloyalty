/**
 * routes/miembros.js
 *
 * CRUD de miembros (socios) del gimnasio del usuario autenticado.
 * Multi-tenant: todas las queries filtran por id_gimnasio.
 *
 *   GET    /api/admin/miembros         -> lista paginada + busqueda por nombre/doc
 *   POST   /api/admin/miembros         -> crea un miembro (genera codigo_qr)
 *   GET    /api/admin/miembros/:id     -> detalle
 *   PUT    /api/admin/miembros/:id     -> actualiza nombre/telefono/email/activo
 *   DELETE /api/admin/miembros/:id     -> soft-delete (activo = false)
 *   GET    /api/admin/miembros/lookup  -> busqueda por codigo_qr/documento (para checkin)
 *
 * Handlers async con asyncHandler para que cualquier rechazo llegue al
 * errorHandler central con respuesta consistente.
 */
const express = require('express');
const crypto  = require('crypto');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');

const router = express.Router();

const createSchema = z.object({
  nombre:    z.string().min(2, 'El nombre es requerido'),
  documento: z.string().min(4, 'El documento es requerido'),
  telefono:  z.string().min(7, 'El telefono es requerido'),
  email:     z.string().email().optional().or(z.literal('').transform(() => undefined)),
});

const updateSchema = z.object({
  nombre:   z.string().min(2).optional(),
  telefono: z.string().min(7).optional(),
  email:    z.string().email().optional().or(z.literal('').transform(() => undefined)),
  activo:   z.boolean().optional(),
});

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

function genQrCode(gymId) {
  // 8 chars legibles, sin ambiguedades (sin 0/O/1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `FL-${gymId}-${out}`;
}

// ---------------------------------------------------------------------------
// GET /api/admin/miembros  (paginado + busqueda)
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
    const q = (req.query.q || '').trim();

    const where = ['id_gimnasio = $1', 'activo = TRUE'];
    const params = [gymId];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const i = params.length;
      where.push(`(LOWER(nombre) LIKE $${i} OR LOWER(documento) LIKE $${i} OR LOWER(COALESCE(email,'')) LIKE $${i} OR LOWER(codigo_qr) = LOWER($${i + 1}))`);
      params.push(q);
    }

    const offset = page * pageSize;
    try {
      const { rows } = await pool.query(
        `SELECT id_miembro, nombre, documento, telefono, email, codigo_qr, activo, fecha_registro
         FROM miembro
         WHERE ${where.join(' AND ')}
         ORDER BY nombre ASC
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );
      const totalQ = await pool.query(
        `SELECT COUNT(*)::int AS total FROM miembro WHERE ${where.join(' AND ')}`,
        params
      );

      return res.json({ miembros: rows, total: totalQ.rows[0].total, page, pageSize });
    } catch (err) {
      console.error('[GET /admin/miembros] Error:', err.message);
      throw new AppError(503, 'No pudimos listar los miembros. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/miembros
// ---------------------------------------------------------------------------
router.post(
  '/admin/miembros',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(createSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const { nombre, documento, telefono, email } = parsed.data;
    const gymId = req.user.gymId;

    try {
      // Duplicados por gimnasio
      const { rows: dupDoc } = await pool.query(
        'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND documento = $2',
        [gymId, documento]
      );
      if (dupDoc.length > 0) throw new AppError(409, 'Ya existe un miembro con ese documento.', 'MEMBER_DOC_TAKEN');

      if (email) {
        const { rows: dupMail } = await pool.query(
          'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND LOWER(email) = $2',
          [gymId, email.toLowerCase()]
        );
        if (dupMail.length > 0) throw new AppError(409, 'Ya existe un miembro con ese correo.', 'MEMBER_EMAIL_TAKEN');
      }

      // Generar codigo_qr unico (reintentar si choca)
      let codigo_qr;
      for (let i = 0; i < 5; i += 1) {
        const candidate = genQrCode(gymId);
        const { rows } = await pool.query('SELECT 1 FROM miembro WHERE codigo_qr = $1', [candidate]);
        if (rows.length === 0) { codigo_qr = candidate; break; }
      }
      if (!codigo_qr) throw new AppError(500, 'No se pudo generar un codigo QR unico. Reintenta.', 'QR_GENERATION_FAILED');

      const { rows } = await pool.query(
        `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, email, codigo_qr)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, activo, fecha_registro`,
        [gymId, nombre.trim(), documento, telefono, email || null, codigo_qr]
      );

      return res.status(201).json({ message: 'Miembro creado.', miembro: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/miembros] Error:', err.message);
      throw new AppError(503, 'No pudimos crear el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/miembros/lookup?codigo=QR-FL-1-XXXX  (para checkin)
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros/lookup',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const codigo = (req.query.codigo || '').trim();
    const documento = (req.query.documento || '').trim();
    if (!codigo && !documento) throw new AppError(400, 'codigo o documento requerido', 'VALIDATION_ERROR');

    const where = ['id_gimnasio = $1', 'activo = TRUE'];
    const params = [gymId];
    if (codigo)    { params.push(codigo);    where.push(`codigo_qr = $${params.length}`); }
    if (documento) { params.push(documento); where.push(`documento = $${params.length}`); }

    try {
      const { rows } = await pool.query(
        `SELECT id_miembro, nombre, documento, telefono, email, codigo_qr
         FROM miembro WHERE ${where.join(' AND ')} LIMIT 1`,
        params
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

      // Membresia actual
      const { rows: mem } = await pool.query(
        `SELECT m.estado, m.fecha_inicio, m.fecha_fin, p.nombre AS plan
         FROM membresia m
         LEFT JOIN plan_membresia p ON p.id_plan = m.id_plan
         WHERE m.id_miembro = $1
         ORDER BY m.fecha_fin DESC NULLS LAST
         LIMIT 1`,
        [rows[0].id_miembro]
      );

      return res.json({ miembro: rows[0], membresia: mem[0] || null });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[GET /admin/miembros/lookup] Error:', err.message);
      throw new AppError(503, 'No pudimos buscar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/miembros/:id
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    try {
      const { rows } = await pool.query(
        'SELECT id_miembro, nombre, documento, telefono, email, codigo_qr, activo, fecha_registro FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
        [id, gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      return res.json({ miembro: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[GET /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/admin/miembros/:id
// ---------------------------------------------------------------------------
router.put(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(updateSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    const campos = [];
    const params = [];
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      params.push(k === 'email' && v ? v.toLowerCase() : v);
      campos.push(`${k} = $${params.length}`);
    }
    if (campos.length === 0) throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');

    params.push(id);
    const idIdx = params.length;
    params.push(req.user.gymId);
    const gymIdx = params.length;

    try {
      const { rows } = await pool.query(
        `UPDATE miembro SET ${campos.join(', ')}
         WHERE id_miembro = $${idIdx} AND id_gimnasio = $${gymIdx}
         RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, activo, fecha_registro`,
        params
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      return res.json({ message: 'Miembro actualizado.', miembro: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[PUT /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos actualizar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/admin/miembros/:id  (soft delete)
// ---------------------------------------------------------------------------
router.delete(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    try {
      const { rows } = await pool.query(
        `UPDATE miembro SET activo = FALSE
         WHERE id_miembro = $1 AND id_gimnasio = $2 AND activo = TRUE
         RETURNING id_miembro`,
        [id, req.user.gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado o ya estaba inactivo', 'MEMBER_NOT_FOUND');
      return res.json({ message: 'Miembro desactivado.' });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[DELETE /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos desactivar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;