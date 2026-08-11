/**
 * lib/trial.js
 *
 * Toda la logica del periodo de prueba (trial) del SaaS FitLoyalty vive aqui.
 *
 * Politica MVP:
 *   - Duracion del trial: 7 dias desde la creacion del gimnasio.
 *   - Mientras el trial este vigente y el gimnasio este activo, el admin y
 *     su staff pueden usar la app sin restricciones.
 *   - Cuando el trial vence (NOW() > trial_ends_at), las llamadas a los
 *     endpoints "de operacion" (miembros, checkin, etc.) devuelven 402
 *     Payment Required para forzar la actualizacion a un plan de pago.
 *   - El gimnasio puede tener `trial_ends_at = NULL` para representar
 *     suscripcion de pago ya activa (modo "sin trial").
 */

const TRIAL_DAYS = 7;

function trialDays() {
  const raw = process.env.TRIAL_DAYS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : TRIAL_DAYS;
}

/** Devuelve el estado del trial de un gimnasio. */
function trialStatus(gimnasio) {
  if (!gimnasio) return { active: false, expired: true, reason: 'no-gimnasio' };
  if (gimnasio.activo === false) return { active: false, expired: true, reason: 'inactivo' };

  const ends = gimnasio.trial_ends_at ? new Date(gimnasio.trial_ends_at) : null;
  if (ends === null) {
    return { active: true, expired: false, reason: 'suscrito', endsAt: null, daysLeft: null };
  }

  const now = new Date();
  const ms = ends.getTime() - now.getTime();
  const daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (ms <= 0) {
    return { active: false, expired: true, reason: 'trial-vencido', endsAt: ends.toISOString(), daysLeft: 0 };
  }
  return { active: true, expired: false, reason: 'trial-activo', endsAt: ends.toISOString(), daysLeft };
}

/**
 * Middleware que bloquea endpoints "de operacion" si el trial esta vencido.
 * Se aplica DESPUES de `authenticate` porque necesita req.user.gymId.
 *
 * - Admins y recepcionistas dentro de un gimnasio con trial vencido: 402.
 * - Gimnasio suscrito (trial_ends_at NULL): pasa.
 * - Gimnasio con trial activo: pasa.
 */
function requireActiveTrial(pool) {
  return async function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const gymId = req.user.gymId;
    if (!gymId) return res.status(403).json({ error: 'Usuario sin gimnasio asignado' });

    try {
      const { rows } = await pool.query(
        'SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );
      const gym = rows[0];
      const status = trialStatus(gym);
      req.trial = { ...status, gymId };
      if (status.expired) {
        return res.status(402).json({
          error: 'Tu prueba gratuita ha finalizado. Activa tu plan para continuar.',
          code: 'TRIAL_EXPIRED',
          trialEndsAt: status.endsAt,
        });
      }
      return next();
    } catch (err) {
      console.error('[requireActiveTrial] Error:', err.message);
      return res.status(500).json({ error: 'Error al verificar el estado del trial' });
    }
  };
}

module.exports = { trialDays, trialStatus, requireActiveTrial, TRIAL_DAYS };
