const express = require('express');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...args) => mockQuery(...args) }));
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { gymId: req.headers['x-gym-id'] ? Number(req.headers['x-gym-id']) : undefined };
    next();
  },
}));

const billingRouter = require('../src/routes/billing');
const { errorHandler } = require('../src/middleware/errorHandler');

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use('/api', billingRouter);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll(() => new Promise((resolve) => {
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(resolve);
}));

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const getStatus = (gymId) => fetch(`${baseUrl}/api/billing/trial-status`, {
  headers: gymId ? { 'x-gym-id': String(gymId) } : {},
});

describe('GET /api/billing/trial-status', () => {
  test('devuelve los datos del gimnasio y el estado del trial', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id_gimnasio: 7,
        nombre: 'Fit Gym',
        activo: true,
        trial_ends_at: new Date(Date.now() + 86400000),
      }],
    });

    const response = await getStatus(7);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.gym).toEqual({ id: 7, nombre: 'Fit Gym', active: true });
    expect(body.trial).toMatchObject({ active: true, reason: 'trial-activo' });
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [7]);
  });

  test('rechaza usuario sin gimnasio y no consulta la base', async () => {
    const response = await getStatus();

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('NO_GYM');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('responde 404 cuando el gimnasio no existe', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await getStatus(99);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('GYM_NOT_FOUND');
  });

  test('convierte fallos de base de datos en respuesta 503', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const response = await getStatus(7);

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('DB_UNREACHABLE');
    expect(console.error).toHaveBeenCalledWith(
      '[GET /billing/trial-status] Error:',
      'connection refused'
    );
  });
});
