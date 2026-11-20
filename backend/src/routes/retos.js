/**
 * routes/retos.js
 *
 * Retos de asistencia (RQF-12), para el administrador:
 *
 *   GET  /api/admin/retos                    -> retos del gimnasio con inscritos y completados
 *   POST /api/admin/retos                    -> crea un reto
 *   PUT  /api/admin/retos/:id                -> edita un reto (no uno cancelado)
 *   POST /api/admin/retos/:id/cancelar       -> lo cancela (y las participaciones en curso)
 *   GET  /api/admin/retos/:id/participantes  -> avance de cada inscrito
 *   GET  /api/admin/retos/:id/elegibles      -> cuantos miembros del segmento faltan por inscribir
 *   POST /api/admin/retos/:id/inscribir      -> inscribe a los elegibles (o a los ids dados)
 *
 * El progreso se actualiza solo en cada check-in (lib/retos.js) y el miembro
 * se puede unir desde la app (POST /api/cliente/retos/:id/unirse).
 *
 * Usa las columnas de produccion (ConsultasDB): meta_asistencias, recompensa,
 * segmento_elegible, estado y creado_por; en Docker las alinean la 009 y la 015.
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { formatZodError } = require('../lib/validators');
const { SEGMENTOS, HOY, miembrosDelSegmento } = require('../lib/segmentos');
const { sincronizarEstados, recalcularParticipacion } = require('../lib/retos');

const router = express.Router();

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD');

const retoBase = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(100),
  descripcion: z.string().trim().max(1000).optional().nullable(),
  meta_asistencias: z.coerce.number().int().min(1, 'La meta debe ser de al menos 1 asistencia.').max(1000),
  recompensa: z.string().trim().max(200).optional().nullable(),
  segmento_elegible: z.enum(SEGMENTOS).default('TODOS'),
  fecha_inicio: FECHA,
  fecha_fin: FECHA,
});

const fechasCoherentes = (d) => !d.fecha_inicio || !d.fecha_fin || d.fecha_fin >= d.fecha_inicio;
const crearSchema = retoBase.refine(fechasCoherentes, {
  message: 'La fecha de fin no puede ser anterior a la de inicio.', path: ['fecha_fin'],
});
const editarSchema = retoBase.partial().refine(fechasCoherentes, {
  message: 'La fecha de fin no puede ser anterior a la de inicio.', path: ['fecha_fin'],
});

const inscribirSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).max(5000).optional(),
});

function validar(schema, body) {
  const r = schema.safeParse(body || {});
  if (!r.success) throw new AppError(400, formatZodError(r.error), 'VALIDATION_ERROR', { issues: r.error.issues });
  return r.data;
}

function idDe(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0 || String(id) !== String(req.params.id)) {
    throw new AppError(400, 'Id de reto invalido.', 'VALIDATION_ERROR');
  }
  return id;
}

const COLS = `r.id_reto, r.nombre, r.descripcion, r.meta_asistencias, r.recompensa,
              r.segmento_elegible, r.estado, r.activo,
              to_char(r.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
              to_char(r.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
              r.fecha_creacion`;

async function retoDelGimnasio(db, idReto, gymId) {
  const { rows } = await db.query(
    `SELECT ${COLS} FROM reto r WHERE r.id_reto = $1 AND r.id_gimnasio = $2`,
    [idReto, gymId]
  );
  if (rows.length === 0) throw new AppError(404, 'Reto no encontrado.', 'NOT_FOUND');
  return rows[0];
}

// Captura los errores de base (sin conexion, CHECK) y deja pasar los AppError.
function enBase(etiqueta, mensaje, fn) {
  return asyncHandler(async (req, res) => {
    try {
      return await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.code === '23514') throw new AppError(400, 'Los datos del reto no son validos.', 'VALIDATION_ERROR');
      console.error(`[${etiqueta}] Error:`, err.message);
      throw new AppError(503, mensaje, 'DB_UNREACHABLE');
    }
  });
}

const soloAdmin = [authenticate, authorize('admin'), requireActiveTrial(pool)];

// ---------------------------------------------------------------------------
router.get('/admin/retos', ...soloAdmin, enBase('GET /admin/retos', 'No pudimos cargar los retos.', async (req, res) => {
  const gymId = req.user.gymId;
  await sincronizarEstados(pool, gymId);
  const { rows } = await pool.query(
    `SELECT ${COLS},
            COUNT(rm.id_reto_miembro)::int AS inscritos,
            COUNT(rm.id_reto_miembro) FILTER (WHERE rm.estado = 'COMPLETADO')::int AS completados,
            COALESCE(ROUND(AVG(rm.porcentaje_avance) FILTER (WHERE rm.estado <> 'CANCELADO'), 1), 0)::float AS avance_promedio
       FROM reto r
       LEFT JOIN reto_miembro rm ON rm.id_reto = r.id_reto
      WHERE r.id_gimnasio = $1
      GROUP BY r.id_reto
      ORDER BY (r.estado = 'CANCELADO'), r.fecha_fin DESC, r.id_reto DESC`,
    [gymId]
  );
  return res.json({ retos: rows });
}));

// ---------------------------------------------------------------------------
router.post('/admin/retos', ...soloAdmin, enBase('POST /admin/retos', 'No pudimos crear el reto.', async (req, res) => {
  const d = validar(crearSchema, req.body);
  const gymId = req.user.gymId;
  const { rows: hoy } = await pool.query(`SELECT to_char(${HOY}, 'YYYY-MM-DD') AS hoy`);
  if (d.fecha_fin < hoy[0].hoy) {
    throw new AppError(400, 'El reto ya habría terminado: la fecha de fin es anterior a hoy.', 'VALIDATION_ERROR');
  }
  const { rows } = await pool.query(
    `INSERT INTO reto (id_gimnasio, nombre, descripcion, meta_asistencias, recompensa,
                       segmento_elegible, estado, activo, fecha_inicio, fecha_fin, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6,
             CASE WHEN $7::date > ${HOY} THEN 'PROGRAMADO' ELSE 'ACTIVO' END,
             TRUE, $7, $8, $9)
     RETURNING id_reto`,
    [gymId, d.nombre, d.descripcion || null, d.meta_asistencias, d.recompensa || null,
     d.segmento_elegible, d.fecha_inicio, d.fecha_fin, req.user.id]
  );
  const reto = await retoDelGimnasio(pool, rows[0].id_reto, gymId);
  return res.status(201).json({ reto });
}));

// ---------------------------------------------------------------------------
router.put('/admin/retos/:id', ...soloAdmin, enBase('PUT /admin/retos', 'No pudimos actualizar el reto.', async (req, res) => {
  const idReto = idDe(req);
  const d = validar(editarSchema, req.body);
  const gymId = req.user.gymId;
  const actual = await retoDelGimnasio(pool, idReto, gymId);
  if (actual.estado === 'CANCELADO') throw new AppError(409, 'El reto está cancelado.', 'RETO_CANCELADO');

  const nuevo = { ...actual, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
  if (nuevo.fecha_fin < nuevo.fecha_inicio) {
    throw new AppError(400, 'La fecha de fin no puede ser anterior a la de inicio.', 'VALIDATION_ERROR');
  }

  await pool.query(
    `UPDATE reto SET nombre = $3, descripcion = $4, meta_asistencias = $5, recompensa = $6,
                     segmento_elegible = $7, fecha_inicio = $8, fecha_fin = $9
      WHERE id_reto = $1 AND id_gimnasio = $2`,
    [idReto, gymId, nuevo.nombre, nuevo.descripcion || null, nuevo.meta_asistencias,
     nuevo.recompensa || null, nuevo.segmento_elegible, nuevo.fecha_inicio, nuevo.fecha_fin]
  );
  await sincronizarEstados(pool, gymId);

  // Si cambio la meta o las fechas, el avance de los inscritos cambia.
  if (d.meta_asistencias !== undefined || d.fecha_inicio !== undefined || d.fecha_fin !== undefined) {
    const { rows: enCurso } = await pool.query(
      `SELECT id_reto_miembro, id_miembro FROM reto_miembro WHERE id_reto = $1 AND estado = 'EN_CURSO'`,
      [idReto]
    );
    for (const p of enCurso) {
      await recalcularParticipacion(pool, { idRetoMiembro: p.id_reto_miembro, idReto, idMiembro: p.id_miembro, gymId });
    }
  }
  const reto = await retoDelGimnasio(pool, idReto, gymId);
  return res.json({ reto });
}));

// ---------------------------------------------------------------------------
router.post('/admin/retos/:id/cancelar', ...soloAdmin, enBase('POST /admin/retos/cancelar', 'No pudimos cancelar el reto.', async (req, res) => {
  const idReto = idDe(req);
  const gymId = req.user.gymId;
  await retoDelGimnasio(pool, idReto, gymId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE reto SET estado = 'CANCELADO', activo = FALSE WHERE id_reto = $1 AND id_gimnasio = $2`,
      [idReto, gymId]
    );
    await client.query(
      `UPDATE reto_miembro SET estado = 'CANCELADO' WHERE id_reto = $1 AND estado = 'EN_CURSO'`,
      [idReto]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const reto = await retoDelGimnasio(pool, idReto, gymId);
  return res.json({ reto });
}));

// ---------------------------------------------------------------------------
router.get('/admin/retos/:id/participantes', ...soloAdmin, enBase('GET /admin/retos/participantes', 'No pudimos cargar los participantes.', async (req, res) => {
  const idReto = idDe(req);
  const gymId = req.user.gymId;
  const reto = await retoDelGimnasio(pool, idReto, gymId);
  const { rows } = await pool.query(
    `SELECT rm.id_reto_miembro, m.id_miembro, m.nombre, m.documento,
            rm.estado, rm.checkins_acumulados, rm.porcentaje_avance::float AS porcentaje_avance,
            rm.fecha_inscripcion, rm.fecha_completado
       FROM reto_miembro rm
       JOIN miembro m ON m.id_miembro = rm.id_miembro AND m.id_gimnasio = $2
      WHERE rm.id_reto = $1
      ORDER BY (rm.estado = 'COMPLETADO') DESC, rm.porcentaje_avance DESC, m.nombre`,
    [idReto, gymId]
  );
  return res.json({ reto, participantes: rows });
}));

// ---------------------------------------------------------------------------
async function elegiblesSinInscribir(db, reto, gymId) {
  const miembros = await miembrosDelSegmento(db, gymId, reto.segmento_elegible);
  const { rows: ya } = await db.query('SELECT id_miembro FROM reto_miembro WHERE id_reto = $1', [reto.id_reto]);
  const inscritos = new Set(ya.map((r) => r.id_miembro));
  return miembros.filter((m) => !inscritos.has(m.id_miembro));
}

router.get('/admin/retos/:id/elegibles', ...soloAdmin, enBase('GET /admin/retos/elegibles', 'No pudimos calcular los elegibles.', async (req, res) => {
  const idReto = idDe(req);
  const gymId = req.user.gymId;
  const reto = await retoDelGimnasio(pool, idReto, gymId);
  const faltan = await elegiblesSinInscribir(pool, reto, gymId);
  return res.json({
    total: faltan.length,
    miembros: faltan.slice(0, 50).map((m) => ({ id_miembro: m.id_miembro, nombre: m.nombre })),
  });
}));

router.post('/admin/retos/:id/inscribir', ...soloAdmin, enBase('POST /admin/retos/inscribir', 'No pudimos inscribir a los miembros.', async (req, res) => {
  const idReto = idDe(req);
  const { ids } = validar(inscribirSchema, req.body);
  const gymId = req.user.gymId;
  const reto = await retoDelGimnasio(pool, idReto, gymId);
  if (reto.estado === 'CANCELADO') throw new AppError(409, 'El reto está cancelado.', 'RETO_CANCELADO');
  if (reto.estado === 'COMPLETADO') throw new AppError(409, 'El reto ya terminó.', 'RETO_TERMINADO');

  // Solo miembros elegibles del gimnasio: los ids que no lo sean se ignoran.
  let candidatos = await elegiblesSinInscribir(pool, reto, gymId);
  if (ids && ids.length) {
    const pedidos = new Set(ids);
    candidatos = candidatos.filter((m) => pedidos.has(m.id_miembro));
  }

  let inscritos = 0;
  for (const m of candidatos) {
    const { rows } = await pool.query(
      `INSERT INTO reto_miembro (id_reto, id_miembro) VALUES ($1, $2)
       ON CONFLICT (id_reto, id_miembro) DO NOTHING
       RETURNING id_reto_miembro`,
      [idReto, m.id_miembro]
    );
    if (rows.length === 0) continue;
    inscritos += 1;
    // Los ingresos que ya hizo dentro de las fechas del reto cuentan.
    await recalcularParticipacion(pool, {
      idRetoMiembro: rows[0].id_reto_miembro, idReto, idMiembro: m.id_miembro, gymId,
    });
  }
  return res.status(201).json({ inscritos });
}));

module.exports = router;
module.exports.crearSchema = crearSchema;
