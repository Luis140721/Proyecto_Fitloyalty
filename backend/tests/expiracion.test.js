/**
 * Job de avisos de vencimiento (RQF-14).
 *  - Un aviso solo se marca como enviado si WhatsApp realmente lo envio.
 *  - Cada plan recibe como maximo dos avisos: al entrar en la ventana de dias
 *    del gimnasio y el dia del vencimiento (no uno por dia).
 *  - El job NO depende de que WhatsApp ya este inicializado: tras un reinicio
 *    el cliente es perezoso y solo arranca dentro de sendWhatsAppText.
 */
const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

const { runJob } = require('../src/jobs/expiracion');

/**
 * Simula la base con estado: `enviados` guarda los avisos ya marcados
 * ({ plan, dias }) y `hoy` es cuantos dias faltan para el vencimiento.
 */
function prepararBD({ diasAviso = 3, diasRestantes = 2, enviados = [] } = {}) {
  const estado = { enviados: [...enviados], diasRestantes };
  mockQuery.mockImplementation(async (sql, params) => {
    if (sql.includes('MAX(dias_aviso_vencimiento)')) return { rows: [{ max_dias: diasAviso }] };
    if (sql.includes('FROM miembro m')) {
      return {
        rows: [{
          id_miembro: 7, nombre: 'Ana', telefono: '3001234567', id_gimnasio: 1,
          gym_nombre: 'Gym Demo', tipo_plan: 'MENSUAL', fecha_fin: '2026-10-20',
          dias_restantes: estado.diasRestantes, dias_aviso: diasAviso,
        }],
      };
    }
    if (sql.includes('SELECT id_plan_cobro FROM plan_cobro')) return { rows: [{ id_plan_cobro: 99 }] };
    if (sql.includes('SELECT 1 FROM alerta_vencimiento_enviada')) {
      const hoy = sql.includes('dias_restantes = 0');
      const hay = estado.enviados.some((e) => e.plan === params[0] && (hoy ? e.dias === 0 : e.dias > 0));
      return { rows: hay ? [{}] : [] };
    }
    if (sql.includes('INSERT INTO alerta_vencimiento_enviada')) {
      estado.enviados.push({ plan: params[1], dias: params[2] });
      return { rows: [] };
    }
    throw new Error('Consulta inesperada: ' + sql.slice(0, 60));
  });
  return estado;
}

const waOk = () => ({ sendWhatsAppText: jest.fn().mockResolvedValue(undefined) });

beforeEach(() => mockQuery.mockReset());

describe('runJob: envio y marcado', () => {
  test('envia y marca como enviado', async () => {
    const estado = prepararBD();
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(r.enviados).toBe(1);
    expect(estado.enviados).toEqual([{ plan: 99, dias: 2 }]);
  });

  test('no consulta isWhatsAppReady: funciona con un cliente sin inicializar', async () => {
    prepararBD();
    // Solo trae sendWhatsAppText; si el job exigiera isWhatsAppReady fallaria.
    const wa = { sendWhatsAppText: jest.fn().mockResolvedValue(undefined) };
    const r = await runJob({ whatsappClient: wa });
    expect(r.enviados).toBe(1);
  });

  test('aunque isWhatsAppReady diga false igual intenta enviar (el envio lo inicializa)', async () => {
    prepararBD();
    const wa = { isWhatsAppReady: () => false, sendWhatsAppText: jest.fn().mockResolvedValue(undefined) };
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(r.enviados).toBe(1);
  });

  test('si el envio falla no marca como enviado y cuenta el error', async () => {
    const estado = prepararBD();
    const wa = { sendWhatsAppText: jest.fn().mockRejectedValue(new Error('fallo')) };
    const r = await runJob({ whatsappClient: wa });
    expect(r.enviados).toBe(0);
    expect(r.errores).toBe(1);
    expect(estado.enviados).toHaveLength(0);
  });

  test('si WhatsApp no esta listo (error del envio) queda pendiente para el reintento', async () => {
    const estado = prepararBD();
    const err = Object.assign(new Error('no listo'), { code: 'WHATSAPP_NO_LISTO' });
    await runJob({ whatsappClient: { sendWhatsAppText: jest.fn().mockRejectedValue(err) } });
    expect(estado.enviados).toHaveLength(0);
    // en la siguiente corrida, ya listo, sale
    const r = await runJob({ whatsappClient: waOk() });
    expect(r.enviados).toBe(1);
  });

  test('respeta la ventana de dias del gimnasio', async () => {
    prepararBD({ diasAviso: 3, diasRestantes: 10 });
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.enVentana).toBe(0);
  });
});

