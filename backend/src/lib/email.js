/**
 * lib/email.js
 *
 * Wrapper de envio de correos para FitLoyalty.
 *
 * Transporte: Brevo API HTTPS (no SMTP).
 * Render free bloquea puertos SMTP pero la API HTTPS funciona.
 *
 * Variables de entorno:
 *   BREVO_API_KEY -> API key v3 de Brevo (xkeysib-...)
 *   MAIL_FROM     -> "Nombre <email>" del remitente
 *
 * Si falta BREVO_API_KEY, hace fallback a consola.
 * TODO: todos los textos usan tuteo obligatorio (tú, tu, tuya). Sin voseo.
 */
const { BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');

const BRAND = {
  name: 'FitLoyalty',
  primary: '#A855F7',
  primaryDark: '#7C3AED',
  accent: '#34D399',
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
    .replaceAll('&', '&')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", ''');
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
    <td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="padding:0 0 28px;text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
              <tr>
                <td style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});text-align:center;vertical-align:middle;">
                  <span style="display:inline-block;width:44px;height:44px;line-height:44px;font-weight:900;font-size:20px;color:#000;letter-spacing:-0.02em;">FL</span>
                </td>
              </tr>
            </table>
            <span style="font-size:20px;font-weight:800;letter-spacing:-0.03em;color:${BRAND.text};">${escapeHtml(BRAND.name)}</span>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:16px;padding:36px 40px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:28px 20px 0;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:${BRAND.textMuted};">
              ¿Necesitas ayuda? Escribenos a
              <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primary};text-decoration:none;">${BRAND.supportEmail}</a>
            </p>
            <p style="margin:0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.textMuted};opacity:0.5;">
              © ${new Date().getFullYear()} ${BRAND.name} — CRM para gimnasios
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

