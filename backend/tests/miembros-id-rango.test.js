/**
 * Capa API: el id de un miembro en la URL tiene que caber en
 * miembro.id_miembro, que es INTEGER (hasta 2147483647).
 *
 * Con un id mas grande, PostgreSQL rechaza el valor (22003) y las rutas
 * respondian 503 DB_UNREACHABLE "intenta de nuevo", como si la BD estuviera
 * caida. Ahora responden 400 "Id inválido" sin consultar. Valor limite:
 * 2147483647 pasa la validacion y llega a la BD; 2147483648 no.
 *
 * Rutas: todas las de routes/miembros.js que reciben el id: GET, PUT y DELETE
 * /api/admin/miembros/:id, DELETE /:id/permanent, GET y PUT /:id/plan y POST
 * /:id/congelar y /:id/descongelar. Un id que no es un numero tambien da
 * "Id inválido", con tilde, en todas.
 *
 * Dobles: la BD es un stub que anota cada consulta y no encuentra nada (el
 * miembro no existe); la lectura del personal en authenticate es un stub;
 * correo y WhatsApp, stubs.
 */
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = 'secreto-de-pruebas';

let mockConsultas = [];
async function mockEjecutar(sql, params = []) {
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
  mockConsultas.push({ sql, params });
  return { rows: [] };
}
jest.mock('../src/db/db', () => ({
  query: (...a) => mockEjecutar(...a),
  connect: async () => ({ query: (...a) => mockEjecutar(...a), release: () => {} }),
}));
jest.mock('../src/lib/email', () => ({ sendMemberQR: async () => ({ delivered: true }), sendStaffInvite: async () => ({ delivered: true }), sendRecoveryCode: async () => ({ delivered: true }) }));
jest.mock('../src/lib/whatsapp', () => ({
  sendWhatsAppQR: async () => {}, sendWhatsAppText: async () => {}, isWhatsAppReady: () => false, initWhatsApp: () => {},
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../src/index');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const ADMIN = jwt.sign({ id: 1, role: 'admin', gymId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });
const PLAN = { tipo_plan: 'MENSUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-02-01', valor_total: 100000, valor_pagado: 0, metodo_pago: 'EFECTIVO' };

function llamar(metodo, ruta, cuerpo) {
  const peticion = request(app)[metodo](ruta).set('Authorization', `Bearer ${ADMIN}`);
  return cuerpo === undefined ? peticion : peticion.send(cuerpo);
}

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  mockConsultas = [];
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// [metodo, ruta, cuerpo]. Toda fila lleva los tres: con dos, Jest pasaria `done` como cuerpo.
const RUTAS = [
  ['get', '/api/admin/miembros/:id', undefined],
  ['put', '/api/admin/miembros/:id', { nombre: 'Ana Maria' }],
  ['get', '/api/admin/miembros/:id/plan', undefined],
  ['put', '/api/admin/miembros/:id/plan', PLAN],
  ['delete', '/api/admin/miembros/:id', undefined],
  ['delete', '/api/admin/miembros/:id/permanent', undefined],
  ['post', '/api/admin/miembros/:id/congelar', {}],
  ['post', '/api/admin/miembros/:id/descongelar', {}],
];
const conId = (ruta, id) => ruta.replace(':id', String(id));

describe('the member id in the URL fits in miembro.id_miembro INTEGER', () => {
  test.each(RUTAS)('should let %s %s with the id 2147483647, the largest INTEGER, pass the validation and reach the database', async (metodo, ruta, cuerpo) => {
    // Arrange: el stub no encuentra al miembro ni su plan (404, o el plan vacio en el GET del plan)

    // Act
    const r = await llamar(metodo, conId(ruta, 2147483647), cuerpo);

    // Assert
    expect(r.status).not.toBe(400);
    expect(mockConsultas.some(({ params }) => params.map(String).includes('2147483647'))).toBe(true);
  });

  test.each(RUTAS)('should answer 400 "Id inválido" without querying when %s %s gets the id 2147483648, one more than INTEGER', async (metodo, ruta, cuerpo) => {
    // Arrange

    // Act
    const r = await llamar(metodo, conId(ruta, 2147483648), cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body).toEqual({ error: 'Id inválido', code: 'VALIDATION_ERROR' });
    expect(mockConsultas).toEqual([]);
  });

  test.each(RUTAS)('should answer 400 "Id inválido" without querying when %s %s gets the id 99999999999', async (metodo, ruta, cuerpo) => {
    // Arrange

    // Act
    const r = await llamar(metodo, conId(ruta, '99999999999'), cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id inválido', code: 'VALIDATION_ERROR' });
    expect(mockConsultas).toEqual([]);
  });

  test.each(RUTAS)('should answer 400 "Id inválido", with the accent, without querying when %s %s gets an id that is not a number', async (metodo, ruta, cuerpo) => {
    // Arrange

    // Act
    const r = await llamar(metodo, conId(ruta, 'abc'), cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id inválido', code: 'VALIDATION_ERROR' });
    expect(mockConsultas).toEqual([]);
  });
});
