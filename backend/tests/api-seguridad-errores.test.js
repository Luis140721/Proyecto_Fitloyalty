/**
 * Bootcamp semana 4 (capa E2E, Santiago): el API desde la seguridad y los errores.
 *  - Endpoints protegidos: 401 sin token o con token falso, 403 con otro rol
 *    y 200 con el rol correcto.
 *  - Contrato de errores de toda la app: JSON con { error, code }, sin HTML,
 *    sin stack traces y sin SQL, aunque la base falle.
 *
 * Se usa la app real de src/index.js (no abre puertos ni migra al importarse).
 * La base va simulada y la busqueda del personal se reemplaza, como en
 * aislamiento.test.js, asi que no hace falta Docker ni la BD de desarrollo.
 */
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = 'secreto-de-pruebas';

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../src/index');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };
const firmar = (payload, secreto = process.env.JWT_SECRET) =>
  jwt.sign(payload, secreto, payload.role === 'cliente' ? {} : { expiresIn: '1h' });
const ADMIN = firmar({ id: 1, role: 'admin', gymId: 7 });
const RECEPCION = firmar({ id: 2, role: 'receptionist', gymId: 7 });
const MIEMBRO = firmar({ id: 5, role: 'cliente', idMiembro: 5, gymId: 7 });
const FALSO = firmar({ id: 1, role: 'admin', gymId: 7 }, 'otro-secreto');

// Un error de pg trae el SQL en el mensaje: no debe llegar nunca al cliente.
const ERROR_PG = Object.assign(new Error('relation "config_gimnasio" does not exist: SELECT * FROM config_gimnasio'), { code: '42P01' });
const GIMNASIO_ACTIVO = { id_gimnasio: 7, activo: true, trial_ends_at: null };

function simularBd({ falla = false } = {}) {
  mockQuery.mockImplementation(async (sql) => {
    if (falla) throw ERROR_PG;
    if (/FROM gimnasio WHERE id_gimnasio/i.test(sql)) return { rows: [GIMNASIO_ACTIVO] };
    if (/FROM config_gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7, moneda: 'COP' }] };
    return { rows: [] };
  });
}

// Forma comun de cualquier error del API.
function esErrorDelContrato(r, status, code) {
  expect(r.status).toBe(status);
  expect(r.headers['content-type']).toMatch(/^application\/json/);
  expect(r.body).toEqual(expect.objectContaining({ error: expect.any(String), code }));
  expect(r.text).not.toMatch(/SELECT|relation|\s+at\s+\S+\.js|<html/i);
}

