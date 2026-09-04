/**
 * routes/notificaciones.js
 *
 *   GET /api/admin/notificaciones  -> avisos accionables del gimnasio
 *
 * La campana del encabezado esta presente en todas las pantallas, asi que este
 * endpoint tiene que ser barato: tres consultas cortas y nada mas. Por eso no
 * se reutiliza /admin/dashboard, que hace una decena de consultas para pintar
 * las graficas.
 *
 * Los avisos no salen de la tabla `notificacion` (que hoy nadie escribe): se
 * derivan del estado real de los planes y de los ingresos. Asi lo que ve el
 * usuario siempre corresponde con lo que hay en la base.
 *
 * OJO con la tabla: los vencimientos se leen de `plan_cobro`, NO de
 * `membresia`. Las dos existen en el esquema, pero el alta de miembros solo
 * escribe en `plan_cobro`; `membresia` esta vacia y por eso el dashboard
 * muestra cero en "vencen pronto". Ver el pendiente abierto sobre unificarlas.
 */
const express = require('express');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');

const router = express.Router();

// Dias sin aparecer tras los cuales un miembro se considera en riesgo.
const DIAS_RIESGO = 15;
// Cuantos dias antes del vencimiento empezamos a avisar.
const DIAS_AVISO_VENCIMIENTO = 7;
// Tope de avisos por categoria: la campana es un resumen, no un listado.
const TOPE = 5;

/*
 * Un miembro puede tener varios planes a lo largo del tiempo; solo interesa el
 * ultimo. DISTINCT ON se queda con la primera fila de cada miembro segun el
 * ORDER BY, que es la forma barata de hacerlo en PostgreSQL.
 */
const ULTIMO_PLAN = `(
  SELECT DISTINCT ON (id_miembro) id_miembro, fecha_fin
    FROM plan_cobro
   WHERE activo = TRUE
   ORDER BY id_miembro, fecha_fin DESC
)`;

router.get(
  '/admin/notificaciones',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;

    try {
      const [vencidas, porVencer, enRiesgo] = await Promise.all([
        pool.query(
          `SELECT mb.id_miembro, mb.nombre, pc.fecha_fin,
                  (CURRENT_DATE - pc.fecha_fin)::int AS dias
             FROM ${ULTIMO_PLAN} pc
             INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
            WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
              AND pc.fecha_fin < CURRENT_DATE
            ORDER BY pc.fecha_fin DESC
            LIMIT $2`,
          [gymId, TOPE]
        ),
        pool.query(
          `SELECT mb.id_miembro, mb.nombre, pc.fecha_fin,
                  (pc.fecha_fin - CURRENT_DATE)::int AS dias
             FROM ${ULTIMO_PLAN} pc
             INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
            WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
              AND pc.fecha_fin >= CURRENT_DATE
              AND pc.fecha_fin <= CURRENT_DATE + ($2 || ' days')::interval
            ORDER BY pc.fecha_fin ASC
            LIMIT $3`,
          [gymId, DIAS_AVISO_VENCIMIENTO, TOPE]
        ),
        pool.query(
          `SELECT m.id_miembro, m.nombre,
                  (CURRENT_DATE - MAX(c.fecha_hora)::date)::int AS dias
             FROM miembro m
             LEFT JOIN checkin c ON c.id_miembro = m.id_miembro
            WHERE m.id_gimnasio = $1 AND m.activo = TRUE
            GROUP BY m.id_miembro, m.nombre
           HAVING MAX(c.fecha_hora) IS NULL
               OR MAX(c.fecha_hora) < NOW() - ($2 || ' days')::interval
            ORDER BY dias DESC NULLS FIRST
            LIMIT $3`,
          [gymId, DIAS_RIESGO, TOPE]
        ),
      ]);

      const avisos = [
        ...vencidas.rows.map((r) => ({
          id: `venc-${r.id_miembro}`,
          tipo: 'vencida',
          icono: 'event_busy',
          titulo: `La membresia de ${r.nombre} vencio`,
          nombreMiembro: r.nombre,
          detalle: r.dias === 0 ? 'Vence hoy' : `Hace ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`,
          idMiembro: r.id_miembro,
        })),
        ...porVencer.rows.map((r) => ({
          id: `porvencer-${r.id_miembro}`,
          tipo: 'por-vencer',
          icono: 'schedule',
          titulo: `${r.nombre} renueva pronto`,
          nombreMiembro: r.nombre,
          detalle: r.dias === 0 ? 'Vence hoy' : `En ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`,
          idMiembro: r.id_miembro,
        })),
        ...enRiesgo.rows.map((r) => ({
          id: `riesgo-${r.id_miembro}`,
          tipo: 'riesgo',
          icono: 'trending_down',
          titulo: `${r.nombre} lleva tiempo sin venir`,
          nombreMiembro: r.nombre,
          detalle: r.dias === null ? 'Nunca ha registrado ingreso' : `${r.dias} dias sin ingresar`,
          idMiembro: r.id_miembro,
        })),
      ];

      return res.json({ total: avisos.length, avisos });
    } catch (err) {
      console.error('[GET /admin/notificaciones] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar los avisos. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;
