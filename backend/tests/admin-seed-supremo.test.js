/**
 * POST /api/admin/seed-supremo (routes/admin.js).
 *
 * La ruta crea o resetea la cuenta suprema. Antes tenia una contrasena por
 * defecto escrita en el codigo, y el repositorio es publico: llamarla sin
 * contrasena dejaba la cuenta con una clave conocida. Estas pruebas fijan que
 * la contrasena es obligatoria y que la respuesta no la devuelve.
 *
 * Dobles:
 *  - BD: pool.connect devuelve un cliente que responde por patron de SQL y
 *    anota cada consulta, para revisar el hash que se guarda.
 *  - bcrypt es el real.
 */
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

let mockLlamadas = [];
let mockUsuarioExiste = true;

async function mockEjecutar(sql, params = []) {
  mockLlamadas.push({ sql, params });
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
  if (/SELECT id_rol FROM rol/.test(sql)) return { rows: [{ id_rol: 1 }] };
  if (/SELECT id_gimnasio FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 3 }] };
  if (/UPDATE gimnasio/.test(sql)) return { rows: [] };
  if (/SELECT id_usuario FROM usuario/.test(sql)) return { rows: mockUsuarioExiste ? [{ id_usuario: 16 }] : [] };
  if (/UPDATE usuario/.test(sql)) return { rows: [] };
  if (/INSERT INTO usuario/.test(sql)) return { rows: [{ id_usuario: 40 }] };
  if (/INSERT INTO configuracion_gimnasio/.test(sql)) return { rows: [] };
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
}

jest.mock('../src/db/db', () => ({
  connect: async () => ({ query: (...a) => mockEjecutar(...a), release: () => {} }),
}));

const adminRouter = require('../src/routes/admin');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

const TOKEN = 'token-de-pruebas';
const CLAVE = 'una-clave-larga-de-prueba';
const ENV_ORIGINAL = process.env;

const pedir = (body, token = TOKEN) => {
  const r = request(app).post('/api/admin/seed-supremo');
  if (token) r.set('X-Admin-Token', token);
  return r.send(body);
};

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, ADMIN_TOKEN: TOKEN };
  mockLlamadas = [];
  mockUsuarioExiste = true;
});
afterAll(() => { process.env = ENV_ORIGINAL; });

describe('POST /api/admin/seed-supremo', () => {
  test('sin ADMIN_TOKEN en el servidor responde 503', async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await pedir({ password: CLAVE });
    expect(res.status).toBe(503);
    expect(mockLlamadas).toHaveLength(0);
  });

  test('con un token equivocado responde 401', async () => {
    const res = await pedir({ password: CLAVE }, 'otro');
    expect(res.status).toBe(401);
    expect(mockLlamadas).toHaveLength(0);
  });

  test.each([
    ['sin cuerpo', undefined],
    ['sin contrasena', { email: 'x@y.com' }],
    ['con contrasena corta', { password: 'corta123' }],
    ['con contrasena que no es texto', { password: 123456789012345 }],
  ])('%s responde 400 y no toca la base', async (_caso, body) => {
    const res = await pedir(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/al menos 12 caracteres/);
    expect(mockLlamadas).toHaveLength(0);
  });

  test('con contrasena valida guarda su hash y no la devuelve', async () => {
    const res = await pedir({ password: CLAVE });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cuenta suprema actualizada.');
    expect(res.body.credentials).toEqual({
      email: 'santicosalamanca@gmail.com',
      gymName: 'FitLoyalty Supremo',
      ownerName: 'Santiago Salamanca',
    });
    expect(JSON.stringify(res.body)).not.toContain(CLAVE);

    const update = mockLlamadas.find((l) => /UPDATE usuario/.test(l.sql));
    expect(await bcrypt.compare(CLAVE, update.params[0])).toBe(true);
  });

  test('si el usuario no existe lo crea con la contrasena dada', async () => {
    mockUsuarioExiste = false;
    const res = await pedir({ password: CLAVE, email: 'Nuevo@Correo.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cuenta suprema creada.');
    expect(res.body.credentials.email).toBe('nuevo@correo.com');

    const insert = mockLlamadas.find((l) => /INSERT INTO usuario/.test(l.sql));
    expect(await bcrypt.compare(CLAVE, insert.params[3])).toBe(true);
  });
});
