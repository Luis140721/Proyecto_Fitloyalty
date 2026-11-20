/**
 * Cobertura del backend (capa API, Luis): registro del gimnasio y baja de la
 * cuenta en routes/auth.js.
 *
 * Que se prueba:
 *  - POST /api/auth/signup (RQF-19): crea el gimnasio y su admin dueño en una
 *    sola transaccion (BEGIN ... COMMIT, o ROLLBACK si algo falla). Validacion,
 *    correo duplicado, dias de prueba (trial_ends_at) y cuentas de desarrollo,
 *    gimnasio.id_dueno (tambien en una BD que aun no tiene esa columna) y el
 *    token, el usuario y el gimnasio que recibe el front. Los largos maximos ya
 *    estan en signup-longitudes.test.js y no se repiten aqui.
 *  - DELETE /api/auth/account (RQF-22, Ley 1581 de 2012): solo el dueño del
 *    gimnasio y solo con su contrasena, revisado antes de abrir la transaccion;
 *    cada tabla se borra en su SAVEPOINT y el gimnasio al final; ante un error
 *    no queda nada borrado.
 *  - GET /api/auth/me (perfil, 404 y BD caida) y POST /api/auth/logout.
 * El login y la recuperacion de clave estan en auth-rutas.test.js (otra asignacion).
 *
 * Dobles de este archivo (el tipo de cada test va en un comentario):
 *  - BD: fake definido en este archivo. Responde segun el SQL con las reglas de
 *    cada test y lanza si llega un SQL que no conoce. connect() entrega un
 *    cliente { query, release } que imita lo minimo de una transaccion de
 *    PostgreSQL: tras un error la transaccion queda abortada (25P02) hasta un
 *    ROLLBACK TO SAVEPOINT o un ROLLBACK, volver a un SAVEPOINT que no existe
 *    falla (3B001) y solo las escrituras de un COMMIT quedan en `confirmadas`.
 *    Para el INSERT del gimnasio calcula trial_ends_at como lo haria el CASE del
 *    SQL, con un NOW() fijo. Los tests verifican ese estado: que se escribio,
 *    con que parametros y si quedo confirmado o deshecho.
 *  - Lectura del personal en authenticate: stub con establecerBusquedaPersonal;
 *    el rol que devuelve es el "de la BD" (rolEnBd).
 *  - Correo: dummy. Estas rutas no envian correos; el modulo solo ocupa el lugar
 *    para que cargar auth.js no dependa de Brevo.
 *  - console.error y console.info: spy, para verificar el registro sin ensuciar
 *    la salida.
 * bcryptjs, jsonwebtoken y zod son los reales. Sin red, sin BD real y sin puertos.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: (...a) => mockBd.connect(...a),
}));
jest.mock('../src/lib/email', () => ({ sendRecoveryCode: () => { throw new Error('estas rutas no envian correo'); } }));

const authRouter = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const UN_DIA = 24 * 60 * 60 * 1000;
// NOW() de la BD falsa: fijo, asi trial_ends_at no depende del dia en que corras el test.
const AHORA_BD = new Date('2026-11-19T15:00:00.000Z');
const HASH = bcrypt.hashSync('clave123', 4);

// ---------------------------------------------------------------------------
// BD falsa
// ---------------------------------------------------------------------------
const errorPg = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);
/** Respuesta de una regla que falla como fallaria PostgreSQL. */
const falla = (code, message, extra) => () => { throw errorPg(code, message, extra); };

/**
 * reglas: [[patron, respuesta]], la primera que coincide gana. La respuesta es
 * un objeto { rows, rowCount } o una funcion (params, sql) que lo devuelve o lanza.
 */
