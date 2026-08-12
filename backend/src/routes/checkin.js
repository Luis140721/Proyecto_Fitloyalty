/**
 * routes/checkin.js
 *
 * Check-in de miembros (asistencia al gimnasio).
 *
 *   POST /api/admin/checkin   -> registra una entrada (manual o por codigo QR)
 *   GET  /api/admin/checkin   -> historial reciente del gimnasio
 *
 * Handlers con asyncHandler: cualquier rechazo va al errorHandler central.
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');

const router = express.Router();

const checkinSchema = z.object({
  codigo:    z.string().optional(),
  documento: z.string().optional(),
  metodo:    z.enum(['QR', 'MANUAL', 'CODIGOBARRAS']).default('MANUAL'),
  observacion: z.string().max(200).optional(),
}).refine((d) => Boolean(d.codigo || d.documento), { message: 'codigo o documento requerido', path: ['codigo'] });

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

// ---------------------------------------------------------------------------
// POST /api/admin/checkin
// ---------------------------------------------------------------------------
router.post(
  '/admin/checkin',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(checkinSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const { codigo, documento, metodo, observacion } = parsed.data;
    const gymId = req.user.gymId;

    try {
      const where = ['id_gimnasio = $1', 'activo = TRUE'];
      const params = [gymId];
      if (codigo)    { params.push(codigo);    where.push(`codigo_qr = $${params.length}`); }
      if (documento) { params.push(documento); where.push(`documento = $${params.length}`); }
      const { rows: miembros } = await pool.query(
        `SELECT id_miembro, nombre, documento, codigo_qr FROM miembro WHERE ${where.join(' AND ')} LIMIT 1`,
        params
      );
      const miembro = miembros[0];
      if (!miembro) throw new AppError(404, 'Miembro no encontrado en este gimnasio.', 'MEMBER_NOT_FOUND');

      // Validar membresia activa
      const { rows: mem } = await pool.query(
        `SELECT estado, fecha_fin FROM membresia
         WHERE id_miembro = $1
         ORDER BY fecha_fin DESC NULLS LAST LIMIT 1`,
        [miembro.id_miembro]
      );
      const m = mem[0];
      const hoy = new Date();
      const sinMembresia = !m;
      const membresiaVencida = m && (m.estado !== 'ACTIVA' || new Date(m.fecha_fin) < hoy);

      const { rows } = await pool.query(
        `INSERT INTO checkin (id_miembro, id_gimnasio, metodo, id_usuario, observacion, valido)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_checkin, fecha_hora, metodo`,
        [miembro.id_miembro, gymId, metodo, req.user.id, observacion || null, !membresiaVencida]
      );

      return res.status(201).json({
        message: membresiaVencida ? 'Membresia no activa. Ingreso registrado con aviso.' : 'Ingreso registrado.',
        checkin: rows[0],
        miembro: { id: miembro.id_miembro, nombre: miembro.nombre, documento: miembro.documento },
        membresia: m || null,
        advertencia: sinMembresia ? 'sin-membresia' : membresiaVencida ? 'membresia-vencida' : null,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/checkin] Error:', err.message);
      throw new AppError(503, 'No pudimos registrar el ingreso. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/checkin  (historial reciente)
// ---------------------------------------------------------------------------
router.get(
  '/admin/checkin',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    try {
      const { rows } = await pool.query(
        `SELECT c.id_checkin, c.fecha_hora, c.metodo, c.valido, c.observacion,
                m.id_miembro, m.nombre, m.documento, m.codigo_qr
         FROM checkin c
         INNER JOIN miembro m ON m.id_miembro = c.id_miembro
         WHERE c.id_gimnasio = $1
         ORDER BY c.fecha_hora DESC
         LIMIT ${limit}`,
        [gymId]
      );
      return res.json({ checkins: rows });
    } catch (err) {
      console.error('[GET /admin/checkin] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar el historial. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;