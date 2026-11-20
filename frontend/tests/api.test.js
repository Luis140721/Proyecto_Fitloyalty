/**
 * Semana 5 (dobles de prueba), capa Front, Santiago.
 *
 * El cliente HTTP (src/api.js) visto con MSW. Los tests de las paginas usan
 * vi.mock('../src/api'): reemplazan el modulo entero y sus interceptores nunca
 * corren. Aqui axios hace la peticion de verdad y MSW responde en lugar del
 * backend, asi que se ejecuta todo api.js: el token que se pega, el error
 * normalizado y el aviso de sesion expirada.
 *
 * Tipos de doble que se usan:
 *   - STUB: el servidor de MSW. Devuelve respuestas fijas (feliz, 500, 422, HTML,
 *     red caida) para que api.js reaccione; el test no le pregunta nada.
 *   - SPY: el listener del evento de sesion expirada y la captura de la cabecera
 *     Authorization. Registran lo que paso para verificar COMPORTAMIENTO.
 *   - FAKE: localStorage de jsdom. Es una implementacion real pero en memoria.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  clearToken,
  describeError,
  getToken,
  SESION_EXPIRADA,
  setToken,
  tokenVenceEn,
} from '../src/api.js';

const API = 'http://localhost:3001/api';
const TOKEN = 'token-de-prueba';

const miembros = [{ id: 'a1', nombre: 'Ana Ruiz', documento: '1001' }];

// Backend feliz por defecto. Cada test cambia solo lo que necesita con server.use.
const server = setupServer(
  http.get(`${API}/admin/miembros`, () => HttpResponse.json(miembros)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => clearToken());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('api: caso feliz', () => {
  it('should return the data and send the stored token as Bearer', async () => {
    // Arrange: SPY sobre la cabecera que llega al "backend".
    const cabeceras = [];
    server.use(
      http.get(`${API}/admin/miembros`, ({ request }) => {
        cabeceras.push(request.headers.get('authorization'));
        return HttpResponse.json(miembros);
      }),
    );
    setToken(TOKEN);

    // Act
    const res = await api.get('/admin/miembros');

    // Assert: estado (los datos) y comportamiento (la cabecera enviada).
    expect(res.data).toEqual(miembros);
    expect(cabeceras).toEqual([`Bearer ${TOKEN}`]);
  });

  it('should not send Authorization when there is no token', async () => {
    const cabeceras = [];
    server.use(
      http.get(`${API}/admin/miembros`, ({ request }) => {
        cabeceras.push(request.headers.get('authorization'));
        return HttpResponse.json(miembros);
      }),
    );

    await api.get('/admin/miembros');

    expect(cabeceras).toEqual([null]);
  });
});

describe('api: errores normalizados', () => {
  it('should reject with the generic server message when the API answers 500 without body', async () => {
    // STUB: un 500 vacio, como el de un proxy o un crash.
    server.use(http.get(`${API}/admin/miembros`, () => new HttpResponse(null, { status: 500 })));

    await expect(api.get('/admin/miembros')).rejects.toMatchObject({
      status: 500,
      code: null,
      message: 'Error interno del servidor, intenta de nuevo',
      isNetwork: false,
    });
  });

  it('should keep the message, code and details sent by the API on a 422', async () => {
    // STUB: el contrato de errores del backend ({ error, code, details }).
    server.use(
      http.post(`${API}/admin/miembros`, () =>
        HttpResponse.json(
          { error: 'El documento ya existe', code: 'DOCUMENTO_DUPLICADO', details: { campo: 'documento' } },
          { status: 422 },
        ),
      ),
    );

    await expect(api.post('/admin/miembros', { documento: '1001' })).rejects.toMatchObject({
      status: 422,
      code: 'DOCUMENTO_DUPLICADO',
      message: 'El documento ya existe',
      details: { campo: 'documento' },
    });
  });

  it('should fall back to a readable message when the API answers HTML instead of JSON', async () => {
    // STUB: un 400 con una pagina HTML (por ejemplo, el de un proxy o de Express sin manejador).
    server.use(
      http.post(`${API}/admin/miembros`, () =>
        new HttpResponse('<!DOCTYPE html><html><body>Bad Request</body></html>', {
          status: 400,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const err = await api.post('/admin/miembros', {}).catch((e) => e);

    // Lo que veria la persona: nunca el HTML ni un "Unexpected token '<'".
    expect(err.message).toBe('Datos invalidos');
    expect(err.message).not.toMatch(/<|JSON/);
    expect(err.code).toBeNull();
  });

  it('should mark the error as network when the server cannot be reached', async () => {
    // STUB: la red cae (CORS, Render dormido, sin internet).
    server.use(http.get(`${API}/admin/miembros`, () => HttpResponse.error()));

    await expect(api.get('/admin/miembros')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
      isNetwork: true,
      message: 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.',
    });
  });
});

describe('api: sesion expirada (RQF-02)', () => {
  let avisos;
  const escuchar = (e) => avisos(e.detail);

  beforeEach(() => {
    // SPY: registra cada aviso de sesion expirada que recibiria AuthContext.
    avisos = vi.fn();
    window.addEventListener(SESION_EXPIRADA, escuchar);
  });
  afterEach(() => window.removeEventListener(SESION_EXPIRADA, escuchar));

  it('should clear the token and notify with the backend code when a protected call answers 401', async () => {
    server.use(
      http.get(`${API}/admin/miembros`, () =>
        HttpResponse.json({ error: 'Cuenta desactivada', code: 'ACCOUNT_DISABLED' }, { status: 401 }),
      ),
    );
    setToken(TOKEN);

    await expect(api.get('/admin/miembros')).rejects.toMatchObject({ status: 401 });

    expect(getToken()).toBeNull();
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(avisos).toHaveBeenCalledWith({ code: 'ACCOUNT_DISABLED' });
  });

  it('should keep the session when the login itself answers 401 for bad credentials', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ error: 'Credenciales invalidas', code: 'BAD_CREDENTIALS' }, { status: 401 }),
      ),
    );
    setToken(TOKEN);

    await expect(api.post('/auth/login', { email: 'x@x.co', password: 'mala' })).rejects.toMatchObject({
      status: 401,
      code: 'BAD_CREDENTIALS',
    });

    // Comportamiento: no se avisa a nadie ni se borra la sesion abierta.
    expect(avisos).not.toHaveBeenCalled();
    expect(getToken()).toBe(TOKEN);
  });

  it('should not touch a newer token saved while the request was in flight', async () => {
    // Otra pestana inicia sesion mientras la peticion con el token viejo va en camino.
    server.use(
      http.get(`${API}/admin/miembros`, () => {
        setToken('token-nuevo');
        return HttpResponse.json({ error: 'Token vencido' }, { status: 401 });
      }),
    );
    setToken(TOKEN);

    await expect(api.get('/admin/miembros')).rejects.toMatchObject({ status: 401 });

    expect(getToken()).toBe('token-nuevo');
    expect(avisos).not.toHaveBeenCalled();
  });
});

describe('tokenVenceEn y describeError', () => {
  const jwt = (payload) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.f`;

  it('should read exp in milliseconds and return null for tokens without a valid exp', () => {
    expect(tokenVenceEn(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
    expect(tokenVenceEn(jwt({ sub: 1 }))).toBeNull();
    expect(tokenVenceEn('no-es-un-jwt')).toBeNull();
    expect(tokenVenceEn(null)).toBeNull();
  });

  it('should describe strings, normalized errors and empty values', () => {
    expect(describeError('Texto')).toBe('Texto');
    expect(describeError({ message: 'Del backend' })).toBe('Del backend');
    expect(describeError({})).toBe('Error desconocido');
    expect(describeError(null)).toBe('Error desconocido');
  });
});
