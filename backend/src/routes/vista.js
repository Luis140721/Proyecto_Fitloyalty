/**
 * routes/vista.js -- Endpoints que consumen VISTAS SQL (criterio C6)
 *
 *   GET /api/vista/miembros-activos  -> Lista desde la vista vista_miembros_activos
 *
 * La vista ya esta definida en la base de datos y NO expone columnas de ID.
 *
 * Handler con asyncHandler.
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');

const router = express.Router();

router.use(authenticate);

router.get('/miembros-activos', asyncHandler(async (req, res) => {
  const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);
  const pageSize = Number.parseInt(req.query.pageSize, 10);
  const limit = Number.isNaN(pageSize) ? 10 : Math.min(Math.max(pageSize, 1), 100);
  const offset = page * limit;

  try {
    const totalQuery = await pool.query('SELECT COUNT(*)::int AS total FROM vista_miembros_activos');
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
       ORDER BY nombre ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
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