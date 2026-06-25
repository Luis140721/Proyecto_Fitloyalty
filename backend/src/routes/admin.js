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
    const totalMiembros = miembrosQuery.rows[0].total;

    // 2. Asistencias (checkins) del día de hoy
    const checkinsQuery = await pool.query(
      `SELECT COUNT(*)::int AS total 
       FROM checkin 
       WHERE id_gimnasio = $1 AND valido = TRUE AND fecha_hora::date = CURRENT_DATE`,
      [gymId]
    );

    // 3. Membresías por vencer en los próximos 7 días (activas)
    const vencimientosQuery = await pool.query(
      `SELECT COUNT(*)::int AS total 
       FROM membresia m
       INNER JOIN miembro mb ON mb.id_miembro = m.id_miembro
       WHERE mb.id_gimnasio = $1 
         AND m.estado = 'ACTIVA' 
         AND m.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
      [gymId]
    );

    // 4. Retention (miembros con al menos 1 checkin en ultimos 90 dias)
    const retenQuery = await pool.query(
      `SELECT COUNT(DISTINCT m.id_miembro)::int AS activos_90
       FROM miembro m
       INNER JOIN checkin c ON c.id_miembro = m.id_miembro
       WHERE m.id_gimnasio = $1 AND m.activo = TRUE AND c.fecha_hora >= CURRENT_DATE - INTERVAL '90 days'`,
      [gymId]
    );
    const activos90 = retenQuery.rows[0].activos_90 || 0;
    const retentionRate = totalMiembros > 0 ? Math.round((activos90 / totalMiembros) * 100) : 0;

    // 5. En riesgo de abandono: miembros sin checkin en los ultimos 15 dias
    const enRiesgoQuery = await pool.query(
      `SELECT COUNT(*)::int AS total FROM miembro m
       LEFT JOIN LATERAL (
         SELECT fecha_hora FROM checkin c WHERE c.id_miembro = m.id_miembro ORDER BY fecha_hora DESC LIMIT 1
       ) lastc ON TRUE
       WHERE m.id_gimnasio = $1 AND m.activo = TRUE
         AND (lastc.fecha_hora IS NULL OR lastc.fecha_hora < NOW() - INTERVAL '15 days')`,
      [gymId]
    );

    // 6. Flow por hora (hoy) — devolvemos mapa hour->count
    const flowQuery = await pool.query(
      `SELECT EXTRACT(HOUR FROM fecha_hora)::int AS hour, COUNT(*)::int AS count
       FROM checkin
       WHERE id_gimnasio = $1 AND fecha_hora::date = CURRENT_DATE AND valido = TRUE
       GROUP BY hour ORDER BY hour`,
      [gymId]
    );

    // 7. Asistencia semanal (desde inicio de la semana)
    const weeklyQuery = await pool.query(
      `SELECT EXTRACT(DOW FROM fecha_hora)::int AS dow, COUNT(*)::int AS count
       FROM checkin
       WHERE id_gimnasio = $1 AND fecha_hora >= date_trunc('week', CURRENT_DATE) AND valido = TRUE
       GROUP BY dow ORDER BY dow`,
      [gymId]
    );

    // 8. Clientes a recuperar (alertas de abandono pendientes)
    const recuperarQuery = await pool.query(
      `SELECT a.id_alerta, m.nombre, m.documento, a.dias_inactivo, a.nivel, a.fecha_alerta
       FROM alerta_abandono a
       INNER JOIN miembro m ON m.id_miembro = a.id_miembro
       WHERE a.id_gimnasio = $1 AND a.estado = 'PENDIENTE'
       ORDER BY a.fecha_alerta DESC LIMIT 6`,
      [gymId]
    );

    // 9. Membresias por vencer (detallado, proximos 30 dias)
    const proximasQuery = await pool.query(
      `SELECT mb.nombre AS miembro, mb.documento, p.nombre AS plan, me.fecha_fin,
              (me.fecha_fin - CURRENT_DATE)::int AS dias_restantes
       FROM membresia me
       INNER JOIN miembro mb ON mb.id_miembro = me.id_miembro
       INNER JOIN plan_membresia p ON p.id_plan = me.id_plan
       WHERE mb.id_gimnasio = $1 AND me.estado = 'ACTIVA'
         AND me.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY me.fecha_fin ASC LIMIT 10`,
      [gymId]
    );

    // Transformar flowQuery en arreglo de 24 horas
    const flowByHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    for (const r of flowQuery.rows) {
      const h = parseInt(r.hour, 10);
      if (!Number.isNaN(h) && h >= 0 && h < 24) flowByHour[h].count = r.count;
    }

    // Transformar weeklyQuery en objeto con claves Lun..Dom (0=Dom in Postgres)
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const weekly = days.map((d, idx) => ({ day: d, count: 0 }));
    for (const r of weeklyQuery.rows) {
      const idx = parseInt(r.dow, 10);
      if (!Number.isNaN(idx)) weekly[idx].count = r.count;
    }

    res.json({
      totalMiembros,
      asistenciasHoy: checkinsQuery.rows[0].total,
      membresiasPorVencer: vencimientosQuery.rows[0].total,
      retentionRate,
      enRiesgo: enRiesgoQuery.rows[0].total,
      flowByHour,
      weeklyAttendance: weekly,
      clientesRecuperar: recuperarQuery.rows,
      proximasVencimientos: proximasQuery.rows,
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

  const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);
  const pageSize = Number.parseInt(req.query.pageSize, 10);
  const limit = Number.isNaN(pageSize) ? 10 : Math.min(Math.max(pageSize, 1), 100);
  const offset = page * limit;

  try {
    const totalQuery = await pool.query(
      'SELECT COUNT(*)::int AS total FROM sp_reporte_asistencia($1, $2, $3)',
      [gymId, startDate, endDate]
    );

    const resultado = await pool.query(
      `SELECT * FROM sp_reporte_asistencia($1, $2, $3)
       ORDER BY fecha DESC, hora DESC
       LIMIT $4 OFFSET $5`,
      [gymId, startDate, endDate, limit, offset]
    );

    res.json({
      reporte: resultado.rows,
      total: totalQuery.rows[0].total,
      page,
      pageSize: limit,
    });

  } catch (err) {
    console.error('[GET /admin/reporte-asistencia] Error:', err.message);
    res.status(500).json({ error: 'Error al ejecutar el reporte de asistencia por SP.' });
  }
});

module.exports = router;
