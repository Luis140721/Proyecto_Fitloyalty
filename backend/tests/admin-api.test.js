const express = require('express');

const mockConnect = jest.fn();
const mockHash = jest.fn();

jest.mock('../src/db/db', () => ({ connect: (...args) => mockConnect(...args) }));
jest.mock('bcryptjs', () => ({ hash: (...args) => mockHash(...args) }));

const adminRouter = require('../src/routes/admin');
const { notFound, errorHandler } = require('../src/middleware/errorHandler');

let server;
let baseUrl;
const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  adminToken: process.env.ADMIN_TOKEN,
  seedEmail: process.env.SEED_ADMIN_EMAIL,
  seedPassword: process.env.SEED_ADMIN_PASSWORD,
};

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  app.use('/api', notFound);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/seed-supremo`;
    done();
  });
});

afterAll(() => new Promise((resolve) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => {
    if (originalEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.nodeEnv;
    if (originalEnv.adminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalEnv.adminToken;
    if (originalEnv.seedEmail === undefined) delete process.env.SEED_ADMIN_EMAIL;
    else process.env.SEED_ADMIN_EMAIL = originalEnv.seedEmail;
    if (originalEnv.seedPassword === undefined) delete process.env.SEED_ADMIN_PASSWORD;
    else process.env.SEED_ADMIN_PASSWORD = originalEnv.seedPassword;
    resolve();
  });
}));

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.SEED_ADMIN_EMAIL = 'seed@example.test';
  process.env.SEED_ADMIN_PASSWORD = 'dev-only-password-123';
  mockConnect.mockReset();
  mockHash.mockReset().mockResolvedValue('hashed-seed-password');
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

async function postSeed({ body, rawBody, token = 'test-admin-token' } = {}) {
  const hasBody = body !== undefined || rawBody !== undefined;
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      ...(token === null ? {} : { 'X-Admin-Token': token }),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: await response.json().catch(() => ({})),
  };
}

function seedClient({ failOnRole = false } = {}) {
  const query = jest.fn(async (sql) => {
    if (/SELECT id_rol FROM rol/i.test(sql)) {
      if (failOnRole) {
        const error = new Error('SELECT * FROM rol WHERE private_column = secret');
        error.code = '42P01';
        throw error;
      }
      return { rows: [{ id_rol: 1 }] };
    }
    if (/SELECT id_gimnasio FROM gimnasio/i.test(sql)) return { rows: [] };
    if (/INSERT INTO gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7 }] };
    if (/SELECT id_usuario FROM usuario/i.test(sql)) return { rows: [] };
    if (/INSERT INTO usuario/i.test(sql)) return { rows: [{ id_usuario: 9 }] };
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: jest.fn() };
  mockConnect.mockResolvedValueOnce(client);
  return client;
}

describe('POST /api/admin/seed-supremo — contrato transversal de seguridad', () => {
  test('requiere el token administrativo y responde JSON 401', async () => {
    const result = await postSeed({ token: 'wrong-token' });

    expect(result.status).toBe(401);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body).toEqual({ error: 'Token invalido.' });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('responde JSON 503 si falta ADMIN_TOKEN', async () => {
    delete process.env.ADMIN_TOKEN;

    const result = await postSeed();

    expect(result.status).toBe(503);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body).toEqual({ error: 'ADMIN_TOKEN no configurado en el servidor.' });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('bloquea la ruta con 403 fuera del entorno development', async () => {
    process.env.NODE_ENV = 'production';

    const result = await postSeed();

    expect(result.status).toBe(403);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body).toEqual({ error: 'Esta ruta solo está disponible en desarrollo.' });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('devuelve 503 sin credenciales de seed válidas y no accede a la base', async () => {
    process.env.SEED_ADMIN_EMAIL = 'correo-invalido';
    process.env.SEED_ADMIN_PASSWORD = 'corta';

    const result = await postSeed();

    expect(result.status).toBe(503);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body.code).toBe('SEED_CONFIG_MISSING');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('convierte JSON mal formado en 400 JSON sin stack trace', async () => {
    const result = await postSeed({ rawBody: '{"gymName":' });

    expect(result.status).toBe(400);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body).toEqual({
      error: 'JSON invalido en el cuerpo de la peticion.',
      code: 'BAD_JSON',
    });
    expect(JSON.stringify(result.body)).not.toMatch(/SyntaxError|at .*\.js:\d+/);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('rechaza campos no permitidos en el body y no permite pasar credenciales allí', async () => {
    const result = await postSeed({
      body: { email: 'attacker@example.test', password: 'attacker-password-123' },
    });

    expect(result.status).toBe(400);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body.code).toBe('VALIDATION_ERROR');
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockHash).not.toHaveBeenCalled();
  });

  test('crea cuenta con token válido y nunca devuelve la contraseña', async () => {
    const client = seedClient();

    const result = await postSeed({ body: { gymName: '  Gym de pruebas  ', ownerName: '  Admin local ' } });

    expect(result.status).toBe(200);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body).toEqual({
      ok: true,
      message: 'Cuenta suprema creada.',
      account: {
        email: 'seed@example.test',
        gymName: 'Gym de pruebas',
        ownerName: 'Admin local',
      },
      ids: { id_usuario: 9, id_gimnasio: 7, id_rol: 1 },
      trial_ends_at: null,
      plan: 'ilimitado',
    });
    expect(JSON.stringify(result.body)).not.toContain('dev-only-password-123');
    expect(mockHash).toHaveBeenCalledWith('dev-only-password-123', 10);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('no expone SQL ni detalle de base de datos si falla la siembra', async () => {
    const client = seedClient({ failOnRole: true });

    const result = await postSeed();

    expect(result.status).toBe(500);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(result.body).toEqual({
      error: 'Error al crear/actualizar cuenta suprema.',
      code: 'SEED_FAILED',
    });
    expect(JSON.stringify(result.body)).not.toMatch(/SELECT|private_column|secret|42P01/);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('responde JSON 404 para rutas administrativas inexistentes', async () => {
    const response = await fetch(`${baseUrl}/not-found`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.error).toContain('/api/admin/seed-supremo/not-found');
  });
});
