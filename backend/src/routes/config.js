/**
 * routes/config.js
 *
 * Configuración del gimnasio (planes, precios, recordatorios)
 *
 *   GET    /api/admin/config      -> obtener configuración del gimnasio
 *   PUT    /api/admin/config      -> actualizar configuración del gimnasio
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

const configSchema = z.object({
  plan_mensual_valor: z.number().min(0).optional(),
  plan_trimestral_valor: z.number().min(0).optional(),
  plan_semestral_valor: z.number().min(0).optional(),
  plan_anual_valor: z.number().min(0).optional(),
  plan_clases_suelta_valor: z.number().min(0).optional(),
  plan_ilimitado_valor: z.number().min(0).optional(),
  recordatorio_cobro_activo: z.boolean().optional(),
  dias_recordatorio_default: z.number().min(1).max(30).optional(),
  dias_prueba: z.number().min(1).max(90).optional(),
});

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

// ---------------------------------------------------------------------------
// GET /api/admin/config
// ---------------------------------------------------------------------------
router.get(
  '/admin/config',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;

    try {
      const { rows } = await pool.query(
        'SELECT * FROM config_gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );

      if (rows.length === 0) {
        // Crear configuración por defecto si no existe
        const { rows: newConfig } = await pool.query(
          `INSERT INTO config_gimnasio (id_gimnasio)
           VALUES ($1)
           RETURNING *`,
          [gymId]
        );
        return res.json({ config: newConfig[0] });
      }

      return res.json({ config: rows[0] });
    } catch (err) {
      console.error('[GET /admin/config] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar la configuración. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/admin/config
// ---------------------------------------------------------------------------
router.put(
  '/admin/config',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(configSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    
    const data = parsed.data;
    const gymId = req.user.gymId;

    const campos = [];
    const params = [];
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      params.push(v);
      campos.push(`${k} = $${params.length}`);
    }
    
    if (campos.length === 0) throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');

    params.push(gymId);

    try {
      // Primero verificar si existe la configuración
      const { rows: existing } = await pool.query(
        'SELECT id_config FROM config_gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );

      if (existing.length === 0) {
        // Crear configuración si no existe
        const camposInsert = Object.keys(data).join(', ');
        const valoresInsert = Object.values(data);
        const placeholders = valoresInsert.map((_, i) => `$${i + 2}`).join(', ');
        
        const { rows: newConfig } = await pool.query(
          `INSERT INTO config_gimnasio (id_gimnasio, ${camposInsert})
           VALUES ($1, ${placeholders})
           RETURNING *`,
          [gymId, ...valoresInsert]
        );
        return res.json({ message: 'Configuración creada.', config: newConfig[0] });
      }

      // Actualizar configuración existente
      const { rows } = await pool.query(
        `UPDATE config_gimnasio 
         SET ${campos.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_gimnasio = $${params.length}
         RETURNING *`,
        params
      );

      return res.json({ message: 'Configuración actualizada.', config: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[PUT /admin/config] Error:', err.message);
      throw new AppError(503, 'No pudimos actualizar la configuración. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// Hitos de gamificacion (RQF-11): los que se otorgan en el check-in.
//   GET    /api/admin/hitos
//   POST   /api/admin/hitos
//   PUT    /api/admin/hitos/:id
//   DELETE /api/admin/hitos/:id   (se desactiva; los ya otorgados se conservan)
// Viven aqui y no en un archivo nuevo para no tocar el montaje de index.js.
// ---------------------------------------------------------------------------
const hitoSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  tipo_hito: z.enum(['RACHA', 'TOTAL_ASISTENCIAS']),
  valor_objetivo: z.number().int().min(1).max(10000),
  mensaje: z.string().trim().min(1).max(300),
  activo: z.boolean().optional(),
});

const HITO_COLS = 'id_hito, nombre, tipo_hito, valor_objetivo, mensaje, activo';

router.get(
  '/admin/hitos',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${HITO_COLS} FROM hito_gamificacion
          WHERE id_gimnasio = $1 ORDER BY tipo_hito, valor_objetivo`,
        [req.user.gymId]
      );
      return res.json({ hitos: rows });
    } catch (err) {
      console.error('[GET /admin/hitos] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar los hitos. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

router.post(
  '/admin/hitos',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(hitoSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const h = parsed.data;
    try {
      const { rows } = await pool.query(
        `INSERT INTO hito_gamificacion (id_gimnasio, nombre, tipo_hito, valor_objetivo, mensaje, activo)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${HITO_COLS}`,
        [req.user.gymId, h.nombre, h.tipo_hito, h.valor_objetivo, h.mensaje, h.activo ?? true]
      );
      return res.status(201).json({ hito: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError(409, 'Ya existe un hito de ese tipo con ese valor.', 'HITO_DUPLICADO');
      }
      console.error('[POST /admin/hitos] Error:', err.message);
      throw new AppError(503, 'No pudimos crear el hito. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

router.put(
  '/admin/hitos/:id',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(hitoSchema.partial(), req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const campos = [];
    const params = [];
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      params.push(v);
      campos.push(`${k} = $${params.length}`);
    }
    if (campos.length === 0) throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');
    params.push(Number(req.params.id), req.user.gymId);
    try {
      const { rows } = await pool.query(
        `UPDATE hito_gamificacion SET ${campos.join(', ')}
          WHERE id_hito = $${params.length - 1} AND id_gimnasio = $${params.length}
          RETURNING ${HITO_COLS}`,
        params
      );
      if (rows.length === 0) throw new AppError(404, 'Hito no encontrado.', 'NOT_FOUND');
      return res.json({ hito: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.code === '23505') {
        throw new AppError(409, 'Ya existe un hito de ese tipo con ese valor.', 'HITO_DUPLICADO');
      }
      console.error('[PUT /admin/hitos] Error:', err.message);
      throw new AppError(503, 'No pudimos actualizar el hito. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

router.delete(
  '/admin/hitos/:id',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await pool.query(
        `UPDATE hito_gamificacion SET activo = FALSE
          WHERE id_hito = $1 AND id_gimnasio = $2 RETURNING ${HITO_COLS}`,
        [Number(req.params.id), req.user.gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Hito no encontrado.', 'NOT_FOUND');
      return res.json({ hito: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[DELETE /admin/hitos] Error:', err.message);
      throw new AppError(503, 'No pudimos desactivar el hito. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;
