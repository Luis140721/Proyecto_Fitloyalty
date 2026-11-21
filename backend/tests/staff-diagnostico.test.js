/**
 * Cobertura de routes/staff.js (capa API, Luis): el diagnostico y los
 * caminos de error que ningun otro test recorria.
 *
 * Que se prueba:
 *  - GET /api/admin/diagnostics tal como lo define staff.js. Es la version que
 *    contesta en la app real: src/index.js monta este router (linea 107) antes
 *    que el de dashboard.js (linea 111), que tiene la misma ruta. Se prueba que
 *    reporta cada chequeo (tablas de roles, columnas opcionales de usuario,
 *    lista de columnas), que repite la consulta de la lista del personal con
 *    las columnas que existen y el gimnasio del token, y que una consulta que
 *    falla queda reportada en el cuerpo en vez de tumbar la respuesta.
 *  - Solo el admin entra al diagnostico.
 *  - El 503 de listar invitaciones, revocar una y ver una invitacion publica.
 *  - El 404 cuando el usuario desaparece entre la lectura y el UPDATE del PATCH.
 *  - El nombre del gimnasio en el correo de invitacion, con su valor por defecto.
 *
 * Dobles de este archivo:
 *  - BD: stub por patron del SQL (crearStub), propio de este archivo; no usa
 *    tests/staff-bd-falsa.js. Un SQL que el test no esperaba lanza error y
 *    ademas hace fallar el test en el afterEach, aunque la ruta lo atrape. La
 *    fila del gimnasio decide la prueba gratuita en el requireActiveTrial real.
 *  - Lectura del personal en authenticate: stub con establecerBusquedaPersonal
 *    (el rol y el gimnasio salen del token). authenticate, authorize,
 *    requireActiveTrial y errorHandler son los reales.
 *  - sendStaffInvite (lib/email.js, nuestra interfaz sobre Brevo): spy con
 *    respuesta fija; no se reemplaza la libreria.
 *  - console.error: spy, para verificar el registro sin ensuciar la salida.
 * Sin red, sin BD real y sin abrir puertos (supertest). Ninguna asercion
 * depende de la fecha: la prueba gratuita del gimnasio no vence (suscrito).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: (...a) => mockBd.connect(...a),
}));
let mockSendStaffInvite;
jest.mock('../src/lib/email', () => ({ sendStaffInvite: (...a) => mockSendStaffInvite(...a) }));

const staffRouter = require('../src/routes/staff');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', staffRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };

const tokenDe = (role = 'admin', gymId = 7) => jwt.sign({ id: 1, role, gymId }, SECRETO, { expiresIn: '1h' });
const conToken = (peticion, role) => peticion.set('Authorization', `Bearer ${tokenDe(role)}`);

/**
 * Stub de la BD. Cada regla es [patron, respuesta]: gana la primera cuyo
 * patron coincide con el SQL. La respuesta es el resultado de pg ({ rows }),
 * una funcion (params) => resultado, o un Error que se lanza. Guarda cada
 * consulta en `consultas` y las que no esperaba en `inesperadas`.
 */
function crearStub(reglas = []) {
  const stub = {
    consultas: [],
    inesperadas: [],
    async query(sql, params) {
      stub.consultas.push({ sql, params });
      const regla = reglas.find(([patron]) => patron.test(sql));
      if (!regla) {
        stub.inesperadas.push(sql);
        throw new Error(`SQL inesperado en el stub: ${sql.trim().slice(0, 80)}`);
      }
      const respuesta = regla[1];
      if (respuesta instanceof Error) throw respuesta;
      return typeof respuesta === 'function' ? respuesta(params) : respuesta;
    },
    async connect() {
      throw new Error('estas rutas no piden conexiones al pool');
    },
  };
  return stub;
}

// Fila del gimnasio que lee requireActiveTrial: suscrito (sin fin de prueba).
const reglaPrueba = () => [
  /SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/,
  (params) => ({ rows: [{ id_gimnasio: params[0], activo: true, trial_ends_at: null }] }),
];

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockBd = crearStub();
  mockSendStaffInvite = jest.fn(async () => ({ delivered: true }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  const { inesperadas } = mockBd;
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
  // Si la ruta corrio un SQL que el test no preparo, el test falla aqui.
  expect(inesperadas).toEqual([]);
});

