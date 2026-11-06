const express = require('express');

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockSendRecoveryCode = jest.fn();
const mockHash = jest.fn();
const mockCompare = jest.fn();

jest.mock('../src/db/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: (...args) => mockConnect(...args),
}));
jest.mock('../src/lib/email', () => ({
  sendRecoveryCode: (...args) => mockSendRecoveryCode(...args),
}));
jest.mock('bcryptjs', () => ({
  hash: (...args) => mockHash(...args),
  compare: (...args) => mockCompare(...args),
}));
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: Number(req.headers['x-user-id'] || 7),
      gymId: Number(req.headers['x-gym-id'] || 3),
      role: 'admin',
      name: 'Ana',
      email: 'ana@example.com',
    };
    next();
  },
}));

process.env.JWT_SECRET = 'auth-route-test-secret';
const authRouter = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
    done();
  });
});

afterAll(() => new Promise((resolve) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(resolve);
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockConnect.mockReset();
  mockSendRecoveryCode.mockReset();
  mockHash.mockReset();
  mockCompare.mockReset();
  mockCompare.mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

async function request(method, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

describe('POST /api/auth/login', () => {
  test('rechaza payload inválido antes de consultar la base', async () => {
    const result = await request('POST', '/login', { email: 'no-email', password: '' });

    expect(result.status).toBe(400);
    expect(result.body.code).toBe('VALIDATION_ERROR');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('responde 401 si no encuentra la cuenta', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await request('POST', '/login', {
      email: 'ana@example.com',
      password: 'secret1',
    });

    expect(result.status).toBe(401);
    expect(result.body.code).toBe('BAD_CREDENTIALS');
  });

  test('devuelve token y datos seguros al validar credenciales', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id_usuario: 7,
        nombre: 'Ana',
        email: 'ana@example.com',
        password_hash: 'stored-hash',
        id_gimnasio: 3,
        activo: true,
        gym_activo: true,
        gym_nombre: 'Fit Gym',
        gym_logo: null,
        rol_nombre: 'ADMINISTRADOR',
      }],
    });

    const result = await request('POST', '/login', {
      email: 'ANA@example.com',
      password: 'secret1',
    });

    expect(result.status).toBe(200);
    expect(result.body.token).toEqual(expect.any(String));
    expect(result.body.user).not.toHaveProperty('password_hash');
    expect(result.body.gym).toMatchObject({ id: 3, name: 'Fit Gym', active: true });
    expect(mockCompare).toHaveBeenCalledWith('secret1', 'stored-hash');
  });

  test('rechaza contraseña incorrecta y cuentas desactivadas', async () => {
    const user = {
      id_usuario: 7,
      nombre: 'Ana',
      email: 'ana@example.com',
      password_hash: 'stored-hash',
      id_gimnasio: 3,
      activo: true,
      gym_activo: true,
      rol_nombre: 'ADMINISTRADOR',
    };
    mockQuery.mockResolvedValueOnce({ rows: [user] });
    mockCompare.mockResolvedValueOnce(false);

    expect((await request('POST', '/login', { email: user.email, password: 'wrong1' })).body.code)
      .toBe('BAD_CREDENTIALS');

    mockQuery.mockResolvedValueOnce({ rows: [{ ...user, activo: false }] });
    mockCompare.mockResolvedValueOnce(true);
    const disabled = await request('POST', '/login', { email: user.email, password: 'secret1' });
    expect(disabled.status).toBe(403);
    expect(disabled.body.code).toBe('ACCOUNT_DISABLED');
  });

  test('convierte fallos de consulta en 503', async () => {
    mockQuery.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await request('POST', '/login', {
      email: 'ana@example.com',
      password: 'secret1',
    });

    expect(result.status).toBe(503);
    expect(result.body.code).toBe('DB_UNREACHABLE');
  });
});

