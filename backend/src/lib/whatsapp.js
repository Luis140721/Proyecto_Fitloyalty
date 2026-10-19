const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-gpu'
        ]
    }
});

let isReady = false;

// Este evento es el que dibuja el código QR en la terminal
client.on('qr', (qr) => {
    console.log('--- ESCANEA ESTE QR ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    isReady = true;
    console.log('¡WhatsApp conectado y listo para enviar mensajes automáticamente!');
});

client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Error de autenticación:', msg);
});

client.initialize();

async function sendWhatsAppQR(telefono, nombre, gymName, qrCodeText, qrBase64) {
    try {
        if (!isReady) {
            console.warn('[WhatsApp] El cliente aún no está listo o vinculado.');
            return;
        }

        let numeroLimpio = telefono.replace(/\D/g, '');
        if (numeroLimpio.length === 10) {
            numeroLimpio = '57' + numeroLimpio;
        }
        const chatId = `${numeroLimpio}@c.us`;

        const qrImageUrlAPI = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeText)}`;
        const mensaje = `¡Hola *${nombre}*! 👋 Bienvenido a *${gymName}*. Tu registro se ha completado con éxito.\n\n📱 *Tu tarjeta de acceso QR es la siguiente:* \n${qrImageUrlAPI}\n\n🔑 Código alternativo: *${qrCodeText}*`;
        
        await client.sendMessage(chatId, mensaje);
        console.log(`[WhatsApp] ¡Mensaje enviado con éxito a ${nombre}!`);
        
    } catch (err) {
        console.error('[WhatsApp] Error al enviar el mensaje:', err.message);
    }
}

module.exports = { sendWhatsAppQR };