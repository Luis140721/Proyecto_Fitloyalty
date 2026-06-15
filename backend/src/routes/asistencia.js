/**
 * routes/asistencia.js -- Historial de asistencia (check-ins) para el dashboard
 *
 *   GET /api/asistencia          -> Lista de check-ins del gimnasio (con resumen)
 *
 * SEGURIDAD MULTI-GIMNASIO:
 * Todo se filtra por el id_gimnasio del token (req.user.gymId), asi un usuario
 * solo ve la asistencia de SU gimnasio, nunca la de otro.
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren estar logueado.
router.use(authenticate);

// --------------------------------------------------------------------------
// GET /api/asistencia
// --------------------------------------------------------------------------
/**
 * Devuelve los check-ins (asistencias) del gimnasio del usuario logueado,
 * mas un pequeno resumen (total y cuantas fueron hoy).
 *
 * Cada fila trae el nombre y documento del miembro, la fecha/hora y el metodo
 * de ingreso (QR, codigo de barras o manual).
 */
router.get('/', async (req, res) => {
  const gymId = req.user.gymId;

  try {
    // 1. Historial de asistencia (ultimas 50, mas recientes primero)
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

    // 2. Resumen: total de asistencias y cuantas fueron hoy
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
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
