/**
 * Job de avisos de vencimiento (RQF-14).
 *  - Un aviso solo se marca como enviado si WhatsApp realmente lo envio.
 *  - Cada plan recibe como maximo dos avisos: al entrar en la ventana de dias
 *    del gimnasio y el dia del vencimiento (no uno por dia).
 *  - El job NO depende de que WhatsApp ya este inicializado: tras un reinicio
 *    el cliente es perezoso y solo arranca dentro de sendWhatsAppText.
 *  - RQNF-16 (Ley 2300 de 2023): solo envia en el horario permitido y respeta
 *    la frecuencia (una vez al dia, un solo canal por semana), sin pedir el
 *    permiso comercial.
 *
 * El reloj de la Ley 2300 se fija a un martes a las 10:00 a. m. (hora de
 * Colombia); las pruebas que simulan varios dias lo mueven.
 */
const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({
  query: (...a) => mockQuery(...a),
  connect: async () => ({ query: (...a) => mockQuery(...a), release: () => {} }),
}));

const legal = require('../src/lib/contacto-legal');
const { runJob } = require('../src/jobs/expiracion');

const co = (texto) => new Date(`${texto.replace(' ', 'T')}:00-05:00`);
const MARTES = co('2026-11-17 10:00');
const fijarReloj = (instante) => legal.establecerReloj(() => instante);
/** Un dia habil a las 10:00, en una semana distinta por cada i. */
const otraSemana = (i) => legal.siguienteHorarioPermitido(new Date(MARTES.getTime() + i * 7 * 86400000));

beforeEach(() => fijarReloj(MARTES));
afterAll(() => legal.establecerReloj(null));

/**
 * Simula la base con estado: `enviados` guarda los avisos ya marcados
 * ({ plan, dias, fecha, vence }), `contactos` otros envios de la semana ({ canal,
 * fecha }) y `diasRestantes` es cuantos dias faltan para el vencimiento (`vence`).
 * La cuenta que en SQL une el aviso con su vencimiento la prueba, contra
 * PostgreSQL, tests/integracion/aviso-vencimiento-renovacion.test.js.
 */
function prepararBD({ diasAviso = 3, diasRestantes = 2, enviados = [], contactos = [], vence = 'ciclo 1' } = {}) {
  const estado = { enviados: enviados.map((e) => ({ vence, ...e })), contactos: [...contactos], diasRestantes, vence };
  mockQuery.mockImplementation(async (sql, params) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('to_regclass')) return { rows: [{ existe: true }] };
    if (sql.includes('FROM envio_mensaje e')) {
      return { rows: estado.contactos.filter((c) => c.fecha >= params[1]).map((c) => ({ id_miembro: 7, ...c })) };
    }
    if (sql.includes("'WHATSAPP' AS canal") && sql.includes('FROM alerta_vencimiento_enviada')) {
      return { rows: estado.enviados.filter((e) => e.fecha && e.fecha >= params[1]).map((e) => ({ id_miembro: 7, canal: 'WHATSAPP', fecha: e.fecha })) };
    }
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
      // Sin esta condicion el aviso de antes de renovar contaria como enviado.
      if (!/enviado_at::date \+ dias_restantes = CURRENT_DATE \+ \$2::int/.test(sql) || params[1] !== estado.diasRestantes) {
        throw new Error('La busqueda no mira el vencimiento actual');
      }
      const hay = estado.enviados.some((e) => e.plan === params[0] && e.vence === estado.vence && (hoy ? e.dias === 0 : e.dias > 0));
      return { rows: hay ? [{}] : [] };
    }
    if (sql.includes('INSERT INTO alerta_vencimiento_enviada')) {
      // UNIQUE (id_plan_cobro, dias_restantes), con DO UPDATE.
      if (!/ON CONFLICT \(id_plan_cobro, dias_restantes\) DO UPDATE SET enviado_at = EXCLUDED\.enviado_at/.test(sql)) {
        throw new Error('El aviso del ciclo nuevo no quedaria marcado');
      }
      estado.enviados = estado.enviados.filter((e) => !(e.plan === params[1] && e.dias === params[2]));
      estado.enviados.push({ plan: params[1], dias: params[2], fecha: params[3], vence: estado.vence });
      return { rows: [] };
    }
    throw new Error('Consulta inesperada: ' + sql.slice(0, 60));
  });
  return estado;
}

/** Solo plan y dias, para comparar sin la fecha. */
const sinFecha = (lista) => lista.map(({ plan, dias }) => ({ plan, dias }));

const waOk = () => ({ sendWhatsAppText: jest.fn().mockResolvedValue(undefined) });

beforeEach(() => mockQuery.mockReset());

