const originalEnv = { ...process.env };

function loadEmail() {
  jest.resetModules();
  return require('../src/lib/email');
}

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.dontMock('@getbrevo/brevo');
  process.env = { ...originalEnv };
});

test('genera correos de recuperación, invitación y QR en modo consola cuando falta la API key', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const email = loadEmail();

  const recoveryCode = await email.sendRecoveryCode({
    to: 'miembro@example.com', name: 'Ana', code: '123456',
  });
  const recoveryLink = await email.sendRecoveryLink({
    to: 'miembro@example.com', name: 'Ana', resetUrl: 'https://example.com/reset',
  });
  const invitation = await email.sendStaffInvite({
    to: 'staff@example.com',
    invitedName: 'Luis',
    invitedBy: 'Ana',
    gymName: 'Gimnasio',
    role: 'trainer',
    acceptUrl: 'https://example.com/invite',
  });
  const memberQr = await email.sendMemberQR({
    to: 'miembro@example.com',
    memberName: 'Ana',
    gymName: 'Gimnasio',
    qrCode: 'QR-123',
    qrImageUrl: 'https://example.com/qr.png',
  });

  for (const result of [recoveryCode, recoveryLink, invitation, memberQr]) {
    expect(result).toEqual({ delivered: false, reason: 'no-api' });
  }
});

test('valida sendMail y utiliza HTML como versión de texto cuando no se proporciona texto', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const email = loadEmail();

  await expect(email.sendMail({ to: 'a@example.com', subject: 'Vacío' }))
    .rejects.toThrow('sendMail: ni text ni html provistos');
  await expect(email.sendMail({
    to: 'a@example.com', subject: 'HTML', html: '<p>Contenido</p>',
  })).resolves.toEqual({ delivered: false, reason: 'no-api' });
});

test('envía con Brevo, interpreta remitentes con nombre o solo correo y reporta errores de API', async () => {
  const sendTransacEmail = jest.fn()
    .mockResolvedValueOnce({ messageId: 'message-1' })
    .mockRejectedValueOnce({ message: 'falló', response: { body: { detail: 'rechazado' } } })
    .mockRejectedValueOnce({ message: 'falló', response: { text: 'texto rechazado' } });
  const client = { transactionalEmails: { sendTransacEmail } };
  jest.doMock('@getbrevo/brevo', () => ({
    BrevoClient: jest.fn(() => client),
    BrevoEnvironment: { PRODUCTION: 'production' },
  }));
  process.env.BREVO_API_KEY = 'test-key';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const email = loadEmail();

  await expect(email.sendMail({
    to: 'a@example.com',
    subject: 'Prueba',
    text: 'Contenido',
  })).resolves.toEqual({ delivered: true, id: 'message-1' });
  expect(sendTransacEmail.mock.calls[0][0].sender).toEqual({
    name: 'FitLoyalty',
    email: 'fitloyaltysaas@gmail.com',
  });

  await expect(email.sendMail({
    to: 'b@example.com',
    subject: 'Falla',
    text: 'Contenido',
  })).resolves.toEqual({ delivered: false, reason: 'api-error', error: 'falló' });
  expect(sendTransacEmail.mock.calls[1][0].sender).toEqual({
    name: 'FitLoyalty',
    email: 'fitloyaltysaas@gmail.com',
  });

  process.env.MAIL_FROM = 'Soporte <soporte@example.com>';
  await expect(email.sendMail({
    to: 'c@example.com',
    subject: 'Falla',
    html: '<strong>Contenido</strong>',
  })).resolves.toEqual({ delivered: false, reason: 'api-error', error: 'falló' });
  expect(sendTransacEmail.mock.calls[2][0].sender).toEqual({
    name: 'Soporte',
    email: 'soporte@example.com',
  });
});

test('cae a modo consola si no puede construir el cliente Brevo', async () => {
  jest.doMock('@getbrevo/brevo', () => ({
    BrevoClient: jest.fn(() => { throw new Error('configuración inválida'); }),
    BrevoEnvironment: { PRODUCTION: 'production' },
  }));
  process.env.BREVO_API_KEY = 'test-key';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const email = loadEmail();

  await expect(email.sendRecoveryCode({
    to: 'a@example.com', name: 'Ana', code: '123456',
  })).resolves.toEqual({ delivered: false, reason: 'no-api' });
});
