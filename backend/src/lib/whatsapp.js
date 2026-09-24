/**
 * backend/src/lib/whatsapp.js
 *
 * Cliente de WhatsApp Web para enviar automaticamente el QR de acceso al
 * miembro nuevo (lo llama POST /api/admin/miembros despues de crear al socio).
 *
 * -- POR QUE ESTE ARCHIVO EXISTE SEPARADO Y SE INICIALIZA "LAZY" --
 *
 *   Daniel metio esto para que cuando la recepcion registra un socio nuevo,
 *   el sistema le mande un WhatsApp con su QR de acceso. Internamente usa
 *   `whatsapp-web.js` que a su vez usa Puppeteer = necesita un Chrome
 *   instalado en la maquina.
 *
 *   En Render (free tier) NO hay Chrome, asi que si inicializamos al
 *   arrancar (`client.initialize()` en module load), el servidor se cae
 *   con "Could not find Chrome" en cada deploy.
 *
 *   Solucion: inicializacion PEREZOSA. El cliente solo arranca la primera
 *   vez que `sendWhatsAppQR` es llamado, y si falla (porque no hay Chrome,
 *   porque no se escaneo el QR, etc.) el error queda logged y el envio
 *   se omite sin tirar el proceso.
 *
 *   Ademas, con ENABLE_WHATSAPP=false el modulo se desactiva por completo
 *   (no crea el Client, no intenta nada). Util en Render mientras no se
 *   tenga Chrome alli.
 */
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Default true para no romper el flujo de Daniel en local. En Render
// normalmente va en false hasta que alguien instale Chrome alla.
const ENABLED = process.env.ENABLE_WHATSAPP !== 'false';

/**
 * Resuelve la ruta del Chrome/Chromium que Puppeteer debe usar.
 *
 * Orden de busqueda:
 *   1) PUPPETEER_EXECUTABLE_PATH en env (sirve para forzar una ruta concreta).
 *   2) require('puppeteer').executablePath() si el paquete `puppeteer`
 *      esta instalado (su postinstall descarga Chrome a PUPPETEER_CACHE_DIR
 *      o ~/.cache/puppeteer). Asi, en Render basta con tener `puppeteer`
 *      como dependencia y Render descarga Chrome en `npm install`.
 *   3) undefined -> puppeteer-core intenta descubrir un Chrome del sistema
 *      (util en dev local si tienes Chrome instalado en /usr/bin/google-chrome).
 */
function resolveChromiumPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    try {
        // `puppeteer` (no core) expone executablePath() que respeta
        // PUPPETEER_CACHE_DIR. Si no esta instalado, este require lanza.
        const puppeteer = require('puppeteer');
        if (typeof puppeteer.executablePath === 'function') {
            return puppeteer.executablePath();
        }
    } catch (e) {
        // puppeteer no instalado, seguimos al fallback
    }
    return undefined;
}

let client = null;
let isReady = false;
let isInitializing = false;
let initPromise = null;

// Registrar los listeners solo si esta habilitado.
if (ENABLED) {
    const executablePath = resolveChromiumPath();
    if (executablePath) {
        console.log('[WhatsApp] Usando Chromium en:', executablePath);
    } else {
        console.warn(
            '[WhatsApp] No se encontro Chrome/Chromium. El envio automatico ' +
            'fallara hasta que instales puppeteer o definas PUPPETEER_EXECUTABLE_PATH.'
        );
    }

    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            executablePath,            // puede ser undefined -> usa el default del sistema
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('Escanea este codigo QR con el WhatsApp de la recepcion:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        isReady = true;
        console.log('[WhatsApp] Conectado y listo para enviar mensajes automaticamente.');
    });

    client.on('auth_failure', (msg) => {
        console.error('[WhatsApp] Error de autenticacion:', msg);
    });

    client.on('disconnected', (reason) => {
        isReady = false;
        console.warn('[WhatsApp] Desconectado:', reason);
    });
} else {
    console.log('[WhatsApp] Modulo deshabilitado por env ENABLE_WHATSAPP=false.');
}

