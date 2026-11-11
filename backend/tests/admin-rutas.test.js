const express = require('express');
const request = require('supertest');

const originalEnv = { ...process.env };

function createPool({ roleExists = false, gymExists = false, userExists = false, failOnConfig = false } = {}) {
  const query = jest.fn(async (sql) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('SELECT id_rol FROM rol')) {
      return { rows: roleExists ? [{ id_rol: 4 }] : [] };
    }
    if (sql.includes('INSERT INTO rol')) return { rows: [{ id_rol: 4 }] };
    if (sql.includes('SELECT id_gimnasio FROM gimnasio')) {
      return { rows: gymExists ? [{ id_gimnasio: 5 }] : [] };
    }
    if (sql.includes('INSERT INTO gimnasio')) return { rows: [{ id_gimnasio: 5 }] };
    if (sql.includes('SELECT id_usuario FROM usuario')) {
      return { rows: userExists ? [{ id_usuario: 6 }] : [] };
    }
    if (sql.includes('INSERT INTO usuario')) return { rows: [{ id_usuario: 6 }] };
    if (sql.includes('INSERT INTO configuracion_gimnasio')) {
      if (failOnConfig) throw Object.assign(new Error('config falló'), { code: 'DB_ERROR' });
      return { rows: [] };
    }
    return { rows: [] };
  });
  const client = { query, release: jest.fn() };
  return { connect: jest.fn().mockResolvedValue(client), client };
}

function createApp(pool, token) {
  jest.resetModules();
  jest.doMock('../src/db/db', () => pool);
  jest.doMock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hash-seguro') }));
  process.env.ADMIN_TOKEN = token;
  const router = require('../src/routes/admin');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', router);
  return app;
}

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.ADMIN_TOKEN;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.dontMock('../src/db/db');
  jest.dontMock('bcryptjs');
  process.env = { ...originalEnv };
});

test('requiere ADMIN_TOKEN y rechaza valores ausentes o incorrectos antes de acceder a la BD', async () => {
  const pool = createPool();
  const app = createApp(pool, '');
  await request(app).post('/api/admin/seed-supremo').expect(503, {
    error: 'ADMIN_TOKEN no configurado en el servidor.',
  });

  process.env.ADMIN_TOKEN = 'token-valido';
  await request(app).post('/api/admin/seed-supremo')
    .set('X-Admin-Token', 'incorrecto')
    .expect(401, { error: 'Token invalido.' });
  expect(pool.connect).not.toHaveBeenCalled();
});

test('crea rol, gimnasio, usuario y configuración con valores enviados normalizados', async () => {
  const pool = createPool();
  const app = createApp(pool, 'token-valido');
  const response = await request(app).post('/api/admin/seed-supremo')
    .set('X-Admin-Token', 'token-valido')
    .send({
      email: '  ADMIN@EXAMPLE.COM ',
      password: 'pass-personalizada',
      gymName: 'Gym de prueba',
      ownerName: 'Nombre Admin',
    })
    .expect(200);

  expect(response.body).toMatchObject({
    ok: true,
    message: 'Cuenta suprema creada.',
    credentials: {
      email: 'admin@example.com',
      password: 'pass-personalizada',
      gymName: 'Gym de prueba',
      ownerName: 'Nombre Admin',
    },
    ids: { id_usuario: 6, id_gimnasio: 5, id_rol: 4 },
    trial_ends_at: null,
    plan: 'ilimitado',
  });
  expect(pool.client.query).toHaveBeenCalledWith('COMMIT');
  expect(pool.client.release).toHaveBeenCalledTimes(1);
});

test('actualiza registros existentes y aplica los valores por defecto del endpoint', async () => {
  const pool = createPool({ roleExists: true, gymExists: true, userExists: true });
  const app = createApp(pool, 'token-valido');
  const response = await request(app).post('/api/admin/seed-supremo')
    .set('X-Admin-Token', 'token-valido')
    .send({})
    .expect(200);

  expect(response.body.message).toBe('Cuenta suprema actualizada.');
  expect(response.body.credentials).toEqual({
    email: 'santicosalamanca@gmail.com',
    password: 'SantiagoSupremo2026!',
    gymName: 'FitLoyalty Supremo',
    ownerName: 'Santiago Salamanca',
  });
  expect(pool.client.query.mock.calls.some(([sql]) => sql.includes('UPDATE gimnasio'))).toBe(true);
  expect(pool.client.query.mock.calls.some(([sql]) => sql.includes('UPDATE usuario'))).toBe(true);
  expect(pool.client.query).toHaveBeenCalledWith('COMMIT');
});

test('revierte la transacción y libera la conexión cuando falla la escritura', async () => {
  const pool = createPool({ failOnConfig: true });
  const app = createApp(pool, 'token-valido');
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await request(app).post('/api/admin/seed-supremo')
    .set('X-Admin-Token', 'token-valido')
    .send({})
    .expect(500, {
      error: 'Error al crear/actualizar cuenta suprema.',
      code: 'DB_ERROR',
      detail: 'config falló',
    });

  expect(pool.client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(pool.client.release).toHaveBeenCalledTimes(1);
});