describe('runJob: envio y marcado', () => {
  test('envia y marca como enviado', async () => {
    const estado = prepararBD();
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(r.enviados).toBe(1);
    expect(sinFecha(estado.enviados)).toEqual([{ plan: 99, dias: 2 }]);
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

// Renovar (PUT /plan) y descongelar cambian las fechas del mismo plan_cobro.
describe('runJob: el plan renovado vuelve a recibir sus avisos', () => {
  test('despues de renovar salen otra vez los dos avisos, y ninguno se repite', async () => {
    const estado = prepararBD({ diasAviso: 3, diasRestantes: 3 });
    const wa = waOk();
    let semana = 0;
    const correr = async (dias) => {
      estado.diasRestantes = dias;
      semana += 1;
      fijarReloj(otraSemana(semana));
      return (await runJob({ whatsappClient: wa })).enviados;
    };

    expect([await correr(3), await correr(2), await correr(0), await correr(0)]).toEqual([1, 0, 1, 0]);
    estado.vence = 'ciclo 2';
    expect([await correr(3), await correr(2), await correr(0), await correr(0)]).toEqual([1, 0, 1, 0]);

    expect(sinFecha(estado.enviados)).toEqual([{ plan: 99, dias: 3 }, { plan: 99, dias: 0 }]);
  });
});

describe('runJob: maximo dos avisos por plan', () => {
  test('con 3 dias de aviso salen 2 mensajes en total (al entrar y el dia 0), no 4', async () => {
    const estado = prepararBD({ diasAviso: 3, diasRestantes: 3 });
    const wa = waOk();
    // Cada corrida en otro dia habil (y otra semana), para que la frecuencia
    // de la Ley 2300 no se mezcle con esta regla.
    for (const [i, dias] of [3, 2, 1, 0].entries()) {
      fijarReloj(otraSemana(i));
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
      fijarReloj(otraSemana(30 - dias));
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
    expect(sinFecha(estado.enviados)).toEqual([{ plan: 99, dias: 2 }]);
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
    jest.doMock('../src/db/db', () => ({
      query: (...a) => mockQuery(...a),
      connect: async () => ({ query: (...a) => mockQuery(...a), release: () => {} }),
    }));
    const job = require('../src/jobs/expiracion');
    // resetModules trae otro lib/contacto-legal: se le fija el mismo reloj.
    require('../src/lib/contacto-legal').establecerReloj(() => MARTES);
    return job;
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

describe('runJob: Ley 2300 de 2023 (RQNF-16)', () => {
  test.each([
    ['domingo', '2026-11-22 10:00', 'DOMINGO'],
    ['festivo (lunes 16 de noviembre de 2026)', '2026-11-16 10:00', 'FESTIVO'],
    ['martes antes de las 7:00 a. m.', '2026-11-17 06:30', 'ANTES'],
    ['sabado a las 3:00 p. m.', '2026-11-21 15:00', 'DESPUES'],
  ])('%s: no envia ningun aviso y dice cuando sigue', async (_, hora, razon) => {
    fijarReloj(co(hora));
    const estado = prepararBD();
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.fueraDeHorario).toBe(true);
    expect(r.motivo).toContain(razon);
    expect(r.siguiente).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(estado.enviados).toHaveLength(0);
  });

  test('sabado a las 8:00 a. m.: si envia', async () => {
    fijarReloj(co('2026-11-21 08:00'));
    prepararBD();
    const r = await runJob({ whatsappClient: waOk() });
    expect(r.enviados).toBe(1);
  });

  test('si ya se le escribio hoy (por cualquier canal), no le llega el aviso y queda para otro dia', async () => {
    const estado = prepararBD({ contactos: [{ canal: 'WHATSAPP', fecha: co('2026-11-17 08:15') }] });
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.omitidosLey2300).toBe(1);
    expect(r.detalle[0]).toMatchObject({ motivo: 'FRECUENCIA' });
    expect(estado.enviados).toHaveLength(0);
    // al dia siguiente si sale
    fijarReloj(co('2026-11-18 10:00'));
    expect((await runJob({ whatsappClient: wa })).enviados).toBe(1);
  });

  test('si esta semana se le escribio por correo, no se le escribe por WhatsApp', async () => {
    prepararBD({ contactos: [{ canal: 'EMAIL', fecha: co('2026-11-16 18:00') }] });
    const wa = waOk();
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.detalle[0].mensaje).toMatch(/misma semana/);
  });

  test('un correo de la semana pasada no impide el aviso', async () => {
    prepararBD({ contactos: [{ canal: 'EMAIL', fecha: co('2026-11-15 12:00') }] });
    expect((await runJob({ whatsappClient: waOk() })).enviados).toBe(1);
  });

  test('es un aviso del contrato: no pide la aceptacion de mensajes comerciales', async () => {
    const estado = prepararBD();
    await runJob({ whatsappClient: waOk() });
    expect(estado.enviados).toHaveLength(1);
    expect(mockQuery.mock.calls.some(([sql]) => /autorizacion_miembro/.test(sql))).toBe(false);
  });

  test('guarda el aviso con la hora del reloj de la ley, dentro de la transaccion con el bloqueo', async () => {
    const estado = prepararBD();
    await runJob({ whatsappClient: waOk() });
    expect(estado.enviados[0].fecha.toISOString()).toBe(MARTES.toISOString());
    const sqls = mockQuery.mock.calls.map(([sql]) => sql);
    const i = (re) => sqls.findIndex((s) => re.test(s));
    expect(i(/^BEGIN$/)).toBeLessThan(i(/pg_advisory_xact_lock/));
    expect(i(/pg_advisory_xact_lock/)).toBeLessThan(i(/INSERT INTO alerta_vencimiento_enviada/));
    expect(i(/INSERT INTO alerta_vencimiento_enviada/)).toBeLessThan(i(/^COMMIT$/));
  });
});
