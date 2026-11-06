const express = require('express');

const mockQuery = jest.fn();
const mockRunJob = jest.fn();
const mockMiembrosPorVencer = jest.fn();

jest.mock('../src/db/db', () => ({ query: (...args) => mockQuery(...args) }));
jest.mock('../src/jobs/expiracion', () => ({
  runJob: (...args) => mockRunJob(...args),
  miembrosPorVencer: (...args) => mockMiembrosPorVencer(...args),
}));
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { role: req.headers['x-role'] || 'admin' };
    next();
  },
  authorize: () => (req, res, next) => next(),
}));

const jobsRouter = require('../src/routes/jobs');
const { errorHandler } = require('../src/middleware/errorHandler');

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/jobs', jobsRouter);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}/api/jobs`;
    done();
  });
});

afterAll(() => new Promise((resolve) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(resolve);
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockRunJob.mockReset();
  mockMiembrosPorVencer.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('/api/jobs/expiracion', () => {
  test.each([
    [undefined, false],
    [true, true],
    ['true', true],
    [false, false],
  ])('POST /run pasa dryRun=%s al job', async (dryRun, expectedDryRun) => {
    const summary = { encontrados: 2, enviados: 1, dryRun: expectedDryRun };
    mockRunJob.mockResolvedValueOnce(summary);

    const response = await fetch(`${baseUrl}/expiracion/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dryRun === undefined ? {} : { dryRun }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(mockRunJob).toHaveBeenCalledWith({ dryRun: expectedDryRun });
  });

  test('GET /preview limita la ventana a treinta días', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ max_dias: 90 }] });
    const candidates = [{ id_miembro: 7 }, { id_miembro: 8 }];
    mockMiembrosPorVencer.mockResolvedValueOnce(candidates);

    const response = await fetch(`${baseUrl}/expiracion/preview`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dias: 30, total: 2, candidatos: candidates });
    expect(mockMiembrosPorVencer).toHaveBeenCalledWith(30);
  });

  test('GET /preview usa tres días si la configuración es nula', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ max_dias: null }] });
    mockMiembrosPorVencer.mockResolvedValueOnce([]);

    const response = await fetch(`${baseUrl}/expiracion/preview`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dias: 3, total: 0, candidatos: [] });
    expect(mockMiembrosPorVencer).toHaveBeenCalledWith(3);
  });

  test('GET /preview conserva cero días cuando se desactivaron los avisos', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ max_dias: 0 }] });
    mockMiembrosPorVencer.mockResolvedValueOnce([]);

    const response = await fetch(`${baseUrl}/expiracion/preview`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dias: 0, total: 0, candidatos: [] });
    expect(mockMiembrosPorVencer).toHaveBeenCalledWith(0);
  });

  test('propaga errores del job mediante el manejador central', async () => {
    mockRunJob.mockRejectedValueOnce(new Error('job failed'));

    const response = await fetch(`${baseUrl}/expiracion/run`, { method: 'POST' });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ error: 'job failed', code: 'INTERNAL_ERROR' });
  });
});
