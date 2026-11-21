/**
 * routes/campanas.js
 *
 * Campanas de mensajes y plantillas reutilizables (RQF-10), para el administrador:
 *
 *   GET    /api/admin/plantillas                 -> plantillas del gimnasio
 *   POST   /api/admin/plantillas                 -> crea una plantilla
 *   PUT    /api/admin/plantillas/:id             -> la edita (nombre, contenido, activa)
 *   DELETE /api/admin/plantillas/:id             -> la desactiva
 *
 *   GET    /api/admin/campanas                   -> campanas con conteo por estado de envio
 *   GET    /api/admin/campanas/segmento          -> vista previa: cuantos miembros caen en un segmento
 *   POST   /api/admin/campanas                   -> crea una campana (MANUAL o PROGRAMADO)
 *   PUT    /api/admin/campanas/:id               -> la edita mientras siga PROGRAMADA
 *   POST   /api/admin/campanas/:id/ejecutar      -> la ejecuta ya; fuera del horario de la
 *                                                   Ley 2300 la deja programada (202)
 *   POST   /api/admin/campanas/:id/reintentar    -> vuelve a procesar los destinatarios PENDIENTE
 *   POST   /api/admin/campanas/:id/cancelar      -> la cancela si no se ha enviado
 *   GET    /api/admin/campanas/:id/destinatarios -> destinatarios con su estado, motivo y mensaje
 *   POST   /api/admin/campanas/:id/destinatarios/:idMiembro/enviado
 *                                                -> constancia de un envio a mano por WhatsApp,
 *                                                   ANTES de abrir el chat (devuelve el texto)
 *
 * Las programadas las ejecuta solo el scheduler (jobs/campanas.js) cada 10
 * minutos; el mismo job reintenta los PENDIENTE que quedaron de un proceso que
 * se cayo. Consultar la lista no ejecuta nada.
 *
 * RQNF-16 (Ley 2300 de 2023, lib/campanas.js y lib/contacto-legal.js): solo
 * reciben la campana los miembros que aceptaron mensajes comerciales por ese
 * canal, dentro del horario y sin pasar la frecuencia; los demas quedan
 * OMITIDO con su motivo. Una campana programada solo se puede poner dentro
 * del horario permitido.
 *
 * Columnas de produccion (ConsultasDB); en Docker las crea la migracion 015,
 * que tambien agrega campana.canal en las dos. motivo y OMITIDO son de la 018.
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { formatZodError } = require('../lib/validators');
const { SEGMENTOS, ETIQUETAS, ZONA, miembrosDelSegmento, diasDe } = require('../lib/segmentos');
const {
  textoParaMiembro, fueraDeHorario, ejecutarCampana, reanudarCampana, registrarEnvioManual,
  destinatariosDeCampana, campanasVencidas, campanasConPendientes, VARIABLES,
} = require('../lib/campanas');
const {
  ahora, evaluarHorario, siguienteHorarioPermitido, describirInstante, TEXTO_HORARIO,
} = require('../lib/contacto-legal');
const { comercialesDeVarios } = require('../lib/contacto-miembro');
const { telefonoWhatsapp } = require('../lib/mensajes');
const { canalDelGimnasio } = require('./notificaciones');
const { sendMail } = require('../lib/email');
const whatsapp = require('../lib/whatsapp');

const router = express.Router();

// Entregas reales; las pruebas las reemplazan con router.setDeps().
let deps = {
  canalDelGimnasio,
  enviarCorreo: (to, asunto, texto) => sendMail({ to, subject: asunto, text: texto }),
  enviarWhatsapp: (telefono, texto) => whatsapp.sendWhatsAppText(telefono, texto),
  whatsappActivo: () => (typeof whatsapp.isWhatsAppEnabled === 'function' ? whatsapp.isWhatsAppEnabled() : false),
};

// Fecha y hora de Colombia <-> TIMESTAMP sin zona en la hora del servidor.
const A_SERVIDOR = (p) => `((${p}::timestamp AT TIME ZONE '${ZONA}') AT TIME ZONE current_setting('TimeZone'))`;
const A_COLOMBIA = (col) => `to_char((${col} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE '${ZONA}', 'YYYY-MM-DD"T"HH24:MI')`;

// ------------------------------------------------------------------ esquemas
const plantillaSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(100),
  contenido: z.string().trim().min(5, 'El mensaje debe tener al menos 5 caracteres.').max(2000),
  activa: z.boolean().optional(),
});

const FECHA_HORA = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Fecha y hora con formato AAAA-MM-DDTHH:MM');

const campanaBase = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(150),
  segmento: z.enum(SEGMENTOS),
  dias: z.coerce.number().int().min(0).max(365).optional().nullable(),
  canal: z.enum(['WHATSAPP', 'EMAIL']).default('WHATSAPP'),
  id_plantilla: z.coerce.number().int().positive().optional().nullable(),
  mensaje: z.string().trim().max(2000).optional(),
  tipo_disparo: z.enum(['MANUAL', 'PROGRAMADO']).default('MANUAL'),
  fecha_programada: FECHA_HORA.optional().nullable(),
});

function validar(schema, body) {
  const r = schema.safeParse(body || {});
  if (!r.success) throw new AppError(400, formatZodError(r.error), 'VALIDATION_ERROR', { issues: r.error.issues });
  return r.data;
}

function idDe(valor, que = 'campaña') {
  const id = Number.parseInt(valor, 10);
  if (!Number.isInteger(id) || id <= 0 || String(id) !== String(valor)) {
    throw new AppError(400, `Id de ${que} invalido.`, 'VALIDATION_ERROR');
  }
  return id;
}

function enBase(etiqueta, mensaje, fn) {
  return asyncHandler(async (req, res) => {
    try {
      return await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.code === '23505') throw new AppError(409, 'Ya existe una plantilla con ese nombre.', 'PLANTILLA_DUPLICADA');
      if (err.code === '23514') throw new AppError(400, 'Los datos no son validos.', 'VALIDATION_ERROR');
      console.error(`[${etiqueta}] Error:`, err.message);
      throw new AppError(503, mensaje, 'DB_UNREACHABLE');
    }
  });
}

const soloAdmin = [authenticate, authorize('admin'), requireActiveTrial(pool)];

// ================================================================ plantillas
const PLANTILLA_COLS = 'id_plantilla, nombre, contenido, activa, fecha_creacion';

router.get('/admin/plantillas', ...soloAdmin, enBase('GET /admin/plantillas', 'No pudimos cargar las plantillas.', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${PLANTILLA_COLS} FROM plantilla_mensaje WHERE id_gimnasio = $1 ORDER BY activa DESC, nombre`,
    [req.user.gymId]
  );
  return res.json({ plantillas: rows, variables: VARIABLES });
}));

router.post('/admin/plantillas', ...soloAdmin, enBase('POST /admin/plantillas', 'No pudimos crear la plantilla.', async (req, res) => {
  const d = validar(plantillaSchema, req.body);
  const { rows } = await pool.query(
    `INSERT INTO plantilla_mensaje (id_gimnasio, nombre, contenido, activa, creada_por)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${PLANTILLA_COLS}`,
    [req.user.gymId, d.nombre, d.contenido, d.activa ?? true, req.user.id]
  );
  return res.status(201).json({ plantilla: rows[0] });
}));

router.put('/admin/plantillas/:id', ...soloAdmin, enBase('PUT /admin/plantillas', 'No pudimos actualizar la plantilla.', async (req, res) => {
  const id = idDe(req.params.id, 'plantilla');
  const d = validar(plantillaSchema.partial(), req.body);
  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    params.push(v);
    campos.push(`${k} = $${params.length}`);
  }
  if (campos.length === 0) throw new AppError(400, 'Nada que actualizar.', 'VALIDATION_ERROR');
  params.push(id, req.user.gymId);
  const { rows } = await pool.query(
    `UPDATE plantilla_mensaje SET ${campos.join(', ')}
      WHERE id_plantilla = $${params.length - 1} AND id_gimnasio = $${params.length}
      RETURNING ${PLANTILLA_COLS}`,
    params
  );
  if (rows.length === 0) throw new AppError(404, 'Plantilla no encontrada.', 'NOT_FOUND');
  return res.json({ plantilla: rows[0] });
}));

router.delete('/admin/plantillas/:id', ...soloAdmin, enBase('DELETE /admin/plantillas', 'No pudimos desactivar la plantilla.', async (req, res) => {
  const id = idDe(req.params.id, 'plantilla');
  const { rows } = await pool.query(
    `UPDATE plantilla_mensaje SET activa = FALSE
      WHERE id_plantilla = $1 AND id_gimnasio = $2 RETURNING ${PLANTILLA_COLS}`,
    [id, req.user.gymId]
  );
  if (rows.length === 0) throw new AppError(404, 'Plantilla no encontrada.', 'NOT_FOUND');
  return res.json({ plantilla: rows[0] });
}));

// ================================================================= campanas
const CAMPANA_COLS = `c.id_campana, c.nombre, c.segmento, c.mensaje, c.id_plantilla, c.canal,
       c.tipo_disparo, c.dias_inactividad, c.estado, c.activa,
       ${A_COLOMBIA('c.fecha_programada')} AS fecha_programada,
       ${A_COLOMBIA('c.fecha_ejecucion')} AS fecha_ejecucion,
       c.fecha_creacion`;

async function campanaDelGimnasio(db, id, gymId) {
  const { rows } = await db.query(
    `SELECT ${CAMPANA_COLS},
            COUNT(d.id_campana_destinatario)::int AS destinatarios,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'ENVIADO')::int AS enviados,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'FALLIDO')::int AS fallidos,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'PENDIENTE')::int AS pendientes,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'OMITIDO')::int AS omitidos
       FROM campana c
       LEFT JOIN campana_destinatario d ON d.id_campana = c.id_campana
      WHERE c.id_campana = $1 AND c.id_gimnasio = $2
      GROUP BY c.id_campana`,
    [id, gymId]
  );
  if (rows.length === 0) throw new AppError(404, 'Campaña no encontrada.', 'NOT_FOUND');
  return rows[0];
}

/**
 * Ejecuta las programadas vencidas de un gimnasio (o de todos con gymId
 * null; la consulta ya filtra por gimnasio). Fuera del horario de la Ley 2300
 * no ejecuta ninguna: esperan a la siguiente franja.
 */
