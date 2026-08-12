/**
 * routes/dashboard.js
 *
 * Metricas para la pantalla principal del admin.
 *
 *   GET /api/admin/dashboard  -> KPIs + listas cortas
 *
 * Handler con asyncHandler: cualquier rechazo va al errorHandler central.
 */
const express = require('express');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');

const router = express.Router();

router.get(
  '/admin/dashboard',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;

    try {
      const totalMiembros = await pool.query(
        'SELECT COUNT(*)::int AS total FROM miembro WHERE id_gimnasio = $1 AND activo = TRUE',
        [gymId]
      );
      const checkinsHoy = await pool.query(
        `SELECT COUNT(*)::int AS total FROM checkin
          WHERE id_gimnasio = $1 AND valido = TRUE AND fecha_hora::date = CURRENT_DATE`,
        [gymId]
      );
      const vencen7 = await pool.query(
        `SELECT COUNT(*)::int AS total FROM membresia m
          INNER JOIN miembro mb ON mb.id_miembro = m.id_miembro
          WHERE mb.id_gimnasio = $1 AND m.estado = 'ACTIVA'
            AND m.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
        [gymId]
      );
      const activos90 = await pool.query(
        `SELECT COUNT(DISTINCT m.id_miembro)::int AS activos FROM miembro m
          INNER JOIN checkin c ON c.id_miembro = m.id_miembro
          WHERE m.id_gimnasio = $1 AND m.activo = TRUE
            AND c.fecha_hora >= CURRENT_DATE - INTERVAL '90 days'`,
        [gymId]
      );
      const total = totalMiembros.rows[0].total;
      const retention = total > 0 ? Math.round((activos90.rows[0].activos / total) * 100) : 0;

      const enRiesgo = await pool.query(
        `SELECT COUNT(*)::int AS total FROM miembro m
          LEFT JOIN LATERAL (
            SELECT fecha_hora FROM checkin c WHERE c.id_miembro = m.id_miembro ORDER BY fecha_hora DESC LIMIT 1
          ) lastc ON TRUE
          WHERE m.id_gimnasio = $1 AND m.activo = TRUE
            AND (lastc.fecha_hora IS NULL OR lastc.fecha_hora < NOW() - INTERVAL '15 days')`,
        [gymId]
      );

      const checkinsSemana = await pool.query(
        `SELECT EXTRACT(DOW FROM fecha_hora)::int AS dow, COUNT(*)::int AS count
           FROM checkin
          WHERE id_gimnasio = $1 AND valido = TRUE
            AND fecha_hora >= date_trunc('week', CURRENT_DATE)
          GROUP BY dow ORDER BY dow`,
        [gymId]
      );
      const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const weekly = days.map((d, idx) => ({ day: d, count: 0 }));
      for (const r of checkinsSemana.rows) {
        const idx = parseInt(r.dow, 10);
        if (!Number.isNaN(idx)) weekly[idx].count = r.count;
      }

      const proximos = await pool.query(
        `SELECT mb.nombre AS miembro, mb.documento, p.nombre AS plan, me.fecha_fin,
                (me.fecha_fin - CURRENT_DATE)::int AS dias_restantes
           FROM membresia me
           INNER JOIN miembro mb ON mb.id_miembro = me.id_miembro
           INNER JOIN plan_membresia p ON p.id_plan = me.id_plan
          WHERE mb.id_gimnasio = $1 AND me.estado = 'ACTIVA'
            AND me.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
          ORDER BY me.fecha_fin ASC LIMIT 8`,
        [gymId]
      );

      const recientes = await pool.query(
        `SELECT c.id_checkin, c.fecha_hora, c.metodo, m.nombre, m.codigo_qr
           FROM checkin c
           INNER JOIN miembro m ON m.id_miembro = c.id_miembro
          WHERE c.id_gimnasio = $1
          ORDER BY c.fecha_hora DESC LIMIT 8`,
        [gymId]
      );

      return res.json({
        totalMiembros: total,
        checkinsHoy: checkinsHoy.rows[0].total,
        vencen7: vencen7.rows[0].total,
        retention,
        enRiesgo: enRiesgo.rows[0].total,
        weekly,
        proximos: proximos.rows,
        recientes: recientes.rows,
      });
    } catch (err) {
      console.error('[GET /admin/dashboard] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar las metricas del dashboard. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;