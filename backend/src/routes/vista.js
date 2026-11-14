/**
 * routes/vista.js -- Endpoints que consumen VISTAS SQL (criterio C6)
 *
 *   GET /api/vista/miembros-activos  -> Lista desde la vista vista_miembros_activos
 *
 * SEGURIDAD MULTI-GIMNASIO: la vista expone id_gimnasio (migracion 011) y aqui
 * se filtra siempre por el gimnasio del token; ademas solo el personal puede
 * consultarla (trae telefono y correo de los miembros).
 *
 * Handler con asyncHandler.
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');

const router = express.Router();

router.use(authenticate, authorize('admin', 'receptionist'));

router.get('/miembros-activos', asyncHandler(async (req, res) => {
  const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);
  const pageSize = Number.parseInt(req.query.pageSize, 10);
  const limit = Number.isNaN(pageSize) ? 10 : Math.min(Math.max(pageSize, 1), 100);
  const offset = page * limit;
  const gymId = req.user.gymId;
  if (!gymId) throw new AppError(403, 'Usuario sin gimnasio asignado', 'NO_GYM');

  try {
    const totalQuery = await pool.query(
      'SELECT COUNT(*)::int AS total FROM vista_miembros_activos WHERE id_gimnasio = $1',
      [gymId]
    );
    const resultado = await pool.query(
      `SELECT nombre,
              documento,
              telefono,
              email,
              codigo_qr,
              estado_membresia,
              fecha_inicio,
              fecha_fin,
              plan
       FROM vista_miembros_activos
       WHERE id_gimnasio = $1
       ORDER BY nombre ASC
       LIMIT $2 OFFSET $3`,
      [gymId, limit, offset]
    );

    res.json({
      miembros: resultado.rows,
      total: totalQuery.rows[0].total,
      page,
      pageSize: limit,
    });
  } catch (err) {
    console.error('[GET /vista/miembros-activos] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar los miembros activos. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

module.exports = router;