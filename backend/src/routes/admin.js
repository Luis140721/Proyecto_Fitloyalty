/**
 * routes/admin.js -- Endpoints de administración de FitLoyalty
 *
 *   GET /api/admin/metrics             -> Métricas principales del dashboard admin
 *   GET /api/admin/reporte-asistencia  -> Llama al SP sp_reporte_asistencia
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren estar logueado y tener rol de Administrador
router.use(authenticate);
router.use(authorize('admin'));

// --------------------------------------------------------------------------
// GET /api/admin/metrics
// --------------------------------------------------------------------------
/**
 * Recupera métricas clave para el gimnasio del administrador:
 * 1. Total miembros activos
 * 2. Asistencias de hoy (checkins válidos)
 * 3. Membresías por vencer en los próximos 7 días
 */
router.get('/metrics', async (req, res) => {
  const gymId = req.user.gymId;

  try {
    // 1. Total miembros activos
    const miembrosQuery = await pool.query(
      'SELECT COUNT(*)::int AS total FROM miembro WHERE id_gimnasio = $1 AND activo = TRUE',
      [gymId]
    );

    // 2. Asistencias (checkins) del día de hoy
    const checkinsQuery = await pool.query(
      `SELECT COUNT(*)::int AS total 
       FROM checkin 
       WHERE id_gimnasio = $1 AND valido = TRUE AND fecha_hora::date = CURRENT_DATE`,
      [gymId]
    );

    // 3. Membresías por vencer en los próximos 7 días (activas y que finalizan pronto)
    const vencimientosQuery = await pool.query(
      `SELECT COUNT(*)::int AS total 
       FROM membresia m
       INNER JOIN miembro mb ON mb.id_miembro = m.id_miembro
       WHERE mb.id_gimnasio = $1 
         AND m.estado = 'ACTIVA' 
         AND m.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
      [gymId]
    );

    res.json({
      totalMiembros: miembrosQuery.rows[0].total,
      asistenciasHoy: checkinsQuery.rows[0].total,
      membresiasPorVencer: vencimientosQuery.rows[0].total,
    });

  } catch (err) {
    console.error('[GET /admin/metrics] Error:', err.message);
    res.status(500).json({ error: 'Error al obtener las métricas de administración.' });
  }
});

// --------------------------------------------------------------------------
// GET /api/admin/reporte-asistencia
// --------------------------------------------------------------------------
/**
 * Llama al procedimiento almacenado sp_reporte_asistencia.
 * Recibe query params: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/reporte-asistencia', async (req, res) => {
  const gymId = req.user.gymId;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Las fechas de inicio y fin son obligatorias.' });
  }

  try {
    // El SP devuelve: miembro (varchar), documento (varchar), fecha (date), hora (time), metodo (varchar)
    const resultado = await pool.query(
      'SELECT * FROM sp_reporte_asistencia($1, $2, $3)',
      [gymId, startDate, endDate]
    );

    res.json({
      reporte: resultado.rows,
      total: resultado.rowCount,
    });

  } catch (err) {
    console.error('[GET /admin/reporte-asistencia] Error:', err.message);
    res.status(500).json({ error: 'Error al ejecutar el reporte de asistencia por SP.' });
  }
});

module.exports = router;