describe('POST /api/auth/signup', () => {
  test('crea gimnasio y dueño en una transacción', async () => {
    const clientQuery = jest.fn(async (sql) => {
      if (/SELECT id_usuario FROM usuario/i.test(sql)) return { rows: [] };
      if (/INSERT INTO gimnasio/i.test(sql)) {
        return {
          rows: [{
            id_gimnasio: 3,
            nombre: 'Fit Gym',
            telefono: '3101234567',
            email: null,
            trial_ends_at: '2026-11-18',
            activo: true,
          }],
        };
      }
      if (/INSERT INTO usuario/i.test(sql)) {
        return {
          rows: [{
            id_usuario: 7,
            nombre: 'Ana',
            email: 'ana@example.com',
            id_gimnasio: 3,
            id_rol: 1,
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const client = { query: clientQuery, release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);
    mockHash.mockResolvedValueOnce('stored-hash');

    const result = await request('POST', '/signup', {
      gymName: ' Fit Gym ',
      gymPhone: '310 123 4567',
      ownerName: ' Ana ',
      ownerEmail: 'ANA@example.com',
      password: 'secret1',
    });

    expect(result.status).toBe(201);
    expect(result.body.user).toMatchObject({ name: 'Ana', email: 'ana@example.com' });
    expect(result.body.gym).toMatchObject({ id: 3, nombre: 'Fit Gym', trialDays: 14, devAccount: false });
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(mockHash).toHaveBeenCalledWith('secret1', 10);
  });

  test('revierte transacción cuando el email del dueño ya existe', async () => {
    const clientQuery = jest.fn(async (sql) => {
      if (/SELECT id_usuario FROM usuario/i.test(sql)) return { rows: [{ id_usuario: 99 }] };
      return { rows: [] };
    });
    const client = { query: clientQuery, release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);

    const result = await request('POST', '/signup', {
      gymName: 'Fit Gym',
      gymPhone: '3101234567',
      ownerName: 'Ana',
      ownerEmail: 'ana@example.com',
      password: 'secret1',
    });

    expect(result.status).toBe(409);
    expect(result.body.code).toBe('USER_EMAIL_TAKEN');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('GET /api/auth/me y POST /api/auth/logout', () => {
  test('devuelve perfil actualizado de base de datos', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id_usuario: 7,
        nombre: 'Ana',
        email: 'ana@example.com',
        id_gimnasio: 3,
        rol_nombre: 'ADMINISTRADOR',
        gym_activo: true,
        gym_nombre: 'Fit Gym',
      }],
    });

    const result = await request('GET', '/me');

    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({ id: 7, name: 'Ana', role: 'admin' });
    expect(result.body.gym).toMatchObject({ id: 3, name: 'Fit Gym', active: true });
  });

  test('responde 404 para usuario ausente y confirma logout', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    expect((await request('GET', '/me')).body.code).toBe('USER_NOT_FOUND');
    expect(await request('POST', '/logout')).toMatchObject({
      status: 200,
      body: { message: 'Sesion cerrada' },
    });
  });
});

describe('POST /api/auth/forgot-password', () => {
  test('usa respuesta genérica si el correo no está registrado', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await request('POST', '/forgot-password', { email: 'unknown@example.com' });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ resendAfterSeconds: 60 });
    expect(result.body).not.toHaveProperty('devCode');
    expect(mockSendRecoveryCode).not.toHaveBeenCalled();
  });

  test('genera código y lo devuelve en modo demo si el correo no se entrega', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id_usuario: 7, nombre: 'Ana', email: 'ana@example.com' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockSendRecoveryCode.mockResolvedValueOnce({ delivered: false, reason: 'no-api' });

    const result = await request('POST', '/forgot-password', { email: ' ANA@example.com ' });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      showCodeInUI: true,
      devCodeReason: 'no-api',
      resendAfterSeconds: 60,
    });
    expect(result.body.devCode).toMatch(/^\d{6}$/);
    expect(mockQuery.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS password_reset');
    expect(mockQuery.mock.calls[2][1][1]).toBe(result.body.devCode);
    expect(mockSendRecoveryCode).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ana@example.com',
      name: 'Ana',
      code: result.body.devCode,
    }));
  });

  test('oculta errores internos de persistencia detrás de respuesta genérica', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id_usuario: 7, nombre: 'Ana', email: 'ana@example.com' }] })
      .mockRejectedValueOnce(new Error('missing reset table'));

    const result = await request('POST', '/forgot-password', { email: 'ana@example.com' });

    expect(result.status).toBe(200);
    expect(result.body).not.toHaveProperty('devCode');
    expect(result.body.message).toMatch(/Si el correo esta registrado/);
  });
});

