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
const { runJob: runAbandonoJob } = require('./abandono');

const DISABLED = String(process.env.DISABLE_SCHEDULER || '').toLowerCase() === 'true';

// Zona horaria de Colombia (Render usa UTC por defecto, asi que el cron
// podria dispararse a horas raras. Forzamos America/Bogota).
const TZ = 'America/Bogota';

let expiracionTasks = [];
let abandonoTask = null;
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

    // Avisos de vencimiento: todos los dias a las 9:00 AM y se reintenta a las
    // 3:00 PM hora Colombia (por si WhatsApp no estaba listo en la primera).
    // El job es idempotente (yaEnviado), asi que la segunda corrida solo envia
    // lo que quedo pendiente.
    // La expresion cron es: min hora dia mes diaSemana
    const correrExpiracion = async () => {
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
    };
    expiracionTasks = ['0 9 * * *', '0 15 * * *'].map(
        (expr) => cron.schedule(expr, correrExpiracion, { timezone: TZ })
    );

    // Alertas de abandono (RQF-08): una vez al dia, antes de los avisos de las
    // 9:00. El job es idempotente, asi que si el servicio estuvo dormido la
    // corrida de la manana siguiente se pone al dia sola.
    abandonoTask = cron.schedule('0 8 * * *', async () => {
        console.log('[scheduler] Disparando job de alertas de abandono...');
        try {
            const resumen = await runAbandonoJob();
            console.log('[scheduler] Job de abandono OK:', JSON.stringify(resumen));
        } catch (err) {
            console.error('[scheduler] Error en job de abandono:', err.message);
        }
    }, { timezone: TZ });

    console.log(`[scheduler] Activo. Vencimiento a las 09:00 y 15:00, abandono a las 08:00 (${TZ}).`);
}

/**
 * Detiene el scheduler (util para tests).
 */
function stop() {
    if (expiracionTasks.length) {
        expiracionTasks.forEach((t) => t.stop());
        expiracionTasks = [];
        if (abandonoTask) abandonoTask.stop();
        abandonoTask = null;
        started = false;
        console.log('[scheduler] Detenido.');
    }
}

module.exports = { start, stop, isStarted: () => started };