async function ejecutarVencidas(gymId = null) {
  if (fueraDeHorario(ahora())) return [];
  const vencidas = await campanasVencidas(pool, gymId);
  const resultados = [];
  for (const c of vencidas) {
    try {
      const r = await ejecutarCampana(pool, { idCampana: c.id_campana, gymId: c.id_gimnasio, usuarioId: c.creada_por }, deps);
      if (r && !r.fueraDeHorario) resultados.push({ id_campana: c.id_campana, ...r });
    } catch (err) {
      console.error(`[campanas] No se pudo ejecutar la campana ${c.id_campana}:`, err.message);
    }
  }
  return resultados;
}

/**
 * Reintenta los destinatarios PENDIENTE que el servidor puede enviar solo y
 * que quedaron asi porque el proceso se cayo o se cerro la franja. Lo llama
 * el scheduler.
 */
async function reanudarPendientes(gymId = null) {
  if (fueraDeHorario(ahora())) return [];
  const lista = await campanasConPendientes(pool, { gymId, conWhatsapp: deps.whatsappActivo() });
  const resultados = [];
  for (const c of lista) {
    try {
      const r = await reanudarCampana(pool, { idCampana: c.id_campana, gymId: c.id_gimnasio, usuarioId: c.creada_por }, deps);
      if (r && !r.fueraDeHorario) resultados.push({ id_campana: c.id_campana, ...r });
    } catch (err) {
      console.error(`[campanas] No se pudo reintentar la campana ${c.id_campana}:`, err.message);
    }
  }
  return resultados;
}

