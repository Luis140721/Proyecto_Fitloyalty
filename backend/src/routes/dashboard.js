/**
 * routes/dashboard.js
 *
 * Metricas para la pantalla principal del admin.
 *
 *   GET /api/admin/dashboard            -> KPIs + listas cortas + enRiesgoList real
 *   GET /api/admin/dashboard/horas-pico -> entradas por hora del dia (hoy, 7 o 30 dias)
 *   GET /api/admin/dashboard/export     -> descarga CSV de miembros activos + membresia
 *
 * Multi-tenant: todas las queries filtran por id_gimnasio (req.user.gymId).
 * Handlers async con asyncHandler: cualquier rechazo va al errorHandler central.
 */
const express = require('express');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { ULTIMO_PLAN } = require('../lib/planes');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escapa un valor siguiendo RFC 4180 para CSV:
 *   - Si contiene ", , o salto de linea -> la envuelve en " y duplica las ".
 *   - Si no, la devuelve tal cual.
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Convierte un array de objetos a CSV con headers en el orden dado. */
function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => csvEscape(row[c.key])).join(','))
    .join('\r\n');
  // Linea final con \r\n para que Excel no se queje.
  return `${header}\r\n${body}\r\n`;
}

/*
 * Cortes de dia en hora de Colombia.
 *
 * `checkin.fecha_hora` es un TIMESTAMP sin zona escrito con la hora de la
 * sesion de la base (UTC en Neon y en Docker), y CURRENT_DATE tambien es la
 * fecha de la sesion: en UTC, "hoy" empezaria a las 19:00 de Colombia del dia
 * anterior. Estas expresiones calculan el corte con el dia de Colombia y lo
 * devuelven en la zona de la sesion, para compararlo directo con `fecha_hora`
 * (asi se sigue usando su indice). Si la base ya esta en hora de Colombia, no
 * cambian nada.
 *
 * Ojo: valen para TIMESTAMP sin zona. Si `fecha_hora` pasa a TIMESTAMPTZ, hay
 * que quitar el paso por current_setting('TimeZone').
 */
const ZONA_GIMNASIO = 'America/Bogota';

/** Hora de Colombia de una columna TIMESTAMP sin zona. */
function enHoraLocal(columna) {
  return `((${columna}) AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE '${ZONA_GIMNASIO}'`;
}

/** Inicio del dia ('day') o de la semana ('week', desde el lunes) de Colombia, menos N dias. */
function inicioLocal(unidad, diasAtras = 0) {
  return `((date_trunc('${unidad}', now() AT TIME ZONE '${ZONA_GIMNASIO}') - INTERVAL '${diasAtras} days')`
    + ` AT TIME ZONE '${ZONA_GIMNASIO}') AT TIME ZONE current_setting('TimeZone')`;
}

/*
 * Membresias congeladas (RQF-04): no cuentan como "por vencer", porque su
 * vencimiento se corre al descongelarlas. Se mira el mismo plan que elige
 * ULTIMO_PLAN (mismo orden), que todavia no trae `congelado_desde`; cuando lo
 * traiga, esto se reduce a `pc.congelado_desde IS NULL`.
 */
