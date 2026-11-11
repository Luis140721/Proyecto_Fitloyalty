const express = require('express');
const request = require('supertest');

const USER = { id: 7, gymId: 42, role: 'admin' };

function createApp(queryImpl) {
  const pool = { query: jest.fn((sql, params) => queryImpl(sql, params)) };
  jest.resetModules();
  jest.doMock('../src/db/db', () => pool);
  jest.doMock('../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
      req.user = USER;
      next();
    },
    authorize: (...roles) => (req, res, next) => (
      roles.includes(USER.role) ? next() : res.status(403).json({ error: 'Forbidden' })
    ),
  }));
  jest.doMock('../src/lib/trial', () => ({
    requireActiveTrial: () => (req, res, next) => next(),
  }));

  const router = require('../src/routes/dashboard');
  const { errorHandler } = require('../src/middleware/errorHandler');
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  return { app, pool };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.dontMock('../src/db/db');
  jest.dontMock('../src/middleware/auth');
  jest.dontMock('../src/lib/trial');
});

test('arma las métricas y completa los días sin actividad semanal', async () => {
  const { app, pool } = createApp(async (sql) => {
    if (sql.includes('COUNT(DISTINCT m.id_miembro)')) return { rows: [{ activos: 6 }] };
    if (sql.includes('SELECT EXTRACT(DOW')) return { rows: [{ dow: '1', count: 4 }, { dow: '6', count: 2 }] };
    if (sql.includes('AS nombre') && sql.includes('dias_sin')) {
      return { rows: [{ nombre: 'Ana', dias_sin: 18, monto: 90000 }] };
    }
    if (sql.includes('AS miembro')) return { rows: [{ id_miembro: 1, miembro: 'Bruno' }] };
    if (sql.includes('c.id_checkin')) return { rows: [{ id_checkin: 8, nombre: 'Carla' }] };
    if (sql.includes('SUM(pc.valor_pagado)')) return { rows: [{ total: 250000 }] };
    if (sql.includes("estado_pago IN ('PENDIENTE', 'PARCIAL')")) return { rows: [{ total: 3 }] };
    if (sql.includes('GROUP BY pc.tipo_plan')) return { rows: [{ plan: 'Mensual', cnt: 7 }] };
    if (sql.includes('fecha_fin BETWEEN CURRENT_DATE')) return { rows: [{ total: 2 }] };
    if (sql.includes('LATERAL')) return { rows: [{ total: 1 }] };
    if (sql.includes('valido = TRUE')) return { rows: [{ total: 5 }] };
    if (sql.includes('COUNT(*)::int AS total FROM miembro')) return { rows: [{ total: 10 }] };
    throw new Error(`Consulta no esperada: ${sql}`);
  });

  const response = await request(app).get('/admin/dashboard').expect(200);

  expect(response.body).toMatchObject({
    totalMiembros: 10,
    checkinsHoy: 5,
    vencen7: 2,
    retention: 60,
    enRiesgo: 1,
    enRiesgoList: [{ nombre: 'Ana', dias_sin: 18, monto: 90000 }],
    ingresosMes: 250000,
    cobrosPendientes: 3,
    planTop: 'Mensual',
    planTopCount: 7,
    qrsActivos: 10,
  });
  expect(response.body.weekly).toEqual([
    { day: 'Dom', count: 0 },
    { day: 'Lun', count: 4 },
    { day: 'Mar', count: 0 },
    { day: 'Mie', count: 0 },
    { day: 'Jue', count: 0 },
    { day: 'Vie', count: 0 },
    { day: 'Sab', count: 2 },
  ]);
  expect(pool.query).toHaveBeenCalledTimes(12);
  expect(pool.query.mock.calls.every(([, params]) => params[0] === USER.gymId)).toBe(true);
});

test('usa Mensual cuando no hay un plan más vendido y permite retención cero', async () => {
  const { app } = createApp(async (sql) => {
    if (sql.includes('SELECT EXTRACT(DOW')) return { rows: [{ dow: 'x', count: 1 }] };
    if (sql.includes('GROUP BY pc.tipo_plan')) return { rows: [] };
    if (sql.includes('AS nombre') && sql.includes('dias_sin')) return { rows: [] };
    if (sql.includes('AS miembro') || sql.includes('c.id_checkin')) return { rows: [] };
    if (sql.includes('COUNT(DISTINCT m.id_miembro)')) return { rows: [{ activos: 0 }] };
    return { rows: [{ total: 0 }] };
  });

  const response = await request(app).get('/admin/dashboard').expect(200);

  expect(response.body.retention).toBe(0);
  expect(response.body.planTop).toBe('Mensual');
  expect(response.body.planTopCount).toBe(0);
});

