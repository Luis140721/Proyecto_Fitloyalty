/**
 * jobs/scheduler.js
 *
 * Tareas programadas (cron) que viven dentro del mismo proceso web.
 *
 * Por que in-process y no un Render Cron Job separado:
 *   - Mantiene el codigo cerca de la logica de negocio (mismo repo, mismo
 *     proceso, mismo .env).
 *   - En el plan Free de Render hay un solo web service; agregar otro
 *     servicio implica otra URL, otra config, otra factura.
 *   - Trade-off: si el web service se reinicia justo cuando tocaba correr,
 *     se pierde esa corrida. Por eso el job es idempotente y se puede
 *     gatillar manualmente via endpoint.
 *
 * Para desactivar todo el scheduler (ej. en tests), setear
 * DISABLE_SCHEDULER=true en el env.
 */

const cron = require('node-cron');
const { runJob: runExpiracionJob } = require('./expiracion');

const DISABLED = String(process.env.DISABLE_SCHEDULER || '').toLowerCase() === 'true';

// Zona horaria de Colombia (Render usa UTC por defecto, asi que el cron
// podria dispararse a horas raras. Forzamos America/Bogota).
const TZ = 'America/Bogota';

let expiracionTask = null;
let started = false;

/**
 * Arranca el scheduler. Llamar una sola vez desde src/index.js despues de
 * que el servidor este escuchando.
 */
function start() {
    if (started) return;
    started = true;
    if (DISABLED) {
        console.log('[scheduler] DESHABILITADO por env DISABLE_SCHEDULER=true');
        return;
    }

    // Avisos de vencimiento: todos los dias a las 9:00 AM hora Colombia.
    // La expresion cron es: min hora dia mes diaSemana
    //   "0 9 * * *"  -> a las 9:00 AM todos los dias
    expiracionTask = cron.schedule('0 9 * * *', async () => {
        console.log('[scheduler] Disparando job de avisos de vencimiento...');
        try {
            const summary = await runExpiracionJob();
            console.log('[scheduler] Job de vencimiento OK:', JSON.stringify({
                encontrados: summary.encontrados,
                enVentana: summary.enVentana,
                enviados: summary.enviados,
                omitidosDuplicado: summary.omitidosDuplicado,
            }));
        } catch (err) {
            console.error('[scheduler] Error en job de vencimiento:', err.message);
        }
    }, { timezone: TZ });

    console.log(`[scheduler] Activo. Job de vencimiento programado todos los dias a las 09:00 (${TZ}).`);
}

/**
 * Detiene el scheduler (util para tests).
 */
function stop() {
    if (expiracionTask) {
        expiracionTask.stop();
        expiracionTask = null;
        started = false;
        console.log('[scheduler] Detenido.');
    }
}

module.exports = { start, stop, isStarted: () => started };