function crearBd(reglas) {
  const bd = { llamadas: [], conexiones: 0, liberadas: 0, tx: null, confirmadas: [] };
  let pendientes = [];
  let savepoints = [];
  let abortada = false;

  function responder(sql, params) {
    const regla = reglas.find(([patron]) => patron.test(sql));
    if (!regla) throw new Error(`SQL inesperado en la BD falsa: ${sql}`);
    const r = typeof regla[1] === 'function' ? regla[1](params, sql) : regla[1];
    return { rows: [], rowCount: 0, ...r };
  }

  function buscarSavepoint(nombre) {
    const i = savepoints.map((s) => s.nombre).lastIndexOf(nombre);
    if (i === -1) {
      abortada = true;
      throw errorPg('3B001', `savepoint "${nombre}" does not exist`);
    }
    return i;
  }

  async function queryCliente(sql, params) {
    bd.llamadas.push({ via: 'client', sql, params });
    const s = sql.trim();
    const vacio = { rows: [], rowCount: 0 };
    if (s === 'BEGIN') { bd.tx = 'abierta'; pendientes = []; savepoints = []; abortada = false; return vacio; }
    if (s === 'ROLLBACK') { bd.tx = 'deshecha'; pendientes = []; abortada = false; return vacio; }
    if (s === 'COMMIT') {
      // Como PostgreSQL: el COMMIT de una transaccion abortada la deshace.
      if (abortada) bd.tx = 'deshecha';
      else { bd.tx = 'confirmada'; bd.confirmadas.push(...pendientes); }
      pendientes = [];
      return vacio;
    }
    let m = /^ROLLBACK TO SAVEPOINT (\w+)$/.exec(s);
    if (m) {
      const i = buscarSavepoint(m[1]);
      pendientes = pendientes.slice(0, savepoints[i].marca);
      savepoints = savepoints.slice(0, i + 1);
      abortada = false;
      return vacio;
    }
    if (abortada) throw errorPg('25P02', 'current transaction is aborted, commands ignored until end of transaction block');
    m = /^SAVEPOINT (\w+)$/.exec(s);
    if (m) { savepoints.push({ nombre: m[1], marca: pendientes.length }); return vacio; }
    m = /^RELEASE SAVEPOINT (\w+)$/.exec(s);
    if (m) { savepoints = savepoints.slice(0, buscarSavepoint(m[1])); return vacio; }
    try {
      const r = responder(sql, params);
      if (/^(INSERT|UPDATE|DELETE)\b/i.test(s)) pendientes.push({ sql: s, params });
      return r;
    } catch (err) {
      abortada = true;
      throw err;
    }
  }

  bd.query = async (sql, params) => {
    bd.llamadas.push({ via: 'pool', sql, params });
    return responder(sql, params);
  };
  bd.connect = async () => {
    bd.conexiones += 1;
    return { query: queryCliente, release: () => { bd.liberadas += 1; } };
  };
  return bd;
}

/** 'INSERT INTO gimnasio', 'UPDATE gimnasio', 'DELETE FROM pago'... */
const operacion = (sql) => sql.trim().match(/^(INSERT INTO|UPDATE|DELETE FROM) (\w+)/).slice(1).join(' ');
const escrituras = () => mockBd.confirmadas.map((e) => [operacion(e.sql), e.params]);
const tablasBorradas = () => mockBd.confirmadas.map((e) => operacion(e.sql)).filter((o) => o.startsWith('DELETE FROM ')).map((o) => o.slice(12));
const llamadas = (patron) => mockBd.llamadas.filter(({ sql }) => patron.test(sql));

