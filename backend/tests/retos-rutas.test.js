/**
 * Retos de asistencia del administrador (routes/retos.js, RQF-12): la lista,
 * crear, editar, cancelar, los participantes, los elegibles e inscribirlos.
 *
 * Sale de la sincronizacion de la rama de la semana con develop (#100 y #104):
 * routes/retos.js entro con 27 ramas sin cubrir en el job backend. Los avisos
 * del reto completado y de la cancelacion (lib/retos.js) ya los prueba
 * retos-avisos.test.js; aqui se prueba lo que hace la ruta.
 *
 * Dobles:
 *  - BD: stub por consulta, como en config-rutas.test.js. Una consulta que no
 *    esta declarada lanza error. Las llamadas quedan anotadas, tambien las del
 *    cliente de la cancelacion (BEGIN, COMMIT, ROLLBACK y release).
 *  - lib/retos.js: sincronizarEstados, recalcularYAvisar y
 *    cancelarParticipaciones son jest.fn; el resto es el real.
 *  - Lectura del personal en authenticate: stub (el admin 1 del gimnasio 7).
 *  - authenticate, authorize, requireActiveTrial, zod y lib/segmentos son los reales.
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
jest.mock('../src/lib/retos', () => ({
  ...jest.requireActual('../src/lib/retos'),
  sincronizarEstados: jest.fn(),
  recalcularYAvisar: jest.fn(),
  cancelarParticipaciones: jest.fn(),
}));

const retosRouter = require('../src/routes/retos');
const { sincronizarEstados, recalcularYAvisar, cancelarParticipaciones } = require('../src/lib/retos');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', retosRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const ADMIN = () => jwt.sign({ id: 1, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const pedir = (metodo, ruta) => request(app)[metodo](`/api${ruta}`).set('Authorization', `Bearer ${ADMIN()}`);

const responder = (...reglas) => { mockReglas = reglas; };
const filas = (rows) => () => ({ rows });
const falla = (code) => () => { const e = new Error('fallo de la BD'); if (code) e.code = code; throw e; };
const llamadas = (patron) => mockLlamadas.filter(({ sql }) => patron.test(sql));
/** BEGIN, COMMIT, ROLLBACK y release, en el orden en que pasaron. */
const transacciones = () => mockLlamadas.map(({ sql }) => sql).filter((sql) => /^(BEGIN|COMMIT|ROLLBACK|release)$/.test(sql));

const RETO = {
  id_reto: 9, nombre: 'Noviembre activo', descripcion: null, meta_asistencias: 8, recompensa: 'Batido',
  segmento_elegible: 'INACTIVOS', estado: 'ACTIVO', activo: true,
  fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30', fecha_creacion: '2026-10-30T15:00:00.000Z',
};
const ANA = { id_miembro: 41, nombre: 'Ana Ruiz' };
const BETO = { id_miembro: 42, nombre: 'Beto Gil' };
const CARLA = { id_miembro: 43, nombre: 'Carla Paz' };

const elReto = (rows = [RETO]) => [/FROM reto r WHERE r\.id_reto = \$1 AND r\.id_gimnasio = \$2/, filas(rows)];
const hoyEs = (hoy) => [/AS hoy/, filas([{ hoy }])];
const delSegmento = (miembros) => [/FROM miembro m\s+LEFT JOIN/, filas(miembros)];
const yaInscritos = (ids) => [/SELECT id_miembro FROM reto_miembro WHERE id_reto = \$1/, filas(ids.map((id) => ({ id_miembro: id })))];

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockReglas = [];
  mockLlamadas = [];
  sincronizarEstados.mockReset().mockResolvedValue(0);
  recalcularYAvisar.mockReset().mockResolvedValue({ fila: null, completado: false });
  cancelarParticipaciones.mockReset().mockResolvedValue(0);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

// ===========================================================================
describe('GET /api/admin/retos: the challenges of the gym', () => {
  const LISTA = /FROM reto r\s+LEFT JOIN reto_miembro rm ON rm\.id_reto = r\.id_reto/;

  test('should update the states by date first and then answer the challenges with their enrolled and completed counts', async () => {
    // Arrange: anota si los estados ya se habian sincronizado al leer la lista
    let sincronizadosAntes = null;
    const conConteos = { ...RETO, inscritos: 5, completados: 2, avance_promedio: 62.5 };
    responder([LISTA, () => { sincronizadosAntes = sincronizarEstados.mock.calls.length; return { rows: [conConteos] }; }]);

    // Act
    const r = await pedir('get', '/admin/retos');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ retos: [conConteos] });
    expect(sincronizarEstados).toHaveBeenCalledWith(expect.anything(), 7);
    expect(sincronizadosAntes).toBe(1);
    expect(llamadas(LISTA)[0].params).toEqual([7]);
  });

  test('should answer 503 DB_UNREACHABLE and log the cause when the challenges cannot be read', async () => {
    // Arrange
    responder([LISTA, falla('08006')]);

    // Act
    const r = await pedir('get', '/admin/retos');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar los retos.', code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith('[GET /admin/retos] Error:', 'fallo de la BD');
  });
});

