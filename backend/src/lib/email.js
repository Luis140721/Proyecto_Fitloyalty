/**
 * lib/email.js
 *
 * Wrapper de envio de correos para FitLoyalty.
 *
 * Transporte: Brevo SMTP relay con Nodemailer. Funciona en Render porque
 * usa conexion HTTPS/SMTPS estandar sin puertos bloqueados.
 *
 * Variables de entorno:
 *   SMTP_HOST     -> smtp-relay.brevo.com
 *   SMTP_PORT     -> 587 (STARTTLS) o 465 (SSL)
 *   SMTP_USER     -> usuario SMTP de Brevo
 *   SMTP_PASSWORD -> password SMTP de Brevo
 *   MAIL_FROM    -> nombre + direccion del remitente
 *
 * Si falta configuracion SMTP, NO envia correo real: hace fallback a consola.
 */
const nodemailer = require('nodemailer');

const BRAND = {
  name: 'FitLoyalty',
  primary: '#A855F7',
  primaryDark: '#7C3AED',
  bg: '#0E0B16',
  cardBg: '#18102A',
  border: '#2A1E3F',
  text: '#F5F2FF',
  textMuted: '#CFC2D6',
  supportEmail: process.env.SUPPORT_EMAIL || 'fitloyaltysaas@gmail.com',
};

