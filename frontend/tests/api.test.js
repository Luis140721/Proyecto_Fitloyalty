/**
 * Cobertura del front (Luis): el cliente HTTP de api.js con sus interceptores
 * reales. El adaptador de axios se reemplaza por uno de prueba que contesta lo
 * que pide cada test, sin red: asi se prueba el token en Authorization, el
 * error normalizado que leen todas las pantallas (status, code, message,
 * details) y el aviso de sesion expirada (RQF-02).
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  api, getToken, setToken, clearToken, tokenVenceEn, describeError, SESION_EXPIRADA, TOKEN_KEY,
} from '../src/api';

const adaptadorOriginal = api.defaults.adapter;
let peticiones;

/** Adaptador que responde 200 con `datos`. */
const responde = (datos) => async (config) => {
  peticiones.push(config);
  return { data: datos, status: 200, statusText: 'OK', headers: {}, config };
};

/** Adaptador que rechaza como lo hace axios cuando el backend contesta un error. */
const fallaCon = (status, data) => async (config) => {
  peticiones.push(config);
  throw Object.assign(new Error(`Request failed with status code ${status}`), { config, response: { status, data, config, headers: {} } });
};

/** Adaptador que rechaza sin respuesta (red caida, CORS, timeout). */
const sinRespuesta = (code, message) => async (config) => {
  peticiones.push(config);
  throw Object.assign(new Error(message), { code, config });
};

/** Captura lo que el front recibe en el catch. */
async function errorDe(peticion) {
  try { await peticion(); } catch (err) { return err; }
  throw new Error('La peticion no fallo');
}

const jwt = (payload) => `cabecera.${btoa(JSON.stringify(payload))}.firma`;

beforeEach(() => {
  localStorage.clear();
  peticiones = [];
});
afterEach(() => {
  api.defaults.adapter = adaptadorOriginal;
  vi.restoreAllMocks();
});

describe('api.js: el token de la sesion', () => {
  test('should read the token when it is saved and stop when it is cleared', () => {
    // Act y Assert
    setToken('token-1');
    expect(getToken()).toBe('token-1');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-1');
    clearToken();
    expect(getToken()).toBeNull();
  });

  test('should not break the app when the browser blocks localStorage', () => {
    // Arrange: modo privado estricto o almacenamiento lleno
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });

    // Act y Assert
    expect(getToken()).toBeNull();
    expect(() => setToken('token-1')).not.toThrow();
  });

  test('should send the token as Bearer when there is a session', async () => {
    // Arrange
    setToken('token-vigente');
    api.defaults.adapter = responde({ miembros: [] });

    // Act
    const { data } = await api.get('/admin/miembros');

    // Assert
    expect(data).toEqual({ miembros: [] });
    expect(peticiones[0].headers.Authorization).toBe('Bearer token-vigente');
  });

  test('should not send Authorization when there is no session', async () => {
    // Arrange
    api.defaults.adapter = responde({});

    // Act
    await api.post('/auth/login', { email: 'ana@gym.co' });

    // Assert
    expect(peticiones[0].headers.Authorization).toBeUndefined();
  });

  test.each([
    ['a token with exp', jwt({ sub: 1, exp: 1795000000 }), 1795000000 * 1000],
    ['a token without exp', jwt({ sub: 1 }), null],
    ['a token with exp as text', jwt({ exp: '1795000000' }), null],
    ['something that is not a JWT', 'no-es-un-jwt', null],
  ])('should read when the session ends from %s', (_caso, token, vence) => {
    // Act y Assert
    expect(tokenVenceEn(token)).toBe(vence);
  });

  test('should read the saved token when tokenVenceEn gets no argument, and null without session', () => {
    // Act y Assert
    expect(tokenVenceEn()).toBeNull();
    setToken(jwt({ exp: 1795000000 }));
    expect(tokenVenceEn()).toBe(1795000000 * 1000);
  });
});

