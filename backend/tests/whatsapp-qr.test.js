const mockHandlers = {};
const mockSendMessage = jest.fn();
const mockInitialize = jest.fn();
const mockMessageMedia = jest.fn().mockImplementation((...args) => ({ args }));
const mockClientOn = jest.fn((event, handler) => {
  mockHandlers[event] = handler;
});

jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: (...args) => mockClientOn(...args),
    initialize: (...args) => mockInitialize(...args),
    sendMessage: (...args) => mockSendMessage(...args),
  })),
  LocalAuth: jest.fn(),
  MessageMedia: mockMessageMedia,
}));
jest.mock('qrcode-terminal', () => ({ generate: jest.fn() }));

function loadWhatsApp(enabled = true) {
  jest.resetModules();
  for (const event of Object.keys(mockHandlers)) delete mockHandlers[event];
  mockInitialize.mockReset();
  mockSendMessage.mockReset();
  process.env.ENABLE_WHATSAPP = enabled ? 'true' : 'false';
  process.env.PUPPETEER_EXECUTABLE_PATH = 'C:\\fake\\chrome.exe';
  return require('../src/lib/whatsapp');
}

describe('WhatsApp QR y estado del cliente', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ENABLE_WHATSAPP;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    jest.restoreAllMocks();
  });

  test('omite el QR cuando el módulo está deshabilitado', async () => {
    const whatsapp = loadWhatsApp(false);

    await expect(whatsapp.sendWhatsAppQR('3001234567', 'Ana', 'Fit Gym', 'QR-1'))
      .resolves.toBeUndefined();
    expect(whatsapp.isWhatsAppReady()).toBe(false);
    expect(whatsapp.isWhatsAppEnabled()).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      '[WhatsApp] Modulo deshabilitado, se omite envio automatico.'
    );
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  test('conecta eventos de QR y autenticación', () => {
    const whatsapp = loadWhatsApp();
    const qrcode = require('qrcode-terminal');

    mockHandlers.qr('qr-test');
    mockHandlers.auth_failure('bad session');

    expect(qrcode.generate).toHaveBeenCalledWith('qr-test', { small: true });
    expect(console.error).toHaveBeenCalledWith('[WhatsApp] Error de autenticacion:', 'bad session');
    expect(whatsapp.isWhatsAppEnabled()).toBe(true);
    expect(whatsapp.isWhatsAppReady()).toBe(false);
  });

  test('envía saludo y código de texto con teléfono normalizado', async () => {
    const whatsapp = loadWhatsApp();
    mockInitialize.mockImplementation(async () => mockHandlers.ready());
    mockSendMessage.mockResolvedValue({});

    await whatsapp.sendWhatsAppQR('300 123 4567', 'Ana', 'Fit Gym', 'QR-123');

    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      '573001234567@c.us',
      expect.stringContaining('Bienvenido a *Fit Gym*')
    );
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      2,
      '573001234567@c.us',
      'Tu codigo de texto es: QR-123'
    );
    expect(whatsapp.isWhatsAppReady()).toBe(true);
  });

  test('envía imagen QR como media y refleja desconexión del cliente', async () => {
    const whatsapp = loadWhatsApp();
    mockInitialize.mockImplementation(async () => mockHandlers.ready());
    mockSendMessage.mockResolvedValue({});

    await whatsapp.sendWhatsAppQR(
      '573001234567',
      'Ana',
      'Fit Gym',
      'QR-123',
      'data:image/png;base64,abc123'
    );

    expect(mockMessageMedia).toHaveBeenCalledWith('image/png', 'abc123', 'qr-acceso.png');
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    mockHandlers.disconnected('logged out');
    expect(whatsapp.isWhatsAppReady()).toBe(false);
  });

  test('omite el envío cuando falla la inicialización', async () => {
    const whatsapp = loadWhatsApp();
    mockInitialize.mockRejectedValueOnce(new Error('Chrome missing'));

    await whatsapp.sendWhatsAppQR('3001234567', 'Ana', 'Fit Gym', 'QR-123');

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      '[WhatsApp] No se pudo inicializar el cliente (probablemente falta Chrome/Puppeteer).',
      'Los envios automaticos quedaran deshabilitados hasta arreglar el entorno.',
      'Detalle:',
      'Chrome missing'
    );
    expect(console.warn).toHaveBeenCalledWith(
      '[WhatsApp] Cliente no listo, se omite envio automatico a',
      'Ana'
    );
  });

  test('no propaga errores al intentar enviar el QR', async () => {
    const whatsapp = loadWhatsApp();
    mockInitialize.mockImplementation(async () => mockHandlers.ready());
    mockSendMessage.mockRejectedValueOnce(new Error('send failed'));

    await expect(whatsapp.sendWhatsAppQR('3001234567', 'Ana', 'Fit Gym', 'QR-123'))
      .resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[WhatsApp] Error al enviar el mensaje:', 'send failed');
  });
});
