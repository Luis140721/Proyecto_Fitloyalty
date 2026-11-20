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

  test.each([
    {
      caso: 'an admin reactivates an inactive receptionist',
      preparar: () => { usuario(ANA).activo = false; },
      objetivo: ANA, cambios: { activo: true },
      detalle: { eventos: ['REACTIVADA'], antes: { activo: false }, despues: { activo: true } },
    },
    {
      caso: 'an admin changes the role of a receptionist',
      preparar: () => {},
      objetivo: ANA, cambios: { rol: 'ADMINISTRADOR' },
      detalle: { eventos: ['ROL_CAMBIADO'], antes: { rol: 'RECEPCIONISTA' }, despues: { rol: 'ADMINISTRADOR' } },
    },
    {
      // Una cuenta de entrenador (id_rol 3), que ROL_EXPR conoce pero ID_ROL no.
      caso: 'an admin changes the role of a trainer',
      preparar: () => { mockBd.usuarios.push({ id_usuario: 4, id_gimnasio: 7, nombre: 'Leo Entrenador', email: 'leo@gym.co', id_rol: 3, activo: true }); },
      objetivo: 4, cambios: { rol: 'RECEPCIONISTA' },
      detalle: { eventos: ['ROL_CAMBIADO'], antes: { rol: 'ENTRENADOR' }, despues: { rol: 'RECEPCIONISTA' } },
    },
    {
      caso: 'an admin renames a receptionist',
      preparar: () => {},
      objetivo: ANA, cambios: { nombre: '  Ana Maria  ' },
      detalle: { eventos: ['NOMBRE_CAMBIADO'], antes: { nombre: 'Ana Recepcion' }, despues: { nombre: 'Ana Maria' } },
    },
  ])('should record what changed, before and after, when $caso', async ({ preparar, objetivo, cambios, detalle }) => {
    // Arrange
    preparar();

    // Act
    const r = await editar(objetivo, cambios);

    // Assert
    expect(r.status).toBe(200);
    expect(mockBd.auditoria).toEqual([expect.objectContaining({ id_registro: objetivo, id_usuario: LUIS, detalle })]);
  });

  test.each([
    ['the request is rejected (an admin deactivates their own account)', () => {}, LUIS, { activo: false }, 403],
    ['nothing really changes (the account was already inactive)', () => { usuario(ANA).activo = false; }, ANA, { activo: false }, 200],
  ])('should not write any audit row when %s', async (_caso, preparar, objetivo, cambios, status) => {
    // Arrange
    preparar();

    // Act
    const r = await editar(objetivo, cambios);

    // Assert
    expect(r.status).toBe(status);
    expect(mockBd.auditoria).toEqual([]);
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

  test('should answer 404 STAFF_NOT_FOUND when the account belongs to another gym', async () => {
    // Arrange: una cuenta del gimnasio 9 con su propia fila de auditoria
    mockBd.usuarios.push({ id_usuario: 5, id_gimnasio: 9, nombre: 'Otro Gym', email: 'otro@gym.co', id_rol: 2, activo: false });
    mockBd.auditoria.push({ id_auditoria: 1, id_gimnasio: 9, tabla_afectada: 'usuario', id_registro: 5, accion: 'UPDATE', id_usuario: 6, detalle: { eventos: ['DESACTIVADA'] }, fecha_evento: T1 });

    // Act
    const r = await historial(5);

    // Assert
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('STAFF_NOT_FOUND');
  });

  test.each([
    ['a receptionist asks for it', () => jwt.sign({ id: ANA, role: 'receptionist', gymId: 7 }, SECRETO, { expiresIn: '1h' }), 403, 'FORBIDDEN'],
    ['the gym trial has ended', () => { mockBd.gimnasios[0].trial_ends_at = new Date(Date.now() - 1000); return tokenDe(LUIS); }, 402, 'TRIAL_EXPIRED'],
  ])('should not show the history when %s', async (_caso, prepararToken, status, code) => {
    // Arrange: Ana ya tiene una fila en su historial
    await editar(ANA, { activo: false });
    const token = prepararToken();

    // Act
    const r = await request(app).get(`/api/admin/staff/${ANA}/auditoria`).set('Authorization', `Bearer ${token}`);

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
    expect(r.body).not.toHaveProperty('auditoria');
  });

  test('should answer 503 DB_UNREACHABLE and log the error when the history query fails', async () => {
    // Arrange: la BD falla al leer la auditoria
    mockBd.fallaCon = /FROM auditoria a/;

    // Act
    const r = await historial(ANA);

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(console.error).toHaveBeenCalledWith('[GET /admin/staff/:id/auditoria] Error:', 'conexion perdida');
  });
});
