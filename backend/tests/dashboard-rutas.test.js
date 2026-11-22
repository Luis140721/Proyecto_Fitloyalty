/**
 * Cobertura de routes/dashboard.js (capa API, Luis): lo que ningun otro test
 * recorria.
 *
 * Que se prueba:
 *  - GET /api/admin/dashboard/export (RQF-18): el CSV de miembros activos con
 *    su plan. BOM, cabecera exacta, una fila por miembro terminada en CRLF,
 *    escape RFC 4180 (comas, comillas y saltos de linea), cabeceras de la
 *    descarga, filtro por el gimnasio del token y el 503 si la BD falla.
 *  - GET /api/admin/diagnostics tal como lo define dashboard.js: que reporta
 *    cada chequeo, que un replay que falla se informa en el cuerpo y que una
 *    introspeccion que falla responde 500 DIAG_FAILED. Ojo: src/index.js monta
 *    el router de staff (linea 107) antes que este (linea 111) y staff.js
 *    define la misma ruta, asi que en la app real contesta la de staff.js. Por
 *    eso aqui se monta solo este router.
 *  - GET /api/admin/dashboard: el 503 y los valores por defecto con el
 *    gimnasio vacio (lo demas ya lo cubre contrato-front.test.js).
 *  - GET /api/admin/dashboard/horas-pico: el periodo por defecto y el empate.
 *  - Permisos (solo el admin entra) y prueba gratuita vencida (402).
 *
 * Dobles de este archivo:
 *  - BD: stub por patron del SQL (crearStub). Cada test dice que devuelve cada
 *    consulta. Un SQL que el test no esperaba lanza error y ademas hace fallar
 *    el test en el afterEach, aunque la ruta se trague el error. La fila del
 *    gimnasio decide la prueba gratuita en el requireActiveTrial real.
 *  - Lectura del personal en authenticate: stub con establecerBusquedaPersonal
 *    (el rol y el gimnasio salen del token). authenticate, authorize,
 *    requireActiveTrial y errorHandler son los reales.
 *  - Reloj: solo se finge Date (jest.setSystemTime), para el nombre del
 *    archivo y el vencimiento de la prueba gratuita.
 *  - console.error: spy, para verificar el registro sin ensuciar la salida.
 * Sin red, sin BD real y sin abrir puertos (supertest).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: (...a) => mockBd.connect(...a),
}));

const dashboardRouter = require('../src/routes/dashboard');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', dashboardRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
// 10:00 en Colombia: la fecha UTC y la de Colombia son el mismo dia.
const AHORA = new Date('2026-11-19T15:00:00.000Z');
const UN_DIA = 24 * 60 * 60 * 1000;
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };

const tokenDe = (role, gymId) => jwt.sign({ id: 1, role, gymId }, SECRETO, { expiresIn: '1h' });
const pedir = (ruta, { role = 'admin', gymId = 7, query = {} } = {}) => request(app)
  .get(ruta)
  .query(query)
  .set('Authorization', `Bearer ${tokenDe(role, gymId)}`);

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

// Fila del gimnasio que lee requireActiveTrial. Por defecto, prueba vigente 3 dias mas.
const reglaPrueba = (cambios = {}) => [
  /SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/,
  (params) => ({ rows: [{ id_gimnasio: params[0], activo: true, trial_ends_at: new Date(AHORA.getTime() + 3 * UN_DIA), ...cambios }] }),
];

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'] });
  jest.setSystemTime(AHORA);
  mockBd = crearStub();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  const { inesperadas } = mockBd;
  process.env = ENV_ORIGINAL;
  jest.useRealTimers();
  jest.restoreAllMocks();
  // Si la ruta corrio un SQL que el test no preparo, el test falla aqui.
  expect(inesperadas).toEqual([]);
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/export (RQF-18)
// ---------------------------------------------------------------------------
const BOM = '﻿';
const CABECERA = 'nombre,documento,telefono,email,plan,fecha_fin,dias_restantes';
const COLUMNAS = CABECERA.split(',');
const ANA = { nombre: 'Ana Perez', documento: '1020304050', telefono: '3001234567', email: 'ana@gym.co', plan: 'Mensual', fecha_fin: '2026-11-25', dias_restantes: 6 };
const BRUNO = { nombre: 'Bruno Diaz', documento: '79888777', telefono: '', email: '', plan: 'Trimestral', fecha_fin: '2027-01-10', dias_restantes: 52 };
const CARLOS = { nombre: 'Carlos Ruiz', documento: '1122334455', telefono: '3109876543', email: 'carlos@otro.co', plan: 'Anual', fecha_fin: '2027-06-30', dias_restantes: 223 };

// Miembros por gimnasio: el stub devuelve los del gimnasio que reciba en $1.
const reglaMiembros = (porGimnasio) => [/FROM miembro mb\s+INNER JOIN/, (params) => ({ rows: porGimnasio[params[0]] || [] })];
const exportar = (opciones) => pedir('/api/admin/dashboard/export', opciones);

describe('GET /api/admin/dashboard/export: CSV of active members with their plan', () => {
  test('should send the BOM, the exact header line and one CRLF-terminated row per member when the gym has active members', async () => {
    // Doble: stub de la BD con dos miembros del gimnasio 7. Verifica la salida:
    // el CSV completo, caracter por caracter.
    // Arrange
    mockBd = crearStub([reglaPrueba(), reglaMiembros({ 7: [ANA, BRUNO] })]);

    // Act
    const r = await exportar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.text).toBe(
      `${BOM}${CABECERA}\r\n`
      + 'Ana Perez,1020304050,3001234567,ana@gym.co,Mensual,2026-11-25,6\r\n'
      + 'Bruno Diaz,79888777,,,Trimestral,2027-01-10,52\r\n',
    );
  });

  test.each([
    { como: 'as is', caso: 'is plain text', columna: 'nombre', valor: 'Ana Perez', esperado: 'Ana Perez' },
    { como: 'as is, keeping its spaces', caso: 'has spaces at the ends', columna: 'nombre', valor: '  Ana Perez ', esperado: '  Ana Perez ' },
    { como: 'quoted', caso: 'has a comma', columna: 'nombre', valor: 'Perez, Ana', esperado: '"Perez, Ana"' },
    { como: 'quoted with every quote doubled', caso: 'has double quotes', columna: 'nombre', valor: 'Ana "La Fuerte" Perez', esperado: '"Ana ""La Fuerte"" Perez"' },
    { como: 'quoted', caso: 'has a line feed', columna: 'email', valor: 'ana@gym.co\nana2@gym.co', esperado: '"ana@gym.co\nana2@gym.co"' },
    { como: 'quoted', caso: 'has a carriage return', columna: 'email', valor: 'ana@gym.co\rana2@gym.co', esperado: '"ana@gym.co\rana2@gym.co"' },
    { como: 'empty', caso: 'is null', columna: 'telefono', valor: null, esperado: '' },
    { como: 'empty', caso: 'is undefined', columna: 'telefono', valor: undefined, esperado: '' },
    { como: 'empty', caso: 'is an empty string', columna: 'telefono', valor: '', esperado: '' },
    { como: 'as the digit 0', caso: 'is the number 0', columna: 'dias_restantes', valor: 0, esperado: '0' },
  ])('should write the field $como when the value $caso', async ({ columna, valor, esperado }) => {
    // Doble: stub de la BD con un miembro que trae ese valor en una columna.
    // Verifica la salida: la fila sigue siendo una sola y el campo va escapado
    // como pide RFC 4180 (un salto de linea dentro de comillas no corta la fila).
    // Arrange
    mockBd = crearStub([reglaPrueba(), reglaMiembros({ 7: [{ ...ANA, [columna]: valor }] })]);
    const fila = COLUMNAS.map((c) => (c === columna ? esperado : String(ANA[c]))).join(',');

    // Act
    const r = await exportar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.text).toBe(`${BOM}${CABECERA}\r\n${fila}\r\n`);
  });

  test('should export only the members of the gym in the token when the admin belongs to another gym', async () => {
    // Doble: stub de la BD que devuelve miembros distintos segun el gimnasio
    // que recibe en $1. Verifica la salida: solo sale el miembro del gimnasio 9.
    // Arrange
    mockBd = crearStub([reglaPrueba(), reglaMiembros({ 7: [ANA], 9: [CARLOS] })]);

    // Act
    const r = await exportar({ gymId: 9 });

    // Assert
    expect(r.status).toBe(200);
    expect(r.text).toBe(`${BOM}${CABECERA}\r\nCarlos Ruiz,1122334455,3109876543,carlos@otro.co,Anual,2027-06-30,223\r\n`);
  });

  test('should send the CSV as a UTF-8 attachment named with the date of today and without cache when the export works', async () => {
    // Dobles: stub de la BD y reloj fijo en el 19 de noviembre de 2026.
    // Verifica las cabeceras que hacen que el navegador lo descargue como archivo.
    // Arrange
    mockBd = crearStub([reglaPrueba(), reglaMiembros({ 7: [ANA] })]);

    // Act
    const r = await exportar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toBe('attachment; filename="fitloyalty-export-2026-11-19.csv"');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  test('should send only the header line when the gym has no active member with a plan', async () => {
    // Doble: stub de la BD sin miembros. Verifica la salida: ningun registro de
    // datos, solo la cabecera (se ignoran las lineas vacias del final).
    // Arrange
    mockBd = crearStub([reglaPrueba(), reglaMiembros({})]);

    // Act
    const r = await exportar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.text.split('\r\n').filter((linea) => linea !== '')).toEqual([`${BOM}${CABECERA}`]);
  });

  test('should answer 503 DB_UNREACHABLE without a CSV and log the cause when the members query fails', async () => {
    // Dobles: stub de la BD que falla en la consulta de miembros y spy en
    // console.error. Verifica la salida (JSON de error, no CSV) y el registro.
    // Arrange
    mockBd = crearStub([reglaPrueba(), [/FROM miembro mb\s+INNER JOIN/, new Error('conexion perdida')]]);

    // Act
    const r = await exportar();

    // Assert
    expect(r.status).toBe(503);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body).toEqual({ error: 'No pudimos generar el CSV. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith('[GET /admin/dashboard/export] Error:', 'conexion perdida');
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/diagnostics (la version de dashboard.js)
// ---------------------------------------------------------------------------
const COLUMNAS_GIMNASIO = [
  { column_name: 'id_gimnasio', data_type: 'integer' },
  { column_name: 'nombre', data_type: 'character varying' },
  { column_name: 'trial_ends_at', data_type: 'timestamp without time zone' },
];
const COLUMNAS_USUARIO = ['id_usuario', 'nombre', 'email', 'id_rol'].map((column_name) => ({ column_name }));
const PERSONAL_GYM_7 = [
  { id_usuario: 3, nombre: 'Marta Admin', email: 'marta@gym.co', id_rol: 1, activo: true, rol: 'ADMINISTRADOR' },
  { id_usuario: 2, nombre: 'Ana Recepcion', email: 'ana@gym.co', id_rol: 2, activo: true, rol: 'RECEPCIONISTA' },
  { id_usuario: 1, nombre: 'Luis Dueno', email: 'luis@gym.co', id_rol: 1, activo: true, rol: 'ADMINISTRADOR' },
];

/** Reglas de las cuatro consultas del diagnostico; `cambios` reemplaza la respuesta de alguna. */
function reglasDiagnostico(cambios = {}) {
  return [
    [/table_name = 'gimnasio'/, cambios.gimnasio || { rows: COLUMNAS_GIMNASIO }],
    [/to_regclass\('public\.rol'\) AS rol_reg/, cambios.roles || { rows: [{ rol_reg: 'rol', roles_reg: null }] }],
    [/table_name = 'usuario'/, cambios.usuario || { rows: COLUMNAS_USUARIO }],
    [/FROM usuario\s+WHERE id_gimnasio = \$1/, cambios.replay || ((params) => ({ rows: params[0] === 7 ? PERSONAL_GYM_7 : [] }))],
  ];
}
const diagnosticar = () => pedir('/api/admin/diagnostics');

