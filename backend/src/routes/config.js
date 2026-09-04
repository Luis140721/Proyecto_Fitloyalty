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

module.exports = router;
