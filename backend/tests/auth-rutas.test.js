/**
 * Bootcamp semana 2 (capa API, Santiago): reglas de negocio de routes/auth.js.
 *  - Recuperacion de clave: el codigo de 6 digitos vence, se usa una sola vez
 *    y no revela si un correo existe.
 *  - Reset con resetToken: solo vale un token firmado con purpose 'reset'.
 *
 * La BD y el correo se simulan (como en aislamiento.test.js) y la fecha se fija
 * con jest.setSystemTime, asi que las pruebas no dependen de la red ni del reloj.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));
const mockSendRecoveryCode = jest.fn();
jest.mock('../src/lib/email', () => ({ sendRecoveryCode: (...a) => mockSendRecoveryCode(...a) }));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const authRouter = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use(errorHandler);

const AHORA = new Date('2026-10-26T15:00:00.000Z');
const USUARIO = { id_usuario: 7, nombre: 'Ana', email: 'ana@gym.co' };

// Responde segun la consulta: el usuario por correo y el ultimo codigo guardado.
function simularBd({ usuario = USUARIO, codigo = null, filasActualizadas = 1 } = {}) {
  mockQuery.mockImplementation(async (sql) => {
    if (/FROM usuario WHERE LOWER\(email\)/i.test(sql)) return { rows: usuario ? [usuario] : [] };
    if (/FROM password_reset/i.test(sql)) return { rows: codigo ? [codigo] : [] };
    if (/UPDATE usuario SET password_hash/i.test(sql)) return { rowCount: filasActualizadas };
    return { rows: [], rowCount: 1 };
  });
}

const llamadas = (patron) => mockQuery.mock.calls.filter(([sql]) => patron.test(sql));

beforeEach(() => {
  mockQuery.mockReset();
  mockSendRecoveryCode.mockReset();
  // Solo se finge la fecha: los timers reales siguen para que supertest funcione.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'] });
  jest.setSystemTime(AHORA);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('POST /api/auth/verify-reset-code', () => {
  const verificar = (body) => request(app).post('/api/auth/verify-reset-code').send(body);
  const codigoQueVence = (ms) => ({ id_reset: 3, used: false, expires_at: new Date(AHORA.getTime() + ms) });

  test.each([
    ['5 digitos', '12345'],
    ['7 digitos', '1234567'],
    ['letras', '12a456'],
  ])('rechaza con 400 un codigo de %s sin consultar la base', async (_caso, code) => {
    const r = await verificar({ email: 'ana@gym.co', code });

    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('acepta un codigo que vence justo ahora (limite) y lo marca como usado', async () => {
    simularBd({ codigo: codigoQueVence(0) });

    const r = await verificar({ email: 'ana@gym.co', code: '123456' });

    expect(r.status).toBe(200);
    const payload = jwt.verify(r.body.resetToken, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: 7, purpose: 'reset' });
    expect(llamadas(/UPDATE password_reset SET used = TRUE/)).toHaveLength(1);
  });

  test('rechaza un codigo vencido hace 1 ms y no lo consume', async () => {
    simularBd({ codigo: codigoQueVence(-1) });

    const r = await verificar({ email: 'ana@gym.co', code: '123456' });

    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Codigo expirado', code: 'BAD_CODE' });
    expect(llamadas(/UPDATE password_reset/)).toHaveLength(0);
  });

  test('rechaza un codigo que ya se uso', async () => {
    simularBd({ codigo: { ...codigoQueVence(60_000), used: true } });

    const r = await verificar({ email: 'ana@gym.co', code: '123456' });

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Codigo ya usado');
  });

  test('un correo que no existe responde igual que un codigo invalido', async () => {
    simularBd({ usuario: null });
    const sinUsuario = await verificar({ email: 'nadie@gym.co', code: '123456' });
    simularBd({ codigo: null });
    const sinCodigo = await verificar({ email: 'ana@gym.co', code: '654321' });

    expect(sinUsuario.status).toBe(400);
    expect(sinUsuario.body).toEqual(sinCodigo.body);
    expect(sinUsuario.body).toEqual({ error: 'Codigo invalido', code: 'BAD_CODE' });
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/auth/reset-password con resetToken', () => {
  const restablecer = (body) => request(app).post('/api/auth/reset-password').send(body);
  const firmar = (payload, opciones = { expiresIn: '15m' }) => jwt.sign(payload, process.env.JWT_SECRET, opciones);

  test('con un token de reset valido cambia la clave y cierra las sesiones del usuario', async () => {
    simularBd();

    const r = await restablecer({ resetToken: firmar({ id: 7, purpose: 'reset' }), password: 'nueva123' });

    expect(r.status).toBe(200);
    const [[, [hash, id]]] = llamadas(/UPDATE usuario SET password_hash/);
    expect(id).toBe(7);
    expect(hash).not.toBe('nueva123');
    expect(llamadas(/UPDATE sesion SET estado = 'CERRADA'/)[0][1]).toEqual([7]);
  });

  test('rechaza un token de sesion normal (purpose distinto de reset)', async () => {
    simularBd();

    const r = await restablecer({ resetToken: firmar({ id: 7, role: 'admin' }), password: 'nueva123' });

    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BAD_RESET_TOKEN');
    expect(llamadas(/UPDATE usuario/)).toHaveLength(0);
  });

  test('rechaza un token de reset vencido', async () => {
    simularBd();
    const vencido = firmar({ id: 7, purpose: 'reset', exp: Math.floor(AHORA.getTime() / 1000) - 1 }, {});

    const r = await restablecer({ resetToken: vencido, password: 'nueva123' });

    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BAD_RESET_TOKEN');
  });

  test('responde 404 si el usuario del token ya no existe', async () => {
    simularBd({ filasActualizadas: 0 });

    const r = await restablecer({ resetToken: firmar({ id: 99, purpose: 'reset' }), password: 'nueva123' });

    expect(r.status).toBe(404);
    expect(r.body.code).toBe('USER_NOT_FOUND');
    expect(llamadas(/UPDATE sesion/)).toHaveLength(0);
  });
});
