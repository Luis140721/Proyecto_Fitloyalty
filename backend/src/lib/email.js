/**
 * lib/email.js
 *
 * Helper de envio de correos por SMTP (nodemailer).
 * Reutilizable para: recuperacion de clave, invitacion de staff,
 * alerta de trial por vencer, etc.
 *
 * Si no hay credenciales SMTP configuradas, NO envia correo real
 * y en su lugar imprime el contenido en consola para que el flujo
 * siga siendo testeable en desarrollo.
 */
const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 5000,
    socketTimeout: 5000,
  });
  return cachedTransporter;
}

/**
 * Envía un correo. Si no hay SMTP configurado, hace fallback a consola.
 * Devuelve { delivered: bool, reason?: 'no-smtp' } para que el caller pueda
 * decidir si muestra un codigo "dev" al cliente.
 */
async function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`\n[EMAIL-DEV] Para: ${to}`);
    console.log(`[EMAIL-DEV] Asunto: ${subject}`);
    console.log(`[EMAIL-DEV] Cuerpo:\n${text}\n`);
    return { delivered: false, reason: 'no-smtp' };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"FitLoyalty" <no-reply@fitloyalty.com>',
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.warn(`[EMAIL-WARN] SMTP fallo (${err.message}), fallback a consola.`);
    console.log(`[EMAIL-DEV-FALLBACK] Para: ${to} | Asunto: ${subject}\n${text}`);
    return { delivered: false, reason: 'smtp-error', error: err.message };
  }
}

module.exports = { sendMail };
