/**
 * lib/accesos.js
 *
 * Registro de los accesos que el check-in bloquea (membresia vencida o sin
 * plan) para que el administrador se entere desde la campana (RQF-06).
 *
 * Se guarda en la tabla `notificacion`, que ya tiene `id_miembro` y `leida`,
 * y NO en `checkin`: asi un intento bloqueado nunca se cuenta como asistencia
 * ni afecta el dashboard, las rachas ni la deteccion de abandono.
 */

// La tabla `notificacion` tiene un CHECK que solo admite los tipos ALERTA, RETO,
// CAMPANA y SISTEMA. Los accesos bloqueados se guardan como ALERTA y se
// distinguen por el titulo.
const TIPO_ACCESO_BLOQUEADO = 'ALERTA';
const TITULO_ACCESO_BLOQUEADO = 'Acceso bloqueado';

// Si la recepcion escanea varias veces seguidas el mismo carnet, solo se deja
// un aviso por miembro en esta ventana.
const VENTANA_MIN = 10;

const MOTIVOS = {
  VENCIDA: 'su membresia esta vencida',
  SIN_PLAN: 'no tiene un plan activo',
};

/**
 * Deja constancia de un acceso bloqueado. Nunca lanza: si no se pudo registrar
 * el aviso, el check-in igual debe responderle a la recepcion.
 *
 * @returns {Promise<boolean>} true si se creo un aviso nuevo.
 */
async function registrarAccesoBloqueado(pool, { gymId, idMiembro, nombre, motivo }) {
  try {
    const texto = MOTIVOS[motivo] || MOTIVOS.VENCIDA;
    const { rowCount } = await pool.query(
      `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje)
       SELECT $1::int, $2::int, $3::varchar, $4::varchar, $5::text
        WHERE NOT EXISTS (
          SELECT 1 FROM notificacion
           WHERE id_gimnasio = $1 AND id_miembro = $2 AND tipo = $3
             AND titulo = $7
             AND leida = FALSE
             AND fecha_creacion > NOW() - ($6 || ' minutes')::interval
        )`,
      [gymId, idMiembro, TIPO_ACCESO_BLOQUEADO,
       TITULO_ACCESO_BLOQUEADO,
       `${nombre} intento ingresar y se bloqueo: ${texto}.`,
       String(VENTANA_MIN), TITULO_ACCESO_BLOQUEADO]
    );
    return rowCount > 0;
  } catch (err) {
    console.error('[accesos] No se pudo registrar el acceso bloqueado:', err.message);
    return false;
  }
}

module.exports = { registrarAccesoBloqueado, TIPO_ACCESO_BLOQUEADO, TITULO_ACCESO_BLOQUEADO, VENTANA_MIN };
