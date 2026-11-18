/**
 * routes/retos.js
 *
 * Retos de asistencia del gimnasio (RQF-12, HU-28 a HU-31, HU-49 y HU-50).
 *
 *   GET    /api/admin/retos                   -> retos del gimnasio, con inscritos y completados
 *   POST   /api/admin/retos                   -> crear (HU-28)
 *   PUT    /api/admin/retos/:id               -> editar (HU-30)
 *   DELETE /api/admin/retos/:id               -> cancelar (HU-50); el progreso se conserva
 *   GET    /api/admin/retos/:id/progreso      -> inscritos y su avance (HU-29), ?estado=
 *   GET    /api/admin/retos/avisos            -> retos completados sin ver, para la campana (HU-31)
 *   POST   /api/admin/retos/avisos/:id/leida  -> marca uno como visto
 *
 * El CRUD y el progreso son del administrador. Los avisos tambien los ve
 * recepcion: la campana es de los dos y es recepcion la que entrega la
 * recompensa. Todo filtra por el gimnasio del token (RQNF-05).
 *
 * La inscripcion y el progreso no se hacen aqui sino en el check-in
 * (lib/retos.js): el miembro entra al reto con su primer ingreso dentro de las
 * fechas si es del segmento elegible.
 *
 * Los avisos viven en este archivo y no en routes/notificaciones.js para no
 * tocar la campana, que arma sus avisos de otra forma; el frontend junta las
 * dos listas (MenuNotificaciones.jsx).
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { HOY, SEGMENTOS, ZONA_GIMNASIO, TITULO_AVISO_GIMNASIO } = require('../lib/retos');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');

const router = express.Router();

// Tope de avisos en la campana, como en routes/notificaciones.js.
const TOPE_AVISOS = 5;

const ESTADOS_INSCRIPCION = ['EN_CURSO', 'COMPLETADO', 'CANCELADO'];

// Estado que ve el panel. La columna reto.estado no se puede creer sola: un reto
// PROGRAMADO pasa a estar en curso cuando llega su fecha sin que nadie lo
// toque, asi que se calcula con las fechas (dia de Colombia) y con `activo`.
const ESTADO_ACTUAL = `CASE WHEN NOT r.activo OR r.estado = 'CANCELADO' THEN 'CANCELADO'
                            WHEN ${HOY} < r.fecha_inicio THEN 'PROGRAMADO'
                            WHEN ${HOY} > r.fecha_fin THEN 'FINALIZADO'
                            ELSE 'ACTIVO' END`;

// Las fechas salen como texto AAAA-MM-DD: pg convierte DATE a un Date de
// medianoche local y, en JSON, en Colombia se veria el dia anterior.
const RETO_COLS = `r.id_reto, r.nombre, r.descripcion, r.meta_asistencias, r.recompensa,
                   r.segmento_elegible,
                   to_char(r.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
                   to_char(r.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
                   r.activo, ${ESTADO_ACTUAL} AS estado, r.fecha_creacion`;

// Lo que define el reto: con inscritos ya no se cambia (HU-30), porque
// cambiaria las reglas a quien ya va avanzando.
const REGLAS = ['meta_asistencias', 'fecha_inicio', 'fecha_fin', 'segmento_elegible'];

/** Hoy en Colombia como AAAA-MM-DD (en-CA da ese formato). */
function hoyGimnasio() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_GIMNASIO }).format(new Date());
}

