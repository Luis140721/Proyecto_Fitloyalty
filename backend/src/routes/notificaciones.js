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
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');

const router = express.Router();

// Valores por defecto si el gimnasio todavia no ha tocado su configuracion.
const POR_DEFECTO = { diasAviso: 7, diasRiesgo: 7, diasRiesgoAlto: 15 };

// Tope de avisos por categoria: la campana es un resumen, no un listado.
const TOPE = 5;

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

      const [bloqueados, vencidas, porVencer, enRiesgo] = await Promise.all([
        // Intentos de ingreso bloqueados de las ultimas 24 h que nadie ha marcado
        // como vistos. Si el miembro ya renovo, el aviso deja de aplicar solo.
        pool.query(
          `SELECT n.id_notificacion, mb.id_miembro, mb.nombre, mb.telefono, mb.codigo_pais_telefono,
                  GREATEST(0, EXTRACT(EPOCH FROM (NOW() - n.fecha_creacion)) / 60)::int AS minutos,
                  (CURRENT_DATE - pc.fecha_fin)::int AS dias_vencida,
                  (pc.congelado_desde IS NOT NULL) AS congelada
             FROM notificacion n
             INNER JOIN miembro mb ON mb.id_miembro = n.id_miembro AND mb.id_gimnasio = n.id_gimnasio
             LEFT JOIN ${ULTIMO_PLAN} pc ON pc.id_miembro = mb.id_miembro
            WHERE n.id_gimnasio = $1 AND n.tipo = $2 AND n.titulo = $4 AND n.leida = FALSE
              AND n.fecha_creacion > NOW() - INTERVAL '24 hours'
              AND (pc.fecha_fin IS NULL OR pc.fecha_fin < CURRENT_DATE OR pc.congelado_desde IS NOT NULL)
            ORDER BY n.fecha_creacion DESC
            LIMIT $3`,
          [gymId, TIPO_ACCESO_BLOQUEADO, TOPE, TITULO_ACCESO_BLOQUEADO]
        ),

        umbrales.recordatoriosActivos
          ? pool.query(
              `SELECT mb.id_miembro, mb.nombre, mb.telefono, mb.codigo_pais_telefono,
                      (CURRENT_DATE - pc.fecha_fin)::int AS dias
                 FROM ${ULTIMO_PLAN} pc
                 INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
                WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
                  AND pc.fecha_fin < CURRENT_DATE
                  AND pc.congelado_desde IS NULL
                ORDER BY pc.fecha_fin DESC
                LIMIT $2`,
              [gymId, TOPE]
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
            r.congelada ? 'tu membresia esta congelada'
              : r.dias_vencida === null ? 'no tienes un plan activo'
              : `tu plan vencio ${r.dias_vencida === 0 ? 'hoy' : `hace ${r.dias_vencida} ${r.dias_vencida === 1 ? 'dia' : 'dias'}`}`),
          id: `acceso-bloqueado-${r.id_notificacion}`,
          idNotificacion: r.id_notificacion,
        })),
        ...vencidas.rows.filter((r) => !conBloqueo.has(r.id_miembro)).map((r) =>
          armar(r, 'vencida', 'event_busy',
            `La membresia de ${r.nombre} vencio`,
            r.dias === 0 ? 'Vencio hoy' : `Hace ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`,
            r.dias === 0 ? 'hoy' : `hace ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`)
        ),
        ...porVencer.rows.map((r) =>
          armar(r, 'por-vencer', 'schedule',
            `${r.nombre} renueva pronto`,
            r.dias === 0 ? 'Vence hoy' : `En ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`,
            r.dias === 0 ? 'hoy' : `en ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}`)
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
          WHERE id_notificacion = $1 AND id_gimnasio = $2 AND tipo = $3 AND titulo = $4`,
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
// POST /api/admin/notificaciones/enviado
// ---------------------------------------------------------------------------
// RQF-09: cada envio queda en envio_mensaje con su fecha y su estado.
// - canal: solo los tipos que admite el CHECK de canal_comunicacion en
//   produccion (EMAIL, WHATSAPP). SMS lo admitia Docker, no produccion.
// - mensaje: el texto que se abrio en WhatsApp. Va a mensaje_copiado, que es
//   NOT NULL: sin el no hay constancia de que se dijo, asi que es obligatorio.
// - idAlerta: opcional, la alerta de abandono que motivo el mensaje.
const envioSchema = z.object({
  idMiembro: z.coerce.number().int().positive(),
  canal: z.enum(['WHATSAPP', 'EMAIL']).default('WHATSAPP'),
  tipo: z.string().max(40).optional(),
  mensaje: z.string({ required_error: 'Falta el mensaje que se envio.' })
    .trim()
    .min(1, 'Falta el mensaje que se envio.')
    .max(2000, 'El mensaje no puede superar 2000 caracteres.'),
  idAlerta: z.coerce.number().int().positive().optional(),
});

/**
 * Devuelve el id_canal del gimnasio para el tipo pedido y lo crea si todavia
 * no existe. canal_comunicacion es un catalogo por gimnasio y los gimnasios
 * reales no traen filas, asi que se crea la primera vez que se envia.
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
      WHERE id_gimnasio = $1 AND tipo = $2
      ORDER BY activo DESC, id_canal
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

router.post(
  '/admin/notificaciones/enviado',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const r = envioSchema.safeParse(req.body || {});
    if (!r.success) throw new AppError(400, formatZodError(r.error), 'VALIDATION_ERROR');
    const { idMiembro, canal, tipo, mensaje, idAlerta } = r.data;
    const gymId = req.user.gymId;

    const { rows: existe } = await pool.query(
      'SELECT nombre FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
      [idMiembro, gymId]
    );
    if (existe.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

    // La alerta tiene que ser de ese miembro y de este gimnasio.
    if (idAlerta) {
      const { rows: alerta } = await pool.query(
        'SELECT id_alerta FROM alerta_abandono WHERE id_alerta = $1 AND id_miembro = $2 AND id_gimnasio = $3',
        [idAlerta, idMiembro, gymId]
      );
      if (alerta.length === 0) throw new AppError(404, 'Alerta no encontrada.', 'ALERT_NOT_FOUND');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const idCanal = await canalDelGimnasio(client, gymId, canal);

      /*
       * El mensaje lo manda WhatsApp desde el telefono del gimnasio, asi que
       * el sistema no puede confirmar la entrega: solo deja constancia de que
       * se abrio el envio. Por eso el estado es ENVIADO y no ENTREGADO.
       */
      const { rows: envio } = await client.query(
        `INSERT INTO envio_mensaje (id_gimnasio, id_miembro, id_canal, id_alerta,
                                    mensaje_copiado, estado, fecha_envio, enviado_por)
         VALUES ($1, $2, $3, $4, $5, 'ENVIADO', NOW(), $6)
         RETURNING id_envio, estado, fecha_envio`,
        [gymId, idMiembro, idCanal, idAlerta || null, mensaje, req.user.id]
      );

      await client.query(
        `INSERT INTO notificacion (id_gimnasio, id_usuario, tipo, titulo, mensaje, leida)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [gymId, req.user.id, 'SISTEMA', 'Recordatorio enviado',
         `Se contacto a ${existe[0].nombre} por ${canal}${tipo ? ` (${tipo})` : ''}.`]
      );

      await client.query('COMMIT');
      return res.status(201).json({ message: 'Envio registrado.', envio: envio[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[POST /admin/notificaciones/enviado] Error:', err.message);
      throw new AppError(503, 'No pudimos dejar constancia del envio.', 'DB_UNREACHABLE');
    } finally {
      client.release();
    }
  })
);

module.exports = router;
