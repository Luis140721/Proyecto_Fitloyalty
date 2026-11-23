/**
 * Campanas de mensajes y plantillas del administrador (routes/campanas.js,
 * RQF-10), con la ejecucion de lib/campanas.js y el job del scheduler
 * (jobs/campanas.js).
 *
 * Sale de la sincronizacion de la rama de la semana con develop (#100 y #104):
 * routes/campanas.js entro con 97 ramas sin cubrir en el job backend. Sus
 * pruebas contra la base real (retos-campanas-real.test.js) se saltan en los
 * dos jobs del CI.
 *
 * Dobles:
 *  - BD: stub por consulta, como en config-rutas.test.js. Cada test declara
 *    que responde a que SQL; una consulta que no esta declarada lanza error.
 *    Las llamadas quedan anotadas (tambien las del cliente de las
 *    transacciones, con BEGIN, COMMIT, ROLLBACK y release) para verificar que
 *    se escribio y con que datos.
 *  - Entregas: router.setDeps() reemplaza el canal, el correo y el WhatsApp.
 *  - Lectura del personal en authenticate: stub (el admin 1 del gimnasio 7).
 *  - authenticate, authorize, requireActiveTrial, zod, lib/campanas,
 *    lib/segmentos y lib/mensajes son los reales.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockReglas = [];
let mockLlamadas = [];

async function mockEjecutar(sql, params = []) {
  mockLlamadas.push({ sql, params });
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
  for (const [patron, respuesta] of mockReglas) if (patron.test(sql)) return respuesta(params, sql);
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
}
jest.mock('../src/db/db', () => ({
  query: (...a) => mockEjecutar(...a),
  connect: async () => ({
    query: (...a) => mockEjecutar(...a),
    release: () => { mockLlamadas.push({ sql: 'release', params: [] }); },
  }),
}));

const campanasRouter = require('../src/routes/campanas');
const { runJob } = require('../src/jobs/campanas');
const { VARIABLES } = require('../src/lib/campanas');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', campanasRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const ADMIN = () => jwt.sign({ id: 1, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const pedir = (metodo, ruta) => request(app)[metodo](`/api${ruta}`).set('Authorization', `Bearer ${ADMIN()}`);

const responder = (...reglas) => { mockReglas = reglas; };
const filas = (rows) => () => ({ rows });
const cambiadas = (rowCount) => () => ({ rows: [], rowCount });
const falla = (code) => () => { const e = new Error('fallo de la BD'); if (code) e.code = code; throw e; };
/** Responde una cosa distinta en cada llamada; la ultima se repite. */
const secuencia = (...respuestas) => {
  let i = 0;
  return (...a) => respuestas[Math.min(i++, respuestas.length - 1)](...a);
};
const llamadas = (patron) => mockLlamadas.filter(({ sql }) => patron.test(sql));
/** BEGIN, COMMIT, ROLLBACK y release, en el orden en que pasaron. */
const transacciones = () => mockLlamadas.map(({ sql }) => sql).filter((sql) => /^(BEGIN|COMMIT|ROLLBACK|release)$/.test(sql));

// ------------------------------------------------------------------- datos
const MENSAJE = 'Hola {primer_nombre}, llevas {dias_sin_venir} días sin venir a {gimnasio}.';
const CAMPANA = {
  id_campana: 4, nombre: 'Te extrañamos', segmento: 'INACTIVOS', mensaje: MENSAJE, id_plantilla: null,
  canal: 'WHATSAPP', tipo_disparo: 'MANUAL', dias_inactividad: 10, estado: 'PROGRAMADA', activa: true,
  fecha_programada: null, fecha_ejecucion: null, fecha_creacion: '2026-11-20T15:00:00.000Z',
  destinatarios: 0, enviados: 0, fallidos: 0, pendientes: 0,
};
// La fila que lee la ejecucion con FOR UPDATE: la campana con el nombre del gimnasio.
const PARA_EJECUTAR = {
  id_campana: 4, id_gimnasio: 7, nombre: 'Te extrañamos', segmento: 'INACTIVOS', mensaje: MENSAJE, canal: 'WHATSAPP',
  dias_inactividad: 10, estado: 'PROGRAMADA', activa: true, id_plantilla: null, gimnasio: 'Gym Norte',
};
const ANA = { id_miembro: 41, nombre: 'Ana Ruiz', telefono: '3001234567', codigo_pais_telefono: '57', email: 'ana@example.com', fecha_fin: '2026-12-01', dias_sin_venir: 12 };
const BETO = { id_miembro: 42, nombre: 'Beto Gil', telefono: null, codigo_pais_telefono: null, email: null, fecha_fin: null, dias_sin_venir: null };
const CARLA = { id_miembro: 43, nombre: 'Carla Paz', telefono: '310 987 6543', codigo_pais_telefono: null, email: 'carla@example.com', fecha_fin: null, dias_sin_venir: 30 };

