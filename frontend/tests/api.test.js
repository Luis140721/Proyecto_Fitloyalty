/**
 * Semana 5 (dobles de prueba), capa Front, Santiago.
 *
 * El cliente HTTP (src/api.js) visto con MSW. Los tests de las paginas usan
 * vi.mock('../src/api'): reemplazan el modulo entero y sus interceptores nunca
 * corren. Aqui axios hace la peticion de verdad y MSW responde en lugar del
 * backend, asi que se ejecuta todo api.js: el token que se pega, el error
 * normalizado y el aviso de sesion expirada.
 *
 * Tipos de doble que se usan (cada test dice en su Arrange cuales usa):
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
  it('should return the data and send the token as Bearer when a token is stored', async () => {
    // Arrange: STUB (MSW responde la lista) + SPY sobre la cabecera que llega al
    // "backend" + FAKE (localStorage de jsdom guarda el token).
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
    // Arrange: STUB (MSW responde la lista) + SPY sobre la cabecera. El FAKE de
    // localStorage queda vacio por el clearToken() del beforeEach.
    const cabeceras = [];
    server.use(
      http.get(`${API}/admin/miembros`, ({ request }) => {
        cabeceras.push(request.headers.get('authorization'));
        return HttpResponse.json(miembros);
      }),
    );

    // Act
    await api.get('/admin/miembros');

    // Assert: comportamiento (la peticion salio sin cabecera).
    expect(cabeceras).toEqual([null]);
  });
});

describe('api: errores normalizados', () => {
  it('should reject with the generic server message when the API answers 500 without body', async () => {
    // Arrange: STUB, un 500 vacio, como el de un proxy o un crash.
    server.use(http.get(`${API}/admin/miembros`, () => new HttpResponse(null, { status: 500 })));

    // Act
    const peticion = api.get('/admin/miembros');

    // Assert: estado (el error normalizado).
    await expect(peticion).rejects.toMatchObject({
      status: 500,
      code: null,
      message: 'Error interno del servidor, intenta de nuevo',
      isNetwork: false,
    });
  });

  it('should keep the message, code and details sent by the API when it answers 422', async () => {
    // Arrange: STUB con el contrato de errores del backend ({ error, code, details }).
    server.use(
      http.post(`${API}/admin/miembros`, () =>
        HttpResponse.json(
          { error: 'El documento ya existe', code: 'DOCUMENTO_DUPLICADO', details: { campo: 'documento' } },
          { status: 422 },
        ),
      ),
    );

    // Act
    const peticion = api.post('/admin/miembros', { documento: '1001' });

    // Assert: estado (el error conserva lo que mando el backend).
    await expect(peticion).rejects.toMatchObject({
      status: 422,
      code: 'DOCUMENTO_DUPLICADO',
      message: 'El documento ya existe',
      details: { campo: 'documento' },
    });
  });

  it('should fall back to a readable message when the API answers HTML instead of JSON', async () => {
    // Arrange: STUB, un 400 con una pagina HTML (por ejemplo, el de un proxy o de
    // Express sin manejador).
    server.use(
      http.post(`${API}/admin/miembros`, () =>
        new HttpResponse('<!DOCTYPE html><html><body>Bad Request</body></html>', {
          status: 400,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    // Act
    const err = await api.post('/admin/miembros', {}).catch((e) => e);

    // Assert: estado. Lo que veria la persona: nunca el HTML ni un
    // "Unexpected token '<'".
    expect(err.message).toBe('Datos invalidos');
    expect(err.code).toBeNull();
  });

  it('should mark the error as network when the server cannot be reached', async () => {
    // Arrange: STUB, la red cae (CORS, Render dormido, sin internet).
    server.use(http.get(`${API}/admin/miembros`, () => HttpResponse.error()));

    // Act
    const peticion = api.get('/admin/miembros');

    // Assert: estado (el error de red normalizado).
    await expect(peticion).rejects.toMatchObject({
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
    // Arrange: STUB (MSW responde 401 con codigo) + SPY `avisos` del beforeEach +
    // FAKE (localStorage de jsdom con el token).
    server.use(
      http.get(`${API}/admin/miembros`, () =>
        HttpResponse.json({ error: 'Cuenta desactivada', code: 'ACCOUNT_DISABLED' }, { status: 401 }),
      ),
    );
    setToken(TOKEN);

    // Act
    await expect(api.get('/admin/miembros')).rejects.toMatchObject({ status: 401 });

    // Assert: estado (el token se borro) y comportamiento (un solo aviso, con el codigo).
    expect(getToken()).toBeNull();
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(avisos).toHaveBeenCalledWith({ code: 'ACCOUNT_DISABLED' });
  });

  it('should keep the session when the login itself answers 401 for bad credentials', async () => {
    // Arrange: STUB (el login responde 401) + SPY `avisos` del beforeEach +
    // FAKE (localStorage con una sesion ya abierta).
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ error: 'Credenciales invalidas', code: 'BAD_CREDENTIALS' }, { status: 401 }),
      ),
    );
    setToken(TOKEN);

    // Act
    await expect(api.post('/auth/login', { email: 'x@x.co', password: 'mala' })).rejects.toMatchObject({
      status: 401,
      code: 'BAD_CREDENTIALS',
    });

    // Assert: comportamiento (no se avisa a nadie) y estado (la sesion abierta sigue).
    expect(avisos).not.toHaveBeenCalled();
    expect(getToken()).toBe(TOKEN);
  });

  it('should not touch a newer token when it was saved while the request was in flight', async () => {
    // Arrange: STUB (MSW guarda un token nuevo, como otra pestana que inicia
    // sesion, y responde 401 al token viejo) + SPY `avisos` del beforeEach +
    // FAKE (localStorage compartido por las dos "pestanas").
    server.use(
      http.get(`${API}/admin/miembros`, () => {
        setToken('token-nuevo');
        return HttpResponse.json({ error: 'Token vencido' }, { status: 401 });
      }),
    );
    setToken(TOKEN);

    // Act
    await expect(api.get('/admin/miembros')).rejects.toMatchObject({ status: 401 });

    // Assert: estado (el token nuevo sigue) y comportamiento (sin aviso).
    expect(getToken()).toBe('token-nuevo');
    expect(avisos).not.toHaveBeenCalled();
  });
});

describe('tokenVenceEn y describeError', () => {
  const jwt = (payload) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.f`;

  it('should return exp in milliseconds when the token has a valid exp, and null when it does not', () => {
    // Arrange: sin dobles, funcion pura.
    const conExp = jwt({ exp: 1_800_000_000 });
    const sinExp = jwt({ sub: 1 });

    // Act y Assert: una llamada por entrada.
    expect(tokenVenceEn(conExp)).toBe(1_800_000_000_000);
    expect(tokenVenceEn(sinExp)).toBeNull();
    expect(tokenVenceEn('no-es-un-jwt')).toBeNull();
    expect(tokenVenceEn(null)).toBeNull();
  });

  it('should return a readable text when it receives a string, a normalized error or an empty value', () => {
    // Arrange: sin dobles, funcion pura.
    const normalizado = { message: 'Del backend' };

    // Act y Assert: una llamada por entrada.
    expect(describeError('Texto')).toBe('Texto');
    expect(describeError(normalizado)).toBe('Del backend');
    expect(describeError({})).toBe('Error desconocido');
    expect(describeError(null)).toBe('Error desconocido');
  });
});
