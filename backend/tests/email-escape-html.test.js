/**
 * Regresión de escapeHtml en src/lib/email.js.
 *
 * Desde 7ad0e04 cada carácter se reemplazaba por sí mismo y el texto que
 * escribe una persona (nombre del miembro, del invitado, del gimnasio) salía
 * como HTML en los correos. escapeHtml es interna, así que se verifica en el
 * HTML que llega a Brevo, con el SDK simulado: sin red y sin tu .env.
 */
let mockSendTransacEmail;
jest.mock('@getbrevo/brevo', () => ({
  BrevoClient: jest.fn().mockImplementation(() => ({
    transactionalEmails: { sendTransacEmail: (...a) => mockSendTransacEmail(...a) },
  })),
  BrevoEnvironment: { PRODUCTION: 'https://brevo.invalid' },
}));

const ENV_ORIGINAL = process.env;
const ATAQUE = `<script>alert("x")</script> & 'co'`;

// Carga email.js con una clave de prueba para que use el cliente simulado.
function cargarEmail() {
  jest.resetModules();
  process.env = { ...ENV_ORIGINAL, BREVO_API_KEY: 'clave-de-prueba' };
  delete process.env.MAIL_FROM;
  return require('../src/lib/email');
}

const htmlEnviado = () => mockSendTransacEmail.mock.calls[0][0].htmlContent;

beforeEach(() => {
  mockSendTransacEmail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('escapeHtml in the email templates', () => {
  test.each([
    ['sendStaffInvite', { to: 'a@gym.co', invitedName: ATAQUE, invitedBy: 'Ana', gymName: 'Gym', role: 'ENTRENADOR', acceptUrl: 'https://app.test/i' }],
    ['sendMemberQR', { to: 'a@gym.co', memberName: ATAQUE, gymName: 'Gym', qrCode: 'QR-1', qrImageUrl: null }],
    ['sendRecoveryCode', { to: 'a@gym.co', name: ATAQUE, code: '123456' }],
  ])('should escape tags, quotes and ampersands when %s gets a name with markup', async (fn, datos) => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email[fn](datos);

    // Assert: el nombre llega como texto, nunca como etiqueta
    const html = htmlEnviado();
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;co&#39;');
    expect(html).not.toContain('<script>');
  });

  test('should escape each character only once when the gym name has & and <', async () => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email.sendMemberQR({ to: 'a@gym.co', memberName: 'Leo', gymName: 'Pesas & <Co>', qrCode: 'QR-1', qrImageUrl: null });

    // Assert: si el & se escapara al final saldría &amp;lt; (doble escape)
    const html = htmlEnviado();
    expect(html).toContain('Pesas &amp; &lt;Co&gt;');
    expect(html).not.toMatch(/&amp;(lt|gt|amp|quot|#39);/);
  });
});
