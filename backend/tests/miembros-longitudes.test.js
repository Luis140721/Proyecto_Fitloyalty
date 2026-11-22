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
 * el limite exacto pasa la validacion y uno mas responde 400 VALIDATION_ERROR,
 * con el mensaje en español y sin llegar a la BD. El test de integracion queda
 * como red.
 *
 * Los largos se cuentan en caracteres, como PostgreSQL, y no en unidades
 * UTF-16 como .max() de zod: un nombre con un emoji que cabe en la columna
 * tambien pasa.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
// Desde el #102 el alta corre en una transaccion (pool.connect, BEGIN, el
// INSERT del miembro y sus autorizaciones, COMMIT): el cliente falso pasa sus
// consultas al mismo mockQuery, asi que las aserciones ven el INSERT igual.
jest.mock('../src/db/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: async () => ({ query: (...args) => mockQuery(...args), release: () => {} }),
}));
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
const actualizoMiembro = () => mockQuery.mock.calls.some(([sql]) => /UPDATE miembro/i.test(sql));

// [campo, largo de la columna, como empieza el mensaje]. Los topes del alta de
// contacto y telefono de emergencia, objetivo, nivel de experiencia y
// referencia_pago los agrega el #96 (miembros-alta-topes.test.js), no este PR.
const LARGOS_ALTA = [
  ['nombre', 100, 'El nombre'],
  ['documento', 20, 'El documento'],
  ['telefono', 20, 'El teléfono'],
];

describe('POST /api/admin/miembros: largos de las columnas de miembro', () => {
  it.each(LARGOS_ALTA)('should create the member when %s has exactly %i characters', async (campo, largo) => {
    // Arrange: pool falso (FAKE) del beforeEach; un valor en el limite exacto.
    const body = miembroValido({ [campo]: '1'.repeat(largo) });

    // Act
    const res = await crear(body);

    // Assert: estado (201) y comportamiento (el INSERT si se intento).
    expect(res.status).toBe(201);
    expect(insertoMiembro()).toBe(true);
  });

  it.each(LARGOS_ALTA)(
    'should answer 400 with a Spanish message and not touch the DB when %s has %i + 1 characters',
    async (campo, largo, inicio) => {
      // Arrange: pool falso (FAKE) del beforeEach; un caracter mas que la columna.
      const body = miembroValido({ [campo]: '1'.repeat(largo + 1) });

      // Act
      const res = await crear(body);
      const json = await res.json();

      // Assert: estado (400 con el mensaje en español) y comportamiento (el
      // INSERT que antes reventaba con 22001 ya ni se intenta).
      expect(res.status).toBe(400);
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(json.error).toBe(`${inicio} admite máximo ${largo} caracteres`);
      expect(insertoMiembro()).toBe(false);
    },
  );

  it('should answer 400 with a Spanish message when the email is longer than 150 characters', async () => {
    // Arrange: pool falso (FAKE) del beforeEach; un correo valido de 151 caracteres.
    const email = `${'a'.repeat(140)}@correo.com`;

    // Act
    const res = await crear(miembroValido({ email }));
    const json = await res.json();

    // Assert: estado y comportamiento. Antes decia «String must contain at most
    // 150 character(s)».
    expect(res.status).toBe(400);
    expect(json.error).toBe('El correo admite máximo 150 caracteres');
    expect(insertoMiembro()).toBe(false);
  });

  it('should create the member when the name has emojis and fits the column in characters', async () => {
    // Arrange: pool falso (FAKE) del beforeEach. 99 letras y un emoji son 100
    // caracteres para PostgreSQL, pero 101 unidades UTF-16 para .max() de zod.
    const nombre = `${'a'.repeat(99)}💪`;

    // Act
    const res = await crear(miembroValido({ nombre }));

    // Assert: estado (201) y comportamiento (el INSERT si se intento).
    expect(res.status).toBe(201);
    expect(insertoMiembro()).toBe(true);
  });
});

describe('PUT /api/admin/miembros/:id: los mismos largos al editar', () => {
  it.each([
    ['nombre', 100, 'El nombre'],
    ['documento', 20, 'El documento'],
    ['telefono', 20, 'El teléfono'],
    ['contacto_emergencia', 100, 'El contacto de emergencia'],
    ['objetivo', 50, 'El objetivo'],
  ])('should answer 400 with a Spanish message and no UPDATE when %s has %i + 1 characters', async (campo, largo, inicio) => {
    // Arrange: pool falso (FAKE) del beforeEach; un caracter mas que la columna.
    const body = { [campo]: '1'.repeat(largo + 1) };

    // Act
    const res = await editar(body);
    const json = await res.json();

    // Assert: estado (400 en español) y comportamiento (sin UPDATE).
    expect(res.status).toBe(400);
    expect(json.error).toBe(`${inicio} admite máximo ${largo} caracteres`);
    expect(actualizoMiembro()).toBe(false);
  });

  it('should answer 400 with a Spanish message when the edited email is longer than 150 characters', async () => {
    // Arrange: pool falso (FAKE) del beforeEach; un correo valido de 151 caracteres.
    const email = `${'a'.repeat(140)}@correo.com`;

    // Act
    const res = await editar({ email });
    const json = await res.json();

    // Assert: estado y comportamiento.
    expect(res.status).toBe(400);
    expect(json.error).toBe('El correo admite máximo 150 caracteres');
    expect(actualizoMiembro()).toBe(false);
  });
});
