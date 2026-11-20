/**
 * Semana 6, capa BD, Santiago: hallazgo de la integracion.
 *
 * Contra la BD real, POST /api/admin/miembros con un nombre de 101 caracteres o
 * un documento de 21 respondia 500 DB_UNREACHABLE: el esquema de zod no tenia
 * maximo y la BD rechazaba el INSERT (22001, VARCHAR(100) y VARCHAR(20)). Lo
 * dejo anotado tests/integracion/restricciones-miembro.test.js.
 *
 * La regla ahora vive en el servicio (createSchema y updateSchema de
 * routes/miembros.js) y aqui se prueba en su valor limite con un pool falso:
 * el limite exacto pasa la validacion y uno mas responde 400 VALIDATION_ERROR
 * sin llegar a la BD. El test de integracion queda como red.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...args) => mockQuery(...args) }));
// Los envios no son parte de esta regla: dummies que no hacen nada.
jest.mock('../src/lib/email', () => ({ sendMemberQR: jest.fn() }));
jest.mock('../src/lib/whatsapp', () => ({ sendWhatsAppQR: jest.fn() }));

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

/** Pool falso (fake) que responde lo minimo para que el alta termine. */
beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql) => {
    if (/FROM gimnasio WHERE id_gimnasio/i.test(sql) && /trial_ends_at/i.test(sql)) {
      return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
    }
    if (/INSERT INTO miembro/i.test(sql)) return { rows: [{ id_miembro: 41, nombre: 'ok' }] };
    if (/SELECT nombre FROM gimnasio/i.test(sql)) return { rows: [{ nombre: 'Gym' }] };
    return { rows: [] }; // duplicados, codigo QR libre, INSERT de plan_cobro
  });
});

const miembroValido = (campos = {}) => ({
  nombre: 'Ana Ruiz',
  documento: '10203040',
  telefono: '3001234567',
  ...campos,
});

function crear(body) {
  return fetch(`${base}/api/admin/miembros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function editar(body) {
  return fetch(`${base}/api/admin/miembros/41`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const insertoMiembro = () => mockQuery.mock.calls.some(([sql]) => /INSERT INTO miembro/i.test(sql));

describe('POST /api/admin/miembros: largos de las columnas de miembro', () => {
  it.each([
    ['nombre', 100],
    ['documento', 20],
    ['telefono', 20],
  ])('should accept %s with exactly %i characters', async (campo, largo) => {
    const res = await crear(miembroValido({ [campo]: '1'.repeat(largo) }));

    expect(res.status).toBe(201);
    expect(insertoMiembro()).toBe(true);
  });

  it.each([
    ['nombre', 101],
    ['documento', 21],
    ['telefono', 21],
  ])('should answer 400 and not touch the DB when %s has %i characters', async (campo, largo) => {
    const res = await crear(miembroValido({ [campo]: '1'.repeat(largo) }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    // Comportamiento: el INSERT que antes reventaba con 22001 ya ni se intenta.
    expect(insertoMiembro()).toBe(false);
  });

  it('should answer 400 when the email is longer than 150 characters', async () => {
    const email = `${'a'.repeat(140)}@correo.com`; // 151
    const res = await crear(miembroValido({ email }));

    expect(res.status).toBe(400);
    expect(insertoMiembro()).toBe(false);
  });
});

describe('PUT /api/admin/miembros/:id: los mismos largos al editar', () => {
  it.each([
    ['nombre', 101],
    ['documento', 21],
    ['telefono', 21],
  ])('should answer 400 without an UPDATE when %s has %i characters', async (campo, largo) => {
    const res = await editar({ [campo]: '1'.repeat(largo) });

    expect(res.status).toBe(400);
    expect(mockQuery.mock.calls.some(([sql]) => /UPDATE miembro/i.test(sql))).toBe(false);
  });
});
