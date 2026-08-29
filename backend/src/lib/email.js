/**
 * lib/email.js
 *
 * Wrapper de envio de correos para FitLoyalty.
 *
 * Transporte: Resend (API HTTPS, no SMTP). Render free bloquea SMTP saliente,
 * por eso elegimos la API directa. Resend tiene plan free generoso.
 *
 * Branding: cada helper expone una funcion de plantilla para un tipo de correo.
 * El HTML/CSS esta inline (sin imagenes externas) para que llegue a Gmail,
 * Outlook, Apple Mail y webmail sin warnings.
 *
 * Variables de entorno:
 *   RESEND_API_KEY  -> requerido para enviar correo real
 *   MAIL_FROM       -> nombre + direccion del remitente (ej: 'FitLoyalty <onboarding@resend.dev>')
 *
 * Si falta RESEND_API_KEY, NO envia correo real: hace fallback a consola
 * (modo dev). El caller recibe { delivered:false, reason:'no-resend' }.
 */
const { Brevo } = require('@getbrevo/brevo');

const BRAND = {
  name: 'FitLoyalty',
  primary: '#A855F7',
  primaryDark: '#7C3AED',
  bg: '#0E0B16',
  cardBg: '#18102A',
  border: '#2A1E3F',
  text: '#F5F2FF',
  textMuted: '#CFC2D6',
  logoUrl: 'https://fitloyalty-zeta.vercel.app/logo-fitloyalty.svg',
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

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString('es-CO', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(d); }
}

