/**
 * RQF-13: el contrato no depende de que WhatsApp ya este inicializado, y un
 * envio fallido queda registrado como fallido.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

const mockWa = {
  sendWhatsAppText: jest.fn(),
  isWhatsAppReady: jest.fn(() => false), // como justo despues de un reinicio
};
jest.mock('../src/lib/whatsapp', () => mockWa);

process.env.JWT_SECRET = 'secreto-de-pruebas';

const router = require('../src/routes/admin-contrato');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const ADMIN = jwt.sign({ id: 1, role: 'admin', gymId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });

let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
  const app = express();
  app.use(express.json());
  app.use('/api/admin/miembros', router);
  app.use(errorHandler);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll(() => new Promise((resolve) => {
  establecerBusquedaPersonal(null);
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

const enviar = async () => {
  const r = await fetch(`${base}/api/admin/miembros/12/contrato/enviar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 'v1' }),
  });
  return { status: r.status, body: await r.json() };
};

const auditorias = () => mockQuery.mock.calls.filter(([sql]) => /INSERT INTO contrato_enviado/i.test(sql));

beforeEach(() => {
  mockQuery.mockReset();
  mockWa.sendWhatsAppText.mockReset();
  mockWa.isWhatsAppReady.mockClear();
  mockQuery.mockImplementation(async (sql) => {
    if (/INSERT INTO contrato_enviado/i.test(sql)) return { rows: [{ id_contrato_enviado: 5, creado_en: new Date() }] };
    // datos del miembro para armar el contrato
    return { rows: [{ id_miembro: 12, id_gimnasio: 7, nombre: 'Ana Gomez', telefono: '3001234567', documento: '123', email: 'a@b.co', gym_nombre: 'Gym Demo', tipo_plan: 'MENSUAL', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', valor_total: 50000 }] };
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/admin/miembros/:id/contrato/enviar', () => {
  test('intenta enviar aunque isWhatsAppReady() sea falso (el envio inicializa el cliente)', async () => {
    mockWa.sendWhatsAppText.mockResolvedValue(undefined);
    const r = await enviar();
    expect(r.status).toBe(200);
    expect(mockWa.sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(r.body.exito).toBe(true);
    expect(auditorias()[0][1][5]).toBe(true); // exito = true
  });

  test('si WhatsApp no esta listo: exito=false, guia del QR y cliente_listo=false', async () => {
    mockWa.sendWhatsAppText.mockRejectedValue(Object.assign(new Error('no listo'), { code: 'WHATSAPP_NO_LISTO' }));
    const r = await enviar();
    expect(r.body.exito).toBe(false);
    expect(r.body.cliente_listo).toBe(false);
    expect(r.body.mensaje).toMatch(/escanee el QR|escanee el QR de autenticacion|QR de autenticacion/);
    expect(auditorias()[0][1][5]).toBe(false);
    expect(auditorias()[0][1][6]).toMatch(/no autenticado/);
  });

  test('otro error de envio: exito=false con el mensaje del error', async () => {
    mockWa.sendWhatsAppText.mockRejectedValue(new Error('No LID for user'));
    const r = await enviar();
    expect(r.body.exito).toBe(false);
    expect(r.body.cliente_listo).toBe(true);
    expect(r.body.mensaje).toMatch(/No LID for user/);
    expect(auditorias()[0][1][5]).toBe(false);
  });
});