describe('POST /api/auth/verify-reset-code y /reset-password', () => {
  test('rechaza código con formato inválido', async () => {
    const result = await request('POST', '/verify-reset-code', {
      email: 'ana@example.com',
      code: '123',
    });

    expect(result.status).toBe(400);
    expect(result.body.code).toBe('VALIDATION_ERROR');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('consume código válido y devuelve resetToken', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id_usuario: 7, nombre: 'Ana' }] })
      .mockResolvedValueOnce({
        rows: [{ id_reset: 12, expires_at: new Date(Date.now() + 60000), used: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await request('POST', '/verify-reset-code', {
      email: 'ana@example.com',
      code: '123456',
    });

    expect(result.status).toBe(200);
    expect(result.body.resetToken).toEqual(expect.any(String));
    expect(mockQuery.mock.calls[2][0]).toContain('used = TRUE');
  });

  test('rechaza código inexistente, usado o expirado', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] });
    const absent = await request('POST', '/verify-reset-code', {
      email: 'missing@example.com',
      code: '123456',
    });
    expect(absent.body.code).toBe('BAD_CODE');

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id_usuario: 7 }] })
      .mockResolvedValueOnce({ rows: [{ id_reset: 1, used: true, expires_at: new Date(Date.now() + 60000) }] });
    const used = await request('POST', '/verify-reset-code', {
      email: 'ana@example.com',
      code: '123456',
    });
    expect(used.body.error).toBe('Codigo ya usado');

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id_usuario: 7 }] })
      .mockResolvedValueOnce({ rows: [{ id_reset: 2, used: false, expires_at: new Date(Date.now() - 60000) }] });
    const expired = await request('POST', '/verify-reset-code', {
      email: 'ana@example.com',
      code: '123456',
    });
    expect(expired.body.error).toBe('Codigo expirado');
  });

  test('restablece la contraseña usando resetToken', async () => {
    mockHash.mockResolvedValueOnce('new-password-hash');
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const jwt = require('jsonwebtoken');
    const resetToken = jwt.sign({ id: 7, purpose: 'reset' }, process.env.JWT_SECRET);

    const result = await request('POST', '/reset-password', {
      resetToken,
      password: 'newpass1',
    });

    expect(result.status).toBe(200);
    expect(result.body.message).toMatch(/Contrasena actualizada/);
    expect(mockQuery.mock.calls[0][1]).toEqual(['new-password-hash', 7]);
    expect(mockHash).toHaveBeenCalledWith('newpass1', 10);
  });

  test('rechaza tokens de propósito incorrecto y usuario no encontrado al guardar', async () => {
    const jwt = require('jsonwebtoken');
    const wrongPurpose = jwt.sign({ id: 7, purpose: 'session' }, process.env.JWT_SECRET);
    const invalid = await request('POST', '/reset-password', {
      resetToken: wrongPurpose,
      password: 'newpass1',
    });
    expect(invalid.body.code).toBe('BAD_RESET_TOKEN');

    mockHash.mockResolvedValueOnce('new-password-hash');
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const resetToken = jwt.sign({ id: 7, purpose: 'reset' }, process.env.JWT_SECRET);
    const missing = await request('POST', '/reset-password', {
      resetToken,
      password: 'newpass1',
    });
    expect(missing.body.code).toBe('USER_NOT_FOUND');
  });
});

describe('DELETE /api/auth/account', () => {
  test('elimina todos los datos del dueño en una transacción', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ password_hash: 'stored-hash', es_dueno: true }],
    });
    mockCompare.mockResolvedValueOnce(true);
    const clientQuery = jest.fn(async (sql) => {
      if (/DELETE FROM gimnasio/i.test(sql)) return { rowCount: 1 };
      return { rowCount: 0 };
    });
    const client = { query: clientQuery, release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);
    jest.spyOn(console, 'info').mockImplementation(() => {});

    const result = await request('DELETE', '/account', { password: 'secret1' });

    expect(result.status).toBe(200);
    expect(result.body.deleted).toMatchObject({ gymId: 3 });
    expect(result.body.deleted.filas).toBe(1);
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(clientQuery.mock.calls.filter(([sql]) => /^SAVEPOINT paso_eliminar$/.test(sql)))
      .toHaveLength(29);
  });

  test('rechaza administrador que no es dueño antes de abrir transacción', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ password_hash: 'stored-hash', es_dueno: false }],
    });

    const result = await request('DELETE', '/account', { password: 'secret1' });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe('NOT_OWNER');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('salta una tabla opcional ausente y completa el borrado', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ password_hash: 'stored-hash', es_dueno: true }],
    });
    mockCompare.mockResolvedValueOnce(true);
    let firstDelete = true;
    const clientQuery = jest.fn(async (sql) => {
      if (/DELETE FROM gimnasio/i.test(sql)) return { rowCount: 1 };
      if (/^DELETE FROM envio_mensaje/i.test(sql) && firstDelete) {
        firstDelete = false;
        const error = new Error('optional table is missing');
        error.code = '42P01';
        throw error;
      }
      return { rowCount: 0 };
    });
    const client = { query: clientQuery, release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);
    jest.spyOn(console, 'info').mockImplementation(() => {});

    const result = await request('DELETE', '/account', { password: 'secret1' });

    expect(result.status).toBe(200);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT paso_eliminar');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  test('revierte la transacción y responde 500 ante fallo inesperado de borrado', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ password_hash: 'stored-hash', es_dueno: true }],
    });
    mockCompare.mockResolvedValueOnce(true);
    const clientQuery = jest.fn(async (sql) => {
      if (/^DELETE FROM envio_mensaje/i.test(sql)) throw new Error('foreign key blocked');
      return { rowCount: 0 };
    });
    const client = { query: clientQuery, release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);

    const result = await request('DELETE', '/account', { password: 'secret1' });

    expect(result.status).toBe(500);
    expect(result.body.code).toBe('DELETE_FAILED');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('rechaza contraseña de confirmación incorrecta sin abrir transacción', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ password_hash: 'stored-hash', es_dueno: true }],
    });
    mockCompare.mockResolvedValueOnce(false);

    const result = await request('DELETE', '/account', { password: 'wrongpass1' });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe('WRONG_PASSWORD');
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