/**
 * Inicializa el cliente la primera vez que se necesita.
 * Devuelve true si quedo listo, false si fallo o esta deshabilitado.
 * Es idempotente: si ya esta inicializando, devuelve la misma promesa.
 */
async function ensureClient() {
    if (!ENABLED || !client) return false;
    if (isReady) return true;
    if (isInitializing) return initPromise ? await initPromise : false;

    isInitializing = true;
    initPromise = (async () => {
        try {
            await client.initialize();
            return isReady;
        } catch (err) {
            console.error(
                '[WhatsApp] No se pudo inicializar el cliente (probablemente falta Chrome/Puppeteer).',
                'Los envios automaticos quedaran deshabilitados hasta arreglar el entorno.',
                'Detalle:', err.message
            );
            return false;
        } finally {
            isInitializing = false;
        }
    })();
    return initPromise;
}

/**
 * Envia el QR de acceso al miembro nuevo por WhatsApp.
 * Si el modulo esta deshabilitado o falla la inicializacion, simplemente
 * loguea y sale sin tirar el proceso (asi el alta del miembro sigue
 * funcionando aunque WhatsApp este roto).
 */
async function sendWhatsAppQR(telefono, nombre, gymName, qrCodeText, qrBase64) {
    if (!ENABLED || !client) {
        console.warn('[WhatsApp] Modulo deshabilitado, se omite envio automatico.');
        return;
    }

    const ok = await ensureClient();
    if (!ok) {
        console.warn('[WhatsApp] Cliente no listo, se omite envio automatico a', nombre);
        return;
    }

    try {
        // Limpiar el numero y asegurar el formato internacional
        // (57 para Colombia si viene de 10 digitos).
        let numeroLimpio = telefono.replace(/\D/g, '');
        if (numeroLimpio.length === 10) {
            numeroLimpio = '57' + numeroLimpio;
        }
        const chatId = `${numeroLimpio}@c.us`;

        const saludo =
            `¡Hola *${nombre}*! 👋 Bienvenido a *${gymName}*. ` +
            `Tu registro ha sido exitoso. Este es tu codigo QR de acceso:`;
        await client.sendMessage(chatId, saludo);

        if (qrBase64) {
            const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');
            const media = new MessageMedia('image/png', base64Data, 'qr-acceso.png');
            await client.sendMessage(chatId, media);
        } else {
            await client.sendMessage(chatId, `Tu codigo de texto es: ${qrCodeText}`);
        }

        console.log(`[WhatsApp] Mensaje enviado exitosamente a ${nombre} (${numeroLimpio})`);
    } catch (err) {
        console.error('[WhatsApp] Error al enviar el mensaje:', err.message);
    }
}

/**
 * Envia un mensaje de texto plano a un numero. Usado por el job automatico
 * de avisos de vencimiento (jobs/expiracion.js) que necesita mandar texto
 * sin imagen de QR. La funcion es tolerante a fallos: si el modulo esta
 * deshabilitado o el cliente no esta listo, loguea y no lanza.
 */
async function sendWhatsAppText(telefono, texto) {
    if (!ENABLED || !client) {
        console.warn('[WhatsApp] Modulo deshabilitado, se omite envio de texto.');
        return;
    }
    const ok = await ensureClient();
    if (!ok) {
        console.warn('[WhatsApp] Cliente no listo, se omite envio de texto a', telefono);
        return;
    }
    try {
        let numeroLimpio = String(telefono || '').replace(/\D/g, '');
        if (numeroLimpio.length === 10) {
            numeroLimpio = '57' + numeroLimpio;
        }
        if (numeroLimpio.length < 7) {
            console.warn('[WhatsApp] Telefono invalido para envio:', telefono);
            return;
        }
        const chatId = `${numeroLimpio}@c.us`;
        await client.sendMessage(chatId, texto);
        console.log(`[WhatsApp] Texto enviado a ${numeroLimpio} (${texto.length} chars)`);
    } catch (err) {
        console.error('[WhatsApp] Error al enviar texto:', err.message);
    }
}

module.exports = {
    sendWhatsAppQR,
    sendWhatsAppText,
    isWhatsAppEnabled: () => ENABLED,
};
