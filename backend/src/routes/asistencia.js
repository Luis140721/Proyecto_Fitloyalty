/**
 * routes/asistencia.js -- Historial de asistencia (check-ins) para el dashboard
 *
 *   GET /api/asistencia          -> Lista de check-ins del gimnasio (con resumen)
 *
 * SEGURIDAD MULTI-GIMNASIO:
 * Todo se filtra por el id_gimnasio del token (req.user.gymId), asi un usuario
 * solo ve la asistencia de SU gimnasio, nunca la de otro.
 *
 * Handler con asyncHandler para errores consistentes.
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');

const router = express.Router();

// Todas las rutas requieren estar logueado.
router.use(authenticate);

// --------------------------------------------------------------------------
// GET /api/asistencia
// --------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const gymId = req.user.gymId;
  try {
    const historial = await pool.query(
      `SELECT m.nombre      AS miembro,
              m.documento   AS documento,
              c.fecha_hora  AS fecha_hora,
              c.metodo      AS metodo
       FROM checkin c
       INNER JOIN miembro m ON m.id_miembro = c.id_miembro
       WHERE c.id_gimnasio = $1 AND c.valido = TRUE
       ORDER BY c.fecha_hora DESC
       LIMIT 50`,
      [gymId]
    );

    const resumen = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE c.fecha_hora::date = CURRENT_DATE)::int AS hoy
       FROM checkin c
       WHERE c.id_gimnasio = $1 AND c.valido = TRUE`,
      [gymId]
    );

    res.json({
      asistencias: historial.rows,
      total: resumen.rows[0].total,
      hoy:   resumen.rows[0].hoy,
    });
  } catch (err) {
    console.error('[GET /asistencia] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar la asistencia. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

module.exports = router;