function ctaButton({ url, label, accent }) {
  const bg = accent ? `linear-gradient(135deg,${BRAND.accent},#10B981)` : `linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark})`;
  const color = accent ? '#000' : '#000';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
  <tr>
    <td style="border-radius:10px;background:${bg};">
      <a href="${url}" target="_blank" style="display:inline-block;padding:15px 32px;font-size:16px;font-weight:700;color:${color};text-decoration:none;border-radius:10px;letter-spacing:0.01em;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

function divider() {
  return `<div style="height:1px;background:${BRAND.border};margin:24px 0;"></div>`;
}

// ---------- Plantilla: recuperacion por codigo ----------
function templateRecoverCode({ name, code, expiresMinutes = 15 }) {
  const subject = `${code} — Tu codigo de recuperacion FitLoyalty`;
  const preheader = `Restablece tu contrasena en ${expiresMinutes} minutos.`;
  const body = `
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.primary};font-weight:600;">Recuperacion de cuenta</p>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:${BRAND.text};letter-spacing:-0.03em;">¡Hola, ${escapeHtml(name)}!</h1>
    <p style="margin:0 0 28px;font-size:16px;line-height:1.7;color:${BRAND.textMuted};">
      Recibimos tu solicitud para restablecer la contrasena de tu cuenta en <strong style="color:${BRAND.text};">FitLoyalty</strong>.
      Usa el codigo abajo para continuar.
    </p>
    <div style="background:${BRAND.bg};border:2px dashed ${BRAND.primary};border-radius:12px;padding:24px;text-align:center;margin:8px 0 8px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.textMuted};">Tu codigo de verificacion</p>
      <p style="margin:0;font-family:ui-monospace,'Courier New',monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:${BRAND.text};">${escapeHtml(code)}</p>
    </div>
    ${divider()}
    <div style="display:flex;align-items:center;gap:10px;margin:0 0 8px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${BRAND.primary}22;color:${BRAND.primary};font-size:14px;">⏱</span>
      <p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Este codigo expira en <strong style="color:${BRAND.text};">${expiresMinutes} minutos</strong></p>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:0;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${BRAND.accent}22;color:${BRAND.accent};font-size:14px;">🛡</span>
      <p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Si no fuiste tú quien pidio el cambio, ignora este correo. Tu cuenta sigue segura.</p>
    </div>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

// ---------- Plantilla: recuperacion por enlace ----------
function templateRecoverLink({ name, resetUrl, expiresHours = 1 }) {
  const subject = 'Restablece tu contrasena — FitLoyalty';
  const preheader = `Tienes ${expiresHours} hora(s) para crear una nueva clave.`;
  const body = `
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.primary};font-weight:600;">Recuperacion de cuenta</p>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:${BRAND.text};letter-spacing:-0.03em;">¡Hola, ${escapeHtml(name)}!</h1>
    <p style="margin:0 0 28px;font-size:16px;line-height:1.7;color:${BRAND.textMuted};">
      Recibimos tu solicitud para restablecer la contrasena de tu cuenta en <strong style="color:${BRAND.text};">FitLoyalty</strong>.
      Haz clic en el boton para crear una nueva clave.
    </p>
    ${ctaButton({ url: resetUrl, label: 'Crear nueva contrasena' })}
    <p style="margin:24px 0 0;font-size:12px;color:${BRAND.textMuted};">Si no funciona, copia y pega este enlace en tu navegador:</p>
    <p style="margin:4px 0 0;padding:12px 16px;background:${BRAND.bg};border-radius:8px;font-family:ui-monospace,monospace;font-size:11px;color:${BRAND.primary};word-break:break-all;">${escapeHtml(resetUrl)}</p>
    ${divider()}
    <div style="display:flex;align-items:center;gap:10px;margin:0;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${BRAND.primary}22;color:${BRAND.primary};font-size:14px;">⏱</span>
      <p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Este enlace expira en <strong style="color:${BRAND.text};">${expiresHours} hora(s)</strong>. Si no lo usas, puedes pedir uno nuevo.</p>
    </div>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

// ---------- Plantilla: invitacion a staff ----------
function templateInviteStaff({ invitedName, invitedBy, gymName, role, acceptUrl, expiresDays = 7 }) {
  const subject = `Te invitaron a FitLoyalty — ${gymName}`;
  const preheader = `${invitedBy} te suma al equipo de ${gymName} en FitLoyalty.`;
  const roleLabel = role === 'ADMINISTRADOR' ? 'Administrador' : role === 'ENTRENADOR' ? 'Entrenador' : 'Recepcionista';
  const roleEmoji = role === 'ADMINISTRADOR' ? '👑' : role === 'ENTRENADOR' ? '💪' : '🎫';
  const body = `
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.primary};font-weight:600;">Nueva invitacion</p>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:${BRAND.text};letter-spacing:-0.03em;">¡Bienvenido, ${escapeHtml(invitedName)}!</h1>
    <p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:${BRAND.textMuted};">
      <strong style="color:${BRAND.text};">${escapeHtml(invitedBy)}</strong> te invita a unirte al equipo de <strong style="color:${BRAND.text};">${escapeHtml(gymName)}</strong> en FitLoyalty.
    </p>
    <div style="background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;padding:20px;margin:8px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="width:44px;text-align:center;vertical-align:top;padding-right:16px;">
            <span style="font-size:28px;">${roleEmoji}</span>
          </td>
          <td>
            <p style="margin:0 0 2px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.textMuted};">Tu rol</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND.text};">${escapeHtml(roleLabel)}</p>
          </td>
        </tr>
      </table>
    </div>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${BRAND.textMuted};">
      Como parte del equipo podras gestionar miembros, registrar check-ins y acompanhar el rendimiento del gimnasio.
    </p>
    ${ctaButton({ url: acceptUrl, label: 'Aceptar invitacion y crear cuenta' })}
    <p style="margin:24px 0 0;font-size:12px;color:${BRAND.textMuted};">Si no funciona, copia y pega este enlace:</p>
    <p style="margin:4px 0 0;padding:12px 16px;background:${BRAND.bg};border-radius:8px;font-family:ui-monospace,monospace;font-size:11px;color:${BRAND.primary};word-break:break-all;">${escapeHtml(acceptUrl)}</p>
    ${divider()}
    <div style="display:flex;align-items:center;gap:10px;margin:0;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${BRAND.primary}22;color:${BRAND.primary};font-size:14px;">⏱</span>
      <p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Esta invitacion expira en <strong style="color:${BRAND.text};">${expiresDays} dias</strong>.</p>
    </div>
  `;
  return { subject, html: baseLayout({ title: subject, preheader, body }) };
}

// ---------- Transporte ----------
let cachedClient = null;

function getClient() {
  if (cachedClient !== null) return cachedClient;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) { console.log('[EMAIL] BREVO_API_KEY no configurada'); return (cachedClient = null); }
  try {
    cachedClient = new BrevoClient({ apiKey, baseUrl: BrevoEnvironment.PRODUCTION });
    console.log('[EMAIL] Cliente Brevo API inicializado');
    return cachedClient;
  } catch (err) {
    console.log('[EMAIL] Error cliente Brevo:', err.message);
    return (cachedClient = null);
  }
}