// ---------------------------------------------------------------------------
// Entorno y autenticacion
// ---------------------------------------------------------------------------
let rolEnBd;
const tokenDe = (extra = {}) => jwt.sign({ id: 1, name: 'Luis Dueño', email: 'luis@gym.co', role: 'admin', gymId: 7, ...extra }, SECRETO, { expiresIn: '1h' });

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: rolEnBd }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  // Copia del entorno: los dias de prueba y la vigencia del token no dependen de tu .env.
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  delete process.env.TRIAL_DAYS;
  delete process.env.DEV_EMAILS;
  delete process.env.JWT_EXPIRES_IN;
  rolEnBd = 'ADMINISTRADOR';
  mockBd = crearBd([]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('POST /api/auth/signup: gym and owner in one transaction', () => {
  const GYM = 12, DUENO = 41;
  const REGISTRO = {
    gymName: '  Gym Central  ',
    gymPhone: '300 123 4567',
    gymEmail: 'Contacto@Gym.co',
    ownerName: '  Ana Perez  ',
    ownerEmail: 'Ana@Gym.co',
    password: 'clave123',
  };
  const registrar = (cuerpo = REGISTRO) => request(app).post('/api/auth/signup').send(cuerpo);

  /** Reglas del registro. `antes` va primero para poder hacer fallar una consulta. */
  function bdDeRegistro({ correoGymTomado = false, correoUsuarioTomado = false, antes = [] } = {}) {
    return crearBd([
      ...antes,
      [/FROM gimnasio WHERE LOWER\(email\)/, { rows: correoGymTomado ? [{ id_gimnasio: 3 }] : [] }],
      [/FROM usuario WHERE LOWER\(email\)/, { rows: correoUsuarioTomado ? [{ id_usuario: 9 }] : [] }],
      // Imita el CASE del SQL: con 0 dias trial_ends_at queda NULL (suscrito).
      [/^INSERT INTO gimnasio/, (p) => ({
        rowCount: 1,
        rows: [{ id_gimnasio: GYM, nombre: p[0], telefono: p[1], email: p[2], activo: true,
          trial_ends_at: Number(p[3]) === 0 ? null : new Date(AHORA_BD.getTime() + Number(p[3]) * UN_DIA) }],
      })],
      [/^INSERT INTO usuario/, (p) => ({ rowCount: 1, rows: [{ id_usuario: DUENO, id_gimnasio: p[0], nombre: p[1], email: p[2], id_rol: 1 }] })],
      [/^UPDATE gimnasio SET id_dueno/, { rowCount: 1 }],
      [/^INSERT INTO configuracion_gimnasio/, { rowCount: 1 }],
    ]);
  }

  test('should commit the gym, the owner, id_dueno and the default config with the cleaned data when the signup is valid', async () => {
    // Doble: fake de la BD. Verifica estado: lo que quedo confirmado y con que
    // parametros (nombres recortados, telefono solo con digitos, correos en
    // minuscula y la clave guardada como hash de bcrypt, nunca en claro).
    // Arrange
    mockBd = bdDeRegistro();

    // Act
    const r = await registrar();

    // Assert
    expect(r.status).toBe(201);
    expect(mockBd.tx).toBe('confirmada');
    expect(escrituras()).toEqual([
      ['INSERT INTO gimnasio', ['Gym Central', '3001234567', 'contacto@gym.co', '14']],
      ['INSERT INTO usuario', [GYM, 'Ana Perez', 'ana@gym.co', expect.any(String)]],
      ['UPDATE gimnasio', [DUENO, GYM]],
      ['INSERT INTO configuracion_gimnasio', [GYM, DUENO]],
    ]);
    const hashGuardado = escrituras()[1][1][3];
    expect(hashGuardado).not.toBe('clave123');
    expect(await bcrypt.compare('clave123', hashGuardado)).toBe(true);
    expect(llamadas(/FROM gimnasio WHERE LOWER\(email\)/)[0].params).toEqual(['contacto@gym.co']);
    expect(llamadas(/FROM usuario WHERE LOWER\(email\)/)[0].params).toEqual(['ana@gym.co']);
    expect([mockBd.conexiones, mockBd.liberadas]).toEqual([1, 1]);
  });

  test('should return a session token and the owner as admin of the new gym without the password hash when the signup is valid', async () => {
    // Doble: fake de la BD. Verifica estado: la respuesta que usa el front para
    // entrar directo al panel. El token se verifica con jsonwebtoken real.
    // Arrange
    mockBd = bdDeRegistro();

    // Act
    const r = await registrar();

    // Assert
    expect(r.status).toBe(201);
    const payload = jwt.verify(r.body.token, SECRETO);
    expect(payload).toMatchObject({ id: DUENO, name: 'Ana Perez', email: 'ana@gym.co', role: 'admin', gymId: GYM });
    expect(payload.exp - payload.iat).toBe(8 * 60 * 60);
    expect(r.body.user).toEqual({
      id: DUENO, name: 'Ana Perez', email: 'ana@gym.co', role: 'admin', gymId: GYM,
      photoUrl: expect.stringContaining('ui-avatars.com'),
    });
    expect(JSON.stringify(r.body)).not.toContain(escrituras()[1][1][3]);
  });

  test.each([
    { caso: 'TRIAL_DAYS and DEV_EMAILS are not set', entorno: {}, dias: '14', trialDays: 14, devAccount: false,
      trialEndsAt: new Date(AHORA_BD.getTime() + 14 * UN_DIA).toISOString(), message: 'Gimnasio creado. Tienes 14 dias de prueba gratuita.' },
    { caso: 'TRIAL_DAYS is 30', entorno: { TRIAL_DAYS: '30' }, dias: '30', trialDays: 30, devAccount: false,
      trialEndsAt: new Date(AHORA_BD.getTime() + 30 * UN_DIA).toISOString(), message: 'Gimnasio creado. Tienes 30 dias de prueba gratuita.' },
    { caso: 'DEV_EMAILS lists only other emails', entorno: { DEV_EMAILS: 'otro@gym.co,dev@fitloyalty.test' }, dias: '14', trialDays: 14, devAccount: false,
      trialEndsAt: new Date(AHORA_BD.getTime() + 14 * UN_DIA).toISOString(), message: 'Gimnasio creado. Tienes 14 dias de prueba gratuita.' },
    { caso: 'DEV_EMAILS has the owner email with other case and spaces', entorno: { DEV_EMAILS: ' otro@gym.co , ANA@GYM.CO ,' }, dias: '0', trialDays: 14, devAccount: true,
      trialEndsAt: null, message: 'Cuenta de desarrollo creada. Trial desactivado (acceso ilimitado).' },
  ])('should save $dias trial days and answer devAccount $devAccount when $caso', async ({ entorno, dias, trialDays, devAccount, trialEndsAt, message }) => {
    // Doble: fake de la BD (calcula trial_ends_at como el CASE del SQL). Verifica
    // estado: el parametro de dias que llega al INSERT y el gimnasio que ve el front.
    // Arrange
    Object.assign(process.env, entorno);
    mockBd = bdDeRegistro();

    // Act
    const r = await registrar();

    // Assert
    expect(r.status).toBe(201);
    expect(escrituras()[0]).toEqual(['INSERT INTO gimnasio', [expect.any(String), expect.any(String), 'contacto@gym.co', dias]]);
    expect(r.body.message).toBe(message);
    expect(r.body.gym).toEqual({ id: GYM, nombre: 'Gym Central', trialEndsAt, trialDays, devAccount });
  });

  test.each([
    ['empty', ''],
    ['missing', undefined],
  ])('should skip the gym email check and save the gym without email when gymEmail is %s', async (_caso, gymEmail) => {
    // Doble: fake de la BD. Verifica estado: no se busca un correo de gimnasio que
    // no existe y la columna email queda en NULL, no en undefined ni ''.
    // Arrange
    mockBd = bdDeRegistro();

    // Act
    const r = await registrar({ ...REGISTRO, gymEmail });

    // Assert
    expect(r.status).toBe(201);
    expect(llamadas(/FROM gimnasio WHERE LOWER\(email\)/)).toHaveLength(0);
    expect(escrituras()[0][1][2]).toBeNull();
    expect(mockBd.tx).toBe('confirmada');
  });

  test.each([
    ['the body is empty', {}, 'El nombre del gimnasio es requerido'],
    ['the phone is not a Colombian mobile', { ...REGISTRO, gymPhone: '2001234567' }, 'El teléfono debe tener 10 dígitos colombianos y comenzar con 3'],
    ['the password has no digit', { ...REGISTRO, password: 'clavesegura' }, 'La contraseña debe tener al menos 6 caracteres, contener al menos un número y no incluir espacios'],
    ['the owner email has no domain', { ...REGISTRO, ownerEmail: 'ana@gym' }, 'El email no tiene un formato válido'],
    // Documenta el comportamiento actual (defecto reportado en lib/validators.js,
    // gymEmail con .or(z.literal(''))): zod responde el mensaje generico de la
    // union, en ingles, y no 'El email no tiene un formato válido'.
    ['the gym email is not valid', { ...REGISTRO, gymEmail: 'contacto-gym.co' }, 'Invalid input'],
  ])('should answer 400 VALIDATION_ERROR without opening a transaction when %s', async (_caso, cuerpo, mensaje) => {
    // Doble: fake de la BD sin reglas (cualquier SQL lanzaria). Verifica estado:
    // ni siquiera se pide una conexion; el detalle de zod va en details.issues.
    // Arrange: la BD falsa del beforeEach no tiene reglas

    // Act
    const r = await registrar(cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'VALIDATION_ERROR', error: mensaje, details: { issues: expect.any(Array) } });
    expect(mockBd.conexiones).toBe(0);
    expect(mockBd.llamadas).toEqual([]);
  });

  test.each([
    ['the gym email is already registered', { correoGymTomado: true }, 'GYM_EMAIL_TAKEN', 'Ya existe un gimnasio registrado con ese correo.'],
    ['the owner email already has a user', { correoUsuarioTomado: true }, 'USER_EMAIL_TAKEN', 'Ya existe un usuario con ese correo.'],
  ])('should answer 409, roll back and create nothing when %s', async (_caso, opciones, code, error) => {
    // Doble: fake de la BD con el correo ya usado. Verifica estado: la transaccion
    // queda deshecha, no se intenta ningun INSERT y la conexion vuelve al pool.
    // Arrange
    mockBd = bdDeRegistro(opciones);

    // Act
    const r = await registrar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error, code });
    expect(mockBd.tx).toBe('deshecha');
    expect(llamadas(/^INSERT/)).toHaveLength(0);
    expect(mockBd.liberadas).toBe(1);
  });

  test('should create the account without id_dueno when the database has no id_dueno column yet (42703)', async () => {
    // Doble: fake de la BD donde el UPDATE de id_dueno falla con 42703 (una BD sin
    // la migracion 013). Como en PostgreSQL, sin volver al SAVEPOINT todo lo que
    // sigue fallaria. Verifica estado: el resto quedo confirmado.
    // Arrange
    mockBd = bdDeRegistro({ antes: [[/^UPDATE gimnasio SET id_dueno/, falla('42703', 'column "id_dueno" of relation "gimnasio" does not exist')]] });

    // Act
    const r = await registrar();

    // Assert
    expect(r.status).toBe(201);
    expect(mockBd.tx).toBe('confirmada');
    expect(escrituras().map(([op]) => op)).toEqual(['INSERT INTO gimnasio', 'INSERT INTO usuario', 'INSERT INTO configuracion_gimnasio']);
  });

  test.each([
    ['saving the gym fails', /^INSERT INTO gimnasio/, undefined, 'conexion perdida'],
    ['saving the owner fails', /^INSERT INTO usuario/, undefined, 'conexion perdida'],
    ['setting id_dueno fails with an error other than a missing column', /^UPDATE gimnasio SET id_dueno/, '23503', 'viola la llave foranea gimnasio_id_dueno_fkey'],
    ['saving the default config fails', /^INSERT INTO configuracion_gimnasio/, undefined, 'conexion perdida'],
  ])('should roll back everything, log the error and answer 500 when %s', async (_caso, consulta, code, mensaje) => {
    // Dobles: fake de la BD que falla en esa consulta y spy en console.error.
    // Verifica estado (nada confirmado, conexion liberada) y comportamiento (el
    // error quedo en el log del servidor).
    // Arrange
    mockBd = bdDeRegistro({ antes: [[consulta, falla(code, mensaje)]] });

    // Act
    const r = await registrar();

    // Assert
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('INTERNAL_ERROR');
    expect(mockBd.tx).toBe('deshecha');
    expect(mockBd.confirmadas).toEqual([]);
    expect(mockBd.liberadas).toBe(1);
    expect(console.error).toHaveBeenCalledWith('[POST /auth/signup] Error:', mensaje, expect.any(String));
  });

  test('should answer 409 USER_EMAIL_TAKEN in the contract and roll back when a concurrent signup took the owner email after the check (23505)', async () => {
    // Doble: fake de la BD donde el chequeo no ve el correo, pero otro registro lo
    // guarda antes que este INSERT y PostgreSQL responde con el UNIQUE de
    // usuario.email. Verifica la salida (el mismo 409 que da el chequeo, no un
    // 500) y el estado (nada confirmado, conexion liberada).
    // Arrange
    mockBd = bdDeRegistro({ antes: [[/^INSERT INTO usuario/, falla('23505', 'duplicate key value violates unique constraint "usuario_email_key"', { constraint: 'usuario_email_key' })]] });

    // Act
    const r = await registrar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body).toEqual({ error: 'Ya existe un usuario con ese correo.', code: 'USER_EMAIL_TAKEN' });
    expect(mockBd.tx).toBe('deshecha');
    expect(mockBd.confirmadas).toEqual([]);
    expect(mockBd.liberadas).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /api/auth/account: only the owner, with the password, deletes the gym', () => {
  const GYM = 7, LUIS = 1;
  // Filas que "tiene" cada tabla en la BD falsa; las demas devuelven 0.
  const FILAS = { miembro: 3, membresia: 4, pago: 6, usuario: 2, gimnasio: 1 };
  const TOTAL_FILAS = 3 + 4 + 6 + 2 + 1;
  // Tablas con datos del gimnasio o de personas que la ley obliga a borrar.
  const TABLAS_DEL_GIMNASIO = [
    'usuario', 'sesion', 'password_reset', 'miembro', 'membresia', 'pago', 'congelacion_membresia',
    'checkin', 'plan_cobro', 'plan_membresia', 'invitacion_staff', 'auditoria', 'configuracion_gimnasio',
    'config_gimnasio', 'canal_comunicacion', 'plantilla_mensaje', 'campana', 'campana_destinatario',
    'envio_mensaje', 'contrato_enviado', 'alerta_abandono', 'alerta_vencimiento_enviada', 'hito_miembro',
    'hito_gamificacion', 'reto', 'reto_miembro', 'notificacion', 'miembro_etiqueta', 'etiqueta_comportamiento',
  ];
  const borrarCuenta = (cuerpo = { password: 'clave123' }, token = tokenDe()) =>
    request(app).delete('/api/auth/account').set('Authorization', `Bearer ${token}`).send(cuerpo);

  /** Reglas de la baja. La consulta de la cuenta debe preguntar por id_dueno. */
  function bdDeBaja({ cuenta = { password_hash: HASH, es_dueno: true }, antes = [] } = {}) {
    return crearBd([
      ...antes,
      [/SELECT u\.password_hash[\s\S]*id_dueno[\s\S]*FROM usuario u/, { rows: cuenta ? [cuenta] : [] }],
      [/^DELETE FROM (\w+) WHERE/, (_p, sql) => ({ rowCount: FILAS[/^DELETE FROM (\w+)/.exec(sql)[1]] || 0 })],
    ]);
  }
  const consultaDeCuenta = () => llamadas(/SELECT u\.password_hash/);

  test('should delete every table of the gym, the gym last, in one committed transaction when the owner confirms with the password', async () => {
    // Dobles: fake de la BD y spy en console.info. Verifica estado: que quedo
    // borrado y confirmado, siempre con el id del gimnasio, cada tabla antes de
    // la tabla a la que apunta (Neon casi no tiene ON DELETE CASCADE) y el
    // gimnasio de ultimo; y el rastro del log solo con ids.
    // Arrange
    mockBd = bdDeBaja();

    // Act
    const r = await borrarCuenta({ password: 'clave123', reason: 'Cerramos la sede' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      message: 'Cuenta eliminada. Todos los datos del gimnasio fueron borrados de forma permanente.',
      deleted: { gymId: GYM, filas: TOTAL_FILAS },
    });
    expect(mockBd.tx).toBe('confirmada');
    const tablas = tablasBorradas();
    expect(tablas).toEqual(expect.arrayContaining(TABLAS_DEL_GIMNASIO));
    expect(tablas[tablas.length - 1]).toBe('gimnasio');
    const antesDe = (hija, madre) => tablas.indexOf(hija) < tablas.indexOf(madre);
    expect([
      ['pago', 'membresia'], ['congelacion_membresia', 'membresia'], ['membresia', 'plan_membresia'],
      ['membresia', 'miembro'], ['checkin', 'miembro'], ['hito_miembro', 'miembro'], ['campana_destinatario', 'campana'],
      ['reto_miembro', 'reto'], ['sesion', 'usuario'], ['password_reset', 'usuario'], ['auditoria', 'usuario'],
    ].filter(([hija, madre]) => !antesDe(hija, madre))).toEqual([]);
    expect(mockBd.confirmadas.every((e) => e.params.length === 1 && e.params[0] === GYM)).toBe(true);
    expect(mockBd.liberadas).toBe(1);
    expect(console.info).toHaveBeenCalledWith(`[DELETE /auth/account] Gimnasio ${GYM} eliminado por el usuario ${LUIS} (Ley 1581/2012): ${TOTAL_FILAS} filas.`);
  });

  test.each([
    { caso: 'the token has no gym', token: () => tokenDe({ gymId: null }), rol: 'ADMINISTRADOR', cuerpo: { password: 'clave123' },
      status: 400, code: 'NO_GYM', error: 'Cuenta sin gimnasio asociado.' },
    { caso: 'the database says the user is a receptionist', token: () => tokenDe(), rol: 'RECEPCIONISTA', cuerpo: { password: 'clave123' },
      status: 403, code: 'NOT_ADMIN', error: 'Solo el administrador del gimnasio puede eliminar la cuenta.' },
    { caso: 'the database says the user is a trainer', token: () => tokenDe(), rol: 'ENTRENADOR', cuerpo: { password: 'clave123' },
      status: 403, code: 'NOT_ADMIN', error: 'Solo el administrador del gimnasio puede eliminar la cuenta.' },
    { caso: 'the body has no password', token: () => tokenDe(), rol: 'ADMINISTRADOR', cuerpo: {},
      status: 400, code: 'VALIDATION_ERROR', error: 'Escribe tu contrasena para confirmar.' },
    { caso: 'the password is empty', token: () => tokenDe(), rol: 'ADMINISTRADOR', cuerpo: { password: '' },
      status: 400, code: 'VALIDATION_ERROR', error: 'Escribe tu contrasena para confirmar.' },
    { caso: 'the reason is longer than 1000 characters', token: () => tokenDe(), rol: 'ADMINISTRADOR', cuerpo: { password: 'clave123', reason: 'x'.repeat(1001) },
      status: 400, code: 'VALIDATION_ERROR', error: expect.any(String) },
  ])('should answer $status $code without reading or deleting anything when $caso', async ({ token, rol, cuerpo, status, code, error }) => {
    // Dobles: stub de authenticate con el rol de la BD y fake de la BD. Verifica
    // estado: la peticion se corta antes de cualquier consulta y no se pide
    // conexion. El rol que cuenta es el de la BD, no el del token (que dice admin).
    // Arrange
    rolEnBd = rol;
    mockBd = bdDeBaja();

    // Act
    const r = await borrarCuenta(cuerpo, token());

    // Assert
    expect(r.status).toBe(status);
    expect(r.body).toMatchObject({ code, error });
    expect(mockBd.llamadas).toEqual([]);
    expect(mockBd.conexiones).toBe(0);
  });

  test.each([
    { caso: 'the user is no longer active in that gym', cuenta: null, password: 'clave123',
      status: 404, code: 'USER_NOT_FOUND' },
    { caso: 'the admin is not the gym owner, even with the right password', cuenta: { password_hash: HASH, es_dueno: false }, password: 'clave123',
      status: 403, code: 'NOT_OWNER' },
    { caso: 'the owner types a wrong password', cuenta: { password_hash: HASH, es_dueno: true }, password: 'clave124',
      status: 403, code: 'WRONG_PASSWORD' },
  ])('should answer $status $code and open no transaction when $caso', async ({ cuenta, password, status, code }) => {
    // Doble: fake de la BD con la cuenta que devuelve la consulta del dueño (el
    // calculo de es_dueno con gimnasio.id_dueno lo hace el SQL). Verifica estado:
    // la consulta se hizo con el usuario y el gimnasio del token y no se borro
    // nada. Con la clave mala es 403 y no 401, para que el front no cierre la sesion.
    // Arrange
    mockBd = bdDeBaja({ cuenta });

    // Act
    const r = await borrarCuenta({ password });

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
    expect(consultaDeCuenta().map((c) => c.params)).toEqual([[LUIS, GYM]]);
    expect(mockBd.conexiones).toBe(0);
    expect(llamadas(/^DELETE/)).toHaveLength(0);
  });

  test('should answer 503 DB_UNREACHABLE and open no transaction when reading the account fails', async () => {
    // Dobles: fake de la BD que falla al leer la cuenta y spy en console.error.
    // Verifica estado (no se pidio conexion) y comportamiento (el error quedo en el log).
    // Arrange
    mockBd = bdDeBaja({ antes: [[/SELECT u\.password_hash/, falla('57P01', 'conexion perdida')]] });

    // Act
    const r = await borrarCuenta();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(mockBd.conexiones).toBe(0);
    expect(console.error).toHaveBeenCalledWith('[DELETE /auth/account] Error consultando usuario:', '57P01', 'conexion perdida');
  });

  test.each([
    ['42P01', 'the table does not exist in this schema', 'relation "alerta_abandono" does not exist'],
    ['42703', 'a column does not exist in this schema', 'column "id_gimnasio" does not exist'],
  ])('should skip that step and still delete the rest when a step fails with %s (%s)', async (code, _caso, mensaje) => {
    // Doble: fake de la BD donde el DELETE de alerta_abandono falla como en una BD
    // de Docker sin esa tabla. Sin volver al SAVEPOINT, PostgreSQL rechazaria todo
    // lo demas (25P02). Verifica estado: lo demas quedo borrado y confirmado.
    // Arrange
    mockBd = bdDeBaja({ antes: [[/^DELETE FROM alerta_abandono/, falla(code, mensaje)]] });

    // Act
    const r = await borrarCuenta();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.deleted).toEqual({ gymId: GYM, filas: TOTAL_FILAS });
    expect(mockBd.tx).toBe('confirmada');
    expect(tablasBorradas()).not.toContain('alerta_abandono');
    expect(tablasBorradas()).toEqual(expect.arrayContaining(['miembro', 'usuario', 'gimnasio']));
  });

  test.each([
    // Una tabla nueva que apunta a usuario sin CASCADE: el log dice que tabla y que llave.
    { caso: 'deleting a step violates a foreign key', consulta: /^DELETE FROM usuario/, code: '23503', mensaje: 'viola la llave foranea',
      extra: { constraint: 'clase_id_entrenador_fkey' }, log: ['23503', 'usuario', 'clase_id_entrenador_fkey', 'viola la llave foranea'] },
    // El DELETE del gimnasio no va en un paso: no hay tabla ni llave que mostrar.
    { caso: 'the connection drops while deleting the gym', consulta: /^DELETE FROM gimnasio/, code: '57P01', mensaje: 'conexion perdida',
      extra: {}, log: ['57P01', '', '', 'conexion perdida'] },
  ])('should roll back everything, log the cause and answer 500 DELETE_FAILED when $caso', async ({ consulta, code, mensaje, extra, log }) => {
    // Dobles: fake de la BD que falla en esa consulta y spy en console.error.
    // Verifica estado (nada borrado: todo o nada, conexion liberada) y
    // comportamiento (lo que queda en el log para diagnosticar).
    // Arrange
    mockBd = bdDeBaja({ antes: [[consulta, falla(code, mensaje, extra)]] });

    // Act
    const r = await borrarCuenta();

    // Assert
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('DELETE_FAILED');
    expect(mockBd.tx).toBe('deshecha');
    expect(mockBd.confirmadas).toEqual([]);
    expect(mockBd.liberadas).toBe(1);
    expect(console.error).toHaveBeenCalledWith('[DELETE /auth/account] Error:', ...log);
  });

  test('should roll back and answer 404 GYM_NOT_FOUND when the gym was already deleted', async () => {
    // Doble: fake de la BD donde el DELETE del gimnasio no encuentra filas (otra
    // peticion lo borro antes). Verifica estado: no queda nada confirmado.
    // Arrange
    mockBd = bdDeBaja({ antes: [[/^DELETE FROM gimnasio/, { rowCount: 0 }]] });

    // Act
    const r = await borrarCuenta();

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'El gimnasio de esta cuenta ya no existe.', code: 'GYM_NOT_FOUND' });
    expect(mockBd.tx).toBe('deshecha');
    expect(mockBd.confirmadas).toEqual([]);
    expect(mockBd.liberadas).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/auth/me and POST /api/auth/logout', () => {
  const perfil = () => request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenDe()}`);
  const reglaPerfil = /SELECT u\.\*[\s\S]*FROM usuario u[\s\S]*INNER JOIN gimnasio g/;
  const FILA = {
    id_usuario: 1, nombre: 'Luis Dueño', email: 'luis@gym.co', password_hash: HASH, id_gimnasio: 7, id_rol: 1,
    rol: 'ADMINISTRADOR', activo: true, foto_url: 'https://cdn.test/luis.jpg',
    gym_activo: true, trial_ends_at: '2026-12-03T15:00:00.000Z', gym_nombre: 'Gym Central', gym_logo: 'https://cdn.test/logo.png',
  };

  test('should return the profile and the gym without the password hash when the user is active', async () => {
    // Doble: fake de la BD con la fila de usuario y gimnasio. Verifica estado: la
    // respuesta y que la consulta usa el id del token.
    // Arrange
    mockBd = crearBd([[reglaPerfil, { rows: [FILA] }]]);

    // Act
    const r = await perfil();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      user: { id: 1, name: 'Luis Dueño', email: 'luis@gym.co', role: 'admin', gymId: 7, photoUrl: 'https://cdn.test/luis.jpg' },
      gym: { id: 7, name: 'Gym Central', logoUrl: 'https://cdn.test/logo.png', active: true, trialEndsAt: '2026-12-03T15:00:00.000Z' },
    });
    expect(JSON.stringify(r.body)).not.toContain(HASH);
    expect(llamadas(reglaPerfil).map((c) => c.params)).toEqual([[1]]);
  });

  test('should answer 404 USER_NOT_FOUND when the profile query finds no active user', async () => {
    // Doble: fake de la BD sin filas (usuario inactivo o borrado). Verifica estado:
    // el 404 llega tal cual y no se convierte en el 503 de BD caida.
    // Arrange
    mockBd = crearBd([[reglaPerfil, { rows: [] }]]);

    // Act
    const r = await perfil();

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
  });

  test('should answer 503 DB_UNREACHABLE and log the error when the profile query fails', async () => {
    // Dobles: fake de la BD que falla y spy en console.error. Verifica estado (la
    // respuesta) y comportamiento (el registro del error).
    // Arrange
    mockBd = crearBd([[reglaPerfil, falla(undefined, 'conexion perdida')]]);

    // Act
    const r = await perfil();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar tu perfil. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith('[GET /auth/me] Error:', 'conexion perdida');
  });

  test('should confirm the logout without touching the database when the token is valid', async () => {
    // Doble: fake de la BD sin reglas (cualquier SQL lanzaria). Verifica estado:
    // el JWT no tiene estado en el servidor; el front borra el token.
    // Arrange: la BD falsa del beforeEach no tiene reglas

    // Act
    const r = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${tokenDe()}`);

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'Sesion cerrada' });
    expect(mockBd.llamadas).toEqual([]);
  });

  test.each([
    ['get', '/api/auth/me'],
    ['post', '/api/auth/logout'],
    ['delete', '/api/auth/account'],
  ])('should answer 401 AUTH_REQUIRED and touch no data when %s %s has no token', async (metodo, ruta) => {
    // Doble: fake de la BD sin reglas. Verifica estado: la ruta esta protegida por
    // authenticate y no llega a consultar ni a borrar nada.
    // Arrange: la peticion va sin header Authorization

    // Act
    const r = await request(app)[metodo](ruta).send({ password: 'clave123' });

    // Assert
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('AUTH_REQUIRED');
    expect(mockBd.llamadas).toEqual([]);
    expect(mockBd.conexiones).toBe(0);
  });
});