describe('GET /api/admin/diagnostics (dashboard.js router)', () => {
  test('should report the gym columns with their types and the user column names when the introspection answers', async () => {
    // Doble: stub de la BD con las columnas de gimnasio y usuario. Verifica la salida.
    // Arrange
    mockBd = crearStub(reglasDiagnostico());

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.gimnasioColumns).toEqual(COLUMNAS_GIMNASIO);
    expect(r.body.checks.gimnasioColumnNames).toEqual(['id_gimnasio', 'nombre', 'trial_ends_at']);
    expect(r.body.checks.usuarioColumns).toEqual(['id_usuario', 'nombre', 'email', 'id_rol']);
  });

  test.each([
    { caso: 'only the rol table exists', filas: [{ rol_reg: 'rol', roles_reg: null }], rolReg: 'rol', rolesReg: null },
    { caso: 'only the roles table exists', filas: [{ rol_reg: null, roles_reg: 'roles' }], rolReg: null, rolesReg: 'roles' },
    { caso: 'the check returns no row', filas: [], rolReg: null, rolesReg: null },
  ])('should report rolReg $rolReg and rolesReg $rolesReg when $caso', async ({ filas, rolReg, rolesReg }) => {
    // Doble: stub de la BD con la respuesta de to_regclass de cada entorno.
    // Verifica la salida: una tabla que no existe se reporta como null.
    // Arrange
    mockBd = crearStub(reglasDiagnostico({ roles: { rows: filas } }));

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.rolReg).toBe(rolReg);
    expect(r.body.checks.rolesReg).toBe(rolesReg);
  });

  test('should replay the staff query for the gym in the token and send the row count and the first two rows when it works', async () => {
    // Doble: stub de la BD que solo tiene personal en el gimnasio 7. Verifica
    // la salida: si la ruta pidiera otro gimnasio, el conteo seria 0.
    // Arrange
    mockBd = crearStub(reglasDiagnostico());

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.replay).toEqual({ ok: true, rowCount: 3, sample: [PERSONAL_GYM_7[0], PERSONAL_GYM_7[1]] });
  });

  test('should report the error code and message in replay and still answer 200 when the replay query fails', async () => {
    // Doble: stub de la BD cuyo replay falla como Postgres con una columna que
    // no existe. Verifica la salida: el diagnostico informa el error, no se cae.
    // Arrange
    const error = Object.assign(new Error('column "fecha_creacion" does not exist'), { code: '42703' });
    mockBd = crearStub(reglasDiagnostico({ replay: error }));

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.checks.replay).toEqual({ ok: false, errCode: '42703', errMessage: 'column "fecha_creacion" does not exist' });
  });

  test.each([
    ['gym columns', 'gimnasio'],
    ['role tables', 'roles'],
    ['user columns', 'usuario'],
  ])('should answer 500 DIAG_FAILED and log the cause when the %s query fails', async (_consulta, clave) => {
    // Dobles: stub de la BD que falla en esa consulta de introspeccion y spy en
    // console.error. Verifica la salida (error controlado) y el registro.
    // Arrange
    mockBd = crearStub(reglasDiagnostico({ [clave]: new Error('conexion perdida') }));

    // Act
    const r = await diagnosticar();

    // Assert
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Error al generar diagnostics.', code: 'DIAG_FAILED' });
    expect(console.error).toHaveBeenCalledWith('[GET /admin/diagnostics] Error:', 'conexion perdida');
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard y /horas-pico: lo que contrato-front.test.js no cubre
// ---------------------------------------------------------------------------
/** Reglas de las 12 consultas de los KPIs; cada test cambia solo lo suyo. */
function reglasDashboard({ totalMiembros = 10, activos = 6, semana = [{ dow: 1, count: 5 }], planTop = [{ plan: 'Mensual', cnt: 7 }] } = {}) {
  return [
    [/FROM miembro WHERE id_gimnasio = \$1 AND activo = TRUE/, { rows: [{ total: totalMiembros }] }],
    [/AS total FROM checkin/, { rows: [{ total: 3 }] }],
    [/INTERVAL '7 days'/, { rows: [{ total: 1 }] }],
    [/COUNT\(DISTINCT m\.id_miembro\)/, { rows: [{ activos }] }],
    [/AS total FROM miembro m\s+LEFT JOIN LATERAL/, { rows: [{ total: 4 }] }],
    [/AS dias_sin/, { rows: [] }],
    [/AS dow/, { rows: semana }],
    [/AS dias_restantes/, { rows: [] }],
    [/c\.id_checkin/, { rows: [] }],
    [/SUM\(pc\.valor_pagado\)/, { rows: [{ total: 0 }] }],
    [/estado_pago IN/, { rows: [{ total: 0 }] }],
    [/AS cnt/, { rows: planTop }],
  ];
}
const verDashboard = () => pedir('/api/admin/dashboard');

describe('GET /api/admin/dashboard: errors and defaults', () => {
  test.each([
    ['the member count', /FROM miembro WHERE id_gimnasio = \$1 AND activo = TRUE/],
    ['the top plan', /AS cnt/],
  ])('should answer 503 DB_UNREACHABLE with the dashboard message and log the cause when %s query fails', async (_consulta, patron) => {
    // Dobles: stub de la BD que falla en esa consulta (la primera o la ultima
    // de la ruta) y spy en console.error. Verifica la salida y el registro.
    // Arrange
    mockBd = crearStub([reglaPrueba(), [patron, new Error('conexion perdida')], ...reglasDashboard()]);

    // Act
    const r = await verDashboard();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar las metricas del dashboard. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith('[GET /admin/dashboard] Error:', 'conexion perdida');
  });

  test('should send retention 0, planTop Mensual and planTopCount 0 when the gym has no members and no plans', async () => {
    // Doble: stub de la BD de un gimnasio recien creado. Verifica la salida:
    // sin dividir por cero y con el plan por defecto que muestra la tarjeta.
    // Arrange
    mockBd = crearStub([reglaPrueba(), ...reglasDashboard({ totalMiembros: 0, activos: 0, semana: [], planTop: [] })]);

    // Act
    const r = await verDashboard();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ totalMiembros: 0, retention: 0, planTop: 'Mensual', planTopCount: 0, qrsActivos: 0 }));
  });

  test('should put each count in the bar of its weekday and skip a row without weekday when building the weekly chart', async () => {
    // Doble: stub de la BD con una fila sin dia de la semana y otra del miercoles
    // (dow 3). Verifica la salida: las 7 barras, todas en 0 menos el miercoles.
    // Arrange
    mockBd = crearStub([reglaPrueba(), ...reglasDashboard({ semana: [{ dow: null, count: 4 }, { dow: 3, count: 2 }] })]);

    // Act
    const r = await verDashboard();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.weekly).toEqual([
      { day: 'Dom', count: 0 }, { day: 'Lun', count: 0 }, { day: 'Mar', count: 0 }, { day: 'Mie', count: 2 },
      { day: 'Jue', count: 0 }, { day: 'Vie', count: 0 }, { day: 'Sab', count: 0 },
    ]);
  });
});