// Consultas de la campana, de la ejecucion y de cada entrega.
const laCampana = (...respuestas) => [/WHERE c\.id_campana = \$1 AND c\.id_gimnasio = \$2\s+GROUP BY/, secuencia(...respuestas)];
const paraEjecutar = (respuesta) => [/FOR UPDATE OF c/, respuesta];
const delSegmento = (miembros) => [/FROM miembro m\s+LEFT JOIN/, filas(miembros)];
const guardarDestinatario = (respuesta = filas([])) => [/INSERT INTO campana_destinatario/, respuesta];
const marcarEnviada = [/UPDATE campana SET estado = 'ENVIADA'/, cambiadas(1)];
const guardarEnvio = (respuesta = filas([])) => [/INSERT INTO envio_mensaje/, respuesta];
const marcarDestinatario = [/UPDATE campana_destinatario SET estado_envio/, (p) => ({ rows: [{ id_campana_destinatario: 90 + p[1] - 40, estado_envio: p[2], fecha_envio: '2026-11-21T14:00:00.000Z' }] })];
const sinVencidas = [/SELECT id_campana, id_gimnasio, creada_por FROM campana/, filas([])];
/** Estado con que quedo cada miembro (UPDATE campana_destinatario), en orden. */
const estadosGuardados = () => llamadas(/UPDATE campana_destinatario SET estado_envio/).map(({ params }) => [params[1], params[2]]);

let deps;
beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockReglas = [];
  mockLlamadas = [];
  deps = {
    canalDelGimnasio: jest.fn(async () => 3),
    enviarCorreo: jest.fn(async () => ({ delivered: true })),
    enviarWhatsapp: jest.fn(async () => ({ ok: true })),
    whatsappActivo: jest.fn(() => true),
  };
  campanasRouter.setDeps(deps);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