const fechaSchema = z.string({ required_error: 'Faltan las fechas del reto.', invalid_type_error: 'Fecha invalida.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa fechas con el formato AAAA-MM-DD.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Esa fecha no existe.');

const retoSchema = z.object({
  nombre: z.string({ required_error: 'El nombre es obligatorio.' })
    .trim().min(1, 'El nombre es obligatorio.').max(100, 'El nombre no puede superar 100 caracteres.'),
  descripcion: z.string().trim().max(500, 'La descripcion no puede superar 500 caracteres.').nullable().optional(),
  meta_asistencias: z.coerce.number({ invalid_type_error: 'La meta debe ser un numero de check-ins.' })
    .int('La meta debe ser un numero entero de check-ins.')
    .min(1, 'La meta debe ser de al menos 1 check-in.')
    .max(1000, 'La meta no puede superar 1000 check-ins.'),
  recompensa: z.string({ required_error: 'La recompensa es obligatoria.' })
    .trim().min(1, 'La recompensa es obligatoria.').max(200, 'La recompensa no puede superar 200 caracteres.'),
  segmento_elegible: z.enum(SEGMENTOS, {
    errorMap: () => ({ message: `Segmento invalido. Usa ${SEGMENTOS.join(', ')}.` }),
  }),
  fecha_inicio: fechaSchema,
  fecha_fin: fechaSchema,
});

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

/** Id positivo de la URL; si no, 400. */
function idDe(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');
  return id;
}

/**
 * La duracion tiene que tener sentido (HU-28 y CU10): el fin no puede ser
 * anterior al inicio (un reto de un solo dia si se puede), y un reto nuevo, o
 * uno al que le cambian las fechas, no puede terminar antes de hoy.
 */
function validarFechas({ fecha_inicio, fecha_fin }, { exigirVigente }) {
  if (fecha_fin < fecha_inicio) {
    throw new AppError(400, 'La fecha de fin no puede ser anterior a la de inicio.', 'VALIDATION_ERROR');
  }
  if (exigirVigente && fecha_fin < hoyGimnasio()) {
    throw new AppError(400, 'La fecha de fin ya paso: el reto terminaria antes de empezar.', 'VALIDATION_ERROR');
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/retos
// ---------------------------------------------------------------------------
router.get(
  '/admin/retos',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${RETO_COLS},
                COUNT(rm.id_reto_miembro)::int AS inscritos,
                COUNT(rm.id_reto_miembro) FILTER (WHERE rm.estado = 'COMPLETADO')::int AS completados
           FROM reto r
           LEFT JOIN reto_miembro rm ON rm.id_reto = r.id_reto
          WHERE r.id_gimnasio = $1
          GROUP BY r.id_reto
          ORDER BY CASE ${ESTADO_ACTUAL} WHEN 'ACTIVO' THEN 0 WHEN 'PROGRAMADO' THEN 1
                                         WHEN 'FINALIZADO' THEN 2 ELSE 3 END,
                   r.fecha_inicio DESC, r.id_reto DESC`,
        [req.user.gymId]
      );
      return res.json({ retos: rows });
    } catch (err) {
      console.error('[GET /admin/retos] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar los retos. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/retos
// ---------------------------------------------------------------------------
router.post(
  '/admin/retos',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(retoSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const d = parsed.data;
    validarFechas(d, { exigirVigente: true });

    try {
      // estado queda PROGRAMADO o ACTIVO segun la fecha de inicio; el que se
      // muestra se vuelve a calcular en cada consulta (ESTADO_ACTUAL).
      const { rows } = await pool.query(
        `INSERT INTO reto AS r (id_gimnasio, nombre, descripcion, meta_asistencias, recompensa,
                                segmento_elegible, estado, activo, fecha_inicio, fecha_fin, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6,
                 CASE WHEN $7::date > ${HOY} THEN 'PROGRAMADO' ELSE 'ACTIVO' END,
                 TRUE, $7, $8, $9)
         RETURNING ${RETO_COLS}`,
        [req.user.gymId, d.nombre, d.descripcion || null, d.meta_asistencias, d.recompensa,
         d.segmento_elegible, d.fecha_inicio, d.fecha_fin, req.user.id]
      );
      return res.status(201).json({ reto: { ...rows[0], inscritos: 0, completados: 0 } });
    } catch (err) {
      console.error('[POST /admin/retos] Error:', err.message);
      throw new AppError(503, 'No pudimos crear el reto. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/admin/retos/:id
// ---------------------------------------------------------------------------
// HU-30: se edita un reto programado o en curso. Con inscritos solo se cambian
// el nombre, la descripcion y la recompensa. Para cancelarlo esta el DELETE.
router.put(
  '/admin/retos/:id',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = idDe(req);
    const parsed = parse(retoSchema.partial(), req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const cambios = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    if (Object.keys(cambios).length === 0) throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');
    if ('descripcion' in cambios) cambios.descripcion = cambios.descripcion || null;

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      // FOR UPDATE: mientras se edita, un check-in no puede inscribir a nadie
      // (la inscripcion necesita la fila del reto por la FK), asi que el conteo
      // de inscritos de abajo no cambia antes del UPDATE.
      const { rows: actuales } = await client.query(
        `SELECT r.id_reto, r.activo, r.estado, r.meta_asistencias, r.segmento_elegible,
                to_char(r.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
                to_char(r.fecha_fin, 'YYYY-MM-DD') AS fecha_fin
           FROM reto r
          WHERE r.id_reto = $1 AND r.id_gimnasio = $2
          FOR UPDATE`,
        [id, req.user.gymId]
      );
      const actual = actuales[0];
      if (!actual) throw new AppError(404, 'Reto no encontrado.', 'NOT_FOUND');
      if (!actual.activo || actual.estado === 'CANCELADO') {
        throw new AppError(409, 'El reto esta cancelado y ya no se puede editar.', 'RETO_CANCELADO');
      }
      if (actual.fecha_fin < hoyGimnasio()) {
        throw new AppError(409, 'El reto ya termino y no se puede editar.', 'RETO_FINALIZADO');
      }

      const cambiaReglas = REGLAS.filter((k) => k in cambios && String(cambios[k]) !== String(actual[k]));
      if (cambiaReglas.length > 0) {
        const { rows: [{ n }] } = await client.query(
          'SELECT COUNT(*)::int AS n FROM reto_miembro WHERE id_reto = $1',
          [id]
        );
        if (n > 0) {
          throw new AppError(409,
            'El reto ya tiene miembros inscritos: solo puedes cambiar el nombre, la descripcion y la recompensa.',
            'RETO_CON_INSCRITOS', { campos: cambiaReglas });
        }
      }

      const nuevo = { ...actual, ...cambios };
      validarFechas(nuevo, { exigirVigente: 'fecha_inicio' in cambios || 'fecha_fin' in cambios });

      const campos = [];
      const params = [];
      for (const [k, v] of Object.entries(cambios)) {
        params.push(v);
        campos.push(`${k} = $${params.length}`);
      }
      // El estado guardado sale de la fecha de inicio nueva (en el SET,
      // r.fecha_inicio todavia es la vieja).
      params.push(nuevo.fecha_inicio);
      campos.push(`estado = CASE WHEN $${params.length}::date > ${HOY} THEN 'PROGRAMADO' ELSE 'ACTIVO' END`);
      params.push(id, req.user.gymId);
      const { rows } = await client.query(
        `UPDATE reto r
            SET ${campos.join(', ')}
          WHERE r.id_reto = $${params.length - 1} AND r.id_gimnasio = $${params.length}
          RETURNING ${RETO_COLS}`,
        params
      );
      await client.query('COMMIT');
      return res.json({ reto: rows[0] });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err instanceof AppError) throw err;
      console.error('[PUT /admin/retos/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos actualizar el reto. Intenta de nuevo.', 'DB_UNREACHABLE');
    } finally {
      if (client) client.release();
    }
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/admin/retos/:id  (cancelar, HU-50)
// ---------------------------------------------------------------------------
// No se borra: el reto pasa a CANCELADO, deja de sumar en el check-in y las
// inscripciones EN_CURSO pasan a CANCELADO con su progreso intacto. Las que ya
// estaban COMPLETADO siguen asi (la recompensa ya se gano). A cada inscrito en
// curso le llega un mensaje a la app.
router.delete(
  '/admin/retos/:id',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = idDe(req);
    const gymId = req.user.gymId;

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows: actuales } = await client.query(
        'SELECT id_reto, nombre, activo, estado FROM reto WHERE id_reto = $1 AND id_gimnasio = $2 FOR UPDATE',
        [id, gymId]
      );
      const actual = actuales[0];
      if (!actual) throw new AppError(404, 'Reto no encontrado.', 'NOT_FOUND');
      if (!actual.activo || actual.estado === 'CANCELADO') {
        throw new AppError(409, 'El reto ya estaba cancelado.', 'RETO_CANCELADO');
      }

      const { rows } = await client.query(
        `UPDATE reto r SET activo = FALSE, estado = 'CANCELADO'
          WHERE r.id_reto = $1 AND r.id_gimnasio = $2
          RETURNING ${RETO_COLS}`,
        [id, gymId]
      );
      const { rows: enCurso } = await client.query(
        `UPDATE reto_miembro SET estado = 'CANCELADO'
          WHERE id_reto = $1 AND estado = 'EN_CURSO'
          RETURNING id_miembro`,
        [id]
      );
      if (enCurso.length > 0) {
        await client.query(
          `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje, destinatario)
           SELECT $1, x, 'RETO', 'Reto cancelado', $3, 'MIEMBRO' FROM unnest($2::int[]) AS x`,
          [gymId, enCurso.map((r) => r.id_miembro),
           `El gimnasio cancelo el reto «${actual.nombre}». Tus ingresos ya no suman para ese reto.`]
        );
      }
      await client.query('COMMIT');
      return res.json({ message: 'Reto cancelado.', reto: rows[0], inscripcionesCanceladas: enCurso.length });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err instanceof AppError) throw err;
      console.error('[DELETE /admin/retos/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos cancelar el reto. Intenta de nuevo.', 'DB_UNREACHABLE');
    } finally {
      if (client) client.release();
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/retos/:id/progreso
// ---------------------------------------------------------------------------
// HU-29: cada inscrito con sus check-ins, la meta y el porcentaje. Los que
// completaron van primero. ?estado=EN_CURSO|COMPLETADO|CANCELADO filtra la
// lista; el resumen siempre cuenta a todos.
router.get(
  '/admin/retos/:id/progreso',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = idDe(req);
    const estado = req.query.estado ? String(req.query.estado).toUpperCase() : null;
    if (estado && !ESTADOS_INSCRIPCION.includes(estado)) {
      throw new AppError(400, `Estado invalido. Usa ${ESTADOS_INSCRIPCION.join(', ')}.`, 'VALIDATION_ERROR');
    }
    const gymId = req.user.gymId;

    try {
      const { rows: retos } = await pool.query(
        `SELECT ${RETO_COLS} FROM reto r WHERE r.id_reto = $1 AND r.id_gimnasio = $2`,
        [id, gymId]
      );
      if (retos.length === 0) throw new AppError(404, 'Reto no encontrado.', 'NOT_FOUND');

      const [{ rows: miembros }, { rows: [resumen] }] = await Promise.all([
        pool.query(
          `SELECT rm.id_reto_miembro, m.id_miembro, m.nombre, m.documento, rm.estado,
                  rm.checkins_acumulados, rm.porcentaje_avance::float AS porcentaje_avance,
                  rm.fecha_inscripcion, rm.fecha_completado
             FROM reto_miembro rm
             INNER JOIN miembro m ON m.id_miembro = rm.id_miembro AND m.id_gimnasio = $2
            WHERE rm.id_reto = $1 AND ($3::varchar IS NULL OR rm.estado = $3)
            ORDER BY (rm.estado = 'COMPLETADO') DESC, rm.checkins_acumulados DESC, m.nombre ASC`,
          [id, gymId, estado]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS inscritos,
                  COUNT(*) FILTER (WHERE rm.estado = 'EN_CURSO')::int AS en_curso,
                  COUNT(*) FILTER (WHERE rm.estado = 'COMPLETADO')::int AS completados,
                  COUNT(*) FILTER (WHERE rm.estado = 'CANCELADO')::int AS cancelados
             FROM reto_miembro rm
             INNER JOIN miembro m ON m.id_miembro = rm.id_miembro AND m.id_gimnasio = $2
            WHERE rm.id_reto = $1`,
          [id, gymId]
        ),
      ]);
      return res.json({ reto: retos[0], resumen, miembros });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[GET /admin/retos/:id/progreso] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar el progreso del reto. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/retos/avisos
// ---------------------------------------------------------------------------
// HU-31: los retos completados que nadie ha marcado como vistos. Salen de la
// tabla notificacion (destinatario GIMNASIO), que llena el check-in al
// completar. Con la misma forma que los avisos de la campana.
const hace = (min) => (min < 1 ? 'hace menos de un minuto'
  : min < 60 ? `hace ${min} min`
  : min < 48 * 60 ? `hace ${Math.floor(min / 60)} h`
  : `hace ${Math.floor(min / (24 * 60))} dias`);

router.get(
  '/admin/retos/avisos',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT n.id_notificacion, n.mensaje, mb.id_miembro, mb.nombre,
                GREATEST(0, EXTRACT(EPOCH FROM (NOW() - n.fecha_creacion)) / 60)::int AS minutos
           FROM notificacion n
           INNER JOIN miembro mb ON mb.id_miembro = n.id_miembro AND mb.id_gimnasio = n.id_gimnasio
          WHERE n.id_gimnasio = $1 AND n.destinatario = 'GIMNASIO'
            AND n.tipo = 'RETO' AND n.titulo = $2 AND n.leida = FALSE
          ORDER BY n.fecha_creacion DESC, n.id_notificacion DESC
          LIMIT $3`,
        [req.user.gymId, TITULO_AVISO_GIMNASIO, TOPE_AVISOS]
      );
      const avisos = rows.map((r) => ({
        id: `reto-completado-${r.id_notificacion}`,
        tipo: 'reto-completado',
        icono: 'emoji_events',
        titulo: r.mensaje,
        detalle: `Reto completado · ${hace(r.minutos)}`,
        idMiembro: r.id_miembro,
        nombreMiembro: r.nombre,
        idNotificacion: r.id_notificacion,
      }));
      return res.json({ total: avisos.length, avisos });
    } catch (err) {
      console.error('[GET /admin/retos/avisos] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar los avisos de retos. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/retos/avisos/:id/leida
// ---------------------------------------------------------------------------
router.post(
  '/admin/retos/avisos/:id/leida',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const id = idDe(req);
    try {
      const { rowCount } = await pool.query(
        `UPDATE notificacion SET leida = TRUE
          WHERE id_notificacion = $1 AND id_gimnasio = $2 AND destinatario = 'GIMNASIO'
            AND tipo = 'RETO' AND titulo = $3`,
        [id, req.user.gymId, TITULO_AVISO_GIMNASIO]
      );
      if (rowCount === 0) throw new AppError(404, 'Aviso no encontrado.', 'NOT_FOUND');
      return res.json({ message: 'Aviso marcado como visto.' });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/retos/avisos/:id/leida] Error:', err.message);
      throw new AppError(503, 'No pudimos marcar el aviso. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;
module.exports.hoyGimnasio = hoyGimnasio; // expuesto para pruebas
