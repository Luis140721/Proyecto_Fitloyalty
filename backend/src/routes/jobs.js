/**
 * routes/jobs.js
 *
 * Endpoints administrativos para gatillar manualmente los jobs
 * automaticos. Pensado para pruebas y para "correr ya" sin esperar
 * al cron diario.
 *
 * Todos tocan solo el gimnasio del administrador que los llama (RQNF-05).
 * Los que recorren todos los gimnasios son los del cron (jobs/scheduler.js).
 *
 *   POST /api/jobs/expiracion/run
 *     body opcional: { "dryRun": true }  -> solo cuenta candidatos
 *     devuelve:       summary con conteos + detalle
 *
 *   GET /api/jobs/expiracion/preview
 *     Solo candidatos, sin envio. Equivalente a dryRun pero sin
 *     contar como envio.
 *
 *   POST /api/jobs/abandono/run
 *     body opcional: { "dryRun": true }  -> calcula las alertas sin guardarlas
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { runJob, miembrosPorVencer, diasDeVentana } = require('../jobs/expiracion');
const { runJob: runAbandono } = require('../jobs/abandono');

const router = express.Router();

// Sin gimnasio no se corre nada: en los jobs, gymId vacio quiere decir "todos".
function exigirGimnasio(req, res, next) {
    if (!req.user.gymId) return next(new AppError(403, 'Usuario sin gimnasio asignado', 'NO_GYM'));
    return next();
}

// Solo el admin del gimnasio puede disparar los jobs. NO se exponen al cliente.
router.use(authenticate, authorize('admin'), exigirGimnasio);

router.post(
    '/expiracion/run',
    asyncHandler(async (req, res) => {
        const dryRun = Boolean(req.body && req.body.dryRun);
        const summary = await runJob({ gymId: req.user.gymId, dryRun });
        res.json(summary);
    })
);

// Alertas de abandono (RQF-08): "correr ya", sin esperar a las 8:00.
router.post(
    '/abandono/run',
    asyncHandler(async (req, res) => {
        const dryRun = Boolean(req.body && req.body.dryRun);
        const resumen = await runAbandono({ gymId: req.user.gymId, dryRun });
        res.json(resumen);
    })
);

router.get(
    '/expiracion/preview',
    asyncHandler(async (req, res) => {
        const dias = await diasDeVentana(req.user.gymId);
        const candidatos = await miembrosPorVencer(dias, req.user.gymId);
        res.json({ dias, total: candidatos.length, candidatos });
    })
);

module.exports = router;
