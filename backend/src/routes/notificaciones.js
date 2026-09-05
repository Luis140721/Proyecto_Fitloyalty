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
 *   configuracion_gimnasio.umbral_alerta_amarilla  dias sin venir para
 *                                                  considerar a alguien
 *                                                  en riesgo
 */
const express = require('express');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { ULTIMO_PLAN } = require('../lib/planes');
const { telefonoWhatsapp, mensajeParaMiembro } = require('../lib/mensajes');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');

const router = express.Router();

// Valores por defecto si el gimnasio todavia no ha tocado su configuracion.
const POR_DEFECTO = { diasAviso: 7, diasRiesgo: 15 };

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
      `SELECT umbral_alerta_amarilla, dias_aviso_vencimiento
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

      const [vencidas, porVencer, enRiesgo] = await Promise.all([
        umbrales.recordatoriosActivos
          ? pool.query(
              `SELECT mb.id_miembro, mb.nombre, mb.telefono, mb.codigo_pais_telefono,
                      (CURRENT_DATE - pc.fecha_fin)::int AS dias
                 FROM ${ULTIMO_PLAN} pc
                 INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
                WHERE mb.id_gimnasio = $1 AND mb.activo = TRUE
                  AND pc.fecha_fin < CURRENT_DATE
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
                  AND pc.fecha_fin <= CURRENT_DATE + ($2 || ' days')::interval
                ORDER BY pc.fecha_fin ASC
                LIMIT $3`,
              [gymId, umbrales.diasAviso, TOPE]
            )
          : vacio,

        pool.query(
          `SELECT m.id_miembro, m.nombre, m.telefono, m.codigo_pais_telefono,
                  (CURRENT_DATE - MAX(c.fecha_hora)::date)::int AS dias
             FROM miembro m
             LEFT JOIN checkin c ON c.id_miembro = m.id_miembro
            WHERE m.id_gimnasio = $1 AND m.activo = TRUE
            GROUP BY m.id_miembro, m.nombre, m.telefono, m.codigo_pais_telefono
           HAVING MAX(c.fecha_hora) IS NULL
               OR MAX(c.fecha_hora) < NOW() - ($2 || ' days')::interval
            ORDER BY dias DESC NULLS FIRST
            LIMIT $3`,
          [gymId, umbrales.diasRiesgo, TOPE]
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

      const avisos = [
        ...vencidas.rows.map((r) =>
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
        ...enRiesgo.rows.map((r) =>
          armar(r, 'riesgo', 'trending_down',
            `${r.nombre} lleva tiempo sin venir`,
            r.dias === null ? 'Nunca ha registrado ingreso' : `${r.dias} dias sin ingresar`,
            r.dias === null ? 'un buen tiempo' : `${r.dias} dias`)
        ),
      ];

      return res.json({ total: avisos.length, avisos, umbrales });
    } catch (err) {
      console.error('[GET /admin/notificaciones] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar los avisos. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/notificaciones/enviado
// ---------------------------------------------------------------------------
const envioSchema = z.object({
  idMiembro: z.coerce.number().int().positive(),
  canal: z.enum(['WHATSAPP', 'EMAIL', 'SMS']).default('WHATSAPP'),
  tipo: z.string().max(40).optional(),
});

router.post(
  '/admin/notificaciones/enviado',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const r = envioSchema.safeParse(req.body || {});
    if (!r.success) throw new AppError(400, formatZodError(r.error), 'VALIDATION_ERROR');
    const { idMiembro, canal, tipo } = r.data;
    const gymId = req.user.gymId;

    const { rows: existe } = await pool.query(
      'SELECT nombre FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
      [idMiembro, gymId]
    );
    if (existe.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

    try {
      /*
       * El mensaje lo manda WhatsApp desde el telefono del gimnasio, asi que
       * el sistema no puede confirmar la entrega: solo deja constancia de que
       * se abrio el envio. Por eso el estado es ENVIADO y no ENTREGADO.
       */
      await pool.query(
        `INSERT INTO envio_mensaje (id_gimnasio, id_miembro, canal, estado, fecha_envio)
         VALUES ($1, $2, $3, 'ENVIADO', NOW())`,
        [gymId, idMiembro, canal]
      );

      await pool.query(
        `INSERT INTO notificacion (id_gimnasio, id_usuario, tipo, titulo, mensaje, leido)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [gymId, req.user.id, tipo || 'RECORDATORIO', 'Recordatorio enviado',
         `Se contacto a ${existe[0].nombre} por ${canal}.`]
      );

      return res.status(201).json({ message: 'Envio registrado.' });
    } catch (err) {
      console.error('[POST /admin/notificaciones/enviado] Error:', err.message);
      throw new AppError(503, 'No pudimos dejar constancia del envio.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;
