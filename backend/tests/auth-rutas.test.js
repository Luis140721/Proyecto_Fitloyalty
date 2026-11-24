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

// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  const bcrypt = require('bcryptjs');
  const HASH = bcrypt.hashSync('clave123', 4);
  const entrar = (body) => request(app).post('/api/auth/login').send(body);
  const fila = (extra = {}) => ({
    id_usuario: 7, nombre: 'Ana', email: 'ana@gym.co', password_hash: HASH, id_gimnasio: 3,
    activo: true, gym_activo: true, trial_ends_at: null, gym_nombre: 'FitGym', gym_logo: null,
    rol_nombre: 'ADMINISTRADOR', ...extra,
  });
  const conUsuario = (u) => mockQuery.mockResolvedValue({ rows: u ? [u] : [] });

  test('con la clave correcta devuelve el token y el gimnasio, sin el hash', async () => {
    conUsuario(fila());

    const r = await entrar({ email: 'ANA@gym.co', password: 'clave123' });

    expect(r.status).toBe(200);
    expect(jwt.verify(r.body.token, process.env.JWT_SECRET)).toMatchObject({ id: 7, gymId: 3 });
    expect(r.body.gym).toMatchObject({ id: 3, name: 'FitGym' });
    expect(JSON.stringify(r.body)).not.toContain(HASH);
    expect(mockQuery.mock.calls[0][1]).toEqual(['ana@gym.co']);
  });

  test('correo inexistente y clave incorrecta dan el mismo 401', async () => {
    conUsuario(null);
    const sinUsuario = await entrar({ email: 'nadie@gym.co', password: 'clave123' });
    conUsuario(fila());
    const malaClave = await entrar({ email: 'ana@gym.co', password: 'clave124' });

    expect(sinUsuario.status).toBe(401);
    expect(malaClave.status).toBe(401);
    expect(sinUsuario.body).toEqual(malaClave.body);
  });

  test('cuenta desactivada: 403 solo si la clave es correcta, para no revelar el correo', async () => {
    conUsuario(fila({ activo: false }));
    const buenaClave = await entrar({ email: 'ana@gym.co', password: 'clave123' });
    const malaClave = await entrar({ email: 'ana@gym.co', password: 'otra456' });

    expect(buenaClave.status).toBe(403);
    expect(buenaClave.body.code).toBe('ACCOUNT_DISABLED');
    expect(malaClave.status).toBe(401);
  });

  test('si la base no responde devuelve 503 y no 500', async () => {
    mockQuery.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const r = await entrar({ email: 'ana@gym.co', password: 'clave123' });

    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/auth/forgot-password', () => {
  const pedir = (email) => request(app).post('/api/auth/forgot-password').send({ email });

  test('correo inexistente: misma respuesta generica y no se envia nada', async () => {
    simularBd({ usuario: null });

    const r = await pedir('nadie@gym.co');

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      message: 'Si el correo esta registrado, te enviamos un codigo para recuperar tu contrasena.',
      resendAfterSeconds: 60,
    });
    expect(mockSendRecoveryCode).not.toHaveBeenCalled();
  });

  test('guarda un codigo de 6 digitos que vence en 15 minutos y lo envia al correo', async () => {
    simularBd();
    mockSendRecoveryCode.mockResolvedValue({ delivered: true });

    const r = await pedir('ana@gym.co');

    expect(r.status).toBe(200);
    expect(r.body.devCode).toBeUndefined();
    const [[, [idUsuario, code, vence]]] = llamadas(/INSERT INTO password_reset/);
    expect(idUsuario).toBe(7);
    expect(code).toMatch(/^\d{6}$/);
    expect(vence.getTime() - AHORA.getTime()).toBe(15 * 60_000);
    expect(mockSendRecoveryCode).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@gym.co', code, expiresMinutes: 15 }));
  });

  // Antes, si el correo no salia, el codigo viajaba en la respuesta y la pagina
  // lo mostraba: quien conociera el correo de alguien del panel podia cambiarle
  // la contrasena. Ahora solo se muestra en el modo demo de un equipo local.
  describe('el codigo no viaja en la respuesta salvo en el modo demo local', () => {
    const entorno = { NODE_ENV: process.env.NODE_ENV, SHOW_DEV_CODE_IN_UI: process.env.SHOW_DEV_CODE_IN_UI };
    const fijarEntorno = ({ nodeEnv, mostrar }) => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      if (mostrar === undefined) delete process.env.SHOW_DEV_CODE_IN_UI;
      else process.env.SHOW_DEV_CODE_IN_UI = mostrar;
    };
    const codigoGuardado = () => llamadas(/INSERT INTO password_reset/)[0][1][1];
    const GENERICA = {
      message: 'Si el correo esta registrado, te enviamos un codigo para recuperar tu contrasena.',
      resendAfterSeconds: 60,
    };

    afterEach(() => {
      if (entorno.NODE_ENV === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = entorno.NODE_ENV;
      if (entorno.SHOW_DEV_CODE_IN_UI === undefined) delete process.env.SHOW_DEV_CODE_IN_UI;
      else process.env.SHOW_DEV_CODE_IN_UI = entorno.SHOW_DEV_CODE_IN_UI;
    });

    test.each([
      ['production sin la variable', { nodeEnv: 'production', mostrar: undefined }],
      ['production con SHOW_DEV_CODE_IN_UI=true', { nodeEnv: 'production', mostrar: 'true' }],
      ['development sin la variable', { nodeEnv: 'development', mostrar: undefined }],
      ['development con SHOW_DEV_CODE_IN_UI=false', { nodeEnv: 'development', mostrar: 'false' }],
      // NODE_ENV es una lista blanca: si falta o trae otro valor, cuenta como produccion
      ['sin NODE_ENV y con SHOW_DEV_CODE_IN_UI=true', { nodeEnv: undefined, mostrar: 'true' }],
      ['staging con SHOW_DEV_CODE_IN_UI=true', { nodeEnv: 'staging', mostrar: 'true' }],
    ])('si el correo no sale, la respuesta es la generica y no trae el codigo (%s)', async (_caso, config) => {
      // Arrange
      fijarEntorno(config);
      simularBd();
      mockSendRecoveryCode.mockResolvedValue({ delivered: false, reason: 'no-api' });
      const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const r = await pedir('ana@gym.co');

      // Assert: lo mismo que ve quien pide con un correo que no existe
      expect(r.status).toBe(200);
      expect(r.body).toEqual(GENERICA);
      expect(JSON.stringify(r.body)).not.toContain(codigoGuardado());
      expect(aviso).toHaveBeenCalledWith(expect.stringContaining('No se pudo enviar el correo de recuperacion'), 'no-api');
    });

    test('con el correo entregado en produccion y SHOW_DEV_CODE_IN_UI=true tampoco trae el codigo', async () => {
      // Arrange
      fijarEntorno({ nodeEnv: 'production', mostrar: 'true' });
      simularBd();
      mockSendRecoveryCode.mockResolvedValue({ delivered: true });

      // Act
      const r = await pedir('ana@gym.co');

      // Assert
      expect(r.body).toEqual(GENERICA);
    });

    test.each([
      ['development, el correo no salio', 'development', { delivered: false, reason: 'no-api' }, 'no-api'],
      ['development, el correo salio', 'development', { delivered: true }, 'demo-mode'],
      ['test, el correo no salio', 'test', { delivered: false, reason: 'no-api' }, 'no-api'],
    ])('en el modo demo local muestra el codigo guardado (%s)', async (_caso, nodeEnv, envio, motivo) => {
      // Arrange
      fijarEntorno({ nodeEnv, mostrar: 'true' });
      simularBd();
      mockSendRecoveryCode.mockResolvedValue(envio);
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const r = await pedir('ana@gym.co');

      // Assert: es el mismo codigo que quedo guardado, para poder ensayar el flujo
      expect(r.body).toEqual({ ...GENERICA, devCode: codigoGuardado(), showCodeInUI: true, devCodeReason: motivo });
    });
  });
});