// Entradas por hora: el stub solo tiene datos para el gimnasio 7.
const reglaHoras = (filas) => [/EXTRACT\(HOUR/, (params) => ({ rows: params[0] === 7 ? filas : [] })];

describe('GET /api/admin/dashboard/horas-pico: period and peak hour', () => {
  test.each([
    ['no period is sent', {}],
    ['the period is unknown', { periodo: 'anio' }],
  ])('should use the last 30 days when %s', async (_caso, query) => {
    // Doble: stub de la BD con una entrada. Verifica la salida: el periodo y la
    // etiqueta que muestra la grafica.
    // Arrange
    mockBd = crearStub([reglaPrueba(), reglaHoras([{ hora: 7, total: 1 }])]);

    // Act
    const r = await pedir('/api/admin/dashboard/horas-pico', { query });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ periodo: 'mes', etiqueta: 'Últimos 30 días', total: 1 }));
  });

  test('should pick the earliest hour as the peak when two hours tie', async () => {
    // Doble: stub de la BD con las 6:00 y las 18:00 empatadas en 5 entradas.
    // Verifica la salida: gana la hora mas temprana.
    // Arrange
    mockBd = crearStub([reglaPrueba(), reglaHoras([{ hora: 6, total: 5 }, { hora: 12, total: 2 }, { hora: 18, total: 5 }])]);

    // Act
    const r = await pedir('/api/admin/dashboard/horas-pico', { query: { periodo: 'semana' } });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(12);
    expect(r.body.horaPico).toEqual({ hora: 6, total: 5 });
  });
});