describe('api.js: el error que reciben las pantallas', () => {
  test('should pass the message, code and details when the backend answers an error', async () => {
    // Arrange
    api.defaults.adapter = fallaCon(400, { error: 'Datos invalidos.', code: 'VALIDATION_ERROR', details: { issues: [{ path: ['email'] }] } });

    // Act
    const err = await errorDe(() => api.post('/auth/signup', {}));

    // Assert
    expect(err).toMatchObject({
      status: 400, code: 'VALIDATION_ERROR', message: 'Datos invalidos.', details: { issues: [{ path: ['email'] }] }, isNetwork: false,
    });
  });

  test('should accept message and error_code when the backend uses those names', async () => {
    // Arrange
    api.defaults.adapter = fallaCon(409, { message: 'Ese documento ya existe.', error_code: 'DUPLICATE' });

    // Act
    const err = await errorDe(() => api.post('/admin/miembros', {}));

    // Assert
    expect(err).toMatchObject({ status: 409, code: 'DUPLICATE', message: 'Ese documento ya existe.', details: null });
  });

  test.each([
    [400, 'Datos invalidos'],
    [401, 'Sesion expirada o no autorizada'],
    [402, 'Tu periodo de prueba expiro'],
    [403, 'No tienes permiso para esta accion'],
    [404, 'Recurso no encontrado'],
    [409, 'Conflicto con un registro existente'],
    [413, 'Solicitud demasiado grande'],
    [429, 'Demasiadas solicitudes, espera un momento'],
    [503, 'Error interno del servidor, intenta de nuevo'],
    [418, 'Error inesperado'],
  ])('should use a message in Spanish when the backend answers %i without one', async (status, mensaje) => {
    // Arrange
    api.defaults.adapter = fallaCon(status, null);

    // Act
    const err = await errorDe(() => api.get('/auth/login'));

    // Assert
    expect(err).toMatchObject({ status, code: null, message: mensaje });
  });

  test.each([
    ['ERR_NETWORK', 'Network Error'],
    ['ECONNABORTED', 'timeout of 20000ms exceeded'],
    [undefined, 'Network Error'],
  ])('should report no connection with status 0 when the request gets no answer (%s)', async (code, mensaje) => {
    // Arrange
    api.defaults.adapter = sinRespuesta(code, mensaje);

    // Act
    const err = await errorDe(() => api.get('/admin/dashboard'));

    // Assert
    expect(err).toMatchObject({
      status: 0, code: 'NETWORK', isNetwork: true, message: 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.',
    });
  });

  test('should keep the code and the message when a request without answer is not a network error', async () => {
    // Arrange: por ejemplo, una peticion cancelada
    api.defaults.adapter = sinRespuesta('ERR_CANCELED', 'canceled');

    // Act
    const err = await errorDe(() => api.get('/admin/dashboard'));

    // Assert
    expect(err).toMatchObject({ status: 0, code: 'ERR_CANCELED', message: 'canceled', isNetwork: true });
  });

  test('should use UNKNOWN and a generic message when a request without answer has no code and no message', async () => {
    // Arrange: falla sin respuesta, sin codigo y sin texto (no es de red)
    api.defaults.adapter = sinRespuesta(undefined, '');

    // Act
    const err = await errorDe(() => api.get('/admin/dashboard'));

    // Assert
    expect(err).toMatchObject({ status: 0, code: 'UNKNOWN', message: 'Error desconocido', isNetwork: true });
  });

  test.each([
    [null, 'Error desconocido'],
    ['Escribe el documento.', 'Escribe el documento.'],
    [{ message: 'Miembro no encontrado.' }, 'Miembro no encontrado.'],
    [{}, 'Error desconocido'],
  ])('should describe %j as "%s" when describeError gets it', (err, texto) => {
    // Act y Assert
    expect(describeError(err)).toBe(texto);
  });
});

describe('api.js: la sesion que vence en medio del uso', () => {
  let avisos;
  const escuchar = (e) => avisos.push(e.detail);
  beforeEach(() => {
    avisos = [];
    window.addEventListener(SESION_EXPIRADA, escuchar);
  });
  afterEach(() => window.removeEventListener(SESION_EXPIRADA, escuchar));

  test('should clear the token and warn AuthContext with the code when a request with the current token answers 401', async () => {
    // Arrange
    setToken('token-vigente');
    api.defaults.adapter = fallaCon(401, { error: 'Tu cuenta fue desactivada.', code: 'ACCOUNT_DISABLED' });

    // Act
    const err = await errorDe(() => api.get('/admin/miembros'));

    // Assert
    expect(err.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(avisos).toEqual([{ code: 'ACCOUNT_DISABLED' }]);
  });

  test('should warn AuthContext without a code when the 401 of the current token brings none', async () => {
    // Arrange: AuthContext muestra entonces "Tu sesion expiro" y no "cuenta desactivada"
    setToken('token-vigente');
    api.defaults.adapter = fallaCon(401, { error: 'No autorizado.' });

    // Act
    await errorDe(() => api.get('/admin/miembros'));

    // Assert
    expect(getToken()).toBeNull();
    expect(avisos).toEqual([{ code: null }]);
  });

  test.each([
    ['the login with a wrong password', '/auth/login', 401],
    ['the invitation', 'auth/accept-invite', 401],
    ['a request without permission', '/admin/staff', 403],
  ])('should keep the session when %s fails', async (_caso, url, status) => {
    // Arrange
    setToken('token-vigente');
    api.defaults.adapter = fallaCon(status, { error: 'No', code: 'X' });

    // Act
    await errorDe(() => api.post(url, {}));

    // Assert
    expect(getToken()).toBe('token-vigente');
    expect(avisos).toEqual([]);
  });

  test('should not touch the new token when it was saved while the old request was on its way', async () => {
    // Arrange: otra pestana inicio sesion mientras viajaba la peticion
    setToken('token-viejo');
    api.defaults.adapter = async (config) => {
      setToken('token-nuevo');
      throw Object.assign(new Error('401'), { config, response: { status: 401, data: null, config } });
    };

    // Act
    await errorDe(() => api.get('/admin/miembros'));

    // Assert
    expect(getToken()).toBe('token-nuevo');
    expect(avisos).toEqual([]);
  });

  test('should not warn when the 401 belongs to a request sent without token', async () => {
    // Arrange: el token aparece despues de mandar la peticion
    api.defaults.adapter = async (config) => {
      setToken('token-nuevo');
      throw Object.assign(new Error('401'), { config, response: { status: 401, data: {}, config } });
    };

    // Act
    await errorDe(() => api.get('/admin/miembros'));

    // Assert
    expect(getToken()).toBe('token-nuevo');
    expect(avisos).toEqual([]);
  });
});

describe('api.js: a que backend apunta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test.each([
    ['https://fitloyalty-api.onrender.com/api', 'fitloyalty.vercel.app'],
    ['http://localhost:3001/api', 'localhost'],
  ])('should point to %s when the front runs on %s without VITE_API_BASE', async (esperado, host) => {
    // Arrange: la URL se decide al cargar el modulo, por eso se vuelve a importar
    vi.stubEnv('VITE_API_BASE', '');
    vi.stubGlobal('window', { location: { hostname: host } });
    vi.resetModules();

    // Act
    const { api: cliente } = await import('../src/api');

    // Assert
    expect(cliente.defaults.baseURL).toBe(esperado);
  });
});
