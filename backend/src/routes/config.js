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
  // Soportar ambos nombres de columnas (nuevos y antiguos)
  plan_mensual_valor: z.number().min(0).optional(),
  plan_trimestral_valor: z.number().min(0).optional(),
  plan_semestral_valor: z.number().min(0).optional(),
  plan_anual_valor: z.number().min(0).optional(),
  plan_clases_suelta_valor: z.number().min(0).optional(),
  plan_ilimitado_valor: z.number().min(0).optional(),
  recordatorio_cobro_activo: z.boolean().optional(),
  dias_recordatorio_default: z.number().min(1).max(30).optional(),
  dias_prueba: z.number().min(1).max(90).optional(),
  // Campos antiguos para compatibilidad
  umbral_alerta_amarilla: z.number().min(0).optional(),
  umbral_alerta_roja: z.number().min(0).optional(),
  dias_aviso_vencimiento: z.number().min(1).max(30).optional(),
  horario_apertura: z.string().optional(),
  horario_cierre: z.string().optional(),
  canal_principal: z.enum(['EMAIL', 'WHATSAPP']).optional(),
  tiempo_inactividad_sesion_min: z.number().min(1).optional(),
}).passthrough(); // Permitir campos adicionales sin error

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
      // Usar siempre la tabla nueva (config_gimnasio)
      let { rows } = await pool.query(
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

    try {
      // Verificar si existe configuración
      const { rows: existing } = await pool.query(
        'SELECT id_config FROM config_gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );

      if (existing.length === 0) {
        // Crear nueva configuración
        const columns = Object.keys(data).filter(k => 
          data[k] !== undefined && 
          k !== 'id_gimnasio' && 
          k !== 'id_config' &&
          k !== 'fecha_actualizacion'
        );
        const values = columns.map(k => data[k]);
        
        if (columns.length === 0) {
          // Si no hay datos, crear configuración vacía
          const { rows: newConfig } = await pool.query(
            'INSERT INTO config_gimnasio (id_gimnasio) VALUES ($1) RETURNING *',
            [gymId]
          );
          return res.json({ message: 'Configuración creada.', config: newConfig[0] });
        }

        const placeholders = values.map((_, i) => `$${i + 2}`).join(', ');
        const { rows: newConfig } = await pool.query(
          `INSERT INTO config_gimnasio (id_gimnasio, ${columns.join(', ')})
           VALUES ($1, ${placeholders})
           RETURNING *`,
          [gymId, ...values]
        );
        return res.json({ message: 'Configuración creada.', config: newConfig[0] });
      }

      // Actualizar configuración existente - construir UPDATE dinámico
      const updateColumns = Object.keys(data).filter(k => 
        data[k] !== undefined && 
        k !== 'id_gimnasio' && 
        k !== 'id_config' &&
        k !== 'fecha_actualizacion'
      );
      
      if (updateColumns.length === 0) {
        throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');
      }

      const updateValues = updateColumns.map(k => data[k]);
      const setClause = updateColumns.map((col, i) => `${col} = $${i + 1}`).join(', ');
      
      const { rows } = await pool.query(
        `UPDATE config_gimnasio 
         SET ${setClause}, fecha_actualizacion = CURRENT_TIMESTAMP 
         WHERE id_gimnasio = $${updateValues.length + 1}
         RETURNING *`,
        [...updateValues, gymId]
      );

      return res.json({ message: 'Configuración actualizada.', config: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[PUT /admin/config] Error:', err.message);
      console.error('[PUT /admin/config] Detalle:', err.detail);
      // Mensaje amigable para el usuario, no técnico
      throw new AppError(500, 'Hubo un error al guardar la configuración. Por favor intenta nuevamente.', 'DB_ERROR');
    }
  })
);

module.exports = router;
