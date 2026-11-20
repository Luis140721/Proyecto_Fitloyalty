/**
 * Bootcamp semana 10 (TDD, Luis): la auditoria de los cambios a las cuentas
 * del personal (HU-04, criterio 4), vista desde el endpoint.
 * Criterios y lista de pruebas: docs/evidencias/s10-tdd-auditoria-personal.md.
 *
 * Dobles: la BD es el fake de tests/staff-bd-falsa.js (los tests miran las
 * filas que quedan en `auditoria`); la lectura del personal en authenticate es
 * un stub; el correo es un dummy, porque estas rutas no envian correos.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: (...a) => mockBd.connect(...a),
}));
jest.mock('../src/lib/email', () => ({ sendStaffInvite: () => { throw new Error('estas rutas no envian correo'); } }));

const staffRouter = require('../src/routes/staff');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');
const { crearBdFalsa } = require('./staff-bd-falsa');

const app = express();
app.use(express.json());
app.use('/api', staffRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
// Luis (1) es el dueño del gimnasio 7; Ana (2) es recepcionista.
const LUIS = 1, ANA = 2;

const tokenDe = (id) => jwt.sign({ id, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const editar = (id, cambios, actor = LUIS) => request(app).patch(`/api/admin/staff/${id}`).set('Authorization', `Bearer ${tokenDe(actor)}`).send(cambios);
const usuario = (id) => mockBd.usuarios.find((u) => u.id_usuario === id);

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: p.role === 'admin' ? 'ADMINISTRADOR' : 'RECEPCIONISTA' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockBd = crearBdFalsa();
  mockBd.usuarios.push({ id_usuario: ANA, id_gimnasio: 7, nombre: 'Ana Recepcion', email: 'ana@gym.co', id_rol: 2, activo: true, fecha_creacion: new Date('2026-03-01T00:00:00Z') });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('PATCH /api/admin/staff/:id: the audit trail', () => {
  test('should record who deactivated the account when an admin deactivates a receptionist', async () => {
    // Arrange: Ana esta activa

    // Act
    const r = await editar(ANA, { activo: false });

    // Assert
    expect(r.status).toBe(200);
    expect(mockBd.auditoria).toEqual([expect.objectContaining({
      id_gimnasio: 7,
      tabla_afectada: 'usuario',
      id_registro: ANA,
      accion: 'UPDATE',
      id_usuario: LUIS,
      detalle: { eventos: ['DESACTIVADA'], antes: { activo: true }, despues: { activo: false } },
    })]);
    expect(usuario(ANA).activo).toBe(false);
  });

  test('should record who reactivated the account when an admin reactivates an inactive receptionist', async () => {
    // Arrange
    usuario(ANA).activo = false;

    // Act
    const r = await editar(ANA, { activo: true });

    // Assert
    expect(r.status).toBe(200);
    expect(mockBd.auditoria).toEqual([expect.objectContaining({
      id_registro: ANA,
      id_usuario: LUIS,
      detalle: { eventos: ['REACTIVADA'], antes: { activo: false }, despues: { activo: true } },
    })]);
  });

  test('should record the old and the new role when an admin changes the role of a receptionist', async () => {
    // Arrange: Ana es recepcionista

    // Act
    const r = await editar(ANA, { rol: 'ADMINISTRADOR' });

    // Assert
    expect(r.status).toBe(200);
    expect(mockBd.auditoria).toEqual([expect.objectContaining({
      id_registro: ANA,
      id_usuario: LUIS,
      detalle: { eventos: ['ROL_CAMBIADO'], antes: { rol: 'RECEPCIONISTA' }, despues: { rol: 'ADMINISTRADOR' } },
    })]);
  });

  test('should record the old and the new name when an admin renames a receptionist', async () => {
    // Arrange: Ana se llama «Ana Recepcion»

    // Act
    const r = await editar(ANA, { nombre: '  Ana Maria  ' });

    // Assert
    expect(r.status).toBe(200);
    expect(mockBd.auditoria).toEqual([expect.objectContaining({
      id_registro: ANA,
      detalle: { eventos: ['NOMBRE_CAMBIADO'], antes: { nombre: 'Ana Recepcion' }, despues: { nombre: 'Ana Maria' } },
    })]);
  });

  test('should answer 503 and keep the account as it was when the audit row cannot be saved', async () => {
    // Arrange: la BD falla justo al guardar la auditoria
    mockBd.fallaCon = /INSERT INTO auditoria/;

    // Act
    const r = await editar(ANA, { activo: false });

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(usuario(ANA).activo).toBe(true);
    expect(mockBd.auditoria).toEqual([]);
  });
});

describe('GET /api/admin/staff/:id/auditoria: the history of an account', () => {
  const T1 = new Date('2026-11-19T14:00:00.000Z');
  const T2 = new Date('2026-11-19T14:05:00.000Z');
  const historial = (id) => request(app).get(`/api/admin/staff/${id}/auditoria`).set('Authorization', `Bearer ${tokenDe(LUIS)}`);

  beforeEach(() => {
    // Solo se finge la fecha: los timers reales siguen para que supertest funcione.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'] });
  });
  afterEach(() => jest.useRealTimers());

  test('should list the history of the account, newest first, with who made each change', async () => {
    // Arrange: Luis desactiva a Ana y la reactiva cinco minutos despues
    jest.setSystemTime(T1);
    await editar(ANA, { activo: false });
    jest.setSystemTime(T2);
    await editar(ANA, { activo: true });

    // Act
    const r = await historial(ANA);

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.auditoria).toEqual([
      { fecha: T2.toISOString(), responsable: 'Luis Admin', eventos: ['REACTIVADA'], antes: { activo: false }, despues: { activo: true } },
      { fecha: T1.toISOString(), responsable: 'Luis Admin', eventos: ['DESACTIVADA'], antes: { activo: true }, despues: { activo: false } },
    ]);
  });
});
