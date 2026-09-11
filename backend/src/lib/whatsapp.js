const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isReady = false;

client.on('qr', (qr) => {
    console.log('Escanea este código QR con el WhatsApp de la recepción:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    isReady = true;
    console.log('¡WhatsApp conectado y listo para enviar mensajes automáticamente!');
});

client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Error de autenticación:', msg);
});

// Iniciar cliente
client.initialize();

// Función segura para enviar el mensaje con imagen QR
async function sendWhatsAppQR(telefono, nombre, gymName, qrCodeText, qrBase64) {
    try {
        if (!isReady) {
            console.warn('[WhatsApp] El cliente aún no está listo o vinculado. Omitiendo envío automático.');
            return;
        }

        // Limpiar el número y asegurar el formato internacional (ej: 57 para Colombia si viene de 10 dígitos)
        let numeroLimpio = telefono.replace(/\D/g, '');
        if (numeroLimpio.length === 10) {
            numeroLimpio = '57' + numeroLimpio; // Prefijo por defecto para Colombia
        }
        const chatId = `${numeroLimpio}@c.us`;

        const saludo = `¡Hola *${nombre}*! 👋 Bienvenido a *${gymName}*. Tu registro ha sido exitoso. Este es tu código QR de acceso:`;
        await client.sendMessage(chatId, saludo);

        if (qrBase64) {
            const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '',);
            const media = new MessageMedia('image/png', base64Data, 'qr-acceso.png');
            await client.sendMessage(chatId, media);
        } else {
            await client.sendMessage(chatId, `Tu código de texto es: ${qrCodeText}`);
        }
        
        console.log(`[WhatsApp] Mensaje enviado exitosamente a ${nombre} (${numeroLimpio})`);
    } catch (err) {
        console.error('[WhatsApp] Error al enviar el mensaje:', err.message);
    }
}

module.exports = { sendWhatsAppQR };