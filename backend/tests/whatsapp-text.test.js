/**
 * Pruebas de sendWhatsAppText: debe LANZAR cuando el envio no sale, para
 * que contratos y avisos no queden registrados como enviados (RQF-13/14).
 */
const mockSend = jest.fn();
let mockHandlers;

jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => {
    mockHandlers = {};
    return {
      on: (ev, fn) => { mockHandlers[ev] = fn; },
      initialize: jest.fn().mockResolvedValue(undefined),
      sendMessage: mockSend,
    };
  }),
  LocalAuth: jest.fn(),
  MessageMedia: jest.fn(),
}));
jest.mock('qrcode-terminal', () => ({ generate: jest.fn() }));

function cargar(enabled) {
  jest.resetModules();
  process.env.ENABLE_WHATSAPP = enabled ? 'true' : 'false';
  process.env.PUPPETEER_EXECUTABLE_PATH = '/tmp/fake-chrome';
  return require('../src/lib/whatsapp');
}

describe('sendWhatsAppText', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('lanza si el modulo esta deshabilitado', async () => {
    const wa = cargar(false);
    await expect(wa.sendWhatsAppText('3001234567', 'hola')).rejects.toThrow(/deshabilitado/);
  });

  test('lanza si el cliente no esta listo', async () => {
    const wa = cargar(true); // initialize resuelve pero nunca llega 'ready'
    await expect(wa.sendWhatsAppText('3001234567', 'hola')).rejects.toThrow(/no esta listo/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('lanza con telefono invalido', async () => {
    const wa = cargar(true);
    mockHandlers.ready();
    await expect(wa.sendWhatsAppText('123', 'hola')).rejects.toThrow(/Telefono invalido/);
  });

  test('relanza el error de client.sendMessage', async () => {
    const wa = cargar(true);
    mockHandlers.ready();
    mockSend.mockRejectedValueOnce(new Error('fallo de red'));
    await expect(wa.sendWhatsAppText('3001234567', 'hola')).rejects.toThrow('fallo de red');
  });

  test('envia al chat con prefijo 57 cuando todo esta bien', async () => {
    const wa = cargar(true);
    mockHandlers.ready();
    mockSend.mockResolvedValueOnce({});
    await expect(wa.sendWhatsAppText('3001234567', 'hola')).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledWith('573001234567@c.us', 'hola');
  });
});