/** 'AAAA-MM-DDTHH:MM' en hora de Colombia -> Date (Colombia es UTC-5 todo el año). */
const instanteDeTexto = (texto) => new Date(`${String(texto).slice(0, 16)}:00-05:00`);

/** El estado del horario ahora, para que el panel avise antes de enviar. */
function horarioAhora() {
  const instante = ahora();
  const permitido = evaluarHorario(instante).permitido;
  const siguiente = permitido ? null : siguienteHorarioPermitido(instante);
  return {
    permitido,
    texto: TEXTO_HORARIO,
    siguiente: siguiente ? siguiente.toISOString() : null,
    siguiente_texto: siguiente ? describirInstante(siguiente) : null,
  };
}

/** Arma el mensaje desde la plantilla si no viene escrito, y valida la programacion. */
async function normalizar(d, gymId, { parcial = false } = {}) {
  let mensaje = d.mensaje;
  if ((!mensaje || !mensaje.trim()) && d.id_plantilla) {
    const { rows } = await pool.query(
      'SELECT contenido FROM plantilla_mensaje WHERE id_plantilla = $1 AND id_gimnasio = $2 AND activa = TRUE',
      [d.id_plantilla, gymId]
    );
    if (rows.length === 0) throw new AppError(404, 'Plantilla no encontrada.', 'NOT_FOUND');
    mensaje = rows[0].contenido;
  } else if (d.id_plantilla) {
    const { rows } = await pool.query(
      'SELECT 1 FROM plantilla_mensaje WHERE id_plantilla = $1 AND id_gimnasio = $2',
      [d.id_plantilla, gymId]
    );
    if (rows.length === 0) throw new AppError(404, 'Plantilla no encontrada.', 'NOT_FOUND');
  }
  if (!parcial && (!mensaje || mensaje.trim().length < 5)) {
    throw new AppError(400, 'Escribe el mensaje o elige una plantilla.', 'VALIDATION_ERROR');
  }
  if (d.tipo_disparo === 'PROGRAMADO') {
    if (!d.fecha_programada) throw new AppError(400, 'Elige la fecha y la hora de envío.', 'VALIDATION_ERROR');
    const { rows } = await pool.query(`SELECT ${A_SERVIDOR('$1')} > NOW() AS futura`, [d.fecha_programada]);
    if (!rows[0].futura) throw new AppError(400, 'La fecha de envío debe ser futura.', 'VALIDATION_ERROR');
    // RQNF-16: solo se programa dentro del horario de la Ley 2300.
    const fuera = fueraDeHorario(instanteDeTexto(d.fecha_programada));
    if (fuera) {
      throw new AppError(400, `Esa hora está fuera del horario permitido. ${fuera.mensaje}`, 'FUERA_DE_HORARIO', {
        siguiente: fuera.siguiente.toISOString(),
      });
    }
  }
  return { ...d, mensaje };
}

