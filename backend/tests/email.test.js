function loadEmailModule({ apiKey, sendTransacEmail, constructorError } = {}) {
  jest.resetModules();
  if (apiKey) process.env.BREVO_API_KEY = apiKey;
  else delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;

  jest.doMock('@getbrevo/brevo', () => ({
    BrevoEnvironment: { PRODUCTION: 'production' },
    BrevoClient: jest.fn().mockImplementation(() => {
      if (constructorError) throw constructorError;
      return { transactionalEmails: { sendTransacEmail } };
    }),
  }));
  return require('../src/lib/email');
}

describe('plantillas y transporte de correo', () => {
  let log;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.BREVO_API_KEY;
    delete process.env.MAIL_FROM;
    jest.dontMock('@getbrevo/brevo');
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('construye correos de recuperación por código y enlace en modo local', async () => {
    const email = loadEmailModule();

    const code = await email.sendRecoveryCode({
      to: 'ana@example.com',
      name: 'Ana',
      code: '123456',
      expiresMinutes: 10,
    });
    const link = await email.sendRecoveryLink({
      to: 'ana@example.com',
      name: 'Ana',
      resetUrl: 'https://example.com/reset',
      expiresHours: 2,
    });

    expect(code).toEqual({ delivered: false, reason: 'no-api' });
    expect(link).toEqual({ delivered: false, reason: 'no-api' });
    expect(log).toHaveBeenCalledWith(
      '[EMAIL] Modo consola - Para:', 'ana@example.com', 'Asunto:',
      expect.stringContaining('123456')
    );
    expect(log).toHaveBeenCalledWith(
      '[EMAIL] Modo consola - Para:', 'ana@example.com', 'Asunto:',
      expect.stringContaining('FitLoyalty')
    );
  });

  test('construye invitación y correo QR con y sin imagen', async () => {
    const email = loadEmailModule();

    const invitation = await email.sendStaffInvite({
      to: 'recepcion@example.com',
      invitedName: 'Ana',
      invitedBy: 'Luis',
      gymName: 'Fit Gym',
      role: 'ENTRENADOR',
      acceptUrl: 'https://example.com/accept',
    });
    const member = await email.sendMemberQR({
      to: 'ana@example.com',
      memberName: 'Ana',
      gymName: 'Fit Gym',
      qrCode: 'QR-123',
    });

    expect(invitation).toEqual({ delivered: false, reason: 'no-api' });
    expect(member).toEqual({ delivered: false, reason: 'no-api' });
    expect(log).toHaveBeenCalledWith(
      '[EMAIL] Modo consola - Para:', 'recepcion@example.com', 'Asunto:',
      expect.stringContaining('Fit Gym')
    );
    expect(log).toHaveBeenCalledWith(
      '[EMAIL] Modo consola - Para:', 'ana@example.com', 'Asunto:',
      expect.stringContaining('Fit Gym')
    );
  });

  test('envía vía Brevo y analiza remitente con nombre', async () => {
    const sendTransacEmail = jest.fn().mockResolvedValue({ messageId: 'message-1' });
    const email = loadEmailModule({ apiKey: 'test-api-key', sendTransacEmail });
    process.env.MAIL_FROM = 'FitLoyalty <noreply@example.com>';

    const result = await email.sendRecoveryCode({
      to: 'ana@example.com',
      name: 'Ana',
      code: '123456',
    });

    expect(result).toEqual({ delivered: true, id: 'message-1' });
    expect(sendTransacEmail).toHaveBeenCalledWith(expect.objectContaining({
      sender: { name: 'FitLoyalty', email: 'noreply@example.com' },
      to: [{ email: 'ana@example.com' }],
      textContent: expect.stringContaining('Tu codigo: 123456'),
    }));
  });

  test('maneja errores de la API de Brevo sin reportar envío exitoso', async () => {
    const sendTransacEmail = jest.fn().mockRejectedValue({
      message: 'Brevo unavailable',
      response: { body: 'rate limited' },
    });
    const email = loadEmailModule({ apiKey: 'test-api-key', sendTransacEmail });

    await expect(email.sendRecoveryLink({
      to: 'ana@example.com',
      name: 'Ana',
      resetUrl: 'https://example.com/reset',
    })).resolves.toEqual({
      delivered: false,
      reason: 'api-error',
      error: 'Brevo unavailable',
    });
    expect(log).toHaveBeenCalledWith('[EMAIL] Error Brevo:', 'rate limited');
  });

  test('vuelve al modo consola si no puede crear el cliente Brevo', async () => {
    const email = loadEmailModule({ apiKey: 'test-api-key', constructorError: new Error('bad key') });

    await expect(email.sendMemberQR({
      to: 'ana@example.com',
      memberName: 'Ana',
      gymName: 'Fit Gym',
      qrCode: 'QR-123',
    })).resolves.toEqual({ delivered: false, reason: 'no-api' });
    expect(log).toHaveBeenCalledWith('[EMAIL] Error cliente Brevo:', 'bad key');
  });
});