describe('runJob: maximo dos avisos por plan', () => {
  test('con 3 dias de aviso salen 2 mensajes en total (al entrar y el dia 0), no 4', async () => {
    const estado = prepararBD({ diasAviso: 3, diasRestantes: 3 });
    const wa = waOk();
    for (const dias of [3, 2, 1, 0]) {
      estado.diasRestantes = dias;
      await runJob({ whatsappClient: wa });
    }
    expect(wa.sendWhatsAppText).toHaveBeenCalledTimes(2);
    expect(estado.enviados.map((e) => e.dias)).toEqual([3, 0]);
  });

  test('con 30 dias de aviso tambien son 2, no 31', async () => {
    const estado = prepararBD({ diasAviso: 30, diasRestantes: 30 });
    const wa = waOk();
    for (let dias = 30; dias >= 0; dias--) {
      estado.diasRestantes = dias;
      await runJob({ whatsappClient: wa });
    }
    expect(wa.sendWhatsAppText).toHaveBeenCalledTimes(2);
  });

  test('si el servidor estuvo dormido el dia exacto, el aviso sale al dia siguiente (no se pierde)', async () => {
    const estado = prepararBD({ diasAviso: 3, diasRestantes: 3 });
    const wa = waOk();
    // el dia 3 no corrio nadie; el job corre por primera vez cuando faltan 2
    estado.diasRestantes = 2;
    await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(estado.enviados).toEqual([{ plan: 99, dias: 2 }]);
  });

  test('el dia del vencimiento envia aunque el aviso anterior ya se haya mandado', async () => {
    prepararBD({ diasAviso: 3, diasRestantes: 0, enviados: [{ plan: 99, dias: 3 }] });
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(r.enviados).toBe(1);
  });

  test('el dia del vencimiento no repite si ya se mando', async () => {
    prepararBD({ diasAviso: 3, diasRestantes: 0, enviados: [{ plan: 99, dias: 3 }, { plan: 99, dias: 0 }] });
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.omitidosDuplicado).toBe(1);
  });

  test('avisos ya enviados dia a dia antes del cambio no se reenvian', async () => {
    // historial del comportamiento anterior: uno por dia (3, 2)
    prepararBD({ diasAviso: 3, diasRestantes: 1, enviados: [{ plan: 99, dias: 3 }, { plan: 99, dias: 2 }] });
    const wa = waOk();
    await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
  });
});

describe('runJob con el modulo real de WhatsApp, sin precalentar (como tras un reinicio)', () => {
  const mockSend = jest.fn();
  let handlers;
  let initialize;

  function cargarJobConWhatsappReal({ conecta }) {
    jest.resetModules();
    process.env.ENABLE_WHATSAPP = 'true';
    process.env.PUPPETEER_EXECUTABLE_PATH = '/tmp/fake-chrome';
    initialize = jest.fn(async () => { if (conecta) handlers.ready(); });
    jest.doMock('whatsapp-web.js', () => ({
      Client: jest.fn().mockImplementation(() => {
        handlers = {};
        return { on: (ev, fn) => { handlers[ev] = fn; }, initialize, sendMessage: mockSend };
      }),
      LocalAuth: jest.fn(),
      MessageMedia: jest.fn(),
    }));
    jest.doMock('qrcode-terminal', () => ({ generate: jest.fn() }));
    jest.doMock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));
    return require('../src/jobs/expiracion');
  }

  beforeEach(() => {
    mockSend.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('el job inicializa WhatsApp por su cuenta y envia el aviso', async () => {
    const { runJob: job } = cargarJobConWhatsappReal({ conecta: true });
    const estado = prepararBD();
    mockSend.mockResolvedValue({});
    const r = await job(); // sin whatsappClient: usa el modulo real
    expect(initialize).toHaveBeenCalledTimes(1);          // nadie lo habia inicializado antes
    expect(mockSend).toHaveBeenCalledWith('573001234567@c.us', expect.any(String));
    expect(r.enviados).toBe(1);
    expect(estado.enviados).toHaveLength(1);
  });

  test('si WhatsApp no llega a estar listo, no marca nada y cuenta el error', async () => {
    const { runJob: job } = cargarJobConWhatsappReal({ conecta: false });
    const estado = prepararBD();
    const r = await job();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
    expect(r.enviados).toBe(0);
    expect(r.errores).toBe(1);
    expect(estado.enviados).toHaveLength(0);
  });
});