// La lista solo lee: las programadas vencidas las ejecuta el scheduler
// (jobs/campanas.js), no la pantalla (antes las ejecutaba al abrirla).
router.get('/admin/campanas', ...soloAdmin, enBase('GET /admin/campanas', 'No pudimos cargar las campañas.', async (req, res) => {
  const gymId = req.user.gymId;
  const { rows } = await pool.query(
    `SELECT ${CAMPANA_COLS},
            COUNT(d.id_campana_destinatario)::int AS destinatarios,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'ENVIADO')::int AS enviados,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'FALLIDO')::int AS fallidos,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'PENDIENTE')::int AS pendientes,
            COUNT(d.id_campana_destinatario) FILTER (WHERE d.estado_envio = 'OMITIDO')::int AS omitidos
       FROM campana c
       LEFT JOIN campana_destinatario d ON d.id_campana = c.id_campana
      WHERE c.id_gimnasio = $1
      GROUP BY c.id_campana
      ORDER BY (c.estado = 'PROGRAMADA') DESC, c.fecha_creacion DESC
      LIMIT 200`,
    [gymId]
  );
  return res.json({
    campanas: rows,
    segmentos: SEGMENTOS.map((s) => ({ valor: s, etiqueta: ETIQUETAS[s], dias: diasDe(s) })),
    variables: VARIABLES,
    horario: horarioAhora(),
  });
}));

