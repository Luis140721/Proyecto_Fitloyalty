const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...args) => mockQuery(...args) }));

const { runJob, miembrosPorVencer, telParaWhatsapp } = require('../src/jobs/expiracion');

const candidate = (overrides = {}) => ({
  id_miembro: 1,
  nombre: 'Ana',
  telefono: '3001234567',
  id_gimnasio: 7,
  gym_nombre: 'Fit Gym',
  tipo_plan: 'MENSUAL',
  fecha_fin: '2026-11-04',
  dias_restantes: 3,
  dias_aviso: 3,
  ...overrides,
});

function setupJob(candidates, { maxDays = 3, planId = 10, alreadySent = false } = {}) {
  mockQuery.mockImplementation(async (sql) => {
    if (/MAX\(dias_aviso_vencimiento\)/i.test(sql)) {
      return { rows: [{ max_dias: maxDays }] };
    }
    if (/SELECT\s+m\.id_miembro/i.test(sql)) return { rows: candidates };
    if (/SELECT id_plan_cobro FROM plan_cobro/i.test(sql)) {
      return { rows: planId ? [{ id_plan_cobro: planId }] : [] };
    }
    if (/SELECT 1 FROM alerta_vencimiento_enviada/i.test(sql)) {
      return { rows: alreadySent ? [{ '?column?': 1 }] : [] };
    }
    if (/INSERT INTO alerta_vencimiento_enviada/i.test(sql)) return { rowCount: 1 };
    throw new Error(`Consulta inesperada: ${sql.slice(0, 60)}`);
  });
}

describe('telParaWhatsapp', () => {
  test.each([
    ['rechaza teléfonos cortos', '123456', null],
    ['normaliza móvil colombiano', '(300) 123-4567', '573001234567'],
    ['conserva teléfono con prefijo', '+573001234567', '573001234567'],
  ])('%s', (_description, phone, expected) => {
    expect(telParaWhatsapp(phone)).toBe(expected);
  });
});

describe('miembrosPorVencer', () => {
  test('consulta miembros y retorna filas usando el límite de días recibido', async () => {
    const rows = [candidate()];
    mockQuery.mockResolvedValueOnce({ rows });

    await expect(miembrosPorVencer(5)).resolves.toBe(rows);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LATERAL'), [5]);
    expect(mockQuery.mock.calls[0][0]).toContain('g.activo = TRUE');
  });
});

describe('runJob', () => {
  beforeEach(() => mockQuery.mockReset());

  test('detiene el job si todos los gimnasios desactivaron los avisos', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ max_dias: 0 }] });

    const result = await runJob();

    expect(result.encontrados).toBe(0);
    expect(result.motivo).toMatch(/desactivado/);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('limita la ventana máxima a treinta días', async () => {
    setupJob([], { maxDays: 90 });

    await runJob({ dryRun: true, whatsappClient: {} });

    expect(mockQuery.mock.calls[1][1]).toEqual([30]);
  });

  test('cuenta gimnasios desactivados, teléfonos faltantes, duplicados y éxitos hipotéticos', async () => {
    const candidates = [
      candidate({ id_miembro: 1, dias_aviso: 0 }),
      candidate({ id_miembro: 2, dias_restantes: 10, dias_aviso: 3 }),
      candidate({ id_miembro: 3, telefono: null, dias_restantes: 2 }),
      candidate({ id_miembro: 4, dias_restantes: 1 }),
      candidate({ id_miembro: 5, dias_restantes: 0, tipo_plan: 'MENSUAL' }),
    ];
    setupJob(candidates, { alreadySent: false });
    const result = await runJob({ dryRun: true });

    expect(result).toMatchObject({
      encontrados: 5,
      enVentana: 3,
      enviados: 2,
      omitidosDuplicado: 0,
      omitidosGymDesactivado: 1,
      omitidosSinTelefono: 1,
      dryRun: true,
    });
    expect(result.detalle).toEqual(expect.arrayContaining([
      { id: 1, motivo: 'gym-desactivado' },
      { id: 3, motivo: 'sin-telefono' },
      expect.objectContaining({ id: 5, texto: expect.stringContaining('vence *hoy*') }),
    ]));
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO alerta_vencimiento_enviada/i.test(sql))).toBe(false);
  });

  test('omite un miembro cuando no encuentra su plan activo', async () => {
    setupJob([candidate()], { planId: null });

    const result = await runJob({ dryRun: true, whatsappClient: {} });

    expect(result.enVentana).toBe(1);
    expect(result.enviados).toBe(0);
    expect(result.detalle).toHaveLength(0);
  });

  test('envía WhatsApp y registra el aviso para el plan', async () => {
    setupJob([candidate()]);
    const whatsappClient = { sendWhatsAppText: jest.fn().mockResolvedValue(undefined) };

    const result = await runJob({ whatsappClient });

    expect(result.enviados).toBe(1);
    expect(whatsappClient.sendWhatsAppText).toHaveBeenCalledWith(
      '573001234567',
      expect.stringContaining('Tu plan vence')
    );
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO alerta_vencimiento_enviada/i.test(sql))).toBe(true);
    expect(result.detalle[0]).toMatchObject({ status: 'enviado', id: 1, tel: '573001234567' });
  });

  test('registra el error de WhatsApp sin contar el envío', async () => {
    setupJob([candidate()]);
    const whatsappClient = { sendWhatsAppText: jest.fn().mockRejectedValue(new Error('offline')) };

    const result = await runJob({ whatsappClient });

    expect(result.enviados).toBe(0);
    expect(result.detalle[0]).toMatchObject({ status: 'error', error: 'offline' });
  });

  test('no reenvía un aviso ya registrado', async () => {
    setupJob([candidate()], { alreadySent: true });

    const result = await runJob({ dryRun: true });

    expect(result.omitidosDuplicado).toBe(1);
    expect(result.enviados).toBe(0);
  });

  test('tolera que aún no exista la tabla anti-duplicados', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/MAX\(dias_aviso_vencimiento\)/i.test(sql)) return { rows: [{ max_dias: 3 }] };
      if (/SELECT\s+m\.id_miembro/i.test(sql)) return { rows: [candidate()] };
      if (/SELECT id_plan_cobro FROM plan_cobro/i.test(sql)) return { rows: [{ id_plan_cobro: 10 }] };
      if (/SELECT 1 FROM alerta_vencimiento_enviada/i.test(sql)) {
        const error = new Error('missing table');
        error.code = '42P01';
        throw error;
      }
      if (/INSERT INTO alerta_vencimiento_enviada/i.test(sql)) {
        const error = new Error('missing table');
        error.code = '42P01';
        throw error;
      }
      throw new Error(`Consulta inesperada: ${sql.slice(0, 60)}`);
    });
    const whatsappClient = { sendWhatsAppText: jest.fn().mockResolvedValue(undefined) };

    const result = await runJob({ whatsappClient });

    expect(result.enviados).toBe(1);
    expect(result.detalle[0].status).toBe('enviado');
  });

  test('propaga errores al consultar la ventana de avisos', async () => {
    mockQuery.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(runJob()).rejects.toThrow('database unavailable');
  });
});