// ---------------------------------------------------------------------------
// GET /api/admin/diagnostics (la version de staff.js)
// ---------------------------------------------------------------------------
const ESQUEMA = { rol_reg: 'rol', roles_reg: null, has_fecha_creacion: true, has_ultimo_acceso: false };
const COLUMNAS_USUARIO = ['id_usuario', 'nombre', 'email', 'id_rol', 'activo', 'fecha_creacion'].map((column_name) => ({ column_name }));
const PERSONAL_GYM_7 = [
  { id_usuario: 3, nombre: 'Marta Admin', email: 'marta@gym.co', id_rol: 1, activo: true, rol: 'ADMINISTRADOR' },
  { id_usuario: 2, nombre: 'Ana Recepcion', email: 'ana@gym.co', id_rol: 2, activo: true, rol: 'RECEPCIONISTA' },
  { id_usuario: 1, nombre: 'Luis Dueno', email: 'luis@gym.co', id_rol: 1, activo: true, rol: 'ADMINISTRADOR' },
];
const COLUMNAS_BASE = 'id_usuario, nombre, email, id_rol, activo';

/**
 * Reglas de las tres consultas del diagnostico. `esquema` cambia campos de la
 * introspeccion; `introspeccion`, `columnas` y `replay` reemplazan la respuesta.
 * El replay solo tiene personal en el gimnasio 7.
 */
function reglasDiagnostico(cambios = {}) {
  return [
    [/AS rol_reg/, cambios.introspeccion || { rows: [{ ...ESQUEMA, ...cambios.esquema }] }],
    [/SELECT column_name FROM information_schema\.columns/, cambios.columnas || { rows: COLUMNAS_USUARIO }],
    [/FROM usuario WHERE id_gimnasio = \$1 ORDER BY/, cambios.replay || ((params) => (params[0] === 7
      ? { rows: PERSONAL_GYM_7, rowCount: PERSONAL_GYM_7.length }
      : { rows: [], rowCount: 0 }))],
  ];
}
const diagnosticar = (role) => conToken(request(app).get('/api/admin/diagnostics'), role);

/** Separa el SQL del replay en la lista de columnas y la columna del ORDER BY. */
function partesDelReplay(sql) {
  const [, columnas, orden] = /^SELECT (.+), CASE usuario\.id_rol .+ ORDER BY (\w+) DESC$/.exec(sql);
  return { columnas, orden };
}

describe('GET /api/admin/diagnostics (staff.js router): what each check reports', () => {
  test('should report the role tables and which optional user columns exist when the introspection answers', async () => {
    // Doble: stub de la BD con la tabla rol y solo fecha_creacion. Verifica la salida.
    // Arrange
    mockBd = crearStub(reglasDiagnostico());

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks).toEqual(expect.objectContaining({ rolReg: 'rol', rolesReg: null, hasFechaCreacion: true, hasUltimoAcceso: false }));
    expect(r.body.checks).not.toHaveProperty('introspection');
  });

  test('should list the user column names in table order when the column query answers', async () => {
    // Doble: stub de la BD con las columnas de usuario. Verifica la salida: solo los nombres.
    // Arrange
    mockBd = crearStub(reglasDiagnostico());

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.usuarioColumns).toEqual(['id_usuario', 'nombre', 'email', 'id_rol', 'activo', 'fecha_creacion']);
  });

  test.each([
    { caso: 'both optional columns exist', fecha: true, acceso: true, columnas: `${COLUMNAS_BASE}, fecha_creacion, ultimo_acceso`, orden: 'fecha_creacion' },
    { caso: 'only fecha_creacion exists', fecha: true, acceso: false, columnas: `${COLUMNAS_BASE}, fecha_creacion`, orden: 'fecha_creacion' },
    { caso: 'only ultimo_acceso exists', fecha: false, acceso: true, columnas: `${COLUMNAS_BASE}, ultimo_acceso`, orden: 'id_usuario' },
    { caso: 'no optional column exists (like Render)', fecha: false, acceso: false, columnas: COLUMNAS_BASE, orden: 'id_usuario' },
  ])('should replay the staff query selecting [$columnas] ordered by $orden when $caso', async ({ fecha, acceso, columnas, orden }) => {
    // Doble: stub de la BD con el esquema de cada entorno. Verifica la salida:
    // el SQL que reporta el diagnostico pide solo columnas que existen.
    // Arrange
    mockBd = crearStub(reglasDiagnostico({ esquema: { has_fecha_creacion: fecha, has_ultimo_acceso: acceso } }));

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(partesDelReplay(r.body.checks.sql)).toEqual({ columnas, orden });
    expect(r.body.checks.replay.ok).toBe(true);
  });

  test('should run the reported SQL with the gym of the token and send the row count and the first two rows when the replay works', async () => {
    // Doble: stub de la BD que solo tiene personal en el gimnasio 7. Verifica
    // la salida y los parametros: el SQL que corrio es el que se reporta.
    // Arrange
    mockBd = crearStub(reglasDiagnostico());

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.replay).toEqual({ ok: true, rowCount: 3, sample: [PERSONAL_GYM_7[0], PERSONAL_GYM_7[1]] });
    expect(mockBd.consultas.at(-1)).toEqual({ sql: r.body.checks.sql, params: [7] });
  });
});

