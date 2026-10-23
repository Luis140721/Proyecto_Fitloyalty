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
  // PostgreSQL devuelve NUMERIC como texto ("50000.00") y la pantalla lo reenvia
  // tal cual al guardar; z.coerce acepta tanto numeros como esos textos.
  plan_mensual_valor: z.coerce.number().min(0).optional(),
  plan_trimestral_valor: z.coerce.number().min(0).optional(),
  plan_semestral_valor: z.coerce.number().min(0).optional(),
  plan_anual_valor: z.coerce.number().min(0).optional(),
  plan_clases_suelta_valor: z.coerce.number().min(0).optional(),
  plan_ilimitado_valor: z.coerce.number().min(0).optional(),
  recordatorio_cobro_activo: z.boolean().optional(),
  dias_recordatorio_default: z.number().min(1).max(30).optional(),
  dias_prueba: z.number().min(1).max(90).optional(),
  // Vive en la tabla gimnasio (migracion 006). 0 desactiva el aviso por WhatsApp.
  dias_aviso_vencimiento: z.number().int().min(0).max(30).optional(),
  // Dias sin venir para la alerta amarilla y la roja (RQF-08). Viven en
  // configuracion_gimnasio; la roja siempre es mayor que la amarilla.
  umbral_alerta_amarilla: z.number().int().min(1).max(365).optional(),
  umbral_alerta_roja: z.number().int().min(2).max(365).optional(),
});

const UMBRALES_POR_DEFECTO = { umbral_alerta_amarilla: 7, umbral_alerta_roja: 15 };

// Agrega a la configuracion los dias de aviso de vencimiento del gimnasio y los
// umbrales de las alertas de abandono.
async function conDiasAviso(gymId, cfg) {
  const [{ rows }, { rows: umbrales }] = await Promise.all([
    pool.query('SELECT dias_aviso_vencimiento FROM gimnasio WHERE id_gimnasio = $1', [gymId]),
    pool.query(
      'SELECT umbral_alerta_amarilla, umbral_alerta_roja FROM configuracion_gimnasio WHERE id_gimnasio = $1',
      [gymId]
    ),
  ]);
  return {
    ...cfg,
    dias_aviso_vencimiento: rows[0] ? rows[0].dias_aviso_vencimiento : 3,
    ...UMBRALES_POR_DEFECTO,
    ...(umbrales[0] || {}),
  };
}

// Guarda los umbrales de abandono; devuelve un mensaje si no son coherentes.
async function guardarUmbrales(gymId, userId, { umbral_alerta_amarilla: amarilla, umbral_alerta_roja: roja }) {
  const { rows } = await pool.query(
    'SELECT umbral_alerta_amarilla, umbral_alerta_roja FROM configuracion_gimnasio WHERE id_gimnasio = $1',
    [gymId]
  );
  const actual = { ...UMBRALES_POR_DEFECTO, ...(rows[0] || {}) };
  const nueva = amarilla ?? actual.umbral_alerta_amarilla;
  const nuevaRoja = roja ?? actual.umbral_alerta_roja;
  if (nuevaRoja <= nueva) {
    throw new AppError(400, 'La alerta roja debe ser mayor que la amarilla.', 'VALIDATION_ERROR');
  }
  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO configuracion_gimnasio (id_gimnasio, umbral_alerta_amarilla, umbral_alerta_roja, actualizado_por)
       VALUES ($1, $2, $3, $4)`,
      [gymId, nueva, nuevaRoja, userId]
    );
  } else {
    await pool.query(
      `UPDATE configuracion_gimnasio
          SET umbral_alerta_amarilla = $2, umbral_alerta_roja = $3,
              actualizado_por = $4, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id_gimnasio = $1`,
      [gymId, nueva, nuevaRoja, userId]
    );
  }
}

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
        return res.json({ config: await conDiasAviso(gymId, newConfig[0]) });
      }

      return res.json({ config: await conDiasAviso(gymId, rows[0]) });
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
    
    const {
      dias_aviso_vencimiento: diasAviso,
      umbral_alerta_amarilla: umbralAmarilla,
      umbral_alerta_roja: umbralRoja,
      ...data
    } = parsed.data;
    const hayUmbrales = umbralAmarilla !== undefined || umbralRoja !== undefined;
    const gymId = req.user.gymId;

    const campos = [];
    const params = [];
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      params.push(v);
      campos.push(`${k} = $${params.length}`);
    }
    
    if (campos.length === 0 && diasAviso === undefined && !hayUmbrales) {
      throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');
    }

    params.push(gymId);

    try {
      // Primero lo que puede rechazar la peticion, para no guardar a medias.
      if (hayUmbrales) {
        await guardarUmbrales(gymId, req.user.id, {
          umbral_alerta_amarilla: umbralAmarilla,
          umbral_alerta_roja: umbralRoja,
        });
      }

      if (diasAviso !== undefined) {
        await pool.query(
          'UPDATE gimnasio SET dias_aviso_vencimiento = $1 WHERE id_gimnasio = $2',
          [diasAviso, gymId]
        );
      }

      if (campos.length === 0) {
        // Solo cambiaron datos de otras tablas: devolvemos la configuracion vigente.
        const { rows: actual } = await pool.query(
          'SELECT * FROM config_gimnasio WHERE id_gimnasio = $1',
          [gymId]
        );
        return res.json({ message: 'Configuración actualizada.', config: await conDiasAviso(gymId, actual[0] || {}) });
      }

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
        return res.json({ message: 'Configuración creada.', config: await conDiasAviso(gymId, newConfig[0]) });
      }

      // Actualizar configuración existente
      const { rows } = await pool.query(
        `UPDATE config_gimnasio 
         SET ${campos.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_gimnasio = $${params.length}
         RETURNING *`,
        params
      );

      return res.json({ message: 'Configuración actualizada.', config: await conDiasAviso(gymId, rows[0]) });
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