router.get('/admin/campanas/segmento', ...soloAdmin, enBase('GET /admin/campanas/segmento', 'No pudimos calcular el segmento.', async (req, res) => {
  const segmento = String(req.query.segmento || '');
  if (!SEGMENTOS.includes(segmento)) throw new AppError(400, 'Segmento invalido.', 'VALIDATION_ERROR');
  const dias = req.query.dias === undefined || req.query.dias === '' ? undefined : req.query.dias;
  const miembros = await miembrosDelSegmento(pool, req.user.gymId, segmento, { dias });
  // RQNF-16: cuantos aceptaron mensajes comerciales por cada canal.
  const comerciales = await comercialesDeVarios(pool, miembros.map((m) => m.id_miembro), req.user.gymId);
  const aceptan = (canal) => miembros.filter((m) => {
    const c = comerciales.get(Number(m.id_miembro));
    return c && c.acepta_mensajes_comerciales && c.canales_autorizados.includes(canal);
  }).length;
  return res.json({
    segmento,
    dias: diasDe(segmento, dias),
    total: miembros.length,
    con_telefono: miembros.filter((m) => telefonoWhatsapp(m.telefono, m.codigo_pais_telefono)).length,
    con_correo: miembros.filter((m) => m.email).length,
    aceptan_whatsapp: aceptan('WHATSAPP'),
    aceptan_correo: aceptan('EMAIL'),
    muestra: miembros.slice(0, 10).map((m) => ({ id_miembro: m.id_miembro, nombre: m.nombre })),
  });
}));

router.post('/admin/campanas', ...soloAdmin, enBase('POST /admin/campanas', 'No pudimos crear la campaña.', async (req, res) => {
  const gymId = req.user.gymId;
  const d = await normalizar(validar(campanaBase, req.body), gymId);
  const { rows } = await pool.query(
    `INSERT INTO campana (id_gimnasio, nombre, segmento, mensaje, id_plantilla, tipo_disparo,
                          dias_inactividad, fecha_programada, estado, activa, creada_por, canal)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             CASE WHEN $8::text IS NULL THEN NULL ELSE ${A_SERVIDOR('$8')} END,
             'PROGRAMADA', TRUE, $9, $10)
     RETURNING id_campana`,
    [gymId, d.nombre, d.segmento, d.mensaje, d.id_plantilla || null, d.tipo_disparo,
     d.dias ?? null, d.tipo_disparo === 'PROGRAMADO' ? d.fecha_programada : null, req.user.id, d.canal]
  );
  const campana = await campanaDelGimnasio(pool, rows[0].id_campana, gymId);
  return res.status(201).json({ campana });
}));

router.put('/admin/campanas/:id', ...soloAdmin, enBase('PUT /admin/campanas', 'No pudimos actualizar la campaña.', async (req, res) => {
  const gymId = req.user.gymId;
  const id = idDe(req.params.id);
  const actual = await campanaDelGimnasio(pool, id, gymId);
  if (actual.estado !== 'PROGRAMADA') throw new AppError(409, 'Solo se puede editar una campaña que no se ha enviado.', 'CAMPANA_NO_EDITABLE');
  const cambios = validar(campanaBase.partial(), req.body);
  const unida = {
    nombre: actual.nombre, segmento: actual.segmento, dias: actual.dias_inactividad, canal: actual.canal,
    id_plantilla: actual.id_plantilla, mensaje: actual.mensaje, tipo_disparo: actual.tipo_disparo,
    fecha_programada: actual.fecha_programada,
    ...Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)),
  };
  const d = await normalizar(unida, gymId);
  await pool.query(
    `UPDATE campana SET nombre = $3, segmento = $4, mensaje = $5, id_plantilla = $6, tipo_disparo = $7,
                        dias_inactividad = $8,
                        fecha_programada = CASE WHEN $9::text IS NULL THEN NULL ELSE ${A_SERVIDOR('$9')} END,
                        canal = $10
      WHERE id_campana = $1 AND id_gimnasio = $2 AND estado = 'PROGRAMADA'`,
    [id, gymId, d.nombre, d.segmento, d.mensaje, d.id_plantilla || null, d.tipo_disparo,
     d.dias ?? null, d.tipo_disparo === 'PROGRAMADO' ? d.fecha_programada : null, d.canal]
  );
  return res.json({ campana: await campanaDelGimnasio(pool, id, gymId) });
}));

