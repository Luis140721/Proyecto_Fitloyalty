/**
 * Pruebas del job de avisos de vencimiento (RQF-14): un aviso solo se marca
 * como enviado si WhatsApp realmente lo envio, y queda pendiente (para el
 * reintento del scheduler) si no esta listo o si el envio falla.
 */
const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

const { runJob } = require('../src/jobs/expiracion');

function prepararBD({ diasAviso = 3, diasRestantes = 2, yaEnviado = false } = {}) {
  mockQuery.mockImplementation(async (sql) => {
    if (sql.includes('MAX(dias_aviso_vencimiento)')) return { rows: [{ max_dias: diasAviso }] };
    if (sql.includes('FROM miembro m')) {
      return {
        rows: [{
          id_miembro: 7, nombre: 'Ana', telefono: '3001234567', id_gimnasio: 1,
          gym_nombre: 'Gym Demo', tipo_plan: 'MENSUAL', fecha_fin: '2026-10-20',
          dias_restantes: diasRestantes, dias_aviso: diasAviso,
        }],
      };
    }
    if (sql.includes('SELECT id_plan_cobro FROM plan_cobro')) return { rows: [{ id_plan_cobro: 99 }] };
    if (sql.includes('SELECT 1 FROM alerta_vencimiento_enviada')) return { rows: yaEnviado ? [{}] : [] };
    if (sql.includes('INSERT INTO alerta_vencimiento_enviada')) return { rows: [] };
    throw new Error('Consulta inesperada: ' + sql.slice(0, 60));
  });
}

const insertsMarcados = () =>
  mockQuery.mock.calls.filter(([sql]) => sql.includes('INSERT INTO alerta_vencimiento_enviada'));

describe('runJob (avisos de vencimiento)', () => {
  test('envia y marca como enviado cuando WhatsApp esta listo', async () => {
    prepararBD();
    const wa = { isWhatsAppReady: () => true, sendWhatsAppText: jest.fn().mockResolvedValue(undefined) };
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(r.enviados).toBe(1);
    expect(insertsMarcados()).toHaveLength(1);
  });

  test('si WhatsApp no esta listo no envia ni marca (queda para reintento)', async () => {
    prepararBD();
    const wa = { isWhatsAppReady: () => false, sendWhatsAppText: jest.fn() };
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.enviados).toBe(0);
    expect(r.omitidosWhatsappNoListo).toBe(1);
    expect(insertsMarcados()).toHaveLength(0);
  });

  test('si el envio falla no marca como enviado y cuenta el error', async () => {
    prepararBD();
    const wa = { isWhatsAppReady: () => true, sendWhatsAppText: jest.fn().mockRejectedValue(new Error('fallo')) };
    const r = await runJob({ whatsappClient: wa });
    expect(r.enviados).toBe(0);
    expect(r.errores).toBe(1);
    expect(insertsMarcados()).toHaveLength(0);
  });

  test('no reenvia un aviso ya enviado', async () => {
    prepararBD({ yaEnviado: true });
    const wa = { isWhatsAppReady: () => true, sendWhatsAppText: jest.fn() };
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.omitidosDuplicado).toBe(1);
  });

  test('respeta la ventana de dias del gimnasio', async () => {
    prepararBD({ diasAviso: 3, diasRestantes: 10 });
    const wa = { isWhatsAppReady: () => true, sendWhatsAppText: jest.fn() };
    const r = await runJob({ whatsappClient: wa });
    expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(r.enVentana).toBe(0);
  });
});
