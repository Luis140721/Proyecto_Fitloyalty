/**
 * routes/notificaciones.js
 *
 *   GET  /api/admin/notificaciones          -> avisos accionables del gimnasio
 *   POST /api/admin/notificaciones/enviado  -> deja constancia de un envio
 *
 * La campana del encabezado esta presente en todas las pantallas, asi que la
 * consulta tiene que ser barata: unas pocas consultas cortas y nada mas. Por
 * eso no se reutiliza /admin/dashboard, que hace una decena para las graficas.
 *
 * Los avisos no salen de la tabla `notificacion` (que nadie escribe): se
 * derivan del estado real de los planes y de los ingresos, asi que lo que ve
 * el usuario siempre corresponde con lo que hay en la base.
 *
 * Cada gimnasio decide cuando quiere que le avisen. Los umbrales salen de su
 * propia configuracion:
 *
 *   config_gimnasio.recordatorio_cobro_activo      apaga los avisos de cobro
 *   config_gimnasio.dias_recordatorio_default      con cuantos dias de
 *                                                  anticipacion avisar
 *   configuracion_gimnasio.umbral_alerta_amarilla  dias sin venir para la
 *                                                  alerta amarilla
 *   configuracion_gimnasio.umbral_alerta_roja      dias sin venir para la
 *                                                  alerta roja
 *
 * Los avisos "en riesgo" ya no se calculan aqui: salen de las alertas
 * PENDIENTE que deja el motor diario (jobs/abandono.js, RQF-08).
 */
const express = require('express');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { ULTIMO_PLAN } = require('../lib/planes');
const { telefonoWhatsapp, mensajeParaMiembro } = require('../lib/mensajes');
const { TIPO_ACCESO_BLOQUEADO, TITULO_ACCESO_BLOQUEADO } = require('../lib/accesos');
const { TITULO_RETO_COMPLETADO } = require('../lib/retos');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');
// RQNF-16 (Ley 2300): solo los usa POST /admin/notificaciones/enviado.
const { clasificarTipo, ahora: relojLey2300, DIAS_AVISO_VENCIDA } = require('../lib/contacto-legal');
const { bloquearContacto, evaluarContacto, registrarEnvio } = require('../lib/contacto-miembro');
const { pieBaja } = require('../lib/baja-mensajes');

const router = express.Router();

// Valores por defecto si el gimnasio todavia no ha tocado su configuracion.
const POR_DEFECTO = { diasAviso: 7, diasRiesgo: 7, diasRiesgoAlto: 15 };

// Tope de avisos por categoria: la campana es un resumen, no un listado.
const TOPE = 5;

const enDias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/**
 * La frase de cada aviso del plan que va dentro de mensajeParaMiembro. La
 * usan la campana (GET) y la constancia del envio (POST), para que el texto
 * que se propone y el que se registra sean el mismo (RQNF-16).
 *   vencida           dias desde el vencimiento
 *   por-vencer        dias que faltan
 *   acceso-bloqueado  congelada, sin plan o dias desde el vencimiento
 */
function datoAviso(tipo, { dias, congelada = false, sinPlan = false } = {}) {
  if (tipo === 'vencida') return dias === 0 ? 'hoy' : `hace ${enDias(dias)}`;
  if (tipo === 'por-vencer') return dias === 0 ? 'hoy' : `en ${enDias(dias)}`;
  if (tipo === 'acceso-bloqueado') {
    if (congelada) return 'tu membresia esta congelada';
    if (sinPlan) return 'no tienes un plan activo';
    return `tu plan vencio ${datoAviso('vencida', { dias })}`;
  }
  return null;
}