router.post('/admin/campanas/:id/ejecutar', ...soloAdmin, enBase('POST /admin/campanas/ejecutar', 'No pudimos ejecutar la campaña.', async (req, res) => {
  const gymId = req.user.gymId;
  const id = idDe(req.params.id);
  const actual = await campanaDelGimnasio(pool, id, gymId);
  if (actual.estado !== 'PROGRAMADA' || !actual.activa) {
    throw new AppError(409, actual.estado === 'ENVIADA' ? 'La campaña ya se envió.' : 'La campaña está cancelada.', 'CAMPANA_NO_EJECUTABLE');
  }
  const resumen = await ejecutarCampana(pool, { idCampana: id, gymId, usuarioId: req.user.id }, deps);
  if (!resumen) throw new AppError(409, 'La campaña ya se está enviando.', 'CAMPANA_NO_EJECUTABLE');

  // RQNF-16: fuera del horario de la Ley 2300 no se envia. Queda programada
  // para el primer momento permitido, y el administrador la puede editar o
  // cancelar mientras tanto.
  if (resumen.fueraDeHorario) {
    await pool.query(
      `UPDATE campana SET tipo_disparo = 'PROGRAMADO',
                          fecha_programada = ($3::timestamptz AT TIME ZONE current_setting('TimeZone'))
        WHERE id_campana = $1 AND id_gimnasio = $2 AND estado = 'PROGRAMADA'`,
      [id, gymId, resumen.siguiente]
    );
    return res.status(202).json({
      programada: true,
      message: `Ahora no se puede enviar. ${resumen.mensaje} La campaña quedó programada para el ${describirInstante(resumen.siguiente)}.`,
      siguiente: resumen.siguiente.toISOString(),
      campana: await campanaDelGimnasio(pool, id, gymId),
    });
  }
  return res.json({ resumen, campana: await campanaDelGimnasio(pool, id, gymId) });
}));

// Reintento de los destinatarios PENDIENTE (el proceso se cayo o se cerro la
// franja). Los de WhatsApp sin el modulo del servidor siguen siendo a mano.
router.post('/admin/campanas/:id/reintentar', ...soloAdmin, enBase('POST /admin/campanas/reintentar', 'No pudimos reintentar la campaña.', async (req, res) => {
  const gymId = req.user.gymId;
  const id = idDe(req.params.id);
  const actual = await campanaDelGimnasio(pool, id, gymId);
  if (actual.estado !== 'ENVIADA') throw new AppError(409, 'Solo se reintenta una campaña que ya se envió.', 'CAMPANA_NO_EJECUTABLE');
  if (actual.pendientes === 0) {
    return res.json({ message: 'No hay destinatarios pendientes.', campana: actual });
  }
  const resumen = await reanudarCampana(pool, { idCampana: id, gymId, usuarioId: req.user.id }, deps);
  if (resumen && resumen.fueraDeHorario) {
    throw new AppError(409, `Ahora no se puede enviar. ${resumen.mensaje}`, 'FUERA_DE_HORARIO', {
      siguiente: resumen.siguiente.toISOString(),
    });
  }
  const aMano = actual.canal === 'WHATSAPP' && !deps.whatsappActivo();
  return res.json({
    resumen,
    message: aMano
      ? 'El servidor no tiene WhatsApp conectado: envía los pendientes uno a uno con el botón de WhatsApp.'
      : `Reintento hecho: ${resumen.enviados} enviados, ${resumen.pendientes} pendientes, ${resumen.fallidos} fallidos y ${resumen.omitidos} omitidos.`,
    campana: await campanaDelGimnasio(pool, id, gymId),
  });
}));

router.post('/admin/campanas/:id/cancelar', ...soloAdmin, enBase('POST /admin/campanas/cancelar', 'No pudimos cancelar la campaña.', async (req, res) => {
  const gymId = req.user.gymId;
  const id = idDe(req.params.id);
  const { rowCount } = await pool.query(
    `UPDATE campana SET estado = 'CANCELADA', activa = FALSE
      WHERE id_campana = $1 AND id_gimnasio = $2 AND estado = 'PROGRAMADA'`,
    [id, gymId]
  );
  if (rowCount === 0) {
    await campanaDelGimnasio(pool, id, gymId); // 404 si no existe
    throw new AppError(409, 'Solo se puede cancelar una campaña que no se ha enviado.', 'CAMPANA_NO_EDITABLE');
  }
  return res.json({ campana: await campanaDelGimnasio(pool, id, gymId) });
}));

