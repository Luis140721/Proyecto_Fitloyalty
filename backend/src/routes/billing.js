/**
 * routes/billing.js
 *
 * Endpoints relacionados con la suscripcion del gimnasio.
 *
 *   GET /api/billing/trial-status  -> estado del trial (vigente o vencido) del gym del usuario
 *
 * Handler con asyncHandler.
 */
const express = require('express');
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { trialStatus } = require('../lib/trial');

const router = express.Router();

router.get('/billing/trial-status', authenticate, asyncHandler(async (req, res) => {
  const gymId = req.user.gymId;
  if (!gymId) throw new AppError(403, 'Usuario sin gimnasio asignado', 'NO_GYM');

  try {
    const { rows } = await pool.query(
      'SELECT id_gimnasio, nombre, activo, trial_ends_at FROM gimnasio WHERE id_gimnasio = $1',
      [gymId]
    );
    const gym = rows[0];
    if (!gym) throw new AppError(404, 'Gimnasio no encontrado', 'GYM_NOT_FOUND');

    const status = trialStatus(gym);
    return res.json({
      gym: { id: gym.id_gimnasio, nombre: gym.nombre, active: gym.activo },
      trial: status,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /billing/trial-status] Error:', err.message);
    throw new AppError(503, 'No pudimos consultar el estado del trial. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

module.exports = router;