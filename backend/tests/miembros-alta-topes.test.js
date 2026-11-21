/**
 * Semana 6, capa BD: hallazgo de la integracion
 * (tests/integracion/cobros-congelamiento-notificaciones.test.js). El alta de
 * un miembro (POST /api/admin/miembros) respondia 500 o 503 DB_UNREACHABLE
 * cuando un dato no cabia en su columna, porque el esquema no tenia maximo y la
 * BD rechazaba el INSERT:
 *
 *  - miembro.contacto_emergencia VARCHAR(100), telefono_emergencia VARCHAR(20),
 *    objetivo VARCHAR(50) y nivel_experiencia VARCHAR(30): 500, sin guardar;
 *  - plan_cobro.referencia_pago VARCHAR(100) y valor_total y valor_pagado
 *    NUMERIC(10,2): 503, con el miembro ya guardado y sin plan.
 *
 * Nombre, documento, telefono y email los acota el #83 (su test es
 * miembros-longitudes.test.js); aqui va el resto. Ahora el servicio lo rechaza
 * con 400 VALIDATION_ERROR antes de escribir nada. Cada regla se prueba en su
 * valor limite: el maximo cabe y uno mas no.
 *
 * Dobles: la BD es un stub que responde lo minimo del alta y anota lo que se
 * escribe; la lectura del personal en authenticate es un stub; correo y
 * WhatsApp, stubs.
 */
let mockEscrituras = [];
async function mockEjecutar(sql) {
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
  if (/^\s*INSERT/.test(sql)) mockEscrituras.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
  if (/INSERT INTO miembro/.test(sql)) return { rows: [{ id_miembro: 88 }] };
  if (/INSERT INTO plan_cobro/.test(sql)) return { rows: [{ id_plan_cobro: 5 }] };
  if (/SELECT nombre FROM gimnasio/.test(sql)) return { rows: [{ nombre: 'Gym' }] };
  return { rows: [] };
}
jest.mock('../src/db/db', () => ({ query: (...a) => mockEjecutar(...a), connect: async () => ({ query: (...a) => mockEjecutar(...a), release() {} }) }));
jest.mock('../src/lib/email', () => ({ sendMemberQR: async () => ({ delivered: true }) }));
jest.mock('../src/lib/whatsapp', () => ({ sendWhatsAppQR: async () => {} }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const miembrosRouter = require('../src/routes/miembros');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', miembrosRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const RECEPCION = () => jwt.sign({ id: 2, role: 'receptionist', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const ANA = { nombre: 'Ana Maria', documento: 'CC12345', telefono: '3001234567' };
const crear = (cambios) => request(app).post('/api/admin/miembros').set('Authorization', `Bearer ${RECEPCION()}`).send({ ...ANA, ...cambios });

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'RECEPCIONISTA' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockEscrituras = [];
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('POST /api/admin/miembros: what does not fit in its column is rejected before saving anything', () => {
  // [campo, largo de la columna, texto de largo n, como empieza el mensaje]
  test.each([
    ['contacto_emergencia', 100, (n) => 'x'.repeat(n), 'El contacto de emergencia'],
    ['telefono_emergencia', 20, (n) => '3'.repeat(n), 'El teléfono de emergencia'],
    ['objetivo', 50, (n) => 'x'.repeat(n), 'El objetivo'],
    ['nivel_experiencia', 30, (n) => 'x'.repeat(n), 'El nivel de experiencia'],
    ['referencia_pago', 100, (n) => 'x'.repeat(n), 'La referencia del pago'],
  ])('should create the member with %s of %i characters and answer 400 without saving anything with one more', async (campo, n, deLargo, etiqueta) => {
    // Arrange: el valor limite y uno mas

    // Act
    const justo = await crear({ [campo]: deLargo(n) });
    const escriturasDelJusto = mockEscrituras.length;
    const sobra = await crear({ [campo]: deLargo(n + 1) });

    // Assert
    expect(justo.status).toBe(201);
    expect(escriturasDelJusto).toBe(2);
    expect(sobra.status).toBe(400);
    expect(sobra.headers['content-type']).toMatch(/^application\/json/);
    expect(sobra.body).toMatchObject({ code: 'VALIDATION_ERROR', error: `${etiqueta} admite máximo ${n} caracteres` });
    expect(mockEscrituras).toHaveLength(escriturasDelJusto);
  });

  test('should count characters like PostgreSQL, so 49 letters and an emoji fit in objetivo', async () => {
    // Arrange: en JavaScript .length dice 51; PostgreSQL cuenta 50

    // Act
    const r = await crear({ objetivo: `${'x'.repeat(49)}💪` });

    // Assert
    expect(r.status).toBe(201);
  });

  test.each([
    ['valor_total'],
    ['valor_pagado'],
  ])('should create the member with %s of 99999999.99 and answer 400 without saving anything with 100000000', async (campo) => {
    // Arrange: NUMERIC(10,2); el formulario manda los valores como texto
    const total = { valor_total: '99999999.99' };

    // Act
    const justo = await crear({ ...total, [campo]: '99999999.99' });
    const escriturasDelJusto = mockEscrituras.length;
    const sobra = await crear({ ...total, [campo]: '100000000' });

    // Assert
    expect(justo.status).toBe(201);
    expect(sobra.status).toBe(400);
    expect(sobra.body).toMatchObject({ code: 'VALIDATION_ERROR', error: 'El valor del plan no puede pasar de 99.999.999,99' });
    expect(mockEscrituras).toHaveLength(escriturasDelJusto);
  });
});