beforeEach(() => {
  mockQuery.mockReset();
  simularBd();
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => establecerBusquedaPersonal(null));

// ---------------------------------------------------------------------------
describe('endpoints protegidos del personal', () => {
  // [metodo, ruta, token con permiso, token del personal sin permiso]
  const PROTEGIDOS = [
    ['get', '/api/admin/config', ADMIN, RECEPCION],
    ['put', '/api/admin/config', ADMIN, RECEPCION],
    ['get', '/api/admin/staff', ADMIN, RECEPCION],
    ['get', '/api/admin/dashboard', ADMIN, RECEPCION],
    ['get', '/api/admin/miembros', RECEPCION, MIEMBRO],
    ['get', '/api/admin/notificaciones', RECEPCION, MIEMBRO],
  ];

  test.each(PROTEGIDOS)('%s %s sin token responde 401 AUTH_REQUIRED', async (metodo, ruta) => {
    const r = await request(app)[metodo](ruta);

    esErrorDelContrato(r, 401, 'AUTH_REQUIRED');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test.each(PROTEGIDOS)('%s %s con un token firmado con otro secreto responde 401 TOKEN_INVALID', async (metodo, ruta) => {
    const r = await request(app)[metodo](ruta).set('Authorization', `Bearer ${FALSO}`);

    esErrorDelContrato(r, 401, 'TOKEN_INVALID');
  });

  test.each(PROTEGIDOS)('%s %s con un rol sin permiso responde 403 FORBIDDEN sin nombrar roles', async (metodo, ruta, _permitido, sinPermiso) => {
    const r = await request(app)[metodo](ruta).set('Authorization', `Bearer ${sinPermiso}`);

    esErrorDelContrato(r, 403, 'FORBIDDEN');
    expect(r.body.error).not.toMatch(/admin|receptionist|cliente/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('GET /api/admin/config con el admin responde 200 con la configuracion de su gimnasio', async () => {
    const r = await request(app).get('/api/admin/config').set('Authorization', `Bearer ${ADMIN}`);

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body.config).toEqual(expect.objectContaining({ id_gimnasio: 7, moneda: 'COP' }));
    const config = mockQuery.mock.calls.find(([sql]) => /FROM config_gimnasio/i.test(sql));
    expect(config[1]).toEqual([7]);
  });

  test('un token de sesion sin vencimiento del personal responde 401', async () => {
    const sinExp = jwt.sign({ id: 1, role: 'admin', gymId: 7 }, process.env.JWT_SECRET);

    const r = await request(app).get('/api/admin/config').set('Authorization', `Bearer ${sinExp}`);

    esErrorDelContrato(r, 401, 'TOKEN_SIN_VENCIMIENTO');
  });
});

// ---------------------------------------------------------------------------
describe('endpoints de la app del miembro', () => {
  test('GET /api/cliente/me con un token del personal responde 403 CLIENT_ONLY', async () => {
    const r = await request(app).get('/api/cliente/me').set('Authorization', `Bearer ${ADMIN}`);

    esErrorDelContrato(r, 403, 'CLIENT_ONLY');
  });

  test('GET /api/cliente/me sin token responde 401 AUTH_REQUIRED', async () => {
    esErrorDelContrato(await request(app).get('/api/cliente/me'), 401, 'AUTH_REQUIRED');
  });

  test('GET /api/cliente/me con el token del miembro pasa la autorizacion', async () => {
    const r = await request(app).get('/api/cliente/me').set('Authorization', `Bearer ${MIEMBRO}`);

    expect([401, 403]).not.toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
describe('contrato de errores de todo el API', () => {
  test.each([
    ['/api/auth/login'],
    ['/api/auth/signup'],
    ['/api/auth/forgot-password'],
  ])('POST %s con JSON mal formado responde 400 BAD_JSON', async (ruta) => {
    const r = await request(app).post(ruta).set('Content-Type', 'application/json').send('{"email":');

    esErrorDelContrato(r, 400, 'BAD_JSON');
  });

  test('un tipo incorrecto en el cuerpo responde 400 VALIDATION_ERROR sin llegar a la base', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 123, password: ['x'] });

    esErrorDelContrato(r, 400, 'VALIDATION_ERROR');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('un cuerpo de mas de 100 kB responde 413 PAYLOAD_TOO_LARGE', async () => {
    const r = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'ana@gym.co', password: 'x'.repeat(200_000) }));

    esErrorDelContrato(r, 413, 'PAYLOAD_TOO_LARGE');
  });

  test.each([['/api/no-existe'], ['/no-existe'], ['/']])('GET %s responde 404 NOT_FOUND en JSON, no la pagina HTML de Express', async (ruta) => {
    esErrorDelContrato(await request(app).get(ruta), 404, 'NOT_FOUND');
  });

  test.each([
    ['get', '/api/admin/config'],
    ['get', '/api/admin/miembros'],
    ['get', '/api/admin/dashboard'],
  ])('%s %s con la base caida responde 503 DB_UNREACHABLE sin el SQL del error', async (metodo, ruta) => {
    simularBd({ falla: true });

    const r = await request(app)[metodo](ruta).set('Authorization', `Bearer ${ADMIN}`);

    esErrorDelContrato(r, 503, 'DB_UNREACHABLE');
  });
});
