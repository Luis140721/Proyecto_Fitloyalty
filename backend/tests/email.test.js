/**
 * Bootcamp semana 2 (Luis): reglas de src/lib/email.js.
 *
 * Solo se prueban las funciones exportadas. Las plantillas, escapeHtml y
 * parseFromAddress son internas, asi que se verifican a traves del payload
 * que llega al cliente de Brevo (asunto, html, texto, remitente, destinatario).
 *
 *  - Anti-inyeccion: los nombres que escribe una persona salen escapados en el HTML.
 *  - Vencimientos por defecto (15 min, 1 h, 7 dias) y valores explicitos.
 *  - Remitente parseado de MAIL_FROM, con y sin "Nombre <correo>".
 *  - Sin BREVO_API_KEY no se llama a Brevo (modo consola).
 *
 * El SDK se reemplaza con jest.mock y cada test carga el modulo de nuevo con
 * jest.resetModules, porque email.js guarda el cliente y lee el entorno al
 * cargarse. No hay red ni dependencia de la fecha.
 */
let mockSendTransacEmail;
jest.mock('@getbrevo/brevo', () => ({
  BrevoClient: jest.fn().mockImplementation(() => ({
    transactionalEmails: { sendTransacEmail: (...a) => mockSendTransacEmail(...a) },
  })),
  BrevoEnvironment: { PRODUCTION: 'https://brevo.invalid' },
}));

const ENV_ORIGINAL = process.env;
const REMITENTE_POR_DEFECTO = { name: 'FitLoyalty', email: 'fitloyaltysaas@gmail.com' };

// Carga email.js con el entorno del test. Por defecto hay clave; pasa
// BREVO_API_KEY: undefined para probar el modo consola.
function cargarEmail(entorno = {}) {
  jest.resetModules();
  const variables = { BREVO_API_KEY: 'clave-de-prueba', ...entorno };
  for (const [nombre, valor] of Object.entries(variables)) {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  }
  return require('../src/lib/email');
}

// Lo que recibio Brevo en el unico envio del test.
const payloadEnviado = () => mockSendTransacEmail.mock.calls[0][0];

const INVITACION = { to: 'a@gym.co', invitedName: 'Leo', invitedBy: 'Ana', gymName: 'Gym', role: 'ENTRENADOR', acceptUrl: 'https://app.test/i' };
const ATAQUE = `<script>alert("x")</script>'`;
const ATAQUE_ESCAPADO = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;';

beforeEach(() => {
  // Copia del entorno sin las variables del correo: el resultado no depende de tu .env.
  process.env = { ...ENV_ORIGINAL };
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.SUPPORT_EMAIL;
  mockSendTransacEmail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('email templates: HTML escaping', () => {
  test.each([
    ['sendRecoveryCode', 'name', { to: 'a@gym.co', name: ATAQUE, code: '123456' }],
    ['sendRecoveryLink', 'name', { to: 'a@gym.co', name: ATAQUE, resetUrl: 'https://app.test/reset' }],
    ['sendStaffInvite', 'invitedName', { ...INVITACION, invitedName: ATAQUE }],
    ['sendStaffInvite', 'invitedBy', { ...INVITACION, invitedBy: ATAQUE }],
    ['sendStaffInvite', 'gymName', { ...INVITACION, gymName: ATAQUE }],
    ['sendMemberQR', 'memberName', { to: 'a@gym.co', memberName: ATAQUE, gymName: 'Gym', qrCode: 'QR-1', qrImageUrl: null }],
    ['sendMemberQR', 'gymName', { to: 'a@gym.co', memberName: 'Leo', gymName: ATAQUE, qrCode: 'QR-1', qrImageUrl: null }],
  ])('should escape the HTML when %s receives markup in %s', async (fn, _campo, datos) => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email[fn](datos);

    // Assert: el texto llega como texto, nunca como etiqueta
    const { htmlContent } = payloadEnviado();
    expect(htmlContent).toContain(ATAQUE_ESCAPADO);
    expect(htmlContent).not.toContain('<script>');
  });

  test('should escape the ampersand when the gym name has one', async () => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email.sendMemberQR({ to: 'a@gym.co', memberName: 'Leo', gymName: 'Pesas & Co', qrCode: 'QR-1', qrImageUrl: null });

    // Assert
    expect(payloadEnviado().htmlContent).toContain('Pesas &amp; Co');
  });
});

describe('email templates: expiration', () => {
  test.each([
    ['sendRecoveryCode', 'the default 15 minutes', { name: 'Ana', code: '123456' }, '>15 minutos<', 'Expira en 15 minutos.'],
    ['sendRecoveryCode', 'expiresMinutes 5', { name: 'Ana', code: '123456', expiresMinutes: 5 }, '>5 minutos<', 'Expira en 5 minutos.'],
    ['sendRecoveryLink', 'the default 1 hour', { name: 'Ana', resetUrl: 'https://app.test/r' }, '>1 hora(s)<', '(expira en 1h)'],
    ['sendRecoveryLink', 'expiresHours 24', { name: 'Ana', resetUrl: 'https://app.test/r', expiresHours: 24 }, '>24 hora(s)<', '(expira en 24h)'],
    ['sendStaffInvite', 'the default 7 days', INVITACION, '>7 dias<', '(expira en 7 dias)'],
    ['sendStaffInvite', 'expiresDays 1', { ...INVITACION, expiresDays: 1 }, '>1 dias<', '(expira en 1 dias)'],
  ])('should show the expiration when %s uses %s', async (fn, _caso, datos, enHtml, enTexto) => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email[fn]({ to: 'a@gym.co', ...datos });

    // Assert: el HTML y la version en texto dicen lo mismo
    const { htmlContent, textContent } = payloadEnviado();
    expect(htmlContent).toContain(enHtml);
    expect(textContent).toContain(enTexto);
  });
});

