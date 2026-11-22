/**
 * Semana 4, capa API: las rutas de miembros (routes/miembros.js) desde la
 * seguridad y el contrato de errores. El CRUD por id (caso feliz, validacion
 * e inexistente) esta en miembros-api-crud.test.js.
 *
 *  - 401: sin token o con un token vencido, en las rutas que escriben o leen
 *    datos de un miembro.
 *  - 403: la recepcion en las rutas solo de admin (baja, borrado, congelar) y
 *    el token de la app del miembro en las rutas del personal.
 *  - Autorizado: lo que cada rol si puede hacer, con codigo, cuerpo y
 *    Content-Type.
 *  - Contrato de errores: JSON mal formado, tipos incorrectos e inexistente,
 *    siempre { error, code } en JSON, sin HTML, sin stack y sin SQL.
 *
 * No repite el #51 (api-seguridad-errores.test.js), que ya prueba el GET de la
 * lista de miembros con 401, 403 y la BD caida.
 *
 * Se usa la app real de src/index.js (no abre puertos ni migra al importarse).
 * Dobles: la BD es un stub por consulta que lanza si llega un SQL que el test
 * no declaro; la lectura del personal en authenticate es un stub; el correo y
 * WhatsApp son stubs (lib/email y lib/whatsapp, nuestras interfaces).
 */
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = 'secreto-de-pruebas';

let mockReglas = [];
let mockLlamadas = [];
const mockGimnasio = { id_gimnasio: 7, activo: true, trial_ends_at: null };