/** Lee los umbrales del gimnasio; si algo falta, usa los valores por defecto. */
async function leerUmbrales(gymId) {
  const [cobro, alertas] = await Promise.all([
    pool.query(
      `SELECT recordatorio_cobro_activo, dias_recordatorio_default
         FROM config_gimnasio WHERE id_gimnasio = $1`,
      [gymId]
    ),
    pool.query(
      `SELECT umbral_alerta_amarilla, umbral_alerta_roja, dias_aviso_vencimiento
         FROM configuracion_gimnasio WHERE id_gimnasio = $1`,
      [gymId]
    ),
  ]);

  const c = cobro.rows[0] || {};
  const a = alertas.rows[0] || {};

  return {
    recordatoriosActivos: c.recordatorio_cobro_activo !== false,
    // El valor que el dueno edita en Configuracion manda sobre el de la otra
    // tabla, que no tiene pantalla propia.
    diasAviso: Number(c.dias_recordatorio_default) || Number(a.dias_aviso_vencimiento) || POR_DEFECTO.diasAviso,
    diasRiesgo: Number(a.umbral_alerta_amarilla) || POR_DEFECTO.diasRiesgo,
    diasRiesgoAlto: Number(a.umbral_alerta_roja) || POR_DEFECTO.diasRiesgoAlto,
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/notificaciones
// ---------------------------------------------------------------------------
router.get(
  '/admin/notificaciones',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;

    try {
      const umbrales = await leerUmbrales(gymId);

      const { rows: gimnasio } = await pool.query(
        'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );
      const nombreGym = gimnasio[0]?.nombre || 'tu gimnasio';

      // Los avisos de cobro se pueden apagar desde Configuracion; los de
      // inactividad no, porque son de retencion y no de plata.
      const vacio = { rows: [] };

      const [bloqueados, vencidas, porVencer, enRiesgo, retosCompletados] = await Promise.all([
        // Intentos de ingreso bloqueados de las ultimas 24 h que nadie ha marcado
        // como vistos. Si el miembro ya renovo, el aviso deja de aplicar solo.
        // Solo los avisos para el gimnasio: los mensajes para la app del
        // miembro (destinatario MIEMBRO, migracion 016) no salen en la campana.
        pool.query(
          `SELECT n.id_notificacion, mb.id_miembro, mb.nombre, mb.telefono, mb.codigo_pais_telefono,
                  GREATEST(0, EXTRACT(EPOCH FROM (NOW() - n.fecha_creacion)) / 60)::int AS minutos,
                  (CURRENT_DATE - pc.fecha_fin)::int AS dias_vencida,
                  (pc.congelado_desde IS NOT NULL) AS congelada
             FROM notificacion n
             INNER JOIN miembro mb ON mb.id_miembro = n.id_miembro AND mb.id_gimnasio = n.id_gimnasio
             LEFT JOIN ${ULTIMO_PLAN} pc ON pc.id_miembro = mb.id_miembro
            WHERE n.id_gimnasio = $1 AND n.destinatario = 'GIMNASIO'
              AND n.tipo = $2 AND n.titulo = $4 AND n.leida = FALSE
              AND n.fecha_creacion > NOW() - INTERVAL '24 hours'
              AND (pc.fecha_fin IS NULL OR pc.fecha_fin < CURRENT_DATE OR pc.congelado_desde IS NOT NULL)
            ORDER BY n.fecha_creacion DESC
            LIMIT $3`,
          [gymId, TIPO_ACCESO_BLOQUEADO, TOPE, TITULO_ACCESO_BLOQUEADO]
        ),

        // Vencidas: RQNF-16, solo hasta DIAS_AVISO_VENCIDA dias despues del
        // vencimiento son aviso del plan; es la misma regla del POST /enviado.
        umbrales.recordatoriosActivos
          ? pool.query(
              `SELECT mb.id_miembro, mb.nombre, mb.telefono, mb.codigo_pais_telefono,
                      (CURRENT_DATE - pc.fecha_fin)::int AS dias
                 FROM ${ULTIMO_PLAN} pc
                 INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
                WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
                  AND pc.fecha_fin < CURRENT_DATE
                  AND pc.fecha_fin >= CURRENT_DATE - $3::int
                  AND pc.congelado_desde IS NULL
                ORDER BY pc.fecha_fin DESC
                LIMIT $2`,
              [gymId, TOPE, DIAS_AVISO_VENCIDA]
            )
          : vacio,

        umbrales.recordatoriosActivos
          ? pool.query(
              `SELECT mb.id_miembro, mb.nombre, mb.telefono, mb.codigo_pais_telefono,
                      (pc.fecha_fin - CURRENT_DATE)::int AS dias
                 FROM ${ULTIMO_PLAN} pc
                 INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
                WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
                  AND pc.fecha_fin >= CURRENT_DATE
                  AND pc.congelado_desde IS NULL
                  AND pc.fecha_fin <= CURRENT_DATE + ($2 || ' days')::interval
                ORDER BY pc.fecha_fin ASC
                LIMIT $3`,
              [gymId, umbrales.diasAviso, TOPE]
            )
          : vacio,

        // Alertas de abandono que dejo el motor diario (jobs/abandono.js): las
        // rojas primero, y dentro de cada nivel quien lleva mas dias.
        pool.query(
          `SELECT a.id_alerta, a.nivel, a.dias_inactivo AS dias,
                  m.id_miembro, m.nombre, m.telefono, m.codigo_pais_telefono
             FROM alerta_abandono a
             INNER JOIN miembro m ON m.id_miembro = a.id_miembro AND m.id_gimnasio = a.id_gimnasio
            WHERE a.id_gimnasio = $1 AND a.estado = 'PENDIENTE' AND m.activo = TRUE
            ORDER BY (a.nivel = 'ROJA') DESC, a.dias_inactivo DESC
            LIMIT $2`,
          [gymId, TOPE]
        ),

        // Retos completados (RQF-12) de los ultimos 7 dias que nadie ha marcado
        // como vistos: el administrador entrega la recompensa y puede felicitar
        // al miembro por WhatsApp. Solo el aviso del gimnasio: el mensaje que le
        // llega al miembro (destinatario MIEMBRO) es otra fila y no sale aqui.
        // Si la consulta falla, la campana sigue.
        pool.query(
          `SELECT n.id_notificacion, n.mensaje AS texto_reto, mb.id_miembro, mb.nombre,
                  mb.telefono, mb.codigo_pais_telefono
             FROM notificacion n
             INNER JOIN miembro mb ON mb.id_miembro = n.id_miembro AND mb.id_gimnasio = n.id_gimnasio
            WHERE n.id_gimnasio = $1 AND n.destinatario = 'GIMNASIO'
              AND n.tipo = 'RETO' AND n.titulo = $2 AND n.leida = FALSE
              AND n.fecha_creacion > NOW() - INTERVAL '7 days'
            ORDER BY n.fecha_creacion DESC
            LIMIT $3`,
          [gymId, TITULO_RETO_COMPLETADO, TOPE]
        ).catch(() => vacio),
      ]);

      const armar = (fila, tipo, icono, titulo, detalle, textoMensaje) => ({
        id: `${tipo}-${fila.id_miembro}`,
        tipo,
        icono,
        titulo,
        detalle,
        idMiembro: fila.id_miembro,
        nombreMiembro: fila.nombre,
        telefono: telefonoWhatsapp(fila.telefono, fila.codigo_pais_telefono),
        mensaje: mensajeParaMiembro(tipo, nombreGym, fila.nombre, textoMensaje),
      });

      // Quien ya aparece como acceso bloqueado no se repite como "vencida".
      const conBloqueo = new Set(bloqueados.rows.map((r) => r.id_miembro));

      const hace = (min) => (min < 1 ? 'hace menos de un minuto'
        : min < 60 ? `hace ${min} min`
        : `hace ${Math.floor(min / 60)} h`);

      const avisos = [
        ...bloqueados.rows.map((r) => ({
          ...armar(r, 'acceso-bloqueado', 'block',
            `${r.nombre} intento ingresar y fue bloqueado`,
            `${r.congelada ? 'Membresia congelada' : r.dias_vencida === null ? 'Sin plan activo' : 'Membresia vencida'} · ${hace(r.minutos)}`,
            datoAviso('acceso-bloqueado', { dias: r.dias_vencida, congelada: r.congelada, sinPlan: r.dias_vencida === null })),
          id: `acceso-bloqueado-${r.id_notificacion}`,
          idNotificacion: r.id_notificacion,
        })),
        ...vencidas.rows.filter((r) => !conBloqueo.has(r.id_miembro)).map((r) =>
          armar(r, 'vencida', 'event_busy',
            `La membresia de ${r.nombre} vencio`,
            r.dias === 0 ? 'Vencio hoy' : `Hace ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`,
            datoAviso('vencida', { dias: r.dias }))
        ),
        ...porVencer.rows.map((r) =>
          armar(r, 'por-vencer', 'schedule',
            `${r.nombre} renueva pronto`,
            r.dias === 0 ? 'Vence hoy' : `En ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`,
            datoAviso('por-vencer', { dias: r.dias }))
        ),
        ...enRiesgo.rows.map((r) => ({
          ...armar(r, 'riesgo', 'trending_down',
            r.nivel === 'ROJA' ? `Alerta roja: ${r.nombre} dejo de venir` : `${r.nombre} lleva tiempo sin venir`,
            `${r.dias} ${r.dias === 1 ? 'dia' : 'dias'} sin ingresar`,
            `${r.dias} dias`),
          id: `riesgo-${r.id_miembro}`,
          nivel: r.nivel,
          // Para que el envio quede ligado a la alerta (envio_mensaje.id_alerta).
          idAlerta: r.id_alerta,
        })),
        ...((retosCompletados && retosCompletados.rows) || []).map((r) => {
          const reto = (/«([^»]+)»/.exec(r.texto_reto || '') || [])[1] || 'del gimnasio';
          return {
            ...armar(r, 'reto-completado', 'emoji_events',
              `${r.nombre} completó un reto`,
              r.texto_reto || 'Reto completado',
              `«${reto}»`),
            id: `reto-completado-${r.id_notificacion}`,
            idNotificacion: r.id_notificacion,
          };
        }),
      ];

      return res.json({ total: avisos.length, avisos, umbrales });
    } catch (err) {
      console.error('[GET /admin/notificaciones] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar los avisos. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/notificaciones/acceso-bloqueado/:id/leida
// ---------------------------------------------------------------------------
router.post(
  '/admin/notificaciones/acceso-bloqueado/:id/leida',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    try {
      const { rowCount } = await pool.query(
        `UPDATE notificacion SET leida = TRUE
          WHERE id_notificacion = $1 AND id_gimnasio = $2 AND destinatario = 'GIMNASIO'
            AND tipo = $3 AND titulo = $4`,
        [id, req.user.gymId, TIPO_ACCESO_BLOQUEADO, TITULO_ACCESO_BLOQUEADO]
      );
      if (rowCount === 0) throw new AppError(404, 'Aviso no encontrado.', 'NOT_FOUND');
      return res.json({ message: 'Aviso marcado como visto.' });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/notificaciones/acceso-bloqueado/:id/leida] Error:', err.message);
      throw new AppError(503, 'No pudimos marcar el aviso. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/notificaciones/reto/:id/leida  (RQF-12)
// ---------------------------------------------------------------------------
router.post(
  '/admin/notificaciones/reto/:id/leida',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');
    try {
      const { rowCount } = await pool.query(
        `UPDATE notificacion SET leida = TRUE
          WHERE id_notificacion = $1 AND id_gimnasio = $2 AND destinatario = 'GIMNASIO'
            AND tipo = 'RETO' AND titulo = $3`,
        [id, req.user.gymId, TITULO_RETO_COMPLETADO]
      );
      if (rowCount === 0) throw new AppError(404, 'Aviso no encontrado.', 'NOT_FOUND');
      return res.json({ message: 'Aviso marcado como visto.' });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/notificaciones/reto/:id/leida] Error:', err.message);
      throw new AppError(503, 'No pudimos marcar el aviso. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/notificaciones/enviado
// ---------------------------------------------------------------------------
// RQF-09: cada envio queda en envio_mensaje con su fecha y su estado.
// - canal: solo los tipos que admite el CHECK de canal_comunicacion en
//   produccion (EMAIL, WHATSAPP). SMS lo admitia Docker, no produccion.
// - mensaje: el texto que propone el panel. Es obligatorio. En un mensaje
//   comercial es el que va a mensaje_copiado (NOT NULL: la constancia de lo
//   que se dijo). En un AVISO confirmado NO se usa: la constancia guarda el
//   texto de la plantilla del servidor (mensajeParaMiembro con datoAviso).
// - idAlerta: opcional, la alerta de abandono que motivo el mensaje.
// - antesDeAbrir: el panel pide la constancia ANTES de abrir WhatsApp
//   (RQNF-16) y abre el chat con el `mensaje` que devuelve esta respuesta: el
//   de la plantilla si es AVISO, o el suyo con el enlace de baja al final si
//   es comercial. Lo que el administrador envie al final desde su WhatsApp el
//   sistema no lo puede ver.
//
// RQNF-16 (Ley 2300 de 2023): antes de registrar se revisa que se pueda
// contactar al miembro (lib/contacto-legal.js), con un bloqueo por miembro
// para que dos envios a la vez no pasen los dos la regla de "una vez al dia".
// Los avisos del plan (tipo vencida, por-vencer, acceso-bloqueado) son aviso
// del contrato: horario y frecuencia, por WhatsApp. Lo demas (en riesgo, reto
// completado o sin tipo) es comercial: ademas pide que el miembro haya
// aceptado mensajes comerciales por ese canal. Si no se puede, responde 409
// CONTACTO_NO_PERMITIDO con el motivo y no guarda nada.
//
// La clase no se cree del `tipo` que manda el panel (claseDelEnvio): un aviso
// solo es aviso si el plan del miembro de verdad esta en esa situacion. Si no
// (p. ej. tipo 'vencida' con un plan al dia), se trata como COMERCIAL.
const envioSchema = z.object({
  idMiembro: z.coerce.number().int().positive(),
  canal: z.enum(['WHATSAPP', 'EMAIL']).default('WHATSAPP'),
  tipo: z.string().max(40).optional(),
  mensaje: z.string({ required_error: 'Falta el mensaje que se envio.' })
    .trim()
    .min(1, 'Falta el mensaje que se envio.')
    .max(2000, 'El mensaje no puede superar 2000 caracteres.'),
  idAlerta: z.coerce.number().int().positive().optional(),
  antesDeAbrir: z.boolean().optional(),
});

/**
 * Devuelve el id_canal activo del gimnasio para el tipo pedido y lo crea si
 * todavia no hay uno activo. canal_comunicacion es un catalogo por gimnasio y
 * los gimnasios reales no traen filas, asi que se crea la primera vez que se
 * envia. Un canal inactivo no se usa: si es el unico, se crea uno activo.
 *
 * Solo usa columnas que existen tanto en produccion (ConsultasDB) como en
 * Docker (migracion 002): nombre_remitente, credenciales_json y es_principal
 * no existen en Docker y para wa.me no significan nada (el envio lo hace el
 * telefono del gimnasio).
 *
 * La tabla no tiene restriccion unica por (id_gimnasio, tipo). Para que dos
 * envios a la vez no creen dos canales, antes de crear se toma un bloqueo de
 * la transaccion por gimnasio (pg_advisory_xact_lock, se suelta solo con el
 * COMMIT o el ROLLBACK) y se vuelve a buscar: la segunda peticion espera y
 * encuentra el canal que creo la primera.
 */
async function canalDelGimnasio(client, gymId, tipo) {
  const buscar = () => client.query(
    `SELECT id_canal FROM canal_comunicacion
      WHERE id_gimnasio = $1 AND tipo = $2 AND activo = TRUE
      ORDER BY id_canal
      LIMIT 1`,
    [gymId, tipo]
  );

  let { rows } = await buscar();
  if (rows.length > 0) return rows[0].id_canal;

  await client.query("SELECT pg_advisory_xact_lock(hashtext('canal_comunicacion'), $1)", [gymId]);
  ({ rows } = await buscar());
  if (rows.length > 0) return rows[0].id_canal;

  const { rows: nuevo } = await client.query(
    `INSERT INTO canal_comunicacion (id_gimnasio, tipo, activo)
     VALUES ($1, $2, TRUE)
     RETURNING id_canal`,
    [gymId, tipo]
  );
  return nuevo[0].id_canal;
}

/**
 * RQNF-16: la clase del envio la decide el servidor. Un tipo de aviso
 * ('vencida', 'por-vencer'/'vencimiento', 'acceso-bloqueado') solo se acepta
 * como AVISO si el ultimo plan del miembro lo confirma, con las mismas reglas
 * de la campana del panel (un miembro inactivo no confirma ninguno):
 *   - vencida: el plan vencio (fecha_fin < hoy) hace DIAS_AVISO_VENCIDA dias
 *     o menos, y no esta congelado. Despues de ese plazo ya no es un aviso
 *     del contrato sino un mensaje para recuperar al cliente (comercial);
 *   - por vencer: vence entre hoy y los dias de aviso del gimnasio, sin congelar;
 *   - acceso bloqueado: hay un aviso de ingreso bloqueado de las ultimas 24 h
 *     y el miembro sigue sin poder entrar (vencido, sin plan o congelado).
 * Si no se confirma, es COMERCIAL (pide la aceptacion de mensajes comerciales).
 * Devuelve { clase, pedida, razon, plantilla, dato }: `razon` dice por que no
 * se confirmo; `plantilla` y `dato` arman el texto del aviso (datoAviso).
 */
async function claseDelEnvio({ tipo, idMiembro, gymId }) {
  const pedida = clasificarTipo(tipo);
  if (pedida !== 'AVISO') return { clase: 'COMERCIAL', pedida };
  const t = String(tipo).toLowerCase();
  const no = (razon) => ({ clase: 'COMERCIAL', pedida, razon });
  const { rows } = await pool.query(
    `SELECT m.activo,
            (pc.id_miembro IS NULL) AS sin_plan,
            (pc.congelado_desde IS NOT NULL) AS congelada,
            (pc.fecha_fin IS NOT NULL AND pc.fecha_fin < CURRENT_DATE) AS vencida,
            CASE WHEN pc.fecha_fin IS NULL THEN NULL ELSE (pc.fecha_fin - CURRENT_DATE)::int END AS dias_para_vencer
       FROM miembro m
       LEFT JOIN ${ULTIMO_PLAN} pc ON pc.id_miembro = m.id_miembro
      WHERE m.id_miembro = $1 AND m.id_gimnasio = $2`,
    [idMiembro, gymId]
  );
  const p = rows[0];
  if (!p) return no('el miembro no tiene un plan');
  // Como la campana (mb.activo = TRUE en vencidas y por vencer; el check-in solo
  // registra ingresos bloqueados de activos): un inactivo no confirma avisos.
  if (p.activo === false) return no('el miembro está inactivo');
  const sinPlan = p.sin_plan === true || p.dias_para_vencer === null;
  const congelada = p.congelada === true;
  const si = (plantilla, datos) => ({ clase: 'AVISO', pedida, plantilla, dato: datoAviso(plantilla, datos) });

  if (t === 'vencida') {
    if (sinPlan) return no('el miembro no tiene un plan');
    if (congelada) return no('la membresía está congelada');
    if (p.vencida !== true) return no('el plan no está vencido');
    const dias = -p.dias_para_vencer;
    if (dias > DIAS_AVISO_VENCIDA) return no(`el plan venció hace más de ${DIAS_AVISO_VENCIDA} días`);
    return si('vencida', { dias });
  }
  if (t === 'por-vencer' || t === 'vencimiento') {
    if (sinPlan) return no('el miembro no tiene un plan');
    if (congelada) return no('la membresía está congelada');
    if (p.vencida === true) return no('el plan ya venció');
    const { diasAviso } = await leerUmbrales(gymId);
    if (p.dias_para_vencer > diasAviso) return no(`el plan no vence en los próximos ${diasAviso} días`);
    return si('por-vencer', { dias: p.dias_para_vencer });
  }
  if (t === 'acceso-bloqueado') {
    if (!(sinPlan || congelada || p.vencida === true)) return no('el miembro tiene el plan al día');
    const { rows: bloqueo } = await pool.query(
      `SELECT 1 FROM notificacion
        WHERE id_gimnasio = $1 AND id_miembro = $2 AND destinatario = 'GIMNASIO'
          AND tipo = $3 AND titulo = $4
          AND fecha_creacion > NOW() - INTERVAL '24 hours'
        LIMIT 1`,
      [gymId, idMiembro, TIPO_ACCESO_BLOQUEADO, TITULO_ACCESO_BLOQUEADO]
    );
    if (bloqueo.length === 0) return no('no hubo un ingreso bloqueado en las últimas 24 horas');
    return si('acceso-bloqueado', { dias: sinPlan ? null : -p.dias_para_vencer, congelada, sinPlan });
  }
  return no('ese tipo de aviso no existe');
}

router.post(
  '/admin/notificaciones/enviado',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const r = envioSchema.safeParse(req.body || {});
    if (!r.success) throw new AppError(400, formatZodError(r.error), 'VALIDATION_ERROR');
    const { idMiembro, canal, tipo, mensaje, idAlerta, antesDeAbrir } = r.data;
    const gymId = req.user.gymId;

    // Todo dentro del try: si la base no responde (tambien al pedir la
    // conexion), la respuesta es 503 y no un 500 generico.
    let client;
    try {
      const { rows: existe } = await pool.query(
        'SELECT id_miembro, nombre FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
        [idMiembro, gymId]
      );
      if (existe.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

      // RQNF-16: el servidor confirma si de verdad es un aviso del plan.
      const { clase, pedida, razon, plantilla, dato } = await claseDelEnvio({ tipo, idMiembro, gymId });

      // La alerta tiene que ser de ese miembro y de este gimnasio.
      if (idAlerta) {
        const { rows: alerta } = await pool.query(
          'SELECT id_alerta FROM alerta_abandono WHERE id_alerta = $1 AND id_miembro = $2 AND id_gimnasio = $3',
          [idAlerta, idMiembro, gymId]
        );
        if (alerta.length === 0) throw new AppError(404, 'Alerta no encontrada.', 'ALERT_NOT_FOUND');
      }

      client = await pool.connect();
      await client.query('BEGIN');

      // RQNF-16: con el bloqueo por miembro, el segundo envio a la vez ya ve
      // el primero en el historial.
      const instante = relojLey2300();
      await bloquearContacto(client, idMiembro);
      const decision = await evaluarContacto(client, { miembro: existe[0], gymId, canal, clase, instante });
      if (!decision.puede) {
        const noConfirmado = pedida === 'AVISO' && clase === 'COMERCIAL';
        throw new AppError(409, noConfirmado
          ? `${decision.mensaje} (No es un aviso del plan: ${razon}, así que se trata como un mensaje comercial.)`
          : decision.mensaje, 'CONTACTO_NO_PERMITIDO', {
          motivo: decision.motivo,
          clase,
          aviso_no_confirmado: noConfirmado,
          siguiente: decision.siguiente ? decision.siguiente.toISOString() : null,
        });
      }

      const idCanal = await canalDelGimnasio(client, gymId, canal);

      // El texto que se abre en WhatsApp y queda en la constancia:
      // - AVISO: lo arma el servidor con la misma plantilla de la campana
      //   (mensajeParaMiembro y datoAviso), no el que manda el panel; asi un
      //   "aviso" no puede llevar otro contenido. El administrador lo envia
      //   desde su WhatsApp y aun puede editarlo alli (ver la evidencia).
      // - COMERCIAL: el del panel, con el enlace de baja al final si el panel
      //   va a abrir el chat con este texto (antesDeAbrir); si el chat ya se
      //   abrio, se guarda lo que de verdad se abrio.
      let texto = mensaje;
      if (clase === 'AVISO') {
        const { rows: gym } = await client.query('SELECT nombre FROM gimnasio WHERE id_gimnasio = $1', [gymId]);
        texto = mensajeParaMiembro(plantilla, gym[0]?.nombre || 'tu gimnasio', existe[0].nombre, dato);
      } else if (antesDeAbrir) {
        texto = mensaje + pieBaja(idMiembro, gymId);
      }

      /*
       * El mensaje lo manda WhatsApp desde el telefono del gimnasio, asi que
       * el sistema no puede confirmar la entrega: solo deja constancia de que
       * se abrio el envio. Por eso el estado es ENVIADO y no ENTREGADO. La
       * fecha es la del reloj con que se decidio (lib/contacto-legal).
       */
      const envio = [await registrarEnvio(client, {
        gymId, idMiembro, idCanal, idAlerta: idAlerta || null,
        mensaje: texto, enviadoPor: req.user.id, fecha: instante,
      })];

      await client.query(
        `INSERT INTO notificacion (id_gimnasio, id_usuario, tipo, titulo, mensaje, leida)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [gymId, req.user.id, 'SISTEMA', 'Recordatorio enviado',
         `Se contacto a ${existe[0].nombre} por ${canal}${tipo ? ` (${tipo})` : ''}.`]
      );

      await client.query('COMMIT');
      return res.status(201).json({ message: 'Envio registrado.', envio: envio[0], mensaje: texto, clase, texto_del_servidor: clase === 'AVISO' });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/notificaciones/enviado] Error:', err.message);
      throw new AppError(503, 'No pudimos dejar constancia del envio.', 'DB_UNREACHABLE');
    } finally {
      if (client) client.release();
    }
  })
);

module.exports = router;

// Lo reutilizan las campanas (RQF-10) para dejar constancia de cada envio.
module.exports.canalDelGimnasio = canalDelGimnasio;
