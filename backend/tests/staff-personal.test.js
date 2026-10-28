/**
 * Bootcamp semana 5 (capa API, Luis): editar, desactivar y listar al personal
 * (RQF-01, routes/staff.js: PATCH /api/admin/staff/:id y GET /api/admin/staff).
 *
 * Reglas que se prueban:
 *  - Nadie se desactiva ni se quita el rol de administrador a si mismo.
 *  - La cuenta del dueño del gimnasio no se desactiva ni baja de rol.
 *  - Solo se edita a usuarios del mismo gimnasio; un cuerpo invalido no cambia nada.
 *  - La columna legacy `rol` de Neon se mantiene igual a id_rol cuando existe.
 *  - La lista se adapta a las columnas que tiene la BD (Render no tiene
 *    fecha_creacion) y responde 503 si la BD falla.
 *
 * Dobles de este archivo (el tipo de cada test va en un comentario):
 *  - BD: fake en memoria (tests/staff-bd-falsa.js). Los tests verifican el
 *    estado que queda en el fake: si el usuario cambio o no.
 *  - Lectura del personal en authenticate: stub con establecerBusquedaPersonal.
 *  - Correo: dummy. Estas rutas no envian correos; el modulo solo ocupa el lugar
 *    para que cargar staff.js no dependa de Brevo.
 *  - console.error y console.warn: spy, para verificar el registro sin ensuciar
 *    la salida.
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
// Luis (1) es el dueño del gimnasio 7; Marta (3) es otra admin; Ana (2), recepcionista.
const LUIS = 1, ANA = 2, MARTA = 3, DE_OTRO_GYM = 5;

const tokenDe = (id) => jwt.sign({ id, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const editar = (id, cambios, actor = LUIS) => request(app).patch(`/api/admin/staff/${id}`).set('Authorization', `Bearer ${tokenDe(actor)}`).send(cambios);
const listar = () => request(app).get('/api/admin/staff').set('Authorization', `Bearer ${tokenDe(LUIS)}`);
const usuario = (id) => mockBd.usuarios.find((u) => u.id_usuario === id);

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: p.role === 'admin' ? 'ADMINISTRADOR' : 'RECEPCIONISTA' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockBd = crearBdFalsa();
  usuario(LUIS).ultimo_acceso = new Date('2026-10-27T12:00:00Z');
  mockBd.usuarios.push(
    { id_usuario: ANA, id_gimnasio: 7, nombre: 'Ana Recepcion', email: 'ana@gym.co', id_rol: 2, activo: true, fecha_creacion: new Date('2026-03-01T00:00:00Z'), ultimo_acceso: null },
    { id_usuario: MARTA, id_gimnasio: 7, nombre: 'Marta Admin', email: 'marta@gym.co', id_rol: 1, activo: true, fecha_creacion: new Date('2026-02-01T00:00:00Z'), ultimo_acceso: null },
    { id_usuario: DE_OTRO_GYM, id_gimnasio: 9, nombre: 'Otro Gym', email: 'otro@gym.co', id_rol: 2, activo: true, fecha_creacion: new Date('2026-04-01T00:00:00Z') },
  );
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('PATCH /api/admin/staff/:id: rules that protect the gym', () => {
  test.each([
    ['the id is not a number', 'abc', { nombre: 'Ana Maria' }, 'Id invalido'],
    ['the id is zero', '0', { nombre: 'Ana Maria' }, 'Id invalido'],
    ['the body is empty', String(ANA), {}, 'Indica que quieres cambiar: nombre, rol o activo.'],
    // Con un campo editable al lado: sin .strict() el correo se ignoraria y el nombre si cambiaria.
    ['the body has a field that cannot be edited', String(ANA), { nombre: 'Ana Maria', email: 'otra@gym.co' }, expect.any(String)],
    ['the name is too short', String(ANA), { nombre: 'A' }, 'El nombre debe tener al menos 2 caracteres'],
  ])('should answer 400 and change nothing when %s', async (_caso, id, cambios, mensaje) => {
    // Doble: fake de la BD. Verifica estado: Ana queda igual que antes.
    // Arrange
    const antes = { ...usuario(ANA) };

    // Act
    const r = await editar(id, cambios);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'VALIDATION_ERROR', error: mensaje });
    expect(usuario(ANA)).toEqual(antes);
  });

  test('should answer 404 STAFF_NOT_FOUND and change nothing when the user belongs to another gym', async () => {
    // Doble: fake de la BD con un usuario del gimnasio 9. Verifica estado.
    // Arrange
    const antes = { ...usuario(DE_OTRO_GYM) };

    // Act
    const r = await editar(DE_OTRO_GYM, { activo: false });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('STAFF_NOT_FOUND');
    expect(usuario(DE_OTRO_GYM)).toEqual(antes);
  });

  test.each([
    ['an admin deactivates their own account', MARTA, MARTA, { activo: false }, 'SELF_LOCKOUT'],
    ['an admin removes their own admin role', MARTA, MARTA, { rol: 'RECEPCIONISTA' }, 'SELF_LOCKOUT'],
    ['another admin deactivates the owner', MARTA, LUIS, { activo: false }, 'OWNER_PROTECTED'],
    ['another admin removes the owner admin role', MARTA, LUIS, { rol: 'RECEPCIONISTA' }, 'OWNER_PROTECTED'],
  ])('should answer 403 and change nothing when %s', async (_caso, actor, objetivo, cambios, code) => {
    // Doble: fake de la BD (sabe quien es el dueño: gimnasio.id_dueno). Verifica
    // estado: la cuenta sigue activa y con su rol, asi el gimnasio no se queda
    // sin quien lo administre.
    // Arrange
    const antes = { ...usuario(objetivo) };

    // Act
    const r = await editar(objetivo, cambios, actor);

    // Assert
    expect(r.status).toBe(403);
    expect(r.body.code).toBe(code);
    expect(usuario(objetivo)).toEqual(antes);
  });
});

describe('PATCH /api/admin/staff/:id: allowed changes', () => {
  test('should let the owner demote another admin when that admin is not the owner', async () => {
    // Doble: fake de la BD. Verifica estado: Marta pasa a recepcionista.
    // Arrange: Luis es el dueño y Marta otra admin

    // Act
    const r = await editar(MARTA, { rol: 'RECEPCIONISTA' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ message: 'Usuario actualizado.', staff: { id_usuario: MARTA, rol: 'RECEPCIONISTA', es_dueno: false } });
    expect(usuario(MARTA).id_rol).toBe(2);
  });

  test('should let an admin rename their own account when nothing else changes', async () => {
    // Doble: fake de la BD. Verifica estado: el nombre se guarda recortado y la
    // cuenta sigue activa (cambiar el nombre propio no es bloquearse).
    // Arrange: Marta se edita a si misma

    // Act
    const r = await editar(MARTA, { nombre: '  Marta Gomez  ' }, MARTA);

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Usuario actualizado.');
    expect(usuario(MARTA)).toMatchObject({ nombre: 'Marta Gomez', activo: true, id_rol: 1 });
  });

  test('should deactivate a receptionist and say the account can no longer log in when activo is false', async () => {
    // Doble: fake de la BD. Verifica estado: Ana queda inactiva.
    // Arrange: Ana esta activa

    // Act
    const r = await editar(ANA, { activo: false });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Usuario desactivado. Ya no puede iniciar sesion.');
    expect(usuario(ANA).activo).toBe(false);
  });

  test('should reactivate the account when activo is true and the user was inactive', async () => {
    // Doble: fake de la BD con Ana desactivada. Verifica estado.
    // Arrange
    usuario(ANA).activo = false;

    // Act
    const r = await editar(ANA, { activo: true });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Usuario reactivado.');
    expect(usuario(ANA).activo).toBe(true);
  });

  test('should say updated, not reactivated, when activo is true and the user was already active', async () => {
    // Doble: fake de la BD con Ana activa. Verifica estado: el mensaje que ve el
    // admin no anuncia una reactivacion que no paso.
    // Arrange: Ana esta activa

    // Act
    const r = await editar(ANA, { activo: true });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Usuario actualizado.');
    expect(usuario(ANA).activo).toBe(true);
  });

  test.each([
    { caso: 'the schema has the legacy rol column (Neon)', columna: true, rolLegacy: 'ADMINISTRADOR' },
    { caso: 'the schema has no legacy rol column', columna: false, rolLegacy: undefined },
  ])('should promote the receptionist and leave the legacy rol as $rolLegacy when $caso', async ({ columna, rolLegacy }) => {
    // Doble: fake de la BD con el esquema de cada entorno. Verifica estado: en
    // Neon la columna `rol` (NOT NULL con CHECK) queda igual a id_rol; sin ella
    // no se escribe una columna que no existe.
    // Arrange
    mockBd.esquema.has_rol_column = columna;

    // Act
    const r = await editar(ANA, { rol: 'ADMINISTRADOR' });

    // Assert
    expect(r.status).toBe(200);
    expect(usuario(ANA).id_rol).toBe(1);
    expect(usuario(ANA).rol).toBe(rolLegacy);
  });

  test.each([
    ['reading the user fails', /SELECT id_usuario, id_rol, activo/, '[PATCH /admin/staff/:id] Error consultando usuario:'],
    ['saving the change fails', /UPDATE usuario SET/, '[PATCH /admin/staff/:id] Error actualizando usuario:'],
  ])('should answer 503 and change nothing when %s', async (_caso, consulta, registro) => {
    // Dobles: fake de la BD que falla en esa consulta y spy en console.error.
    // Verifica estado (Ana sin cambios) y comportamiento (el error quedo registrado).
    // Arrange
    mockBd.fallaCon = consulta;
    const antes = { ...usuario(ANA) };

    // Act
    const r = await editar(ANA, { activo: false });

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(usuario(ANA)).toEqual(antes);
    expect(console.error).toHaveBeenCalledWith(registro, undefined, 'conexion perdida');
  });
});

describe('GET /api/admin/staff: the staff list', () => {
  test('should list only the gym staff, newest first, with role, owner mark and optional columns when the schema has them', async () => {
    // Doble: fake de la BD con fecha_creacion y ultimo_acceso. Verifica estado:
    // la lista que recibe el admin.
    // Arrange
    mockBd.esquema.has_ultimo_acceso = true;

    // Act
    const r = await listar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.staff.map((s) => [s.id_usuario, s.rol, s.es_dueno])).toEqual([
      [ANA, 'RECEPCIONISTA', false],
      [MARTA, 'ADMINISTRADOR', false],
      [LUIS, 'ADMINISTRADOR', true],
    ]);
    expect(r.body.staff[2]).toMatchObject({ fecha_creacion: '2026-01-01T00:00:00.000Z', ultimo_acceso: '2026-10-27T12:00:00.000Z' });
  });

  test.each([
    ['the schema has no optional columns (like Render)', (bd) => { bd.esquema.has_fecha_creacion = false; }],
    ['the schema check fails', (bd) => { bd.fallaCon = /information_schema/; }],
  ])('should list the staff by id without the optional columns when %s', async (_caso, prepararBd) => {
    // Doble: fake de la BD sin esas columnas, o que falla al revisar el esquema
    // (entonces la ruta usa el esquema minimo). Verifica estado: la lista no pide
    // columnas que podrian no existir y sale ordenada por id.
    // Arrange
    prepararBd(mockBd);

    // Act
    const r = await listar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.staff.map((s) => s.id_usuario)).toEqual([MARTA, ANA, LUIS]);
    expect(r.body.staff[0]).not.toHaveProperty('fecha_creacion');
    expect(r.body.staff[0]).not.toHaveProperty('ultimo_acceso');
  });

  test('should answer 503 and log the error when the list query fails', async () => {
    // Dobles: fake de la BD que falla en la consulta de la lista y spy en
    // console.error. Verifica comportamiento: el registro dice que el SQL no se ve.
    // Arrange
    mockBd.fallaCon = /FROM usuario WHERE id_gimnasio = \$1 ORDER BY/;

    // Act
    const r = await listar();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(console.error).toHaveBeenCalledWith('[GET /admin/staff] code:', undefined, 'msg:', 'conexion perdida', 'sql:', '(invisible)');
  });
});