test.each([
  ['hoy', 'Hoy'],
  ['semana', 'Últimos 7 días'],
  ['mes', 'Últimos 30 días'],
  ['desconocido', 'Últimos 30 días'],
])('agrupa las horas pico para el período %s y usa la primera hora en empate', async (periodo, etiqueta) => {
  const { app, pool } = createApp(async () => ({
    rows: [{ hora: 8, total: 3 }, { hora: 10, total: 3 }],
  }));

  const response = await request(app).get(`/admin/dashboard/horas-pico?periodo=${periodo}`).expect(200);

  expect(response.body).toMatchObject({
    periodo: ['hoy', 'semana', 'mes'].includes(periodo) ? periodo : 'mes',
    etiqueta,
    zona: 'America/Bogota',
    total: 6,
    horaPico: { hora: 8, total: 3 },
  });
  expect(response.body.horas).toHaveLength(24);
  expect(response.body.horas[9]).toEqual({ hora: 9, total: 0 });
  expect(pool.query.mock.calls[0][1]).toEqual([USER.gymId]);
});

test('responde sin hora pico cuando no hay registros', async () => {
  const { app } = createApp(async () => ({ rows: [] }));

  const response = await request(app).get('/admin/dashboard/horas-pico?periodo=hoy').expect(200);

  expect(response.body.total).toBe(0);
  expect(response.body.horaPico).toBeNull();
  expect(response.body.horas.every(({ total }) => total === 0)).toBe(true);
});

test('exporta el CSV con BOM, encabezados, escapes RFC 4180 y descarga sin caché', async () => {
  const { app } = createApp(async () => ({
    rows: [{
      nombre: 'Ana, "La fuerte"',
      documento: 'CC123',
      telefono: '',
      email: 'ana@example.com',
      plan: 'Mensual',
      fecha_fin: '2026-12-01',
      dias_restantes: 20,
    }],
  }));

  const response = await request(app).get('/admin/dashboard/export').expect(200);

  expect(response.headers['content-type']).toMatch(/text\/csv; charset=utf-8/);
  expect(response.headers['content-disposition']).toMatch(/attachment; filename="fitloyalty-export-\d{4}-\d{2}-\d{2}\.csv"/);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.text).toContain('\uFEFFnombre,documento,telefono,email,plan,fecha_fin,dias_restantes\r\n');
  expect(response.text).toContain('"Ana, ""La fuerte""",CC123,,ana@example.com,Mensual,2026-12-01,20\r\n');
});

test('diagnostics reporta columnas y conserva el error interno del replay como dato diagnóstico', async () => {
  const { app } = createApp(async (sql) => {
    if (sql.includes('information_schema.columns') && sql.includes("'gimnasio'")) {
      return { rows: [{ column_name: 'id_gimnasio', data_type: 'integer' }] };
    }
    if (sql.includes('to_regclass')) {
      return { rows: [{ rol_reg: 'rol', roles_reg: null }] };
    }
    if (sql.includes('information_schema.columns') && sql.includes("'usuario'")) {
      return { rows: [{ column_name: 'email' }] };
    }
    if (sql.includes('CASE usuario.id_rol')) {
      throw Object.assign(new Error('missing column'), { code: '42703' });
    }
    throw new Error(`Consulta no esperada: ${sql}`);
  });

  const response = await request(app).get('/admin/diagnostics').expect(200);

  expect(response.body.checks).toMatchObject({
    gimnasioColumnNames: ['id_gimnasio'],
    rolReg: 'rol',
    rolesReg: null,
    usuarioColumns: ['email'],
    replay: { ok: false, errCode: '42703', errMessage: 'missing column' },
  });
});

test.each([
  ['/admin/dashboard', 'SELECT COUNT(*)::int AS total FROM miembro'],
  ['/admin/dashboard/horas-pico', 'EXTRACT(HOUR'],
  ['/admin/dashboard/export', 'SELECT mb.nombre'],
])('%s convierte los errores de base de datos al contrato 503', async (path, expectedQuery) => {
  const { app } = createApp(async () => {
    throw new Error('database offline');
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(app).get(path).expect(503);

  expect(response.body).toMatchObject({
    code: 'DB_UNREACHABLE',
    error: expect.any(String),
  });
  expect(response.text).not.toContain(expectedQuery);
});

test('diagnostics convierte errores de introspección al contrato 500', async () => {
  const { app } = createApp(async () => {
    throw new Error('database offline');
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(app).get('/admin/diagnostics').expect(500);

  expect(response.body).toMatchObject({ code: 'DIAG_FAILED', error: 'Error al generar diagnostics.' });
});
