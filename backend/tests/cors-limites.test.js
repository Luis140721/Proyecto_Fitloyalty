/**
 * D1 (RQNF-15) y D2 (RQNF-09): CORS solo para los orígenes de FRONTEND_URL
 * y límite de 5 intentos por 15 minutos en verify-reset-code, reset-password
 * y account.
 *
 * Se prueba la app real: src/index.js exporta `app` y solo arranca el
 * servidor (y las migraciones) cuando se ejecuta directamente, así que aquí
 * no abre puertos ni toca la base. Las peticiones de los límites se cortan
 * antes de la base (zod o token), por eso no hace falta simularla.
 *
 * FRONTEND_URL se fija antes del require porque index.js lee la lista de
 * orígenes al cargarse; dotenv no pisa variables que ya existen.
 */
process.env.FRONTEND_URL = 'http://localhost:5173,https://fitloyalty-zeta.vercel.app';
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas';

const request = require('supertest');
const { app } = require('../src/index');

const PERMITIDO = 'http://localhost:5173';
const PERMITIDO_2 = 'https://fitloyalty-zeta.vercel.app';
const AJENO = 'https://sitio-ajeno.example';

let errorLog;
beforeEach(() => {
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('D1: CORS solo para los orígenes de FRONTEND_URL', () => {
  test('origen permitido: 200 con Access-Control-Allow-Origin', async () => {
    const r = await request(app).get('/api/healthz').set('Origin', PERMITIDO);
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe(PERMITIDO);
  });

  test('el segundo origen de la lista también pasa', async () => {
    const r = await request(app).get('/api/healthz').set('Origin', PERMITIDO_2);
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe(PERMITIDO_2);
  });

  test('origen ajeno: 403 CORS_BLOCKED, sin Allow-Origin y sin traza en el log', async () => {
    const r = await request(app).get('/api/healthz').set('Origin', AJENO);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Origen no permitido', code: 'CORS_BLOCKED' });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(errorLog).not.toHaveBeenCalled();
  });

  test('preflight de un origen ajeno: 403', async () => {
    const r = await request(app)
      .options('/api/auth/login')
      .set('Origin', AJENO)
      .set('Access-Control-Request-Method', 'POST');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CORS_BLOCKED');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('preflight de un origen permitido: 204 con Allow-Origin', async () => {
    const r = await request(app)
      .options('/api/auth/login')
      .set('Origin', PERMITIDO)
      .set('Access-Control-Request-Method', 'POST');
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(PERMITIDO);
  });

  test('sin Origin (app Flutter, curl, monitor de healthz): pasa', async () => {
    const r = await request(app).get('/api/healthz');
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('D2: 5 intentos por 15 minutos', () => {
  // Estado HTTP de seis intentos seguidos.
  const seisIntentos = async (hacer) => {
    const estados = [];
    for (let i = 0; i < 6; i += 1) estados.push((await hacer()).status);
    return estados;
  };

  test('POST /api/auth/verify-reset-code: 429 al sexto intento', async () => {
    const estados = await seisIntentos(() => request(app).post('/api/auth/verify-reset-code').send({}));
    expect(estados).toEqual([400, 400, 400, 400, 400, 429]);
  });

  test('POST /api/auth/reset-password: 429 al sexto intento', async () => {
    const estados = await seisIntentos(() => request(app).post('/api/auth/reset-password').send({}));
    expect(estados).toEqual([400, 400, 400, 400, 400, 429]);
  });

  test('DELETE /api/auth/account: 429 al sexto intento, con la ventana de 15 minutos', async () => {
    const estados = await seisIntentos(() => request(app).delete('/api/auth/account'));
    expect(estados).toEqual([401, 401, 401, 401, 401, 429]);
    const r = await request(app).delete('/api/auth/account');
    expect(r.status).toBe(429);
    expect(r.headers['ratelimit-limit']).toBe('5');
    expect(Number(r.headers['ratelimit-reset'])).toBeLessThanOrEqual(15 * 60);
    expect(r.body.error).toMatch(/Demasiadas solicitudes/);
  });
});
