/**
 * RQNF-05: los jobs que un administrador dispara a mano (routes/jobs.js) usan
 * el gimnasio de su sesion; el cron sigue recorriendo todos.
 *
 * La base falsa tiene miembros de dos gimnasios y respeta el filtro del SQL.
 * authenticate y authorize son los reales; solo se simulan la base, la lectura
 * del personal y WhatsApp.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({
  query: (...a) => mockQuery(...a),
  connect: async () => ({ query: (...a) => mockQuery(...a), release: () => {} }),
}));
const mockEnviar = jest.fn();
jest.mock('../src/lib/whatsapp', () => ({ sendWhatsAppText: (...a) => mockEnviar(...a) }));

const legal = require('../src/lib/contacto-legal');
const { runJob, miembrosPorVencer, diasDeVentana } = require('../src/jobs/expiracion');
const jobsRouter = require('../src/routes/jobs');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/jobs', jobsRouter);
app.use(errorHandler);

const SECRETO = 'secreto-de-pruebas';
const ENV_ORIGINAL = process.env;
const token = (datos) => jwt.sign({ id: 1, role: 'admin', gymId: 7, ...datos }, SECRETO, { expiresIn: '1h' });
const llamar = (metodo, ruta, datos = {}) => request(app)[metodo](ruta).set('Authorization', `Bearer ${token(datos)}`);

const fila = (id, gym, nombre, telefono) => ({
  id_miembro: id, id_gimnasio: gym, nombre, telefono, gym_nombre: `Gym ${gym}`,
  tipo_plan: 'MENSUAL', fecha_fin: '2026-11-19', dias_restantes: 2, dias_aviso: 5,
});
const PROPIA = fila(70, 7, 'Ana del 7', '3001112233');
const AJENO = fila(80, 8, 'Beto del 8', '3009998877');
const DIAS = { 7: 5, 8: 20 }; // dias_aviso_vencimiento de cada gimnasio
/** Parametros de la consulta de miembros por vencer. */
const parametros = () => mockQuery.mock.calls.find(([sql]) => sql.includes('FROM miembro m'))[1];

/** Base falsa: aplica el filtro por gimnasio solo si el SQL lo trae. */
function responder(sql, params = []) {
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.includes('pg_advisory_xact_lock')) return [];
  if (sql.includes('MAX(dias_aviso_vencimiento)')) {
    const gym = /id_gimnasio = \$1/.test(sql) ? params[0] : null;
    return [{ max_dias: gym ? DIAS[gym] : Math.max(...Object.values(DIAS)) }];
  }
  if (sql.includes('FROM miembro m')) {
    const gym = /m\.id_gimnasio = \$2/.test(sql) ? params[1] : null;
    return [PROPIA, AJENO].filter((m) => gym === null || m.id_gimnasio === gym);
  }
  if (sql.includes('SELECT id_plan_cobro FROM plan_cobro')) return [{ id_plan_cobro: params[0] }];
  if (sql.includes('to_regclass')) return [{ existe: true }];
  if (/FROM (alerta_vencimiento_enviada|envio_mensaje)/.test(sql)) return [];
  if (sql.includes('INSERT INTO alerta_vencimiento_enviada')) return [];
  throw new Error(`SQL inesperado: ${sql.trim().slice(0, 80)}`);
}

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: p.role === 'admin' ? 'ADMINISTRADOR' : 'RECEPCIONISTA' }));
});
afterAll(() => {
  establecerBusquedaPersonal(null);
  legal.establecerReloj(null);
});
beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  // Martes 10:00 a. m. en Colombia: dentro del horario de la Ley 2300.
  legal.establecerReloj(() => new Date('2026-11-17T10:00:00-05:00'));
  mockQuery.mockReset().mockImplementation(async (sql, params) => ({ rows: responder(sql, params) }));
  mockEnviar.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { process.env = ENV_ORIGINAL; });

describe('GET /api/jobs/expiracion/preview', () => {
  test('should list only the members of the gym in the token, with the notice days of that gym', async () => {
    const r = await llamar('get', '/api/jobs/expiracion/preview');

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ dias: 5, total: 1, candidatos: [PROPIA] });
    expect(JSON.stringify(r.body)).not.toContain('Beto');
  });

  test('should list the members of the other gym when the admin of the other gym asks', async () => {
    const r = await llamar('get', '/api/jobs/expiracion/preview', { gymId: 8 });

    expect(r.body).toEqual({ dias: 20, total: 1, candidatos: [AJENO] });
  });
});

describe('POST /api/jobs/expiracion/run', () => {
  test('should send the notice only to the members of the gym in the token', async () => {
    const r = await llamar('post', '/api/jobs/expiracion/run').send({});

    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ encontrados: 1, enviados: 1 }));
    expect(parametros()).toEqual([5, 7]); // los dias de aviso y el id de su gimnasio
    expect(mockEnviar.mock.calls.map(([tel]) => tel)).toEqual(['573001112233']);
    expect(JSON.stringify(r.body)).not.toMatch(/Beto|3009998877/);
  });

  test('should count only the members of the gym in the token, without sending, when dryRun is sent', async () => {
    const r = await llamar('post', '/api/jobs/expiracion/run').send({ dryRun: true });

    expect(r.body).toEqual(expect.objectContaining({ dryRun: true, encontrados: 1, enviados: 1 }));
    expect(r.body.detalle.map((d) => d.id)).toEqual([70]);
    expect(mockEnviar).not.toHaveBeenCalled();
  });
});

describe('who can run the jobs', () => {
  const RUTAS = [
    ['get', '/api/jobs/expiracion/preview'],
    ['post', '/api/jobs/expiracion/run'],
    ['post', '/api/jobs/abandono/run'],
  ];

  // En los jobs, gymId vacio quiere decir "todos los gimnasios".
  test.each(RUTAS)('should answer 403 NO_GYM without running anything when the admin of %s %s has no gym', async (metodo, ruta) => {
    const r = await llamar(metodo, ruta, { gymId: null });

    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NO_GYM');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test.each(RUTAS)('should answer 403 FORBIDDEN without running anything when a receptionist calls %s %s', async (metodo, ruta) => {
    const r = await llamar(metodo, ruta, { role: 'receptionist' });

    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test.each(RUTAS)('should answer 401 when %s %s has no token', async (metodo, ruta) => {
    const r = await request(app)[metodo](ruta);

    expect(r.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the daily job (cron)', () => {
  test('should still go through every gym when no gym is given', async () => {
    const r = await runJob({ whatsappClient: { sendWhatsAppText: mockEnviar } });

    expect(r.encontrados).toBe(2);
    expect(parametros()).toEqual([20]); // sin filtro: con id_gimnasio = NULL no saldria nadie
    expect(mockEnviar.mock.calls.map(([tel]) => tel)).toEqual(['573001112233', '573009998877']);
    expect(await diasDeVentana()).toBe(20);
    expect((await miembrosPorVencer(20)).map((m) => m.id_gimnasio)).toEqual([7, 8]);
  });
});