async function mockEjecutar(sql, params = []) {
  mockLlamadas.push({ sql, params });
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [mockGimnasio] };
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql)) return { rows: [] };
  for (const [patron, respuesta] of mockReglas) if (patron.test(sql)) return respuesta(params, sql);
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
}
jest.mock('../src/db/db', () => ({
  query: (...a) => mockEjecutar(...a),
  connect: async () => ({ query: (...a) => mockEjecutar(...a), release: () => {} }),
}));
jest.mock('../src/lib/email', () => ({ sendMemberQR: async () => ({ delivered: true }), sendStaffInvite: async () => ({ delivered: true }), sendRecoveryCode: async () => ({ delivered: true }) }));
jest.mock('../src/lib/whatsapp', () => ({
  sendWhatsAppQR: async () => {}, sendWhatsAppText: async () => {}, isWhatsAppReady: () => false, initWhatsApp: () => {},
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../src/index');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const SECRETO = process.env.JWT_SECRET;
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };
const ADMIN = jwt.sign({ id: 1, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const RECEPCION = jwt.sign({ id: 2, role: 'receptionist', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const MIEMBRO_APP = jwt.sign({ idMiembro: 5, role: 'cliente', gymId: 7 }, SECRETO, { expiresIn: '1h' });
// Vencio hace un minuto: firmado con exp en el pasado.
const VENCIDO = jwt.sign({ id: 1, role: 'admin', gymId: 7, exp: Math.floor(Date.now() / 1000) - 60 }, SECRETO);

const responder = (...reglas) => { mockReglas = reglas; };
// Supertest se queda esperando si a un GET o DELETE se le hace .send(undefined): el cuerpo va solo si hay.
function llamar(metodo, ruta, token, cuerpo) {
  let peticion = request(app)[metodo](ruta);
  if (token) peticion = peticion.set('Authorization', `Bearer ${token}`);
  return cuerpo === undefined ? peticion : peticion.send(cuerpo);
}
const filas = (rows) => () => ({ rows });
// Un error de pg trae el SQL o el dato en el mensaje: no debe llegar al cliente.
const ERROR_PG = () => () => { throw Object.assign(new Error('connection terminated: SELECT pc.id_plan_cobro FROM plan_cobro pc'), { code: '57P01' }); };
const consultasDeDatos = () => mockLlamadas.filter(({ sql }) => !/FROM gimnasio WHERE id_gimnasio/.test(sql));

/** La forma comun de cualquier error del API. */
function esErrorDelContrato(r, status, code) {
  expect(r.status).toBe(status);
  expect(r.headers['content-type']).toMatch(/^application\/json/);
  expect(r.body).toEqual(expect.objectContaining({ error: expect.any(String), code }));
  expect(r.text).not.toMatch(/SELECT|plan_cobro|relation|invalid input syntax|\s+at\s+\S+\.js|<html/i);
}

const ANA = { nombre: 'Ana Maria', documento: 'CC12345', telefono: '3001234567' };

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  mockReglas = [];
  mockLlamadas = [];
  mockGimnasio.trial_ends_at = null;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// [metodo, ruta, cuerpo]. Toda fila lleva los tres: con dos, Jest pasaria `done` como cuerpo y esperaria a que se llame.
const RUTAS_DE_MIEMBRO = [
  ['post', '/api/admin/miembros', ANA],
  ['get', '/api/admin/miembros/lookup?documento=CC12345', undefined],
  ['get', '/api/admin/miembros/88', undefined],
  ['put', '/api/admin/miembros/88', { nombre: 'Ana' }],
  ['delete', '/api/admin/miembros/88', undefined],
  ['delete', '/api/admin/miembros/88/permanent', undefined],
  ['get', '/api/admin/miembros/88/plan', undefined],
  ['put', '/api/admin/miembros/88/plan', {}],
  ['post', '/api/admin/miembros/88/congelar', {}],
  ['post', '/api/admin/miembros/88/descongelar', {}],
];

// ---------------------------------------------------------------------------
describe('member routes: 401 without a valid session', () => {
  test.each(RUTAS_DE_MIEMBRO)('should answer 401 AUTH_REQUIRED without touching the data when %s %s has no token', async (metodo, ruta, cuerpo) => {
    // Arrange: ninguna consulta declarada

    // Act
    const r = await llamar(metodo, ruta, null, cuerpo);

    // Assert
    esErrorDelContrato(r, 401, 'AUTH_REQUIRED');
    expect(mockLlamadas).toHaveLength(0);
  });

  test('should answer 401 TOKEN_INVALID and create nothing when the session token has expired', async () => {
    // Arrange: el token vencio hace un minuto

    // Act
    const r = await request(app).post('/api/admin/miembros').set('Authorization', `Bearer ${VENCIDO}`).send(ANA);

    // Assert
    esErrorDelContrato(r, 401, 'TOKEN_INVALID');
    expect(mockLlamadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('member routes: 403 for the wrong role', () => {
  test.each([
    ['delete', '/api/admin/miembros/88'],
    ['delete', '/api/admin/miembros/88/permanent'],
    ['post', '/api/admin/miembros/88/congelar'],
    ['post', '/api/admin/miembros/88/descongelar'],
  ])('should answer 403 FORBIDDEN without naming roles nor touching data when a receptionist calls %s %s', async (metodo, ruta) => {
    // Arrange: la recepcion no puede dar de baja, borrar ni congelar

    // Act
    const r = await request(app)[metodo](ruta).set('Authorization', `Bearer ${RECEPCION}`).send({});

    // Assert
    esErrorDelContrato(r, 403, 'FORBIDDEN');
    expect(r.body.error).not.toMatch(/admin|recep|rol/i);
    expect(consultasDeDatos()).toHaveLength(0);
  });

  test.each([
    ['post', '/api/admin/miembros', ANA],
    ['put', '/api/admin/miembros/88', { nombre: 'Otra' }],
    ['get', '/api/admin/miembros/88/plan', undefined],
  ])('should answer 403 FORBIDDEN when the member app token calls %s %s', async (metodo, ruta, cuerpo) => {
    // Arrange: el token de la app del miembro no es del personal

    // Act
    const r = await llamar(metodo, ruta, MIEMBRO_APP, cuerpo);

    // Assert
    esErrorDelContrato(r, 403, 'FORBIDDEN');
    expect(consultasDeDatos()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('member routes: what each role can do', () => {
  test('should answer 201 in JSON with the new member and no password hash when a receptionist creates a member', async () => {
    // Arrange
    responder(
      [/SELECT id_miembro FROM miembro WHERE id_gimnasio = \$1 AND documento = \$2/, filas([])],
      [/SELECT 1 FROM miembro WHERE codigo_qr/, filas([])],
      [/INSERT INTO miembro/, (p) => ({ rows: [{ id_miembro: 88, nombre: p[1], documento: p[3], password_asignada: true }] })],
      [/INSERT INTO plan_cobro/, filas([])],
      [/INSERT INTO autorizacion_miembro/, (p) => ({ rows: [{ id_autorizacion: 1, tipo: p[2], otorgada: p[3], version_texto: p[4], canal: p[5], fecha: new Date('2026-11-17T15:00:00Z') }] })],
      [/SELECT nombre FROM gimnasio/, filas([{ nombre: 'Gym Norte' }])],
    );

    // Act
    const r = await request(app).post('/api/admin/miembros').set('Authorization', `Bearer ${RECEPCION}`).send({ ...ANA, password: 'clave123' });

    // Assert
    expect(r.status).toBe(201);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body).toMatchObject({ message: 'Miembro creado.', miembro: { id_miembro: 88, nombre: 'Ana Maria', password_asignada: true } });
    expect(r.text).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  test('should answer 200 in JSON when the admin deactivates a member of the gym', async () => {
    // Arrange
    responder([/UPDATE miembro SET activo = FALSE/, filas([{ id_miembro: 88 }])]);

    // Act
    const r = await request(app).delete('/api/admin/miembros/88').set('Authorization', `Bearer ${ADMIN}`);

    // Assert
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body).toEqual({ message: 'Miembro desactivado.' });
  });
});

// ---------------------------------------------------------------------------
describe('member routes: the error contract', () => {
  test.each([
    ['post', '/api/admin/miembros'],
    ['put', '/api/admin/miembros/88'],
    ['put', '/api/admin/miembros/88/plan'],
    ['post', '/api/admin/miembros/88/congelar'],
  ])('should answer 400 BAD_JSON without touching the data when %s %s gets malformed JSON', async (metodo, ruta) => {
    // Arrange: el cuerpo se corta a la mitad

    // Act
    const r = await request(app)[metodo](ruta).set('Authorization', `Bearer ${ADMIN}`)
      .set('Content-Type', 'application/json').send('{"nombre": "Ana",');

    // Assert
    esErrorDelContrato(r, 400, 'BAD_JSON');
    expect(mockLlamadas).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR with the field issues and touch no data when the types are wrong', async () => {
    // Arrange: nombre numerico y telefono como lista

    // Act
    const r = await request(app).post('/api/admin/miembros').set('Authorization', `Bearer ${ADMIN}`).send({ nombre: 123, documento: 'CC1234', telefono: ['300'] });

    // Assert
    esErrorDelContrato(r, 400, 'VALIDATION_ERROR');
    expect(r.body.details.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['nombre', 'telefono']));
    expect(consultasDeDatos()).toHaveLength(0);
  });

  test.each([
    ['get', '/api/admin/miembros/99', /FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2/, undefined],
    ['put', '/api/admin/miembros/99', /UPDATE miembro SET/, { nombre: 'Ana Maria' }],
    ['delete', '/api/admin/miembros/99', /UPDATE miembro SET activo = FALSE/, undefined],
  ])('should answer 404 MEMBER_NOT_FOUND in the contract when %s %s asks for a member of another gym', async (metodo, ruta, patron, cuerpo) => {
    // Arrange: la BD no encuentra el miembro en el gimnasio del token
    responder([patron, filas([])]);

    // Act
    const r = await llamar(metodo, ruta, ADMIN, cuerpo);

    // Assert
    esErrorDelContrato(r, 404, 'MEMBER_NOT_FOUND');
    expect(mockLlamadas.find(({ sql }) => patron.test(sql)).params.slice(-2)).toEqual([99, 7]);
  });
});

// ---------------------------------------------------------------------------
// Hallazgos de contrato de las rutas del plan, corregidos en routes/miembros.js.
describe('GET and PUT /api/admin/miembros/:id/plan: contract findings', () => {
  const PLAN = { tipo_plan: 'MENSUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-02-01', valor_total: 100000, valor_pagado: 0, metodo_pago: 'EFECTIVO' };
  // Como PostgreSQL: un id que no es entero hace fallar la consulta con el dato en el mensaje.
  const comoPostgres = () => (params) => {
    if (params.some((p) => p === 'abc')) throw Object.assign(new Error('invalid input syntax for type integer: "abc"'), { code: '22P02' });
    return { rows: [] };
  };

  test.each([
    ['get', '/api/admin/miembros/abc/plan', undefined],
    ['put', '/api/admin/miembros/abc/plan', PLAN],
  ])('should answer 400 VALIDATION_ERROR without querying when %s %s gets an id that is not a number', async (metodo, ruta, cuerpo) => {
    // Arrange
    responder([/plan_cobro|FROM miembro|congelacion_plan/, comoPostgres()]);

    // Act
    const r = await llamar(metodo, ruta, ADMIN, cuerpo);

    // Assert
    esErrorDelContrato(r, 400, 'VALIDATION_ERROR');
    expect(r.body.error).toBe('Id inválido');
    expect(consultasDeDatos()).toHaveLength(0);
  });

  test.each([
    ['get', '/api/admin/miembros/88/plan', undefined],
    ['put', '/api/admin/miembros/88/plan', PLAN],
  ])('should answer 503 DB_UNREACHABLE without the SQL when the database fails on %s %s', async (metodo, ruta, cuerpo) => {
    // Arrange
    responder([/plan_cobro|FROM miembro|congelacion_plan/, ERROR_PG()]);

    // Act
    const r = await llamar(metodo, ruta, ADMIN, cuerpo);

    // Assert
    esErrorDelContrato(r, 503, 'DB_UNREACHABLE');
  });

  // Solo la BD que no responde es 503 "intenta de nuevo". Cualquier otro error de
  // la BD es un fallo real: sigue al errorHandler (500), que en produccion no
  // muestra el mensaje.
  const PLANES = [
    ['get', '/api/admin/miembros/88/plan', undefined],
    ['put', '/api/admin/miembros/88/plan', PLAN],
  ];
  const CORTES = [
    ['the server refuses the connection (ECONNREFUSED)', () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })],
    ['pg loses the connection, with no SQLSTATE', () => new Error('Connection terminated unexpectedly')],
    ['the pool cannot get a connection in time', () => new Error('timeout exceeded when trying to connect')],
  ];
  const FALLOS_REALES = [
    ['a column does not exist (42703)', () => Object.assign(new Error('column "valor" does not exist'), { code: '42703' })],
    ['the route has a bug (TypeError)', () => new TypeError("Cannot read properties of undefined (reading 'id_plan_cobro')")],
  ];
  const cruzar = (rutas, casos) => rutas.flatMap(([metodo, ruta, cuerpo]) => casos.map(([caso, error]) => [metodo, ruta, caso, cuerpo, error]));

  test.each(cruzar(PLANES, CORTES))('should answer 503 DB_UNREACHABLE when %s %s fails because %s', async (metodo, ruta, _caso, cuerpo, error) => {
    // Arrange
    responder([/plan_cobro|FROM miembro|congelacion_plan/, () => { throw error(); }]);

    // Act
    const r = await llamar(metodo, ruta, ADMIN, cuerpo);

    // Assert
    esErrorDelContrato(r, 503, 'DB_UNREACHABLE');
  });

  test.each(cruzar(PLANES, FALLOS_REALES))('should answer 500 INTERNAL_ERROR, not 503, when %s %s fails because %s', async (metodo, ruta, _caso, cuerpo, error) => {
    // Arrange: en produccion, como en Render
    const entorno = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    responder([/plan_cobro|FROM miembro|congelacion_plan/, () => { throw error(); }]);

    // Act
    let r;
    try {
      r = await llamar(metodo, ruta, ADMIN, cuerpo);
    } finally {
      process.env.NODE_ENV = entorno;
    }

    // Assert
    esErrorDelContrato(r, 500, 'INTERNAL_ERROR');
    expect(r.body.error).toBe('Error interno del servidor');
  });

  test('should answer 402 TRIAL_EXPIRED without reading the plan when the gym trial has ended', async () => {
    // Arrange: la prueba gratuita del gimnasio vencio ayer
    mockGimnasio.trial_ends_at = new Date(Date.now() - 24 * 60 * 60 * 1000);
    responder([/plan_cobro|congelacion_plan/, filas([{ id_plan_cobro: 5 }])]);

    // Act
    const r = await llamar('get', '/api/admin/miembros/88/plan', RECEPCION);

    // Assert
    esErrorDelContrato(r, 402, 'TRIAL_EXPIRED');
    expect(consultasDeDatos()).toHaveLength(0);
  });
});