// ---------- Layout reusable ----------
function baseLayout({ title, preheader, body }) {
  return `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};font-family:'Inter','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
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
              ¿Necesitas ayuda? Escríbenos a
              <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primary};text-decoration:none;">${BRAND.supportEmail}</a>
            </p>
            <p style="margin:0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.textMuted};opacity:0.6;">
              © ${new Date().getFullYear()} ${BRAND.name} · Ley 1581/2012
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

function ctaButton({ url, label }) {
  const safeUrl = escapeAttr(url);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:8px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});box-shadow:0 6px 18px rgba(168,85,247,0.35);">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#000;text-decoration:none;border-radius:8px;letter-spacing:-0.01em;">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}

// ---------- Plantillas ----------

function templateRecoverCode({ name, code, expiresMinutes = 15 }) {
  const subject = `${code} es tu código de recuperación — FitLoyalty`;
  const preheader = `Tu código temporal expira en ${expiresMinutes} minutos.`;
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.text};">
      Restablecé tu contraseña
    </h1>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:15px;line-height:1.6;">
      Hola <strong style="color:${BRAND.text};">${escapeHtml(name)}</strong>, recibimos un pedido para restablecer la contraseña de tu cuenta.
    </p>
    <p style="margin:0 0 8px;color:${BRAND.textMuted};font-size:14px;">Ingresa este código en la pantalla de recuperación:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 16px;width:100%;">
      <tr>
        <td align="center" style="padding:16px;background:${BRAND.bg};border:1px dashed ${BRAND.primary};border-radius:8px;">
          <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.text};">${escapeHtml(code)}</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:${BRAND.textMuted};font-size:13px;">
      ⏱️ Este código expira en <strong style="color:${BRAND.text};">${expiresMinutes} minutos</strong>. Si no lo usás en ese tiempo, podés pedir uno nuevo.
    </p>
    <p style="margin:0;color:${BRAND.textMuted};font-size:13px;line-height:1.6;">
      Si no fuiste vos quien hizo este pedido, podés ignorar este correo. Nadie podrá acceder a tu cuenta sin este código.
    </p>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

function templateRecoverLink({ name, resetUrl, expiresHours = 1 }) {
  const subject = 'Restablecé tu contraseña — FitLoyalty';
  const preheader = `Tenés ${expiresHours} hora(s) para restablecer tu clave.`;
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.text};">Restablecé tu contraseña</h1>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:15px;line-height:1.6;">
      Hola <strong style="color:${BRAND.text};">${escapeHtml(name)}</strong>, recibiste este correo porque pediste restablecer la contraseña de tu cuenta.
    </p>
    ${ctaButton({ url: resetUrl, label: 'Restablecer contraseña' })}
    <p style="margin:16px 0;color:${BRAND.textMuted};font-size:13px;">O copiá y pegá este enlace en tu navegador:</p>
    <p style="margin:0 0 24px;padding:12px;background:${BRAND.bg};border-radius:8px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:${BRAND.primary};word-break:break-all;">
      ${escapeHtml(resetUrl)}
    </p>
    <p style="margin:0;color:${BRAND.textMuted};font-size:13px;">
      ⏱️ Este enlace expira en <strong style="color:${BRAND.text};">${expiresHours} hora(s)</strong>. Si no pediste esto, ignora este mensaje.
    </p>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

function templateInviteStaff({ invitedName, invitedBy, gymName, role, acceptUrl, expiresDays = 7 }) {
  const subject = `${invitedBy} te invitó a FitLoyalty — ${gymName}`;
  const preheader = `Aceptá la invitación y empezá a gestionar el gimnasio.`;
  const roleLabel = role === 'ADMINISTRADOR' ? 'Administrador' : role === 'ENTRENADOR' ? 'Entrenador' : 'Recepcionista';
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.text};">Sos parte del equipo</h1>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:15px;line-height:1.6;">
      Hola <strong style="color:${BRAND.text};">${escapeHtml(invitedName)}</strong>, <strong style="color:${BRAND.text};">${escapeHtml(invitedBy)}</strong> te invitó a FitLoyalty como <strong style="color:${BRAND.primary};">${escapeHtml(roleLabel)}</strong> en <strong style="color:${BRAND.text};">${escapeHtml(gymName)}</strong>.
    </p>
    <p style="margin:0 0 20px;color:${BRAND.textMuted};font-size:14px;line-height:1.6;">
      Para empezar, creá tu contraseña. Vas a poder gestionar miembros, registrar check-ins y ver los indicadores del gimnasio.
    </p>
    ${ctaButton({ url: acceptUrl, label: 'Aceptar invitación' })}
    <p style="margin:16px 0;color:${BRAND.textMuted};font-size:13px;">O copiá y pegá este enlace en tu navegador:</p>
    <p style="margin:0 0 24px;padding:12px;background:${BRAND.bg};border-radius:8px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:${BRAND.primary};word-break:break-all;">
      ${escapeHtml(acceptUrl)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr>
        <td style="padding:12px;background:${BRAND.bg};border-left:3px solid ${BRAND.primary};border-radius:6px;">
          <p style="margin:0;font-size:13px;color:${BRAND.textMuted};"><strong style="color:${BRAND.text};">Tu rol:</strong> ${escapeHtml(roleLabel)}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:${BRAND.textMuted};font-size:13px;">
      ⏱️ Esta invitación expira en <strong style="color:${BRAND.text};">${expiresDays} días</strong>.
    </p>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

let cachedClient = null;
function getClient() {
  if (cachedClient !== null) return cachedClient;
  const key = process.env.BREVO_API_KEY;
  if (!key) return (cachedClient = null);
  const Brevo = require('@getbrevo/brevo');
  const defaultClient = Brevo.ApiClient.instance || new Brevo.ApiClient();
  const apiKey = defaultClient.authentications['api-key'];
  if (apiKey) {
    apiKey.apiKey = key;
  } else {
    defaultClient.authentications['api-key'] = { apiKey: key, type: 'apiKey' };
  }
  cachedClient = new Brevo.EmailsApi();
  return cachedClient;
}

async function deliverViaBrevo({ from, to, subject, html, text }) {
  const client = getClient();
  if (!client) return { delivered: false, reason: 'no-brevo' };
  try {
    const senderEmail = from.match(/<([^>]+)>/)?.[1] || from;
    const senderName = from.match(/^([^<]+)/)?.[1].trim() || 'FitLoyalty';
    
    const sendSmtpEmail = {
      to: [{ email: to, name: to.split('@')[0] }],
      from: { email: senderEmail, name: senderName },
      subject: subject,
      htmlContent: html,
      textContent: text || html.replace(/<[^>]+>/g, ''),
    };
    
    await client.sendTransacEmail(sendSmtpEmail);
    return { delivered: true };
  } catch (err) {
    console.warn(`[EMAIL-WARN] Brevo fallo: ${err.message}`);
    return { delivered: false, reason: 'brevo-error', error: err.message };
  }
}

function fallbackConsole({ to, subject, text }) {
  console.log('\n[EMAIL-DEV] ----------------------------------------');
  console.log(`[EMAIL-DEV] Para:   ${to}`);
  console.log(`[EMAIL-DEV] Asunto: ${subject}`);
  console.log(`[EMAIL-DEV] Cuerpo:\n${text || '(sin version texto)'}`);
  console.log('[EMAIL-DEV] ----------------------------------------\n');
  return { delivered: false, reason: 'no-brevo' };
}

function textVersion({ preheader, content }) {
  return `${preheader ? preheader + '\n\n' : ''}${content}\n\n— Equipo FitLoyalty\n${BRAND.supportEmail}\n© ${new Date().getFullYear()} FitLoyalty`;
}

// ---------- API publica ----------

async function sendRecoveryCode({ to, name, code, expiresMinutes = 15 }) {
  const tpl = templateRecoverCode({ name, code, expiresMinutes });
  const text = textVersion({
    preheader: `Tu código de recuperación es ${code}.`,
    content: `Hola ${name},\nRecibimos un pedido para restablecer tu contraseña.\n\nTu código es: ${code}\n\nExpira en ${expiresMinutes} minutos. Si no solicitaste esto, ignora este correo.`,
  });
  const from = process.env.MAIL_FROM || 'FitLoyalty <onboarding@brevo.example>';
  const client = getClient();
  if (!client) {
    fallbackConsole({ to, subject: tpl.subject, text });
    return { delivered: false, reason: 'no-brevo' };
  }
  return deliverViaBrevo({ from, to, subject: tpl.subject, html: tpl.html, text });
}

async function sendRecoveryLink({ to, name, resetUrl, expiresHours = 1 }) {
  const tpl = templateRecoverLink({ name, resetUrl, expiresHours });
  const text = textVersion({
    preheader: 'Restablecé tu contraseña.',
    content: `Hola ${name},\nRecibiste este correo porque pediste restablecer tu contraseña.\n\nEntrá a este enlace para crear una nueva (expira en ${expiresHours}h):\n${resetUrl}\n\nSi no pediste esto, ignora este correo.`,
  });
  const from = process.env.MAIL_FROM || 'FitLoyalty <onboarding@brevo.example>';
  const client = getClient();
  if (!client) {
    fallbackConsole({ to, subject: tpl.subject, text });
    return { delivered: false, reason: 'no-brevo' };
  }
  return deliverViaBrevo({ from, to, subject: tpl.subject, html: tpl.html, text });
}

async function sendStaffInvite({ to, invitedName, invitedBy, gymName, role, acceptUrl, expiresDays = 7 }) {
  const tpl = templateInviteStaff({ invitedName, invitedBy, gymName, role, acceptUrl, expiresDays });
  const text = textVersion({
    preheader: `${invitedBy} te invitó a FitLoyalty como ${role} en ${gymName}.`,
    content: `Hola ${invitedName},\n${invitedBy} te invitó a FitLoyalty como ${role} en ${gymName}.\n\nCreá tu contraseña acá (link válido ${expiresDays} días):\n${acceptUrl}`,
  });
  const from = process.env.MAIL_FROM || 'FitLoyalty <onboarding@brevo.example>';
  const client = getClient();
  if (!client) {
    fallbackConsole({ to, subject: tpl.subject, text });
    return { delivered: false, reason: 'no-brevo' };
  }
  return deliverViaBrevo({ from, to, subject: tpl.subject, html: tpl.html, text });
}

// Compatibilidad: la API legacy `sendMail({ to, subject, text, html })` sigue existiendo
// para no romper callers existentes, pero se prefiere usar las funciones de plantilla.
async function sendMail({ to, subject, text, html }) {
  if (!text && !html) throw new Error('sendMail: ni text ni html provistos');
  const from = process.env.MAIL_FROM || 'FitLoyalty <onboarding@brevo.example>';
  const client = getClient();
  if (!client) {
    fallbackConsole({ to, subject, text: text || html.replace(/<[^>]+>/g, '') });
    return { delivered: false, reason: 'no-brevo' };
  }
  return deliverViaBrevo({ from, to, subject, html, text });
}

module.exports = {
  sendMail,
  sendRecoveryCode,
  sendRecoveryLink,
  sendStaffInvite,
  // expongo helpers en caso de tests / debugging
  _templates: { templateRecoverCode, templateRecoverLink, templateInviteStaff, baseLayout },
};