describe('email transport: sender, recipient and content', () => {
  test.each([
    ['MAIL_FROM is not set', undefined, REMITENTE_POR_DEFECTO],
    ['MAIL_FROM has name and address', 'Soporte Gym <soporte@gym.co>', { name: 'Soporte Gym', email: 'soporte@gym.co' }],
    ['MAIL_FROM has no space before the address', 'Gym<soporte@gym.co>', { name: 'Gym', email: 'soporte@gym.co' }],
    ['MAIL_FROM has spaces inside the brackets', '  Gym  < soporte@gym.co >', { name: 'Gym', email: 'soporte@gym.co' }],
    ['MAIL_FROM is only an address', '  soporte@gym.co  ', { name: 'FitLoyalty', email: 'soporte@gym.co' }],
  ])('should parse the sender when %s', async (_caso, mailFrom, esperado) => {
    // Arrange
    const email = cargarEmail({ MAIL_FROM: mailFrom });

    // Act
    await email.sendRecoveryCode({ to: 'ana@gym.co', name: 'Ana', code: '123456' });

    // Assert
    expect(payloadEnviado().sender).toEqual(esperado);
  });

  test('should send the code to the recipient with its subject and signed text when the key is set', async () => {
    // Arrange
    const email = cargarEmail();

    // Act
    const resultado = await email.sendRecoveryCode({ to: 'ana@gym.co', name: 'Ana', code: '482913' });

    // Assert
    const payload = payloadEnviado();
    expect(payload.to).toEqual([{ email: 'ana@gym.co' }]);
    expect(payload.subject).toBe('482913 — Tu codigo de recuperacion FitLoyalty');
    expect(payload.textContent).toContain('Tu codigo: 482913');
    expect(payload.textContent).toMatch(/— Equipo FitLoyalty\nfitloyaltysaas@gmail\.com$/);
    expect(resultado).toEqual({ delivered: true, id: 'msg-1' });
  });

  test.each([
    ['ADMINISTRADOR', 'Administrador'],
    ['ENTRENADOR', 'Entrenador'],
    ['RECEPCIONISTA', 'Recepcionista'],
    ['OTRO', 'Recepcionista'],
  ])('should label the role as %s -> %s when inviting staff', async (role, etiqueta) => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email.sendStaffInvite({ ...INVITACION, role });

    // Assert
    expect(payloadEnviado().htmlContent).toContain(`>${etiqueta}</p>`);
  });

  test.each([
    ['there is a QR image', 'data:image/png;base64,AAA', ['<img src="data:image/png;base64,AAA"']],
    ['there is no QR image', null, []],
  ])('should include the img tag only when %s', async (_caso, qrImageUrl, imagenes) => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email.sendMemberQR({ to: 'a@gym.co', memberName: 'Leo', gymName: 'Gym', qrCode: 'QR-77', qrImageUrl });

    // Assert: todas las <img> del correo; sin imagen no debe quedar ni un <img src="null">
    const { htmlContent } = payloadEnviado();
    expect(htmlContent.match(/<img src="[^"]*"/g) ?? []).toEqual(imagenes);
    expect(htmlContent).toContain('QR-77');
  });
});

describe('email transport: without key and with errors', () => {
  test.each([
    ['is not set', undefined],
    ['is empty', ''],
  ])('should not call Brevo when BREVO_API_KEY %s', async (_caso, apiKey) => {
    // Arrange
    const email = cargarEmail({ BREVO_API_KEY: apiKey });
    const { BrevoClient } = require('@getbrevo/brevo');

    // Act
    const resultado = await email.sendRecoveryCode({ to: 'ana@gym.co', name: 'Ana', code: '123456' });

    // Assert
    expect(resultado).toEqual({ delivered: false, reason: 'no-api' });
    expect(BrevoClient).not.toHaveBeenCalled();
    expect(mockSendTransacEmail).not.toHaveBeenCalled();
  });

  test('should report api-error and not throw when Brevo rejects the send', async () => {
    // Arrange
    mockSendTransacEmail = jest.fn().mockRejectedValue(new Error('401 unauthorized'));
    const email = cargarEmail();

    // Act
    const resultado = await email.sendRecoveryCode({ to: 'ana@gym.co', name: 'Ana', code: '123456' });

    // Assert
    expect(resultado).toEqual({ delivered: false, reason: 'api-error', error: '401 unauthorized' });
  });

  test('should throw when sendMail gets neither text nor html', async () => {
    // Arrange
    const email = cargarEmail();

    // Act
    const envio = email.sendMail({ to: 'ana@gym.co', subject: 'Hola' });

    // Assert
    await expect(envio).rejects.toThrow('sendMail: ni text ni html provistos');
    expect(mockSendTransacEmail).not.toHaveBeenCalled();
  });

  test.each([
    ['only html', { html: '<p>Hola <b>Ana</b></p>' }, 'Hola Ana'],
    ['text and html', { html: '<p>Hola</p>', text: 'Texto propio' }, 'Texto propio'],
  ])('should build the plain text when sendMail gets %s', async (_caso, contenido, textoEsperado) => {
    // Arrange
    const email = cargarEmail();

    // Act
    await email.sendMail({ to: 'ana@gym.co', subject: 'Hola', ...contenido });

    // Assert
    expect(payloadEnviado().textContent).toBe(textoEsperado);
  });
});
