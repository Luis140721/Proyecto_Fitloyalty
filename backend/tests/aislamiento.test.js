/**
 * RQNF-05: aislamiento entre gimnasios y control de rol.
 *  - /api/vista/miembros-activos y /api/asistencia solo para personal y
 *    siempre filtrados por el gimnasio del token.
 *  - El check-in deriva la clave de los QR una sola vez (RQNF-01).
 */
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const vistaRouter = require('../src/routes/vista');
const asistenciaRouter = require('../src/routes/asistencia');
const checkinRouter = require('../src/routes/checkin');
const { errorHandler } = require('../src/middleware/errorHandler');

const token = (payload) => jwt.sign(payload, process.env.JWT_SECRET);
const STAFF_G7 = token({ id: 1, role: 'admin', gymId: 7 });
const RECEP_G9 = token({ id: 2, role: 'receptionist', gymId: 9 });
const MIEMBRO_G7 = token({ id: 5, role: 'cliente', idMiembro: 5, gymId: 7 });
const ADMIN_SIN_GYM = token({ id: 3, role: 'admin' });

let server, base;
beforeAll((done) => {
  const app = express();
  app.use('/api/vista', vistaRouter);
  app.use('/api/asistencia', asistenciaRouter);
  app.use(errorHandler);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll(() => new Promise((resolve) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

const get = (url, tk) => fetch(base + url, { headers: tk ? { Authorization: `Bearer ${tk}` } : {} });

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql) => {
    if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total: 1, hoy: 1 }] };
    return { rows: [{ nombre: 'Ana' }] };
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('/api/vista/miembros-activos', () => {
  test('sin token -> 401', async () => {
    expect((await get('/api/vista/miembros-activos')).status).toBe(401);
  });
  test('token de un miembro (app movil) -> 403 y no consulta la base', async () => {
    expect((await get('/api/vista/miembros-activos', MIEMBRO_G7)).status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
  test('staff sin gimnasio -> 403', async () => {
    expect((await get('/api/vista/miembros-activos', ADMIN_SIN_GYM)).status).toBe(403);
  });
  test('staff: ambas consultas filtran por el gimnasio del token', async () => {
    const r = await get('/api/vista/miembros-activos?page=1&pageSize=5', STAFF_G7);
    expect(r.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    for (const [sql] of mockQuery.mock.calls) expect(sql).toMatch(/WHERE id_gimnasio = \$1/);
    expect(mockQuery.mock.calls[0][1]).toEqual([7]);
    expect(mockQuery.mock.calls[1][1]).toEqual([7, 5, 5]);
  });
  test('otro gimnasio usa su propio id', async () => {
    await get('/api/vista/miembros-activos', RECEP_G9);
    expect(mockQuery.mock.calls[0][1]).toEqual([9]);
  });
});

describe('/api/asistencia', () => {
  test('token de un miembro -> 403', async () => {
    expect((await get('/api/asistencia', MIEMBRO_G7)).status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
  test('recepcionista -> 200 filtrando por su gimnasio', async () => {
    const r = await get('/api/asistencia', RECEP_G9);
    expect(r.status).toBe(200);
    for (const [, params] of mockQuery.mock.calls) expect(params).toEqual([9]);
  });
});

describe('check-in: decifrado de QR', () => {
  // La clave se deriva una sola vez aqui (hacerlo por cada QR tardaria segundos).
  const key = crypto.scryptSync(process.env.QR_ENCRYPTION_KEY || 'FitLoyalty2024SecretKey', 'salt', 32);
  const cifrar = (texto) => {
    const iv = crypto.randomBytes(16);
    const c = crypto.createCipheriv('aes-256-cbc', key, iv);
    return `${iv.toString('hex')}:${c.update(texto, 'utf8', 'hex') + c.final('hex')}`;
  };

  test('descifra un codigo cifrado y devuelve en claro uno que no lo esta', () => {
    expect(checkinRouter.decryptQrCode(cifrar('QR-123'))).toBe('QR-123');
    expect(checkinRouter.decryptQrCode('QR-plano')).toBe('QR-plano');
  });

  test('no vuelve a derivar la clave (scryptSync) en cada decifrado', () => {
    const cifrados = Array.from({ length: 200 }, (_, i) => cifrar(`QR-${i}`));
    const spy = jest.spyOn(crypto, 'scryptSync');
    cifrados.forEach((c, i) => expect(checkinRouter.decryptQrCode(c)).toBe(`QR-${i}`));
    expect(spy).not.toHaveBeenCalled();
  });
});
