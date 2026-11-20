/**
 * Configuracion del gimnasio (routes/config.js): precios de los planes, dias
 * de aviso de vencimiento (RQF-14) y los hitos de gamificacion (RQF-11).
 *
 * Sale del analisis de ramas sin cubrir del backend de la semana 8: config.js
 * tenia 37 ramas sin cubrir. Los umbrales de abandono (RQF-08) ya estan en
 * abandono.test.js y los permisos (solo el admin) en api-seguridad-errores.test.js.
 *
 * Dobles:
 *  - BD: stub por consulta. Cada test declara que responde a que SQL; una
 *    consulta que no esta declarada lanza error. Las llamadas quedan anotadas
 *    para verificar que se escribio y con que datos.
 *  - Lectura del personal en authenticate: stub (el admin del gimnasio 7).
 *  - El authenticate, el authorize, el requireActiveTrial y zod son los reales.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockReglas = [];
let mockLlamadas = [];

async function mockEjecutar(sql, params = []) {
  mockLlamadas.push({ sql, params });
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
  for (const [patron, respuesta] of mockReglas) if (patron.test(sql)) return respuesta(params, sql);
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
}
jest.mock('../src/db/db', () => ({ query: (...a) => mockEjecutar(...a) }));

const configRouter = require('../src/routes/config');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', configRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const ADMIN = () => jwt.sign({ id: 1, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const pedir = (metodo, ruta) => request(app)[metodo](`/api${ruta}`).set('Authorization', `Bearer ${ADMIN()}`);

const responder = (...reglas) => { mockReglas = reglas; };
const filas = (rows) => () => ({ rows });
const falla = (code) => () => { const e = new Error('fallo de la BD'); if (code) e.code = code; throw e; };
const llamadas = (patron) => mockLlamadas.filter(({ sql }) => patron.test(sql));

// Lo que conDiasAviso agrega a toda respuesta: dias de aviso del gimnasio y umbrales.
const diasDeAviso = (dias = 5) => [/SELECT dias_aviso_vencimiento FROM gimnasio/, filas([{ dias_aviso_vencimiento: dias }])];
const umbrales = (fila = { umbral_alerta_amarilla: 6, umbral_alerta_roja: 12 }) => [/FROM configuracion_gimnasio/, filas(fila ? [fila] : [])];
const CONFIG = { id_config: 3, id_gimnasio: 7, plan_mensual_valor: '50000.00', plan_anual_valor: '480000.00' };

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockReglas = [];
  mockLlamadas = [];
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('GET /api/admin/config', () => {
  test('should create the default configuration and answer it with the notice days and the default thresholds when the gym has none yet', async () => {
    // Arrange
    responder(
      [/SELECT \* FROM config_gimnasio/, filas([])],
      [/INSERT INTO config_gimnasio \(id_gimnasio\)/, filas([{ id_config: 9, id_gimnasio: 7 }])],
      diasDeAviso(4),
      umbrales(null),
    );

    // Act
    const r = await pedir('get', '/admin/config');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.config).toEqual({ id_config: 9, id_gimnasio: 7, dias_aviso_vencimiento: 4, umbral_alerta_amarilla: 7, umbral_alerta_roja: 15 });
    expect(llamadas(/INSERT INTO config_gimnasio/)[0].params).toEqual([7]);
  });

  test('should answer 503 DB_UNREACHABLE when the configuration cannot be read', async () => {
    // Arrange
    responder([/FROM config_gimnasio/, falla()]);

    // Act
    const r = await pedir('get', '/admin/config');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar la configuración. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('PUT /api/admin/config', () => {
  test('should save the prices sent, also the NUMERIC text PostgreSQL returns, on the configuration of the gym', async () => {
    // Arrange
    responder(
      [/SELECT id_config FROM config_gimnasio/, filas([{ id_config: 3 }])],
      [/UPDATE config_gimnasio/, filas([{ ...CONFIG, plan_mensual_valor: '55000.00' }])],
      diasDeAviso(),
      umbrales(),
    );

    // Act
    const r = await pedir('put', '/admin/config').send({ plan_mensual_valor: '55000.00', plan_anual_valor: 480000 });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Configuración actualizada.');
    expect(r.body.config).toMatchObject({ plan_mensual_valor: '55000.00', dias_aviso_vencimiento: 5, umbral_alerta_amarilla: 6, umbral_alerta_roja: 12 });
    const [update] = llamadas(/UPDATE config_gimnasio/);
    expect(update.sql).toMatch(/SET plan_mensual_valor = \$1, plan_anual_valor = \$2, fecha_actualizacion = CURRENT_TIMESTAMP\s+WHERE id_gimnasio = \$3/);
    expect(update.params).toEqual([55000, 480000, 7]);
    expect(llamadas(/UPDATE gimnasio|configuracion_gimnasio \(|UPDATE configuracion_gimnasio/)).toHaveLength(0);
  });

  test('should create the configuration with the prices sent when the gym has none yet', async () => {
    // Arrange
    responder(
      [/SELECT id_config FROM config_gimnasio/, filas([])],
      [/INSERT INTO config_gimnasio/, filas([{ id_config: 9, id_gimnasio: 7, plan_mensual_valor: '50000.00', dias_prueba: 10 }])],
      diasDeAviso(),
      umbrales(),
    );

    // Act
    const r = await pedir('put', '/admin/config').send({ plan_mensual_valor: 50000, dias_prueba: 10 });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Configuración creada.');
    const [insert] = llamadas(/INSERT INTO config_gimnasio/);
    expect(insert.sql).toMatch(/INSERT INTO config_gimnasio \(id_gimnasio, plan_mensual_valor, dias_prueba\)\s+VALUES \(\$1, \$2, \$3\)/);
    expect(insert.params).toEqual([7, 50000, 10]);
  });

  test('should save 0 notice days in the gym, which turns off the WhatsApp notice, and answer the current configuration', async () => {
    // Arrange
    responder(
      [/UPDATE gimnasio SET dias_aviso_vencimiento/, filas([])],
      [/SELECT \* FROM config_gimnasio/, filas([CONFIG])],
      diasDeAviso(0),
      umbrales(),
    );

    // Act
    const r = await pedir('put', '/admin/config').send({ dias_aviso_vencimiento: 0 });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      message: 'Configuración actualizada.',
      config: { ...CONFIG, dias_aviso_vencimiento: 0, umbral_alerta_amarilla: 6, umbral_alerta_roja: 12 },
    });
    expect(llamadas(/UPDATE gimnasio SET dias_aviso_vencimiento/)[0].params).toEqual([0, 7]);
    expect(llamadas(/UPDATE config_gimnasio|INSERT INTO config_gimnasio/)).toHaveLength(0);
  });

  test('should answer only the notice days and the thresholds when the gym has no configuration row', async () => {
    // Arrange
    responder(
      [/UPDATE gimnasio SET dias_aviso_vencimiento/, filas([])],
      [/SELECT \* FROM config_gimnasio/, filas([])],
      diasDeAviso(2),
      umbrales(null),
    );

    // Act
    const r = await pedir('put', '/admin/config').send({ dias_aviso_vencimiento: 2 });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.config).toEqual({ dias_aviso_vencimiento: 2, umbral_alerta_amarilla: 7, umbral_alerta_roja: 15 });
  });

  test('should keep the saved yellow threshold when only the red one is sent', async () => {
    // Arrange
    responder(
      [/SELECT umbral_alerta_amarilla, umbral_alerta_roja FROM configuracion_gimnasio/, filas([{ umbral_alerta_amarilla: 6, umbral_alerta_roja: 12 }])],
      [/UPDATE configuracion_gimnasio/, filas([])],
      [/SELECT \* FROM config_gimnasio/, filas([CONFIG])],
      diasDeAviso(),
    );

    // Act
    const r = await pedir('put', '/admin/config').send({ umbral_alerta_roja: 20 });

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(/UPDATE configuracion_gimnasio/)[0].params).toEqual([7, 6, 20, 1]);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when nothing is sent', async () => {
    // Act
    const r = await pedir('put', '/admin/config').send({});

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Nada que actualizar', code: 'VALIDATION_ERROR' });
    expect(llamadas(/config_gimnasio|UPDATE gimnasio/)).toHaveLength(0);
  });

  test('should answer 503 DB_UNREACHABLE when the update fails', async () => {
    // Arrange
    responder([/SELECT id_config FROM config_gimnasio/, falla()]);

    // Act
    const r = await pedir('put', '/admin/config').send({ plan_mensual_valor: 50000 });

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos actualizar la configuración. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('/api/admin/hitos: the gamification milestones', () => {
  const HITO = { id_hito: 5, nombre: 'Racha de 7', tipo_hito: 'RACHA', valor_objetivo: 7, mensaje: '¡Siete días seguidos!', activo: true };
  const NUEVO = { nombre: '  Racha de 7  ', tipo_hito: 'RACHA', valor_objetivo: 7, mensaje: '¡Siete días seguidos!' };

  test('should list the milestones of the gym of the admin', async () => {
    // Arrange
    responder([/FROM hito_gamificacion/, filas([HITO])]);

    // Act
    const r = await pedir('get', '/admin/hitos');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ hitos: [HITO] });
    expect(llamadas(/FROM hito_gamificacion/)[0].params).toEqual([7]);
  });

  test('should answer 503 DB_UNREACHABLE when the milestones cannot be read', async () => {
    // Arrange
    responder([/FROM hito_gamificacion/, falla()]);

    // Act
    const r = await pedir('get', '/admin/hitos');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
  });

  test.each([
    ['active when activo is not sent', {}, true],
    ['inactive when activo is false', { activo: false }, false],
  ])('should create the milestone trimmed and %s', async (_caso, extra, activo) => {
    // Arrange
    responder([/INSERT INTO hito_gamificacion/, filas([{ ...HITO, activo }])]);

    // Act
    const r = await pedir('post', '/admin/hitos').send({ ...NUEVO, ...extra });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ hito: { ...HITO, activo } });
    expect(llamadas(/INSERT INTO hito_gamificacion/)[0].params).toEqual([7, 'Racha de 7', 'RACHA', 7, '¡Siete días seguidos!', activo]);
  });

  test('should answer 400 VALIDATION_ERROR without writing when the milestone type does not exist', async () => {
    // Act
    const r = await pedir('post', '/admin/hitos').send({ ...NUEVO, tipo_hito: 'PUNTOS' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['tipo_hito']);
    expect(llamadas(/hito_gamificacion/)).toHaveLength(0);
  });

  test.each([
    ['POST', 'post', '/admin/hitos', NUEVO, /INSERT INTO hito_gamificacion/],
    ['PUT', 'put', '/admin/hitos/5', { valor_objetivo: 7 }, /UPDATE hito_gamificacion/],
  ])('should answer 409 HITO_DUPLICADO on %s when the gym already has a milestone of that type and value', async (_m, metodo, ruta, cuerpo, patron) => {
    // Arrange: la restriccion UNIQUE (id_gimnasio, tipo_hito, valor_objetivo)
    responder([patron, falla('23505')]);

    // Act
    const r = await pedir(metodo, ruta).send(cuerpo);

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Ya existe un hito de ese tipo con ese valor.', code: 'HITO_DUPLICADO' });
  });

  test.each([
    ['POST', 'post', '/admin/hitos', NUEVO, /INSERT INTO hito_gamificacion/, 'No pudimos crear el hito. Intenta de nuevo.'],
    ['PUT', 'put', '/admin/hitos/5', { valor_objetivo: 7 }, /UPDATE hito_gamificacion/, 'No pudimos actualizar el hito. Intenta de nuevo.'],
    ['DELETE', 'delete', '/admin/hitos/5', undefined, /UPDATE hito_gamificacion/, 'No pudimos desactivar el hito. Intenta de nuevo.'],
  ])('should answer 503 DB_UNREACHABLE on %s when the database fails for another reason', async (_m, metodo, ruta, cuerpo, patron, mensaje) => {
    // Arrange
    responder([patron, falla('08006')]);

    // Act
    const r = await pedir(metodo, ruta).send(cuerpo);

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: mensaje, code: 'DB_UNREACHABLE' });
  });

  test('should update only the fields sent on the milestone of the gym of the admin', async () => {
    // Arrange
    responder([/UPDATE hito_gamificacion SET/, filas([{ ...HITO, valor_objetivo: 10, mensaje: '¡Diez!' }])]);

    // Act
    const r = await pedir('put', '/admin/hitos/5').send({ valor_objetivo: 10, mensaje: ' ¡Diez! ' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.hito).toMatchObject({ valor_objetivo: 10, mensaje: '¡Diez!' });
    const [update] = llamadas(/UPDATE hito_gamificacion/);
    expect(update.sql).toMatch(/SET valor_objetivo = \$1, mensaje = \$2\s+WHERE id_hito = \$3 AND id_gimnasio = \$4/);
    expect(update.params).toEqual([10, '¡Diez!', 5, 7]);
  });

  test('should answer 400 VALIDATION_ERROR on PUT without writing when the goal is below 1', async () => {
    // Act
    const r = await pedir('put', '/admin/hitos/5').send({ valor_objetivo: 0 });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['valor_objetivo']);
    expect(llamadas(/hito_gamificacion/)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR on PUT without writing when nothing is sent', async () => {
    // Act
    const r = await pedir('put', '/admin/hitos/5').send({});

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Nada que actualizar', code: 'VALIDATION_ERROR' });
    expect(llamadas(/hito_gamificacion/)).toHaveLength(0);
  });

  // DEFECTO (sin corregir, zona de Santiago): hitoSchema no tiene mensajes
  // propios y el admin ve el texto de zod en ingles. HitosConfig.jsx tiene
  // noValidate y muestra err.message, asi que una meta en 0 o vacia (Number('')
  // es 0) muestra «Number must be greater than or equal to 1». Pasa a verde
  // cuando el esquema de hitos explique el error en espanol.
  test.failing('should explain in Spanish why the milestone is not valid when the admin sends a goal of 0', async () => {
    // Act
    const r = await pedir('post', '/admin/hitos').send({ ...NUEVO, valor_objetivo: 0 });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.error).not.toMatch(/must be|expected|invalid|required/i);
  });

  test.each([
    ['PUT', 'put', { nombre: 'Otro' }],
    ['DELETE', 'delete', undefined],
  ])('should answer 404 NOT_FOUND on %s when the milestone is not of the gym of the admin', async (_m, metodo, cuerpo) => {
    // Arrange
    responder([/UPDATE hito_gamificacion/, filas([])]);

    // Act
    const r = await pedir(metodo, '/admin/hitos/99').send(cuerpo);

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Hito no encontrado.', code: 'NOT_FOUND' });
    expect(llamadas(/UPDATE hito_gamificacion/)[0].params.slice(-2)).toEqual([99, 7]);
  });

  test('should deactivate the milestone instead of deleting it, so the ones already given are kept', async () => {
    // Arrange
    responder([/UPDATE hito_gamificacion SET activo = FALSE/, filas([{ ...HITO, activo: false }])]);

    // Act
    const r = await pedir('delete', '/admin/hitos/5');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ hito: { ...HITO, activo: false } });
    expect(llamadas(/UPDATE hito_gamificacion SET activo = FALSE/)[0].params).toEqual([5, 7]);
    expect(llamadas(/DELETE/)).toHaveLength(0);
  });
});
