import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  api,
  clearToken,
  describeError,
  getToken,
  SESION_EXPIRADA,
  setToken,
  tokenVenceEn,
} from '../src/api';

const successfulAdapter = async (config) => ({
  data: { ok: true },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

function failingAdapter(status, data = {}, configOverride = {}) {
  return async (config) => {
    const requestConfig = { ...config, ...configOverride };
    throw {
      config: requestConfig,
      response: { status, data, config: requestConfig },
    };
  };
}

describe('cliente API y sesión', () => {
  beforeEach(() => {
    localStorage.clear();
    api.defaults.adapter = successfulAdapter;
  });

  afterEach(() => {
    api.defaults.adapter = successfulAdapter;
    vi.restoreAllMocks();
  });

  test('lee, guarda, borra y tolera fallas de localStorage', () => {
    expect(getToken()).toBeNull();
    setToken('token-uno');
    expect(getToken()).toBe('token-uno');
    clearToken();
    expect(getToken()).toBeNull();

    const original = window.localStorage;
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('inaccesible'); },
      setItem: () => { throw new Error('inaccesible'); },
      removeItem: () => { throw new Error('inaccesible'); },
    });
    expect(getToken()).toBeNull();
    expect(() => setToken('no-guardado')).not.toThrow();
    expect(() => clearToken()).not.toThrow();
    vi.stubGlobal('localStorage', original);
  });

  test('adjunta el token a las solicitudes y no inventa uno si no existe', async () => {
    const adapter = vi.fn(successfulAdapter);
    api.defaults.adapter = adapter;
    await api.get('/admin/miembros');
    expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined();

    setToken('jwt-vigente');
    await api.get('/admin/miembros');
    expect(adapter.mock.calls[1][0].headers.Authorization).toBe('Bearer jwt-vigente');
  });

  test('decodifica exp, token por defecto, formato inválido y exp no numérico', () => {
    const encode = (payload) => `header.${btoa(JSON.stringify(payload)).replace(/=/g, '')}.signature`;
    const expiration = Math.floor(Date.now() / 1000) + 3600;
    expect(tokenVenceEn(encode({ exp: expiration }))).toBe(expiration * 1000);
    setToken(encode({ exp: expiration }));
    expect(tokenVenceEn()).toBe(expiration * 1000);
    expect(tokenVenceEn(null)).toBeNull();
    expect(tokenVenceEn('sin-payload')).toBeNull();
    expect(tokenVenceEn(encode({ exp: 'mañana' }))).toBeNull();
  });

  test.each([
    [400, {}, 'Datos invalidos'],
    [401, {}, 'Sesion expirada o no autorizada'],
    [402, {}, 'Tu periodo de prueba expiro'],
    [403, {}, 'No tienes permiso para esta accion'],
    [404, {}, 'Recurso no encontrado'],
    [409, {}, 'Conflicto con un registro existente'],
    [413, {}, 'Solicitud demasiado grande'],
    [429, {}, 'Demasiadas solicitudes, espera un momento'],
    [503, {}, 'Error interno del servidor, intenta de nuevo'],
    [422, {}, 'Error inesperado'],
    [422, { message: 'Mensaje del servicio', code: 'VALIDATION', details: { field: 'email' } }, 'Mensaje del servicio'],
    [422, { error: 'Error del contrato', error_code: 'BAD_INPUT' }, 'Error del contrato'],
  ])('normaliza HTTP %s a un error con mensaje y metadatos', async (status, data, message) => {
    api.defaults.adapter = failingAdapter(status, data);
    try {
      await api.get('/admin/miembros');
      throw new Error('La solicitud debía fallar');
    } catch (error) {
      expect(error.status).toBe(status);
      expect(error.message).toBe(message);
      expect(error.isNetwork).toBe(false);
      expect(error.raw).toBeDefined();
      if (data.code || data.error_code) expect(error.code).toBe(data.code || data.error_code);
      if (data.details) expect(error.details).toEqual(data.details);
    }
  });

  test.each([
    ['ERR_NETWORK', 'Network Error', 'NETWORK'],
    ['ECONNABORTED', 'timeout', 'NETWORK'],
    [undefined, 'Network Error', 'NETWORK'],
    ['EOTHER', 'fallo inesperado', 'EOTHER'],
    [undefined, 'sin código', 'UNKNOWN'],
  ])('normaliza errores de red %s', async (code, message, expectedCode) => {
    api.defaults.adapter = async (config) => { throw { code, message, config }; };
    try {
      await api.get('/admin/miembros');
      throw new Error('La solicitud debía fallar');
    } catch (error) {
      expect(error.status).toBe(0);
      expect(error.code).toBe(expectedCode);
      expect(error.isNetwork).toBe(true);
      expect(error.message).toBe(expectedCode === 'NETWORK'
        ? 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.'
        : message);
    }
  });

  test('describeError normaliza valores vacíos, texto y error con mensaje', () => {
    expect(describeError(null)).toBe('Error desconocido');
    expect(describeError('No disponible')).toBe('No disponible');
    expect(describeError({ message: 'Mensaje del API' })).toBe('Mensaje del API');
    expect(describeError({})).toBe('Error desconocido');
  });
});

describe('sesión expirada', () => {
  beforeEach(() => {
    localStorage.clear();
    api.defaults.adapter = successfulAdapter;
  });

  afterEach(() => {
    api.defaults.adapter = successfulAdapter;
    vi.restoreAllMocks();
  });

  test('notifica y borra el token cuando el API invalida la sesión actual', async () => {
    setToken('token-viejo');
    const onExpired = vi.fn();
    window.addEventListener(SESION_EXPIRADA, onExpired);
    api.defaults.adapter = failingAdapter(401, { code: 'ACCOUNT_DISABLED' });

    await expect(api.get('/admin/miembros')).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
    expect(onExpired.mock.calls[0][0].detail).toEqual({ code: 'ACCOUNT_DISABLED' });
    window.removeEventListener(SESION_EXPIRADA, onExpired);
  });

  test.each([
    ['/auth/login', 401],
    ['/auth/signup', 401],
    ['/auth/forgot-password', 401],
    ['/auth/verify-reset-code', 401],
    ['/auth/reset-password', 401],
    ['/auth/accept-invite', 401],
    ['/admin/miembros', 403],
  ])('no invalida la sesión por una respuesta pública %s / HTTP %s', async (url, status) => {
    setToken('token-vigente');
    const onExpired = vi.fn();
    window.addEventListener(SESION_EXPIRADA, onExpired);
    api.defaults.adapter = failingAdapter(status, { code: 'BAD_CREDENTIALS' });
    await expect(api.get(url)).rejects.toMatchObject({ status });
    expect(getToken()).toBe('token-vigente');
    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener(SESION_EXPIRADA, onExpired);
  });

  test('no borra un token nuevo ni una respuesta sin Authorization enviado', async () => {
    setToken('token-nuevo');
    const onExpired = vi.fn();
    window.addEventListener(SESION_EXPIRADA, onExpired);
    api.defaults.adapter = failingAdapter(401, {}, { headers: {} });
    await expect(api.get('/admin/miembros')).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBe('token-nuevo');
    expect(onExpired).not.toHaveBeenCalled();

    api.defaults.adapter = failingAdapter(401);
    const unsubscribe = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => false);
    setToken('token-vigente');
    await expect(api.get('/admin/miembros')).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
    unsubscribe.mockRestore();
    window.removeEventListener(SESION_EXPIRADA, onExpired);
  });
});