describe('GET /api/admin/diagnostics (staff.js router): a failing query is reported, not thrown', () => {
  test('should report the introspection error and still replay the minimal query when the introspection query fails', async () => {
    // Doble: stub de la BD sin permiso sobre information_schema. Verifica la
    // salida: 200 con el error en introspection y un replay sin columnas opcionales.
    // Arrange
    const error = Object.assign(new Error('permission denied for schema information_schema'), { code: '42501' });
    mockBd = crearStub(reglasDiagnostico({ introspeccion: error }));

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.introspection).toEqual({ code: '42501', message: 'permission denied for schema information_schema' });
    expect(r.body.checks).not.toHaveProperty('rolReg');
    expect(partesDelReplay(r.body.checks.sql)).toEqual({ columnas: COLUMNAS_BASE, orden: 'id_usuario' });
    expect(r.body.checks.replay.ok).toBe(true);
  });

  test('should report the code and message in usuarioColumns when the column list query fails', async () => {
    // Doble: stub de la BD que corta la conexion en la lista de columnas. Verifica la salida.
    // Arrange
    const error = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' });
    mockBd = crearStub(reglasDiagnostico({ columnas: error }));

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.usuarioColumns).toEqual({ code: '57P01', message: 'terminating connection due to administrator command' });
  });

  test('should report ok false with every Postgres error field when the replay query fails', async () => {
    // Doble: stub de la BD cuyo replay falla como Postgres con una columna que
    // no existe. Verifica la salida: el admin ve code, hint, detail, position y where.
    // Arrange
    const error = Object.assign(new Error('column "fecha_creacion" does not exist'), {
      code: '42703', hint: 'Perhaps you meant to reference the column "usuario.fecha_alta".', detail: 'detalle de prueba', position: '58', where: 'SQL statement',
    });
    mockBd = crearStub(reglasDiagnostico({ replay: error }));

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.replay).toEqual({
      ok: false,
      code: '42703',
      message: 'column "fecha_creacion" does not exist',
      hint: 'Perhaps you meant to reference the column "usuario.fecha_alta".',
      detail: 'detalle de prueba',
      position: '58',
      where: 'SQL statement',
    });
  });

  test('should answer 403 FORBIDDEN without touching the database when a receptionist asks for the diagnostics', async () => {
    // Doble: stub de la BD sin reglas: cualquier consulta seria inesperada.
    // Verifica la salida y que no se leyo nada.
    // Arrange: el token es de una recepcionista del gimnasio 7

    // Act
    const r = await diagnosticar('receptionist');

    // Assert
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN');
    expect(mockBd.consultas).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Otros caminos de staff.js sin cubrir
// ---------------------------------------------------------------------------
describe('staff.js: database errors and edge cases', () => {
  test.each([
    ['GET', '/api/admin/staff/invitations', true, /FROM invitacion_staff/, 'No pudimos listar las invitaciones. Intenta de nuevo.', '[GET /admin/staff/invitations] Error:'],
    ['POST', '/api/admin/staff/invitations/4/revoke', true, /UPDATE invitacion_staff/, 'No pudimos revocar la invitacion. Intenta de nuevo.', '[POST /admin/staff/invitations/:id/revoke] Error:'],
    ['GET', '/api/auth/accept-invite/token-de-prueba', false, /FROM invitacion_staff i/, 'No pudimos validar la invitacion. Intenta de nuevo.', '[GET /auth/accept-invite/:token] Error:'],
  ])('should answer 503 DB_UNREACHABLE and log the cause when the database fails on %s %s', async (metodo, ruta, esDelAdmin, consulta, mensaje, registro) => {
    // Dobles: stub de la BD que falla en la consulta de la ruta y spy en
    // console.error. Verifica la salida y el registro. La vista publica de la
    // invitacion no lleva token.
    // Arrange
    mockBd = crearStub([reglaPrueba(), [consulta, new Error('conexion perdida')]]);
    const peticion = request(app)[metodo.toLowerCase()](ruta);

    // Act
    const r = await (esDelAdmin ? conToken(peticion) : peticion);

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: mensaje, code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith(registro, 'conexion perdida');
  });

  test('should answer 404 STAFF_NOT_FOUND when the user disappears between the read and the update', async () => {
    // Doble: stub de la BD que encuentra a Ana al leerla, pero cuyo UPDATE no
    // devuelve fila (otra peticion la borro en medio). Verifica la salida y los
    // parametros del UPDATE: el usuario y el gimnasio correctos.
    // Arrange
    mockBd = crearStub([
      reglaPrueba(),
      [/AS rol_exists/, { rows: [{ rol_exists: false, roles_exists: false, has_fecha_creacion: true, has_ultimo_acceso: true, has_rol_column: false }] }],
      [/SELECT id_usuario, id_rol, activo,/, { rows: [{ id_usuario: 2, id_rol: 2, activo: true, es_dueno: false }] }],
      [/UPDATE usuario SET/, { rows: [] }],
    ]);

    // Act
    const r = await conToken(request(app).patch('/api/admin/staff/2')).send({ nombre: 'Ana Maria' });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Usuario no encontrado en este gimnasio.', code: 'STAFF_NOT_FOUND' });
    expect(mockBd.consultas.at(-1).params).toEqual(['Ana Maria', 2, 7]);
  });

  test.each([
    { caso: 'the gym has a name', filas: [{ nombre: 'Gimnasio Central' }], gymName: 'Gimnasio Central' },
    { caso: 'the gym has no name', filas: [{ nombre: null }], gymName: 'tu gimnasio' },
    { caso: 'the gym row is missing', filas: [], gymName: 'tu gimnasio' },
  ])('should name the gym "$gymName" in the invitation email when $caso', async ({ filas, gymName }) => {
    // Dobles: stub de la BD para crear la invitacion y spy en sendStaffInvite.
    // Verifica el comportamiento: el correo sale una vez con ese nombre.
    // Arrange
    mockBd = crearStub([
      reglaPrueba(),
      [/FROM usuario WHERE LOWER\(email\) = \$1/, { rows: [] }],
      [/FROM invitacion_staff\s+WHERE LOWER\(email\)/, { rows: [] }],
      [/INSERT INTO invitacion_staff/, { rows: [{ id_invitacion: 4, email: 'ana@gym.co', nombre: 'Ana Perez', rol_asignado: 'RECEPCIONISTA' }] }],
      [/SELECT nombre FROM gimnasio/, { rows: filas }],
    ]);

    // Act
    const r = await conToken(request(app).post('/api/admin/staff/invite')).send({ email: 'ana@gym.co', nombre: 'Ana Perez' });

    // Assert
    expect(r.status).toBe(201);
    expect(mockSendStaffInvite).toHaveBeenCalledTimes(1);
    expect(mockSendStaffInvite.mock.calls[0][0].gymName).toBe(gymName);
  });
});
