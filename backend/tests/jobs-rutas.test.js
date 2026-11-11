const express = require('express');
const request = require('supertest');

function createApp({ expiracion, abandono, configRows = [{ max_dias: 3 }], candidatos = [] } = {}) {
  const mocks = {
    runExpiracion: jest.fn(expiracion || (() => Promise.resolve({ enviados: 2 }))),
    miembrosPorVencer: jest.fn(() => (
      typeof candidatos === 'function' ? candidatos() : Promise.resolve(candidatos)
    )),
    runAbandono: jest.fn(abandono || (() => Promise.resolve({ alertas: 1 }))),
    query: jest.fn(() => Promise.resolve({ rows: configRows })),
  };
  jest.resetModules();
  jest.doMock('../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
      req.user = { gymId: 42 };
      next();
    },
    authorize: () => (req, res, next) => next(),
  }));
  jest.doMock('../src/jobs/expiracion', () => ({
    runJob: mocks.runExpiracion,
    miembrosPorVencer: mocks.miembrosPorVencer,
  }));
  jest.doMock('../src/jobs/abandono', () => ({ runJob: mocks.runAbandono }));
  jest.doMock('../src/db/db', () => ({ query: mocks.query }));

  const router = require('../src/routes/jobs');
  const app = express();
  app.use(express.json());
  app.use('/api/jobs', router);
  return { app, mocks };
}

afterEach(() => {
  jest.dontMock('../src/middleware/auth');
  jest.dontMock('../src/jobs/expiracion');
  jest.dontMock('../src/jobs/abandono');
  jest.dontMock('../src/db/db');
});

test('dispara vencimientos y abandonos con dryRun y limita preview a 30 días', async () => {
  const candidatos = [{ id_miembro: 5 }, { id_miembro: 8 }];
  const { app, mocks } = createApp({
    candidatos,
    configRows: [{ max_dias: '45' }],
  });

  await request(app).post('/api/jobs/expiracion/run').send({ dryRun: true })
    .expect(200, { enviados: 2 });
  expect(mocks.runExpiracion).toHaveBeenCalledWith({ dryRun: true });

  await request(app).post('/api/jobs/abandono/run').send({ dryRun: true })
    .expect(200, { alertas: 1 });
  expect(mocks.runAbandono).toHaveBeenCalledWith({ gymId: 42, dryRun: true });

  await request(app).get('/api/jobs/expiracion/preview')
    .expect(200, { dias: 30, total: 2, candidatos });
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.miembrosPorVencer).toHaveBeenCalledWith(30);
});

test('usa tres días ante configuración vacía y pasa dryRun false por defecto', async () => {
  const { app, mocks } = createApp({ configRows: [{ max_dias: null }] });

  await request(app).post('/api/jobs/expiracion/run').expect(200);
  expect(mocks.runExpiracion).toHaveBeenCalledWith({ dryRun: false });
  await request(app).post('/api/jobs/abandono/run').expect(200);
  expect(mocks.runAbandono).toHaveBeenCalledWith({ gymId: 42, dryRun: false });
  await request(app).get('/api/jobs/expiracion/preview')
    .expect(200, { dias: 3, total: 0, candidatos: [] });
  expect(mocks.miembrosPorVencer).toHaveBeenCalledWith(3);
});

test('propaga errores de jobs, configuración y consulta de candidatos como errores HTTP', async () => {
  const { app } = createApp({
    expiracion: () => Promise.reject(new Error('job de vencimiento falló')),
    abandono: () => Promise.reject(new Error('job de abandono falló')),
    configRows: [{ max_dias: 3 }],
    candidatos: () => Promise.reject(new Error('consulta falló')),
  });

  await request(app).post('/api/jobs/expiracion/run').expect(500);
  await request(app).post('/api/jobs/abandono/run').expect(500);
  await request(app).get('/api/jobs/expiracion/preview').expect(500);
});