// ---------- Sanitizacion ----------
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// ---------- Layout reusable ----------
function baseLayout({ title, preheader, body }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
${preheader ? `<span style="display:none;font-size:1px;color:${BRAND.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="padding:0 0 24px;text-align:center;">
            <span style="display:inline-block;width:40px;height:40px;line-height:40px;border-radius:8px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});color:#000;font-weight:900;font-size:18px;letter-spacing:-0.02em;vertical-align:middle;">FL</span>
            <span style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.text};margin-left:10px;vertical-align:middle;">${escapeHtml(BRAND.name)}</span>
          </td>
        </tr>
        <tr>
          <td style="background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:12px;padding:32px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 16px 0;text-align:center;">
            <p style="margin:0 0 8px;font-size:12px;color:${BRAND.textMuted};">
              ¿Necesitas ayuda? Escribenos a
              <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primary};text-decoration:none;">${BRAND.supportEmail}</a>
            </p>
            <p style="margin:0;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.textMuted};opacity:0.6;">
              © ${new Date().getFullYear()} ${BRAND.name}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ---------- Plantillas ----------

function ctaButton({ url, label }) {
  const safeUrl = escapeAttr(url);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:8px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});">
      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#000;text-decoration:none;border-radius:8px;">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}

function templateRecoverCode({ name, code, expiresMinutes = 15 }) {
  const subject = `${code} es tu codigo de recuperacion — FitLoyalty`;
  const preheader = `Tu codigo temporal expira en ${expiresMinutes} minutos.`;
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.text};">Restablece tu contrasena</h1>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:15px;line-height:1.6;">
      Hola <strong style="color:${BRAND.text};">${escapeHtml(name)}</strong>, recibimos un pedido para restablecer la contrasena de tu cuenta.
    </p>
    <p style="margin:0 0 8px;color:${BRAND.textMuted};font-size:14px;">Ingresa este codigo en la pantalla de recuperacion:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 16px;width:100%;">
      <tr>
        <td align="center" style="padding:16px;background:${BRAND.bg};border:1px dashed ${BRAND.primary};border-radius:8px;">
          <span style="font-family:ui-monospace,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.text};">${escapeHtml(code)}</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:${BRAND.textMuted};font-size:13px;">
      Este codigo expira en <strong style="color:${BRAND.text};">${expiresMinutes} minutos</strong>. Si no lo usas en ese tiempo, puedes pedir uno nuevo.
    </p>
    <p style="margin:0;color:${BRAND.textMuted};font-size:13px;line-height:1.6;">
      Si no fuiste vos quien hizo este pedido, puedes ignorar este correo. Nadie podra acceder a tu cuenta sin este codigo.
    </p>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

function templateRecoverLink({ name, resetUrl, expiresHours = 1 }) {
  const subject = 'Restablece tu contrasena — FitLoyalty';
  const preheader = `Tienes ${expiresHours} hora(s) para restablecer tu clave.`;
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.text};">Restablece tu contrasena</h1>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:15px;line-height:1.6;">
      Hola <strong style="color:${BRAND.text};">${escapeHtml(name)}</strong>, recibiste este correo porque pediste restablecer la contrasena de tu cuenta.
    </p>
    ${ctaButton({ url: resetUrl, label: 'Restablecer contrasena' })}
    <p style="margin:16px 0;color:${BRAND.textMuted};font-size:13px;">O copia y pega este enlace en tu navegador:</p>
    <p style="margin:0 0 24px;padding:12px;background:${BRAND.bg};border-radius:8px;font-family:ui-monospace,monospace;font-size:11px;color:${BRAND.primary};word-break:break-all;">
      ${escapeHtml(resetUrl)}
    </p>
    <p style="margin:0;color:${BRAND.textMuted};font-size:13px;">
      Este enlace expira en <strong style="color:${BRAND.text};">${expiresHours} hora(s)</strong>. Si no pediste esto, ignora este mensaje.
    </p>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

function templateInviteStaff({ invitedName, invitedBy, gymName, role, acceptUrl, expiresDays = 7 }) {
  const subject = `${invitedBy} te invito a FitLoyalty — ${gymName}`;
  const preheader = `Acepta la invitacion y empieza a gestionar el gimnasio.`;
  const roleLabel = role === 'ADMINISTRADOR' ? 'Administrador' : role === 'ENTRENADOR' ? 'Entrenador' : 'Recepcionista';
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.text};">Sos parte del equipo</h1>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:15px;line-height:1.6;">
      Hola <strong style="color:${BRAND.text};">${escapeHtml(invitedName)}</strong>, <strong style="color:${BRAND.text};">${escapeHtml(invitedBy)}</strong> te invito a FitLoyalty como <strong style="color:${BRAND.primary};">${escapeHtml(roleLabel)}</strong> en <strong style="color:${BRAND.text};">${escapeHtml(gymName)}</strong>.
    </p>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:14px;line-height:1.6;">
      Para empezar, crea tu contrasena. Vas a poder gestionar miembros, registrar check-ins y ver los indicadores del gimnasio.
    </p>
    ${ctaButton({ url: acceptUrl, label: 'Aceptar invitacion' })}
    <p style="margin:16px 0;color:${BRAND.textMuted};font-size:13px;">O copia y pega este enlace en tu navegador:</p>
    <p style="margin:0 0 24px;padding:12px;background:${BRAND.bg};border-radius:8px;font-family:ui-monospace,monospace;font-size:11px;color:${BRAND.primary};word-break:break-all;">
      ${escapeHtml(acceptUrl)}
    </p>
    <p style="margin:0;color:${BRAND.textMuted};font-size:13px;">
      Esta invitacion expira en <strong style="color:${BRAND.text};">${expiresDays} dias</strong>.
    </p>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

// ---------- Transporte ----------

let cachedTransport = null;

function getTransport() {
  if (cachedTransport !== null) return cachedTransport;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  console.log('[EMAIL] Config SMTP:', { host, port, user });

  if (!host || !user || !pass) {
    console.log('[EMAIL] FALTAN VARIABLES SMTP - usando modo consola');
    return (cachedTransport = null);
  }

  try {
    cachedTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
      auth: { user, pass },
    });
    console.log('[EMAIL] Transport SMTP creado OK');
    return cachedTransport;
  } catch (err) {
    console.log('[EMAIL] Error creando transport:', err.message);
    return (cachedTransport = null);
  }
}

async function sendViaSmtp({ from, to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) {
    console.log('[EMAIL] SMTP no disponible - modo consola');
    console.log('[EMAIL] Para:', to);
    console.log('[EMAIL] Asunto:', subject);
    return { delivered: false, reason: 'no-smtp' };
  }

  try {
    console.log('[EMAIL] Enviando a:', to);
    const info = await transport.sendMail({ from, to, subject, html, text });
    console.log('[EMAIL] Enviado OK, messageId:', info.messageId);
    return { delivered: true, id: info.messageId };
  } catch (err) {
    console.log('[EMAIL] Error SMTP:', err.message);
    return { delivered: false, reason: 'smtp-error', error: err.message };
  }
}

function textVersion({ preheader, content }) {
  return `${preheader ? preheader + '\n\n' : ''}${content}\n\n— Equipo FitLoyalty\n${BRAND.supportEmail}`;
}

// ---------- API publica ----------

async function sendRecoveryCode({ to, name, code, expiresMinutes = 15 }) {
  const tpl = templateRecoverCode({ name, code, expiresMinutes });
  const text = textVersion({
    preheader: `Tu codigo de recuperacion es ${code}.`,
    content: `Hola ${name},\nRecibimos un pedido para restablecer tu contrasena.\n\nTu codigo es: ${code}\n\nExpira en ${expiresMinutes} minutos. Si no solicitaste esto, ignora este correo.`,
  });
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaSmtp({ from, to, subject: tpl.subject, html: tpl.html, text });
}

async function sendRecoveryLink({ to, name, resetUrl, expiresHours = 1 }) {
  const tpl = templateRecoverLink({ name, resetUrl, expiresHours });
  const text = textVersion({
    preheader: 'Restablece tu contrasena.',
    content: `Hola ${name},\nRecibiste este correo porque pediste restablecer tu contrasena.\n\nEntra a este enlace para crear una nueva (expira en ${expiresHours}h):\n${resetUrl}\n\nSi no pediste esto, ignora este correo.`,
  });
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaSmtp({ from, to, subject: tpl.subject, html: tpl.html, text });
}

async function sendStaffInvite({ to, invitedName, invitedBy, gymName, role, acceptUrl, expiresDays = 7 }) {
  const tpl = templateInviteStaff({ invitedName, invitedBy, gymName, role, acceptUrl, expiresDays });
  const text = textVersion({
    preheader: `${invitedBy} te invito a FitLoyalty como ${role} en ${gymName}.`,
    content: `Hola ${invitedName},\n${invitedBy} te invito a FitLoyalty como ${role} en ${gymName}.\n\nCrea tu contrasena aqui (link valido ${expiresDays} dias):\n${acceptUrl}`,
  });
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaSmtp({ from, to, subject: tpl.subject, html: tpl.html, text });
}

// Compatibilidad legacy
async function sendMail({ to, subject, text, html }) {
  if (!text && !html) throw new Error('sendMail: ni text ni html provistos');
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaSmtp({ from, to, subject, html, text: text || html.replace(/<[^>]+>/g, '') });
}

module.exports = {
  sendMail,
  sendRecoveryCode,
  sendRecoveryLink,
  sendStaffInvite,
};