function parseFromAddress(from) {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: 'FitLoyalty', email: from.trim() };
}

async function sendViaBrevo({ from, to, subject, html, text }) {
  const client = getClient();
  if (!client) {
    console.log('[EMAIL] Modo consola - Para:', to, 'Asunto:', subject);
    return { delivered: false, reason: 'no-api' };
  }
  try {
    const sender = parseFromAddress(from);
    console.log('[EMAIL] Enviando a:', to);
    const result = await client.transactionalEmails.sendTransacEmail({
      sender, to: [{ email: to }], subject,
      htmlContent: html,
      textContent: text || html.replace(/<[^>]+>/g, ''),
    });
    console.log('[EMAIL] Enviado OK:', result.messageId);
    return { delivered: true, id: result.messageId };
  } catch (err) {
    const detail = err.response?.body || err.response?.text || err.message;
    console.log('[EMAIL] Error Brevo:', typeof detail === 'string' ? detail : JSON.stringify(detail));
    return { delivered: false, reason: 'api-error', error: err.message };
  }
}

function textVersion({ content }) {
  return `${content}\n\n— Equipo FitLoyalty\n${BRAND.supportEmail}`;
}

// ---------- API publica ----------
async function sendRecoveryCode({ to, name, code, expiresMinutes = 15 }) {
  const tpl = templateRecoverCode({ name, code, expiresMinutes });
  const text = textVersion({ content: `Hola ${name},\nRecibimos tu solicitud para restablecer la contrasena.\n\nTu codigo: ${code}\nExpira en ${expiresMinutes} minutos.\n\nSi no fuiste tu, ignora este correo.` });
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaBrevo({ from, to, subject: tpl.subject, html: tpl.html, text });
}

async function sendRecoveryLink({ to, name, resetUrl, expiresHours = 1 }) {
  const tpl = templateRecoverLink({ name, resetUrl, expiresHours });
  const text = textVersion({ content: `Hola ${name},\nRecibimos tu solicitud para restablecer la contrasena.\n\nUsa este enlace (expira en ${expiresHours}h):\n${resetUrl}\n\nSi no fuiste tu, ignora este correo.` });
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaBrevo({ from, to, subject: tpl.subject, html: tpl.html, text });
}

async function sendStaffInvite({ to, invitedName, invitedBy, gymName, role, acceptUrl, expiresDays = 7 }) {
  const tpl = templateInviteStaff({ invitedName, invitedBy, gymName, role, acceptUrl, expiresDays });
  const text = textVersion({ content: `Hola ${invitedName},\n${invitedBy} te invita a FitLoyalty como ${role} en ${gymName}.\n\nCrea tu cuenta aqui (expira en ${expiresDays} dias):\n${acceptUrl}` });
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaBrevo({ from, to, subject: tpl.subject, html: tpl.html, text });
}

async function sendMail({ to, subject, text, html }) {
  if (!text && !html) throw new Error('sendMail: ni text ni html provistos');
  const from = process.env.MAIL_FROM || 'FitLoyalty <fitloyaltysaas@gmail.com>';
  return sendViaBrevo({ from, to, subject, html, text: text || html.replace(/<[^>]+>/g, '') });
}

module.exports = { sendMail, sendRecoveryCode, sendRecoveryLink, sendStaffInvite };