// ===========================================================================
describe('POST /api/admin/retos: create a challenge', () => {
  const INSERT = /INSERT INTO reto \(/;
  const NUEVO = { nombre: '  Diciembre activo ', meta_asistencias: '12', fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31' };

  test('should create the challenge trimmed, for every member by default, and answer it as it was saved', async () => {
    // Arrange
    const creado = { ...RETO, id_reto: 10, nombre: 'Diciembre activo', meta_asistencias: 12, segmento_elegible: 'TODOS', estado: 'PROGRAMADO' };
    responder(hoyEs('2026-11-21'), [INSERT, filas([{ id_reto: 10 }])], elReto([creado]));

    // Act
    const r = await pedir('post', '/admin/retos').send(NUEVO);

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ reto: creado });
    const [insert] = llamadas(INSERT);
    // Empieza PROGRAMADO si su inicio es despues de hoy (en Colombia) y ACTIVO si no.
    expect(insert.sql).toMatch(/CASE WHEN \$7::date > \(NOW\(\) AT TIME ZONE 'America\/Bogota'\)::date THEN 'PROGRAMADO' ELSE 'ACTIVO' END/);
    expect(insert.params).toEqual([7, 'Diciembre activo', null, 12, null, 'TODOS', '2026-12-01', '2026-12-31', 1]);
    expect(llamadas(/FROM reto r WHERE/)[0].params).toEqual([10, 7]);
  });

  test('should answer 400 VALIDATION_ERROR without creating it when the challenge would have already ended', async () => {
    // Arrange
    responder(hoyEs('2026-11-21'));

    // Act
    const r = await pedir('post', '/admin/retos').send({ ...NUEVO, fecha_inicio: '2026-11-01', fecha_fin: '2026-11-20' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'El reto ya habría terminado: la fecha de fin es anterior a hoy.', code: 'VALIDATION_ERROR' });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when the end date is before the start date', async () => {
    // Act
    const r = await pedir('post', '/admin/retos').send({ ...NUEVO, fecha_fin: '2026-11-30' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0]).toMatchObject({ path: ['fecha_fin'], message: 'La fecha de fin no puede ser anterior a la de inicio.' });
    expect(llamadas(/reto/)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR when a CHECK of the database rejects the challenge', async () => {
    // Arrange: el CHECK de reto.segmento_elegible en produccion
    responder(hoyEs('2026-11-21'), [INSERT, falla('23514')]);

    // Act
    const r = await pedir('post', '/admin/retos').send(NUEVO);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Los datos del reto no son validos.', code: 'VALIDATION_ERROR' });
  });
});

// ===========================================================================
describe('PUT /api/admin/retos/:id: edit a challenge', () => {
  const UPDATE = /UPDATE reto SET nombre = \$3/;

  test('should save the merged challenge without recalculating the progress when neither the goal nor the dates change', async () => {
    // Arrange
    responder(elReto(), [UPDATE, () => ({ rows: [], rowCount: 1 })]);

    // Act
    const r = await pedir('put', '/admin/retos/9').send({ nombre: 'Noviembre a fondo', recompensa: '' });

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(UPDATE)[0].params).toEqual([9, 7, 'Noviembre a fondo', null, 8, null, 'INACTIVOS', '2026-11-01', '2026-11-30']);
    expect(sincronizarEstados).toHaveBeenCalledWith(expect.anything(), 7);
    expect(llamadas(/FROM reto_miembro WHERE id_reto = \$1 AND estado = 'EN_CURSO'/)).toHaveLength(0);
    expect(recalcularYAvisar).not.toHaveBeenCalled();
  });

  test('should answer 400 VALIDATION_ERROR without saving when the new end date is before the saved start date', async () => {
    // Arrange
    responder(elReto());

    // Act
    const r = await pedir('put', '/admin/retos/9').send({ fecha_fin: '2026-10-31' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'La fecha de fin no puede ser anterior a la de inicio.', code: 'VALIDATION_ERROR' });
    expect(llamadas(UPDATE)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/retos/:id/cancelar: cancel a challenge', () => {
  test('should roll back, release the client and answer 503 DB_UNREACHABLE when the participations cannot be cancelled', async () => {
    // Arrange
    responder(elReto(), [/UPDATE reto SET estado = 'CANCELADO', activo = FALSE/, () => ({ rows: [], rowCount: 1 })]);
    cancelarParticipaciones.mockRejectedValue(new Error('fallo de la BD'));

    // Act
    const r = await pedir('post', '/admin/retos/9/cancelar');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cancelar el reto.', code: 'DB_UNREACHABLE' });
    expect(cancelarParticipaciones).toHaveBeenCalledWith(expect.anything(), { idReto: 9, gymId: 7, nombreReto: 'Noviembre activo' });
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
  });
});

// ===========================================================================
describe('GET /api/admin/retos/:id/participantes: the progress of each enrolled member', () => {
  const PARTICIPANTES = /FROM reto_miembro rm\s+JOIN miembro m ON m\.id_miembro = rm\.id_miembro AND m\.id_gimnasio = \$2/;

  test('should answer the challenge and its participants of the gym of the admin', async () => {
    // Arrange
    const participantes = [
      { id_reto_miembro: 70, id_miembro: 41, nombre: 'Ana Ruiz', documento: '1020', estado: 'COMPLETADO', checkins_acumulados: 8, porcentaje_avance: 100 },
      { id_reto_miembro: 71, id_miembro: 42, nombre: 'Beto Gil', documento: '1030', estado: 'EN_CURSO', checkins_acumulados: 3, porcentaje_avance: 37.5 },
    ];
    responder(elReto(), [PARTICIPANTES, filas(participantes)]);

    // Act
    const r = await pedir('get', '/admin/retos/9/participantes');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ reto: RETO, participantes });
    expect(llamadas(PARTICIPANTES)[0].params).toEqual([9, 7]);
  });

  test('should answer 404 NOT_FOUND without reading participants when the challenge is not of the gym of the admin', async () => {
    // Arrange
    responder(elReto([]));

    // Act
    const r = await pedir('get', '/admin/retos/99/participantes');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Reto no encontrado.', code: 'NOT_FOUND' });
    expect(llamadas(PARTICIPANTES)).toHaveLength(0);
  });

  test.each(['abc', '0', '9.5', '09'])('should answer 400 VALIDATION_ERROR without touching the database when the challenge id is %s', async (id) => {
    // Act
    const r = await pedir('get', `/admin/retos/${id}/participantes`);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id de reto invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/reto/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('/api/admin/retos/:id/elegibles and /inscribir: the eligible members', () => {
  const INSCRIBIR = /INSERT INTO reto_miembro \(id_reto, id_miembro\) VALUES/;

  test('should count only the members of the segment that are not enrolled yet', async () => {
    // Arrange
    responder(elReto(), delSegmento([ANA, BETO, CARLA]), yaInscritos([41]));

    // Act
    const r = await pedir('get', '/admin/retos/9/elegibles');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ total: 2, miembros: [BETO, CARLA] });
    // El segmento del reto (INACTIVOS) con sus dias por defecto.
    expect(llamadas(/FROM miembro m/)[0].params).toEqual([7, 7]);
    expect(llamadas(/SELECT id_miembro FROM reto_miembro/)[0].params).toEqual([9]);
  });

  test('should enroll only the requested ids that are eligible and recalculate each new participation when ids are sent', async () => {
    // Arrange: Beto entra, Carla ya se habia unido desde la app (ON CONFLICT) y el 99 no es elegible
    responder(
      elReto(),
      delSegmento([ANA, BETO, CARLA]),
      yaInscritos([41]),
      [INSCRIBIR, (p) => ({ rows: p[1] === 42 ? [{ id_reto_miembro: 72 }] : [] })],
    );

    // Act
    const r = await pedir('post', '/admin/retos/9/inscribir').send({ ids: [42, '43', 99] });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ inscritos: 1 });
    expect(llamadas(INSCRIBIR).map(({ params }) => params)).toEqual([[9, 42], [9, 43]]);
    expect(recalcularYAvisar).toHaveBeenCalledTimes(1);
    expect(recalcularYAvisar).toHaveBeenCalledWith(expect.anything(), { idRetoMiembro: 72, idReto: 9, idMiembro: 42, gymId: 7 });
  });

  test('should enroll every eligible member when the list of ids comes empty', async () => {
    // Arrange
    responder(elReto(), delSegmento([BETO, CARLA]), yaInscritos([]), [INSCRIBIR, (p) => ({ rows: [{ id_reto_miembro: 30 + p[1] }] })]);

    // Act
    const r = await pedir('post', '/admin/retos/9/inscribir').send({ ids: [] });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ inscritos: 2 });
    expect(recalcularYAvisar).toHaveBeenCalledTimes(2);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when an id is not a positive number', async () => {
    // Act
    const r = await pedir('post', '/admin/retos/9/inscribir').send({ ids: [42, -1] });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['ids', 1]);
    expect(llamadas(/reto/)).toHaveLength(0);
  });
});