const SIN_CONGELAR = `NOT EXISTS (
              SELECT 1 FROM (
                SELECT congelado_desde FROM plan_cobro
                 WHERE id_miembro = pc.id_miembro AND activo = TRUE
                 ORDER BY fecha_fin DESC NULLS LAST, id_plan_cobro DESC
                 LIMIT 1
              ) ultimo
             WHERE ultimo.congelado_desde IS NOT NULL)`;

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard  (KPIs)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/admin/diagnostics  -> info de columnas reales y replay del query
// ---------------------------------------------------------------------------
router.get(
  '/admin/diagnostics',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    try {
      const { rows: gymCols } = await pool.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'gimnasio'
        ORDER BY ordinal_position
      `);
      const { rows: rolTabla } = await pool.query(`
        SELECT to_regclass('public.rol') AS rol_reg, to_regclass('public.roles') AS roles_reg
      `);
      const { rows: usuarioCols } = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'usuario' ORDER BY ordinal_position
      `);

      let replay = { ok: false };
      try {
        const { rows } = await pool.query(
          `SELECT id_usuario, nombre, email, id_rol, activo, fecha_creacion, ultimo_acceso,
                  CASE usuario.id_rol
                    WHEN 1 THEN 'ADMINISTRADOR'
                    WHEN 2 THEN 'RECEPCIONISTA'
                    WHEN 3 THEN 'ENTRENADOR'
                    ELSE 'ROL_' || usuario.id_rol::text
                  END AS rol
             FROM usuario
            WHERE id_gimnasio = $1
            ORDER BY fecha_creacion DESC`,
          [req.user.gymId]
        );
        replay = { ok: true, rowCount: rows.length, sample: rows.slice(0, 2) };
      } catch (err) {
        replay = { ok: false, errCode: err.code, errMessage: err.message };
      }

      return res.json({
        checks: {
          gimnasioColumns: gymCols,
          gimnasioColumnNames: gymCols.map((c) => c.column_name),
          rolReg: rolTabla[0]?.rol_reg || null,
          rolesReg: rolTabla[0]?.roles_reg || null,
          usuarioColumns: usuarioCols.map((c) => c.column_name),
          replay,
        },
      });
    } catch (err) {
      console.error('[GET /admin/diagnostics] Error:', err.message);
      throw new AppError(500, 'Error al generar diagnostics.', 'DIAG_FAILED');
    }
  })
);

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
      // Mismo corte que "Hoy" en las horas pico: el dia de Colombia.
      const checkinsHoy = await pool.query(
        `SELECT COUNT(*)::int AS total FROM checkin
          WHERE id_gimnasio = $1 AND valido = TRUE AND fecha_hora >= ${inicioLocal('day')}`,
        [gymId]
      );
      /*
       * Los planes de los miembros viven en `plan_cobro`, que es donde escribe
       * el alta. Las tablas `membresia` y `pago` del diseno original quedaron
       * sin conectar, y por leer de ellas estas tarjetas mostraban cero
       * siempre, incluso con el gimnasio lleno.
       */
      const vencen7 = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM ${ULTIMO_PLAN} pc
           INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
          WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
            AND pc.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
            AND ${SIN_CONGELAR}`,
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

      // enRiesgoList: top 4 miembros sin ir 15+ dias (o nunca), con monto del ultimo plan.
      // Si no tienen membresia, se usa 89900 como plan default (basico mensual).
      const enRiesgoList = await pool.query(
        `SELECT m.nombre::text AS nombre,
                (CURRENT_DATE - MAX(c.fecha_hora)::date)::int AS dias_sin,
                COALESCE(p.valor_total, 89900)::int AS monto
           FROM miembro m
           LEFT JOIN checkin c ON c.id_miembro = m.id_miembro
           LEFT JOIN LATERAL (
             SELECT pc.valor_total
               FROM plan_cobro pc
              WHERE pc.id_miembro = m.id_miembro AND pc.activo = TRUE
              ORDER BY pc.fecha_fin DESC NULLS LAST, pc.id_plan_cobro DESC
              LIMIT 1
           ) p ON TRUE
          WHERE m.id_gimnasio = $1 AND m.activo = TRUE
          GROUP BY m.id_miembro, m.nombre, p.valor_total
         HAVING MAX(c.fecha_hora) IS NULL OR MAX(c.fecha_hora) < NOW() - INTERVAL '15 days'
          ORDER BY dias_sin DESC NULLS FIRST
          LIMIT 4`,
        [gymId]
      );

      const checkinsSemana = await pool.query(
        `SELECT EXTRACT(DOW FROM ${enHoraLocal('fecha_hora')})::int AS dow, COUNT(*)::int AS count
           FROM checkin
          WHERE id_gimnasio = $1 AND valido = TRUE
            AND fecha_hora >= ${inicioLocal('week')}
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
        `SELECT mb.id_miembro, mb.nombre AS miembro, mb.documento,
                INITCAP(LOWER(pc.tipo_plan)) AS plan, pc.fecha_fin,
                (pc.fecha_fin - CURRENT_DATE)::int AS dias_restantes
           FROM ${ULTIMO_PLAN} pc
           INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
          WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
            AND pc.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
            AND ${SIN_CONGELAR}
          ORDER BY pc.fecha_fin ASC LIMIT 8`,
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

      // Cobros del mes (pagos PAGADOS dentro del mes actual).
      // Lo efectivamente recaudado este mes, segun lo abonado en cada plan.
      const ingresosMes = await pool.query(
        `SELECT COALESCE(SUM(pc.valor_pagado), 0)::int AS total
           FROM plan_cobro pc
           INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
          WHERE mb.id_gimnasio = $1 AND pc.activo = TRUE
            AND pc.fecha_creacion >= date_trunc('month', CURRENT_DATE)
            AND pc.fecha_creacion <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
        [gymId]
      );

      // Cobros pendientes (cualquier mes).
      // Planes con saldo: los que quedaron pendientes o pagados a medias.
      const cobrosPendientes = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM ${ULTIMO_PLAN} pc
           INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
          WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
            AND pc.estado_pago IN ('PENDIENTE', 'PARCIAL')`,
        [gymId]
      );

      // Plan mas vendido entre membresias activas.
      const planTop = await pool.query(
        `SELECT INITCAP(LOWER(pc.tipo_plan))::text AS plan, COUNT(*)::int AS cnt
           FROM plan_cobro pc
           INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
          WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE AND pc.activo = TRUE
          GROUP BY pc.tipo_plan
          ORDER BY cnt DESC, plan ASC
          LIMIT 1`,
        [gymId]
      );

      // QRs activos = miembros activos (cada miembro tiene un QR unico).
      const qrsActivos = total;

      return res.json({
        totalMiembros: total,
        checkinsHoy: checkinsHoy.rows[0].total,
        vencen7: vencen7.rows[0].total,
        retention,
        enRiesgo: enRiesgo.rows[0].total,
        enRiesgoList: enRiesgoList.rows,
        weekly,
        proximos: proximos.rows,
        recientes: recientes.rows,
        ingresosMes: ingresosMes.rows[0].total,
        cobrosPendientes: cobrosPendientes.rows[0].total,
        planTop: planTop.rows[0] ? planTop.rows[0].plan : 'Mensual',
        planTopCount: planTop.rows[0] ? planTop.rows[0].cnt : 0,
        qrsActivos,
      });
    } catch (err) {
      console.error('[GET /admin/dashboard] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar las metricas del dashboard. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/horas-pico?periodo=hoy|semana|mes
// ---------------------------------------------------------------------------
// Entradas por hora del dia (0-23) en la hora de Colombia. La hora y el inicio
// de cada periodo se calculan con el dia de Colombia (ver `enHoraLocal` e
// `inicioLocal` arriba).
const PERIODOS_HORAS = {
  hoy: { desde: inicioLocal('day', 0), etiqueta: 'Hoy' },
  semana: { desde: inicioLocal('day', 6), etiqueta: 'Últimos 7 días' },
  mes: { desde: inicioLocal('day', 29), etiqueta: 'Últimos 30 días' },
};

router.get(
  '/admin/dashboard/horas-pico',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const periodo = PERIODOS_HORAS[req.query.periodo] ? req.query.periodo : 'mes';
    const { desde, etiqueta } = PERIODOS_HORAS[periodo];

    try {
      // `desde` sale de la lista fija de arriba, nunca del request.
      const { rows } = await pool.query(
        `SELECT EXTRACT(HOUR FROM ${enHoraLocal('c.fecha_hora')})::int AS hora,
                COUNT(*)::int AS total
           FROM checkin c
          WHERE c.id_gimnasio = $1 AND c.valido = TRUE
            AND c.fecha_hora >= ${desde}
          GROUP BY hora
          ORDER BY hora`,
        [gymId]
      );

      const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, total: 0 }));
      for (const r of rows) horas[r.hora].total = r.total;
      const total = horas.reduce((acc, h) => acc + h.total, 0);
      // Si hay empate, gana la hora mas temprana.
      const pico = total > 0 ? horas.reduce((max, h) => (h.total > max.total ? h : max)) : null;

      return res.json({ periodo, etiqueta, zona: ZONA_GIMNASIO, total, horas, horaPico: pico });
    } catch (err) {
      console.error('[GET /admin/dashboard/horas-pico] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar las horas pico. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/export  -> CSV descargable
// ---------------------------------------------------------------------------
router.get(
  '/admin/dashboard/export',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;

    try {
      const { rows } = await pool.query(
        `SELECT mb.nombre::text        AS nombre,
                mb.documento::text     AS documento,
                COALESCE(mb.telefono::text, '')  AS telefono,
                COALESCE(mb.email::text, '')     AS email,
                INITCAP(LOWER(pc.tipo_plan))::text AS plan,
                pc.fecha_fin::text     AS fecha_fin,
                (pc.fecha_fin - CURRENT_DATE)::int AS dias_restantes
           FROM miembro mb
           INNER JOIN ${ULTIMO_PLAN} pc ON pc.id_miembro = mb.id_miembro
          WHERE mb.id_gimnasio = $1
            AND mb.activo = TRUE
          ORDER BY pc.fecha_fin ASC`,
        [gymId]
      );

      const columns = [
        { key: 'nombre',         label: 'nombre'         },
        { key: 'documento',      label: 'documento'      },
        { key: 'telefono',       label: 'telefono'       },
        { key: 'email',          label: 'email'          },
        { key: 'plan',           label: 'plan'           },
        { key: 'fecha_fin',      label: 'fecha_fin'      },
        { key: 'dias_restantes', label: 'dias_restantes' },
      ];

      const csv = toCsv(rows, columns);

      const today = new Date().toISOString().slice(0, 10);
      const filename = `fitloyalty-export-${today}.csv`;

      // BOM UTF-8 para que Excel detecte acentos correctamente.
      const body = '\uFEFF' + csv;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(body);
    } catch (err) {
      console.error('[GET /admin/dashboard/export] Error:', err.message);
      throw new AppError(503, 'No pudimos generar el CSV. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;