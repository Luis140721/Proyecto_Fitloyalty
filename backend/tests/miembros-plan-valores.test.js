/**
 * Semana 6, capa BD: hallazgo de la integracion
 * (tests/integracion/cobros-congelamiento-notificaciones.test.js).
 * PUT /api/admin/miembros/:id/plan con valor_total 100000000 llegaba a la BD,
 * que lo rechaza porque no cabe en plan_cobro.valor_total NUMERIC(10,2)
 * (22003), y la ruta respondia 503 "intenta de nuevo", aunque reintentar no
 * sirve. Ahora el servicio lo rechaza con 400 VALIDATION_ERROR antes de llegar
 * a la BD.
 *
 * Aqui va el valor limite de la regla: 99999999.99 cabe y 100000000 no.
 * valor_pagado no necesita una regla propia: la ruta ya exige que no supere a
 * valor_total, asi que tampoco puede pasar del maximo.
 *
 * Dobles: la BD es un stub que responde lo minimo del PUT del plan y anota lo
 * que se escribe; la lectura del personal en authenticate es un stub; correo y
 * WhatsApp, stubs.
 */
let mockEscrituras = [];
async function mockEjecutar(sql, params = []) {
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
  if (/SELECT id_miembro FROM miembro WHERE id_miembro/.test(sql)) return { rows: [{ id_miembro: 88 }] };
  if (/SELECT id_plan_cobro FROM plan_cobro/.test(sql)) return { rows: [{ id_plan_cobro: 5 }] };
  if (/^\s*UPDATE plan_cobro/.test(sql)) {
    mockEscrituras.push(params);
    return { rows: [{ id_plan_cobro: 5 }] };
  }
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
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
const ADMIN = () => jwt.sign({ id: 1, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const PLAN = { tipo_plan: 'ANUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', valor_total: 1200000, valor_pagado: 0, metodo_pago: 'EFECTIVO' };
const cambiarPlan = (cambios) => request(app).put('/api/admin/miembros/88/plan').set('Authorization', `Bearer ${ADMIN()}`).send({ ...PLAN, ...cambios });

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockEscrituras = [];
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('PUT /api/admin/miembros/:id/plan: the values fit in plan_cobro NUMERIC(10,2)', () => {
  test('should save the plan when valor_total and valor_pagado are 99,999,999.99, the largest value that fits', async () => {
    // Arrange: el valor limite de la columna

    // Act
    const r = await cambiarPlan({ valor_total: 99999999.99, valor_pagado: 99999999.99 });

    // Assert
    expect(r.status).toBe(200);
    expect(mockEscrituras).toHaveLength(1);
    expect(mockEscrituras[0]).toEqual(expect.arrayContaining([99999999.99]));
  });

  test('should answer 400 VALIDATION_ERROR without saving the plan when valor_total is 100,000,000', async () => {
    // Arrange: uno mas que el maximo en pesos enteros

    // Act
    const r = await cambiarPlan({ valor_total: 100000000 });

    // Assert
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body).toMatchObject({ code: 'VALIDATION_ERROR', error: 'El valor del plan no puede pasar de 99.999.999,99' });
    expect(mockEscrituras).toEqual([]);
  });

  test('should answer 400 VALIDATION_ERROR without saving the plan when valor_total comes as the text 100000000', async () => {
    // Arrange: el formulario puede mandar el valor como texto; zod lo convierte

    // Act
    const r = await cambiarPlan({ valor_total: '100000000' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(mockEscrituras).toEqual([]);
  });

  test('should answer 400 without saving the plan when valor_pagado is 100,000,000, because it cannot exceed valor_total', async () => {
    // Arrange: valor_total en el maximo; lo pagado, uno mas

    // Act
    const r = await cambiarPlan({ valor_total: 99999999.99, valor_pagado: 100000000 });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(mockEscrituras).toEqual([]);
  });
});