// ===========================================================================
describe('/api/admin/plantillas: the reusable templates', () => {
  const PLANTILLA = { id_plantilla: 3, nombre: 'Regreso', contenido: 'Hola {nombre}, te esperamos.', activa: true, fecha_creacion: '2026-11-01T12:00:00.000Z' };

  test('should list the templates of the gym of the admin with the variables the text admits', async () => {
    // Arrange
    responder([/FROM plantilla_mensaje WHERE id_gimnasio = \$1/, filas([PLANTILLA])]);

    // Act
    const r = await pedir('get', '/admin/plantillas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ plantillas: [PLANTILLA], variables: VARIABLES });
    expect(llamadas(/FROM plantilla_mensaje/)[0].params).toEqual([7]);
  });

  test('should answer 503 DB_UNREACHABLE and log the cause when the templates cannot be read', async () => {
    // Arrange
    responder([/FROM plantilla_mensaje/, falla('08006')]);

    // Act
    const r = await pedir('get', '/admin/plantillas');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar las plantillas.', code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith('[GET /admin/plantillas] Error:', 'fallo de la BD');
  });

  test.each([
    ['active when activa is not sent', {}, true],
    ['inactive when activa is false', { activa: false }, false],
  ])('should create the template trimmed and %s', async (_caso, extra, activa) => {
    // Arrange
    responder([/INSERT INTO plantilla_mensaje/, filas([{ ...PLANTILLA, activa }])]);

    // Act
    const r = await pedir('post', '/admin/plantillas').send({ nombre: '  Regreso ', contenido: ' Hola {nombre}, te esperamos. ', ...extra });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ plantilla: { ...PLANTILLA, activa } });
    expect(llamadas(/INSERT INTO plantilla_mensaje/)[0].params).toEqual([7, 'Regreso', 'Hola {nombre}, te esperamos.', activa, 1]);
  });

  test('should answer 400 VALIDATION_ERROR without writing when the name is too short', async () => {
    // Act
    const r = await pedir('post', '/admin/plantillas').send({ nombre: 'ab', contenido: 'Hola {nombre}' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['nombre']);
    expect(llamadas(/plantilla_mensaje/)).toHaveLength(0);
  });

  test('should answer 409 PLANTILLA_DUPLICADA when the gym already has a template with that name', async () => {
    // Arrange: la restriccion UNIQUE (id_gimnasio, nombre)
    responder([/INSERT INTO plantilla_mensaje/, falla('23505')]);

    // Act
    const r = await pedir('post', '/admin/plantillas').send({ nombre: 'Regreso', contenido: 'Hola {nombre}' });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Ya existe una plantilla con ese nombre.', code: 'PLANTILLA_DUPLICADA' });
  });

  test('should update only the fields sent on the template of the gym of the admin', async () => {
    // Arrange
    responder([/UPDATE plantilla_mensaje SET/, filas([{ ...PLANTILLA, contenido: 'Te esperamos, {primer_nombre}.', activa: false }])]);

    // Act
    const r = await pedir('put', '/admin/plantillas/3').send({ contenido: ' Te esperamos, {primer_nombre}. ', activa: false });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.plantilla).toMatchObject({ contenido: 'Te esperamos, {primer_nombre}.', activa: false });
    const [update] = llamadas(/UPDATE plantilla_mensaje/);
    expect(update.sql).toMatch(/SET contenido = \$1, activa = \$2\s+WHERE id_plantilla = \$3 AND id_gimnasio = \$4/);
    expect(update.params).toEqual(['Te esperamos, {primer_nombre}.', false, 3, 7]);
  });

  test('should answer 400 VALIDATION_ERROR on PUT without writing when nothing is sent', async () => {
    // Act
    const r = await pedir('put', '/admin/plantillas/3').send({});

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Nada que actualizar.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/plantilla_mensaje/)).toHaveLength(0);
  });

  test.each([
    ['PUT', 'put', { nombre: 'Otro nombre' }],
    ['DELETE', 'delete', undefined],
  ])('should answer 404 NOT_FOUND on %s when the template is not of the gym of the admin', async (_m, metodo, cuerpo) => {
    // Arrange
    responder([/UPDATE plantilla_mensaje/, filas([])]);

    // Act
    const r = await pedir(metodo, '/admin/plantillas/99').send(cuerpo);

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Plantilla no encontrada.', code: 'NOT_FOUND' });
    expect(llamadas(/UPDATE plantilla_mensaje/)[0].params.slice(-2)).toEqual([99, 7]);
  });

  test('should deactivate the template instead of deleting it, so the campaigns that used it keep their text', async () => {
    // Arrange
    responder([/UPDATE plantilla_mensaje SET activa = FALSE/, filas([{ ...PLANTILLA, activa: false }])]);

    // Act
    const r = await pedir('delete', '/admin/plantillas/3');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ plantilla: { ...PLANTILLA, activa: false } });
    expect(llamadas(/UPDATE plantilla_mensaje SET activa = FALSE/)[0].params).toEqual([3, 7]);
    expect(llamadas(/DELETE/)).toHaveLength(0);
  });

  test.each(['abc', '0', '3.5', '03'])('should answer 400 VALIDATION_ERROR without touching the database when the template id is %s', async (id) => {
    // Act
    const r = await pedir('delete', `/admin/plantillas/${id}`);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id de plantilla invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/plantilla_mensaje/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('GET /api/admin/campanas: the list and the due scheduled campaigns', () => {
  const LISTA = /WHERE c\.id_gimnasio = \$1\s+GROUP BY c\.id_campana/;

  test('should answer the campaigns with the segments, their default days and the variables when nothing is due', async () => {
    // Arrange
    responder(sinVencidas, [LISTA, filas([CAMPANA])]);

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      campanas: [CAMPANA],
      segmentos: [
        { valor: 'TODOS', etiqueta: 'Todos los miembros activos', dias: null },
        { valor: 'INACTIVOS', etiqueta: 'Inactivos', dias: 7 },
        { valor: 'NUEVOS', etiqueta: 'Nuevos', dias: 30 },
        { valor: 'PROXIMOS_A_VENCER', etiqueta: 'Próximos a vencer', dias: 7 },
      ],
      variables: VARIABLES,
    });
    expect(llamadas(LISTA)[0].params).toEqual([7]);
  });

  test('should run first only the due campaigns of the gym of the admin when the server slept through their time', async () => {
    // Arrange: la 5 es del gimnasio 7 y la 6 de otro gimnasio
    responder(
      [/SELECT id_campana, id_gimnasio, creada_por FROM campana/, filas([
        { id_campana: 5, id_gimnasio: 7, creada_por: 1 },
        { id_campana: 6, id_gimnasio: 8, creada_por: 2 },
      ])],
      paraEjecutar(filas([{ ...PARA_EJECUTAR, id_campana: 5, segmento: 'TODOS' }])),
      delSegmento([]),
      marcarEnviada,
      [LISTA, filas([{ ...CAMPANA, id_campana: 5, estado: 'ENVIADA' }])],
    );

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.campanas).toEqual([{ ...CAMPANA, id_campana: 5, estado: 'ENVIADA' }]);
    expect(llamadas(/FOR UPDATE OF c/).map(({ params }) => params)).toEqual([[5, 7]]);
    expect(llamadas(/UPDATE campana SET estado = 'ENVIADA'/)[0].params).toEqual([5]);
  });

  test('should keep listing and log the cause when a due campaign fails to run', async () => {
    // Arrange
    responder(
      [/SELECT id_campana, id_gimnasio, creada_por FROM campana/, filas([{ id_campana: 5, id_gimnasio: 7, creada_por: 1 }])],
      paraEjecutar(falla('08006')),
      [LISTA, filas([CAMPANA])],
    );

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.campanas).toEqual([CAMPANA]);
    expect(console.error).toHaveBeenCalledWith('[campanas] No se pudo ejecutar la campana 5:', 'fallo de la BD');
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
  });

  test('should answer 503 DB_UNREACHABLE when the campaigns cannot be read', async () => {
    // Arrange
    responder(sinVencidas, [LISTA, falla()]);

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar las campañas.', code: 'DB_UNREACHABLE' });
  });
});