// ---------------------------------------------------------------------------
// Permisos y prueba gratuita
// ---------------------------------------------------------------------------
describe('dashboard.js routes: who can enter', () => {
  test.each([
    ['/api/admin/dashboard'],
    ['/api/admin/dashboard/horas-pico'],
    ['/api/admin/dashboard/export'],
    ['/api/admin/diagnostics'],
  ])('should answer 403 FORBIDDEN without touching the database when a receptionist calls %s', async (ruta) => {
    // Doble: stub de la BD sin reglas: cualquier consulta seria inesperada.
    // Verifica la salida y que no se leyo nada.
    // Arrange: el token es de una recepcionista del gimnasio 7

    // Act
    const r = await pedir(ruta, { role: 'receptionist' });

    // Assert
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN');
    expect(mockBd.consultas).toEqual([]);
  });

  test.each([
    ['/api/admin/dashboard'],
    ['/api/admin/dashboard/horas-pico'],
    ['/api/admin/dashboard/export'],
  ])('should answer 402 TRIAL_EXPIRED and read only the gym when the trial ended and the admin calls %s', async (ruta) => {
    // Dobles: reloj fijo y stub de la BD con la prueba vencida ayer. Verifica la
    // salida y que no se corrio ninguna consulta de metricas ni de miembros.
    // Arrange
    mockBd = crearStub([reglaPrueba({ trial_ends_at: new Date(AHORA.getTime() - UN_DIA) })]);

    // Act
    const r = await pedir(ruta);

    // Assert
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('TRIAL_EXPIRED');
    expect(mockBd.consultas).toHaveLength(1);
  });
});
