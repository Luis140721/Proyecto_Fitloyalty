const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...args) => mockQuery(...args) }));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const miembrosRouter = require('../src/routes/miembros');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const token = jwt.sign({ id: 1, role: 'admin', gymId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });

let server;
let base;

beforeAll((done) => {
  establecerBusquedaPersonal(() => ({ activo: true, id_gimnasio: 7, rol_nombre: 'ADMINISTRADOR' }));
  const app = express();
  app.use(express.json());
  app.use('/api', miembrosRouter);
  app.use(errorHandler);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll(() => new Promise((resolve) => {
  establecerBusquedaPersonal(null);
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql) => {
    if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/i.test(sql)) {
      return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
    }
    if (/UPDATE miembro SET/i.test(sql)) {
      return {
        rows: [{
          id_miembro: 4,
          nombre: 'Daniel Editado',
          documento: '123456789',
          telefono: '3000000001',
          email: null,
          codigo_qr: 'QR',
          qr_imagen: null,
          activo: true,
          fecha_registro: new Date(),
          app_acceso: true,
          password_asignada: false,
        }],
      };
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test('PUT /admin/miembros/:id convierte una fecha vacía a NULL antes de actualizar', async () => {
  const response = await fetch(`${base}/api/admin/miembros/4`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      nombre: 'Daniel Editado',
      fecha_nacimiento: '',
    }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    message: 'Miembro actualizado.',
    miembro: { id_miembro: 4, nombre: 'Daniel Editado' },
  });

  const [sql, params] = mockQuery.mock.calls.find(([query]) => /UPDATE miembro SET/i.test(query));
  const dateParameter = Number(sql.match(/fecha_nacimiento = \$(\d+)/)[1]) - 1;
  expect(params[dateParameter]).toBeNull();
});