router.get('/admin/campanas/:id/destinatarios', ...soloAdmin, enBase('GET /admin/campanas/destinatarios', 'No pudimos cargar los destinatarios.', async (req, res) => {
  const gymId = req.user.gymId;
  const id = idDe(req.params.id);
  const campana = await campanaDelGimnasio(pool, id, gymId);
  const { rows: gym } = await pool.query('SELECT nombre FROM gimnasio WHERE id_gimnasio = $1', [gymId]);
  const rows = await destinatariosDeCampana(pool, id, gymId);
  const conGimnasio = { ...campana, gimnasio: gym[0] ? gym[0].nombre : null };
  return res.json({
    campana,
    horario: horarioAhora(),
    destinatarios: rows.map((r) => ({
      id_campana_destinatario: r.id_campana_destinatario,
      id_miembro: r.id_miembro,
      nombre: r.nombre,
      estado_envio: r.estado_envio,
      // RQNF-16: por que no se le envio (OMITIDO) o por que sigue esperando.
      motivo: r.motivo || null,
      fecha_envio: r.fecha_envio,
      telefono: telefonoWhatsapp(r.telefono, r.codigo_pais_telefono),
      email: r.email,
      // El texto para enviar a mano, con los datos de hoy y el enlace de baja.
      mensaje: textoParaMiembro(conGimnasio, r, gymId),
    })),
  });
}));

// El mensaje lo arma el servidor (con el enlace de baja); si el panel manda
// uno, se ignora: queda registrado lo que de verdad se abre en WhatsApp.
const envioManualSchema = z.object({
  mensaje: z.string().trim().max(2000).optional(),
});

/**
 * Constancia de un envio a mano por WhatsApp. El panel la pide ANTES de
 * abrir el chat (RQNF-16): el servidor revisa la ley con la fila del
 * destinatario bloqueada y, si se puede, deja la constancia y devuelve el
 * texto y el telefono para wa.me. Un doble clic no duplica la constancia
 * (200 con duplicado: true).
 */
router.post('/admin/campanas/:id/destinatarios/:idMiembro/enviado', ...soloAdmin, enBase('POST /admin/campanas/enviado', 'No pudimos dejar constancia del envío.', async (req, res) => {
  const gymId = req.user.gymId;
  const id = idDe(req.params.id);
  const idMiembro = idDe(req.params.idMiembro, 'miembro');
  validar(envioManualSchema, req.body);
  const campana = await campanaDelGimnasio(pool, id, gymId);
  if (campana.canal !== 'WHATSAPP') {
    throw new AppError(409, 'Solo las campañas por WhatsApp se envían a mano.', 'CAMPANA_NO_EJECUTABLE');
  }
  if (campana.estado !== 'ENVIADA') {
    throw new AppError(409, 'La campaña todavía no se ha ejecutado.', 'CAMPANA_NO_EJECUTABLE');
  }
  const { rows: gym } = await pool.query('SELECT nombre FROM gimnasio WHERE id_gimnasio = $1', [gymId]);
  const r = await registrarEnvioManual(pool, {
    campana: { ...campana, gimnasio: gym[0] ? gym[0].nombre : null }, gymId, idMiembro, usuarioId: req.user.id,
  }, deps);
  if (!r) throw new AppError(404, 'Ese miembro no es destinatario de la campaña.', 'NOT_FOUND');
  if (r.error) {
    throw new AppError(409, r.error.mensaje, 'CONTACTO_NO_PERMITIDO', {
      motivo: r.error.motivo,
      siguiente: r.error.siguiente ? r.error.siguiente.toISOString() : null,
    });
  }
  return res.status(r.duplicado ? 200 : 201).json(r);
}));

module.exports = router;
module.exports.ejecutarVencidas = ejecutarVencidas;
module.exports.reanudarPendientes = reanudarPendientes;
module.exports.setDeps = (nuevas) => { deps = { ...deps, ...nuevas }; };
