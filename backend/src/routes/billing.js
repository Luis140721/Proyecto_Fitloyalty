/**
 * routes/billing.js
 *
 * Endpoints relacionados con la suscripcion del gimnasio.
 *
 *   GET /api/billing/trial-status  -> estado del trial (vigente o vencido) del gym del usuario
 */
const express = require('express');
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth');
const { trialStatus } = require('../lib/trial');

const router = express.Router();

router.get('/billing/trial-status', authenticate, async (req, res) => {
  const gymId = req.user.gymId;
  if (!gymId) return res.status(403).json({ error: 'Usuario sin gimnasio asignado' });

  try {
    const { rows } = await pool.query(
      'SELECT id_gimnasio, nombre, activo, trial_ends_at FROM gimnasio WHERE id_gimnasio = $1',
      [gymId]
    );
    const gym = rows[0];
    if (!gym) return res.status(404).json({ error: 'Gimnasio no encontrado' });

    const status = trialStatus(gym);
    return res.json({
      gym: { id: gym.id_gimnasio, nombre: gym.nombre, active: gym.activo },
      trial: status,
    });
  } catch (err) {
    console.error('[GET /billing/trial-status] Error:', err.message);
    return res.status(500).json({ error: 'Error al consultar el estado del trial' });
  }
});

module.exports = router;
