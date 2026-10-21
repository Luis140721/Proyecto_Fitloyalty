/**
 * routes/jobs.js
 *
 * Endpoints administrativos para gatillar manualmente los jobs
 * automaticos. Pensado para pruebas y para "correr ya" sin esperar
 * al cron diario.
 *
 *   POST /api/jobs/expiracion/run
 *     body opcional: { "dryRun": true }  -> solo cuenta candidatos
 *     devuelve:       summary con conteos + detalle
 *
 *   GET /api/jobs/expiracion/preview
 *     Solo candidatos, sin envio. Equivalente a dryRun pero sin
 *     contar como envio.
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { runJob, miembrosPorVencer } = require('../jobs/expiracion');
const pool = require('../db/db');

const router = express.Router();

// Solo admin del gimnasio (o cualquier admin si lo corren los profes)
// pueden disparar el job manualmente. NO se expone al cliente.
router.post(
    '/expiracion/run',
    authenticate,
    authorize('admin'),
    asyncHandler(async (req, res) => {
        const dryRun = Boolean(req.body && req.body.dryRun);
        const summary = await runJob({ dryRun });
        res.json(summary);
    })
);

router.get(
    '/expiracion/preview',
    authenticate,
    authorize('admin'),
    asyncHandler(async (req, res) => {
        // Calcula dias max desde config de gyms
        const cfg = await pool.query(
            `SELECT COALESCE(MAX(dias_aviso_vencimiento), 3) AS max_dias
               FROM gimnasio WHERE activo = TRUE`
        );
        const dias = Math.min(parseInt(cfg.rows[0].max_dias || 3, 10) || 3, 30);
        const candidatos = await miembrosPorVencer(dias);
        res.json({ dias, total: candidatos.length, candidatos });
    })
);

module.exports = router;