// ===========================================================================
describe('GET /api/admin/campanas/segmento: the preview of a segment', () => {
  test.each([
    ['the default days of the segment when no days are sent', '', 7],
    ['the default days of the segment when the days come empty', '&dias=', 7],
    ['the days sent when the admin writes them', '&dias=15', 15],
  ])('should count the members with WhatsApp and with email using %s', async (_caso, query, dias) => {
    // Arrange
    responder(delSegmento([ANA, BETO, CARLA]));

    // Act
    const r = await pedir('get', `/admin/campanas/segmento?segmento=INACTIVOS${query}`);

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      segmento: 'INACTIVOS',
      dias,
      total: 3,
      con_telefono: 2,
      con_correo: 2,
      muestra: [{ id_miembro: 41, nombre: 'Ana Ruiz' }, { id_miembro: 42, nombre: 'Beto Gil' }, { id_miembro: 43, nombre: 'Carla Paz' }],
    });
    expect(llamadas(/FROM miembro m/)[0].params).toEqual([7, dias]);
  });

  test('should show a sample of at most 10 members when the segment is bigger', async () => {
    // Arrange
    const muchos = Array.from({ length: 12 }, (_, i) => ({ ...BETO, id_miembro: 100 + i, nombre: `Miembro ${i}` }));
    responder(delSegmento(muchos));

    // Act
    const r = await pedir('get', '/admin/campanas/segmento?segmento=TODOS');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ segmento: 'TODOS', dias: null, total: 12, con_telefono: 0, con_correo: 0 });
    expect(r.body.muestra).toHaveLength(10);
  });

  test.each(['ETIQUETA', ''])('should answer 400 VALIDATION_ERROR without reading the members when the segment is "%s"', async (segmento) => {
    // Act
    const r = await pedir('get', `/admin/campanas/segmento?segmento=${segmento}`);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Segmento invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/FROM miembro/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas: create a campaign', () => {
  const INSERT = /INSERT INTO campana \(/;
  const crear = (cambios) => pedir('post', '/admin/campanas').send({ nombre: ' Te extrañamos ', segmento: 'INACTIVOS', dias: '10', ...cambios });

  test('should create a manual WhatsApp campaign with the message written and answer it with its counters', async () => {
    // Arrange
    responder([INSERT, filas([{ id_campana: 4 }])], laCampana(filas([CAMPANA])));

    // Act
    const r = await crear({ mensaje: ` ${MENSAJE} ` });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ campana: CAMPANA });
    expect(llamadas(INSERT)[0].params).toEqual([7, 'Te extrañamos', 'INACTIVOS', MENSAJE, null, 'MANUAL', 10, null, 1, 'WHATSAPP']);
    expect(llamadas(/GROUP BY c\.id_campana/)[0].params).toEqual([4, 7]);
  });

  test('should copy the text of the active template of the gym when no message is written', async () => {
    // Arrange
    responder(
      [/SELECT contenido FROM plantilla_mensaje/, filas([{ contenido: 'Hola {nombre}, te esperamos.' }])],
      [INSERT, filas([{ id_campana: 4 }])],
      laCampana(filas([CAMPANA])),
    );

    // Act
    const r = await crear({ id_plantilla: 3 });

    // Assert
    expect(r.status).toBe(201);
    expect(llamadas(/SELECT contenido FROM plantilla_mensaje/)[0].params).toEqual([3, 7]);
    expect(llamadas(INSERT)[0].params.slice(3, 5)).toEqual(['Hola {nombre}, te esperamos.', 3]);
  });

  test('should keep the message written and only check that the template is of the gym when both are sent', async () => {
    // Arrange
    responder(
      [/SELECT 1 FROM plantilla_mensaje/, filas([{ '?column?': 1 }])],
      [INSERT, filas([{ id_campana: 4 }])],
      laCampana(filas([CAMPANA])),
    );

    // Act
    const r = await crear({ id_plantilla: 3, mensaje: MENSAJE });

    // Assert
    expect(r.status).toBe(201);
    expect(llamadas(/SELECT 1 FROM plantilla_mensaje/)[0].params).toEqual([3, 7]);
    expect(llamadas(INSERT)[0].params.slice(3, 5)).toEqual([MENSAJE, 3]);
    expect(llamadas(/SELECT contenido/)).toHaveLength(0);
  });

  test.each([
    ['no message is written', {}, /SELECT contenido FROM plantilla_mensaje/],
    ['a message is written', { mensaje: MENSAJE }, /SELECT 1 FROM plantilla_mensaje/],
  ])('should answer 404 NOT_FOUND without creating it when the template is not of the gym and %s', async (_caso, extra, patron) => {
    // Arrange
    responder([patron, filas([])]);

    // Act
    const r = await crear({ id_plantilla: 99, ...extra });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Plantilla no encontrada.', code: 'NOT_FOUND' });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test.each([
    ['there is no message and no template', {}],
    ['the message has less than 5 characters', { mensaje: 'Hola' }],
  ])('should answer 400 VALIDATION_ERROR without creating it when %s', async (_caso, extra) => {
    // Act
    const r = await crear(extra);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Escribe el mensaje o elige una plantilla.', code: 'VALIDATION_ERROR' });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test('should create a scheduled email campaign with the Colombian date and time when the date is in the future', async () => {
    // Arrange
    responder(
      [/AS futura/, filas([{ futura: true }])],
      [INSERT, filas([{ id_campana: 4 }])],
      laCampana(filas([{ ...CAMPANA, canal: 'EMAIL', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00' }])),
    );

    // Act
    const r = await crear({ mensaje: MENSAJE, canal: 'EMAIL', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00' });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body.campana).toMatchObject({ canal: 'EMAIL', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00' });
    const [futura] = llamadas(/AS futura/);
    expect(futura.sql).toMatch(/AT TIME ZONE 'America\/Bogota'/);
    expect(futura.params).toEqual(['2026-11-25T08:00']);
    expect(llamadas(INSERT)[0].params).toEqual([7, 'Te extrañamos', 'INACTIVOS', MENSAJE, null, 'PROGRAMADO', 10, '2026-11-25T08:00', 1, 'EMAIL']);
  });

  test.each([
    ['there is no date', {}, [], 'Elige la fecha y la hora de envío.'],
    ['the date already passed', { fecha_programada: '2026-11-20T08:00' }, [[/AS futura/, filas([{ futura: false }])]], 'La fecha de envío debe ser futura.'],
  ])('should answer 400 VALIDATION_ERROR without creating a scheduled campaign when %s', async (_caso, extra, reglas, mensaje) => {
    // Arrange
    responder(...reglas);

    // Act
    const r = await crear({ mensaje: MENSAJE, tipo_disparo: 'PROGRAMADO', ...extra });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: mensaje, code: 'VALIDATION_ERROR' });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when the segment does not exist', async () => {
    // Act
    const r = await crear({ segmento: 'ETIQUETA', mensaje: MENSAJE });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['segmento']);
    expect(llamadas(/campana|plantilla/)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR when a CHECK of the database rejects the campaign', async () => {
    // Arrange: el CHECK de campana.segmento en produccion
    responder([INSERT, falla('23514')]);

    // Act
    const r = await crear({ mensaje: MENSAJE });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Los datos no son validos.', code: 'VALIDATION_ERROR' });
  });
});

// ===========================================================================
describe('PUT /api/admin/campanas/:id: edit a campaign while it is scheduled', () => {
  const UPDATE = /UPDATE campana SET nombre = \$3/;

  test('should merge the changes with the saved campaign and answer it as it was saved', async () => {
    // Arrange
    const editada = { ...CAMPANA, nombre: 'Vuelve pronto', canal: 'EMAIL' };
    responder(laCampana(filas([CAMPANA]), filas([editada])), [UPDATE, cambiadas(1)]);

    // Act
    const r = await pedir('put', '/admin/campanas/4').send({ nombre: 'Vuelve pronto', canal: 'EMAIL' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ campana: editada });
    const [update] = llamadas(UPDATE);
    expect(update.sql).toMatch(/WHERE id_campana = \$1 AND id_gimnasio = \$2 AND estado = 'PROGRAMADA'/);
    expect(update.params).toEqual([4, 7, 'Vuelve pronto', 'INACTIVOS', MENSAJE, null, 'MANUAL', 10, null, 'EMAIL']);
  });

  test.each(['ENVIADA', 'CANCELADA'])('should answer 409 CAMPANA_NO_EDITABLE without saving when the campaign is %s', async (estado) => {
    // Arrange
    responder(laCampana(filas([{ ...CAMPANA, estado }])));

    // Act
    const r = await pedir('put', '/admin/campanas/4').send({ nombre: 'Vuelve pronto' });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Solo se puede editar una campaña que no se ha enviado.', code: 'CAMPANA_NO_EDITABLE' });
    expect(llamadas(UPDATE)).toHaveLength(0);
  });

  test('should answer 404 NOT_FOUND when the campaign is not of the gym of the admin', async () => {
    // Arrange
    responder(laCampana(filas([])));

    // Act
    const r = await pedir('put', '/admin/campanas/99').send({ nombre: 'Vuelve pronto' });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Campaña no encontrada.', code: 'NOT_FOUND' });
    expect(llamadas(/GROUP BY c\.id_campana/)[0].params).toEqual([99, 7]);
  });

  test.each(['abc', '0', '4.5', '04'])('should answer 400 VALIDATION_ERROR without touching the database when the campaign id is %s', async (id) => {
    // Act
    const r = await pedir('put', `/admin/campanas/${id}`).send({ nombre: 'Vuelve pronto' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id de campaña invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/campana/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas/:id/ejecutar: send a campaign now', () => {
  const ejecutar = () => pedir('post', '/admin/campanas/4/ejecutar');
  const enviada = (contadores) => filas([{ ...CAMPANA, estado: 'ENVIADA', fecha_ejecucion: '2026-11-21T09:00', ...contadores }]);
  const reglasDeEnvio = (campana = PARA_EJECUTAR, miembros = [ANA, BETO, CARLA], contadores = {}) => [
    laCampana(filas([CAMPANA]), enviada(contadores)),
    paraEjecutar(filas([campana])),
    delSegmento(miembros),
    guardarDestinatario(),
    marcarEnviada,
    guardarEnvio(),
    marcarDestinatario,
  ];

  test('should send by WhatsApp to the members with a phone and mark the one without a phone as FALLIDO when the WhatsApp module is active', async () => {
    // Arrange
    responder(...reglasDeEnvio(PARA_EJECUTAR, [ANA, BETO, CARLA], { destinatarios: 3, enviados: 2, fallidos: 1 }));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 2, fallidos: 1, pendientes: 0, canal: 'WHATSAPP' });
    expect(r.body.campana).toMatchObject({ estado: 'ENVIADA', enviados: 2, fallidos: 1 });
    expect(deps.enviarWhatsapp.mock.calls).toEqual([
      ['573001234567', 'Hola Ana, llevas 12 días sin venir a Gym Norte.'],
      ['573109876543', 'Hola Carla, llevas 30 días sin venir a Gym Norte.'],
    ]);
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO'], [42, 'FALLIDO'], [43, 'ENVIADO']]);
    // Los destinatarios y el estado ENVIADA quedan en la misma transaccion, con la fila bloqueada.
    expect(llamadas(/INSERT INTO campana_destinatario/).map(({ params }) => params)).toEqual([[4, 41], [4, 42], [4, 43]]);
    expect(llamadas(/FROM miembro m/)[0].params).toEqual([7, 10]);
    // Una transaccion para congelar los destinatarios y una por cada entrega guardada.
    expect(transacciones()).toEqual(Array(4).fill(['BEGIN', 'COMMIT', 'release']).flat());
    // Cada entrega deja constancia en envio_mensaje, con el canal del gimnasio.
    expect(llamadas(/INSERT INTO envio_mensaje/)[0].params).toEqual([7, 41, 3, 4, null, 'Hola Ana, llevas 12 días sin venir a Gym Norte.', 'ENVIADO', 1]);
    expect(deps.canalDelGimnasio).toHaveBeenCalledWith(expect.anything(), 7, 'WHATSAPP');
  });

  test('should leave PENDIENTE for sending by hand every member with a phone when the WhatsApp module is not active', async () => {
    // Arrange
    deps.whatsappActivo.mockReturnValue(false);
    responder(...reglasDeEnvio());

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 0, fallidos: 1, pendientes: 2, canal: 'WHATSAPP' });
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(estadosGuardados()).toEqual([[42, 'FALLIDO']]);
  });

  test.each(['WHATSAPP_NO_LISTO', 'WHATSAPP_DESHABILITADO'])('should stop trying WhatsApp and leave the rest PENDIENTE when the client answers %s', async (code) => {
    // Arrange
    deps.enviarWhatsapp.mockRejectedValueOnce(Object.assign(new Error('sin cliente'), { code }));
    responder(...reglasDeEnvio());

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 0, fallidos: 1, pendientes: 2, canal: 'WHATSAPP' });
    expect(deps.enviarWhatsapp).toHaveBeenCalledTimes(1);
    expect(estadosGuardados()).toEqual([[42, 'FALLIDO']]);
  });

  test('should mark FALLIDO the member whose WhatsApp fails for another reason and keep sending to the rest', async () => {
    // Arrange
    deps.enviarWhatsapp.mockRejectedValueOnce(new Error('numero invalido'));
    responder(...reglasDeEnvio());

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 1, fallidos: 2, pendientes: 0, canal: 'WHATSAPP' });
    expect(estadosGuardados()).toEqual([[41, 'FALLIDO'], [42, 'FALLIDO'], [43, 'ENVIADO']]);
  });

  test('should send an email to each member with email and mark FALLIDO the ones without email or whose email was not delivered when the channel is EMAIL', async () => {
    // Arrange: a Ana le llega, Beto no tiene correo, a Carla Brevo no lo entrega y con Dani falla
    const DANI = { ...CARLA, id_miembro: 44, nombre: 'Dani Rey', email: 'dani@example.com' };
    deps.enviarCorreo.mockImplementation(async (to) => {
      if (to === 'dani@example.com') throw new Error('Brevo no responde');
      return { delivered: to === 'ana@example.com' };
    });
    responder(...reglasDeEnvio({ ...PARA_EJECUTAR, canal: 'EMAIL' }, [ANA, BETO, CARLA, DANI]));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 4, enviados: 1, fallidos: 3, pendientes: 0, canal: 'EMAIL' });
    expect(deps.enviarCorreo.mock.calls.map(([to]) => to)).toEqual(['ana@example.com', 'carla@example.com', 'dani@example.com']);
    expect(deps.enviarCorreo).toHaveBeenCalledWith('ana@example.com', 'Te extrañamos', 'Hola Ana, llevas 12 días sin venir a Gym Norte.');
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO'], [42, 'FALLIDO'], [43, 'FALLIDO'], [44, 'FALLIDO']]);
    expect(deps.canalDelGimnasio).toHaveBeenCalledWith(expect.anything(), 7, 'EMAIL');
  });

  test.each([
    ['ENVIADA', true, 'La campaña ya se envió.'],
    ['CANCELADA', false, 'La campaña está cancelada.'],
    ['PROGRAMADA', false, 'La campaña está cancelada.'],
  ])('should answer 409 CAMPANA_NO_EJECUTABLE without sending when the campaign is %s and activa is %s', async (estado, activa, mensaje) => {
    // Arrange
    responder(laCampana(filas([{ ...CAMPANA, estado, activa }])));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: mensaje, code: 'CAMPANA_NO_EJECUTABLE' });
    expect(llamadas(/FOR UPDATE/)).toHaveLength(0);
  });

  test('should answer 409 CAMPANA_NO_EJECUTABLE and roll back when another execution took the campaign first', async () => {
    // Arrange: al bloquear la fila, otra ejecucion ya la paso a ENVIADA
    responder(laCampana(filas([CAMPANA])), paraEjecutar(filas([{ ...PARA_EJECUTAR, estado: 'ENVIADA' }])));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'La campaña ya se está enviando.', code: 'CAMPANA_NO_EJECUTABLE' });
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
    expect(llamadas(/INSERT INTO campana_destinatario|UPDATE campana SET estado/)).toHaveLength(0);
  });

  test('should roll back, release the client and answer 503 DB_UNREACHABLE when the recipients cannot be saved', async () => {
    // Arrange
    responder(laCampana(filas([CAMPANA])), paraEjecutar(filas([PARA_EJECUTAR])), delSegmento([ANA]), guardarDestinatario(falla('08006')));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos ejecutar la campaña.', code: 'DB_UNREACHABLE' });
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
    expect(llamadas(/UPDATE campana SET estado = 'ENVIADA'/)).toHaveLength(0);
  });

  test('should roll back the record of the delivery and answer 503 DB_UNREACHABLE when it cannot be saved', async () => {
    // Arrange: el correo a Ana sale, pero su constancia no se puede guardar
    responder(
      laCampana(filas([CAMPANA])),
      paraEjecutar(filas([{ ...PARA_EJECUTAR, canal: 'EMAIL' }])),
      delSegmento([ANA]),
      guardarDestinatario(),
      marcarEnviada,
      guardarEnvio(falla('08006')),
    );

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos ejecutar la campaña.', code: 'DB_UNREACHABLE' });
    expect(transacciones()).toEqual(['BEGIN', 'COMMIT', 'release', 'BEGIN', 'ROLLBACK', 'release']);
    expect(llamadas(/UPDATE campana_destinatario/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas/:id/cancelar: cancel a campaign', () => {
  const CANCELAR = /UPDATE campana SET estado = 'CANCELADA', activa = FALSE/;

  test('should cancel the scheduled campaign of the gym of the admin and answer it', async () => {
    // Arrange
    responder([CANCELAR, cambiadas(1)], laCampana(filas([{ ...CAMPANA, estado: 'CANCELADA', activa: false }])));

    // Act
    const r = await pedir('post', '/admin/campanas/4/cancelar');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.campana).toMatchObject({ id_campana: 4, estado: 'CANCELADA', activa: false });
    const [update] = llamadas(CANCELAR);
    expect(update.sql).toMatch(/WHERE id_campana = \$1 AND id_gimnasio = \$2 AND estado = 'PROGRAMADA'/);
    expect(update.params).toEqual([4, 7]);
  });

  test('should answer 409 CAMPANA_NO_EDITABLE when the campaign was already sent', async () => {
    // Arrange
    responder([CANCELAR, cambiadas(0)], laCampana(filas([{ ...CAMPANA, estado: 'ENVIADA' }])));

    // Act
    const r = await pedir('post', '/admin/campanas/4/cancelar');

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Solo se puede cancelar una campaña que no se ha enviado.', code: 'CAMPANA_NO_EDITABLE' });
  });

  test('should answer 404 NOT_FOUND when the campaign is not of the gym of the admin', async () => {
    // Arrange
    responder([CANCELAR, cambiadas(0)], laCampana(filas([])));

    // Act
    const r = await pedir('post', '/admin/campanas/99/cancelar');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Campaña no encontrada.', code: 'NOT_FOUND' });
  });
});

// ===========================================================================
describe('GET /api/admin/campanas/:id/destinatarios: the recipients and their message', () => {
  const DESTINATARIOS = /SELECT d\.id_campana_destinatario, d\.estado_envio/;
  const MENSAJE_CON_FECHA = `${MENSAJE} Tu plan vence el {fecha_vencimiento}.`;
  const fila = (m, estado) => ({ id_campana_destinatario: 90 + m.id_miembro - 40, estado_envio: estado, fecha_envio: null, ...m });

  test('should answer each recipient with the WhatsApp number and the message of today ready to send by hand', async () => {
    // Arrange
    responder(
      laCampana(filas([{ ...CAMPANA, mensaje: MENSAJE_CON_FECHA }])),
      [/SELECT nombre FROM gimnasio WHERE id_gimnasio = \$1/, filas([{ nombre: 'Gym Norte' }])],
      [DESTINATARIOS, filas([fila(ANA, 'PENDIENTE'), fila(BETO, 'FALLIDO')])],
    );

    // Act
    const r = await pedir('get', '/admin/campanas/4/destinatarios');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.campana).toMatchObject({ id_campana: 4 });
    expect(r.body.destinatarios).toEqual([
      { id_campana_destinatario: 91, id_miembro: 41, nombre: 'Ana Ruiz', estado_envio: 'PENDIENTE', fecha_envio: null, telefono: '573001234567', email: 'ana@example.com',
        mensaje: 'Hola Ana, llevas 12 días sin venir a Gym Norte. Tu plan vence el 01/12/2026.' },
      { id_campana_destinatario: 92, id_miembro: 42, nombre: 'Beto Gil', estado_envio: 'FALLIDO', fecha_envio: null, telefono: null, email: null,
        mensaje: 'Hola Beto, llevas varios días sin venir a Gym Norte. Tu plan vence el .' },
    ]);
    expect(llamadas(DESTINATARIOS)[0].params).toEqual([4, 7]);
  });

  test('should write "tu gimnasio" in the message when the gym name cannot be found', async () => {
    // Arrange
    responder(
      laCampana(filas([CAMPANA])),
      [/SELECT nombre FROM gimnasio/, filas([])],
      [DESTINATARIOS, filas([fila(CARLA, 'PENDIENTE')])],
    );

    // Act
    const r = await pedir('get', '/admin/campanas/4/destinatarios');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.destinatarios[0].mensaje).toBe('Hola Carla, llevas 30 días sin venir a tu gimnasio.');
  });

  test('should answer 404 NOT_FOUND without reading recipients when the campaign is not of the gym of the admin', async () => {
    // Arrange
    responder(laCampana(filas([])));

    // Act
    const r = await pedir('get', '/admin/campanas/99/destinatarios');

    // Assert
    expect(r.status).toBe(404);
    expect(llamadas(/SELECT nombre FROM gimnasio|FROM campana_destinatario d\s+JOIN miembro/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas/:id/destinatarios/:idMiembro/enviado: record a WhatsApp sent by hand', () => {
  const ES_DESTINATARIO = /SELECT d\.estado_envio FROM campana_destinatario d/;
  const marcar = (idMiembro = '41', cuerpo = { mensaje: ' Hola Ana, te esperamos. ' }) => (
    pedir('post', `/admin/campanas/4/destinatarios/${idMiembro}/enviado`).send(cuerpo)
  );

  test('should record the delivery with the text sent and mark the recipient as ENVIADO', async () => {
    // Arrange
    responder(laCampana(filas([{ ...CAMPANA, id_plantilla: 3 }])), [ES_DESTINATARIO, filas([{ estado_envio: 'PENDIENTE' }])], guardarEnvio(), marcarDestinatario);

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ destinatario: { id_campana_destinatario: 91, estado_envio: 'ENVIADO', fecha_envio: '2026-11-21T14:00:00.000Z' } });
    expect(llamadas(ES_DESTINATARIO)[0].params).toEqual([4, 41, 7]);
    expect(llamadas(/INSERT INTO envio_mensaje/)[0].params).toEqual([7, 41, 3, 4, 3, 'Hola Ana, te esperamos.', 'ENVIADO', 1]);
    expect(transacciones()).toEqual(['BEGIN', 'COMMIT', 'release']);
  });

  test('should answer 404 NOT_FOUND without recording when the member is not a recipient of the campaign', async () => {
    // Arrange
    responder(laCampana(filas([CAMPANA])), [ES_DESTINATARIO, filas([])]);

    // Act
    const r = await marcar('99');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Ese miembro no es destinatario de la campaña.', code: 'NOT_FOUND' });
    expect(llamadas(/envio_mensaje/)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when the member id is not valid', async () => {
    // Act
    const r = await marcar('abc');

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id de miembro invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/campana/)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when the message sent is missing', async () => {
    // Act
    const r = await marcar('41', { mensaje: '   ' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['mensaje']);
    expect(llamadas(/campana/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('jobs/campanas.js: the scheduler job', () => {
  test('should run the due campaigns of every gym and add up their summaries when the scheduler calls it', async () => {
    // Arrange: la 5 (gimnasio 7) tiene a Ana, la 6 (gimnasio 8) a Beto y la 7 ya la envio otra ejecucion
    deps.whatsappActivo.mockReturnValue(false);
    const porCampana = {
      5: { ...PARA_EJECUTAR, id_campana: 5 },
      6: { ...PARA_EJECUTAR, id_campana: 6, id_gimnasio: 8 },
      7: { ...PARA_EJECUTAR, id_campana: 7, estado: 'ENVIADA' },
    };
    responder(
      [/SELECT id_campana, id_gimnasio, creada_por FROM campana/, filas([
        { id_campana: 5, id_gimnasio: 7, creada_por: 1 },
        { id_campana: 6, id_gimnasio: 8, creada_por: 2 },
        { id_campana: 7, id_gimnasio: 7, creada_por: 1 },
      ])],
      paraEjecutar((p) => ({ rows: [porCampana[p[0]]] })),
      [/FROM miembro m\s+LEFT JOIN/, (p) => ({ rows: p[0] === 7 ? [ANA] : [BETO] })],
      guardarDestinatario(),
      marcarEnviada,
      guardarEnvio(),
      marcarDestinatario,
    );

    // Act
    const resumen = await runJob();

    // Assert
    expect(resumen).toEqual({ ejecutadas: 2, destinatarios: 2, enviados: 0, pendientes: 1, fallidos: 1 });
    expect(llamadas(/FOR UPDATE OF c/).map(({ params }) => params)).toEqual([[5, 7], [6, 8], [7, 7]]);
    // La entrega fallida de la 6 queda a nombre de quien creo la campana.
    expect(llamadas(/INSERT INTO envio_mensaje/)[0].params).toEqual([8, 42, 3, 6, null, 'Hola Beto, llevas varios días sin venir a Gym Norte.', 'FALLIDO', 2]);
  });

  test('should answer zeros when no campaign is due', async () => {
    // Arrange
    responder(sinVencidas);

    // Act
    const resumen = await runJob();

    // Assert
    expect(resumen).toEqual({ ejecutadas: 0, destinatarios: 0, enviados: 0, pendientes: 0, fallidos: 0 });
  });
});
