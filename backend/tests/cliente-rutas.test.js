/**
 * API de la app del miembro (routes/cliente.js): login por telefono y
 * contrasena, perfil, QR, plan, asistencia, logros y retos.
 *
 * Sale del analisis de ramas sin cubrir del backend de la semana 8: cliente.js
 * era el archivo con mas ramas sin cubrir (66 de 68).
 *
 * Dobles:
 *  - BD: stub por consulta. Cada test declara que responde a que SQL; una
 *    consulta que no esta declarada lanza error. Las llamadas quedan anotadas
 *    para verificar con que datos se filtra (siempre el miembro del token).
 *  - Sin red: bcrypt, jsonwebtoken y zod son los reales, y el authenticate y el
 *    requireClient tambien.
 *
 * Que el token del personal no entra a estas rutas ya lo prueba
 * api-seguridad-errores.test.js (403 CLIENT_ONLY).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

let mockReglas = [];
let mockLlamadas = [];

async function mockEjecutar(sql, params = []) {
  mockLlamadas.push({ sql, params });
  for (const [patron, respuesta] of mockReglas) if (patron.test(sql)) return respuesta(params, sql);
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
}
jest.mock('../src/db/db', () => ({ query: (...a) => mockEjecutar(...a) }));

const clienteRouter = require('../src/routes/cliente');
const { errorHandler } = require('../src/middleware/errorHandler');
const { generarTokenCliente } = require('../src/lib/auth-helpers');
const { datosParaApp } = require('../src/lib/qr-dinamico');

const app = express();
app.use(express.json());
app.use('/api/cliente', clienteRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const CLAVE = 'clave-del-miembro';
let hashDeLaClave;

// El miembro 41 del gimnasio 7, el de todos los tokens.
const MIEMBRO = { id_miembro: 41, id_gimnasio: 7, documento: '1020304050' };
const tokenDelMiembro = () => generarTokenCliente(MIEMBRO);
const pedir = (metodo, ruta) => request(app)[metodo](`/api/cliente${ruta}`).set('Authorization', `Bearer ${tokenDelMiembro()}`);

const responder = (...reglas) => { mockReglas = reglas; };
const filas = (rows) => () => ({ rows });
const falla = () => () => { throw new Error('conexion perdida'); };
const llamadas = (patron) => mockLlamadas.filter(({ sql }) => patron.test(sql));

/** La fila que lee el login: el miembro con su gimnasio. */
const filaDeLogin = (cambios = {}) => ({
  ...MIEMBRO,
  nombre: 'Ana Ruiz',
  telefono: '3001234567',
  email: 'ana@example.com',
  codigo_qr: 'QR-ANA',
  qr_imagen: null,
  foto_url: null,
  activo: true,
  fecha_registro: '2026-01-10T00:00:00.000Z',
  password_hash: hashDeLaClave,
  app_acceso: true,
  gym_nombre: 'Gym Norte',
  gym_activo: true,
  plan_activo: 'PRO',
  ...cambios,
});

beforeAll(async () => {
  hashDeLaClave = await bcrypt.hash(CLAVE, 4);
});

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
describe('POST /api/cliente/login: phone and password', () => {
  const entrar = (cuerpo) => request(app).post('/api/cliente/login').send(cuerpo);
  const conMiembro = (fila) => responder([/FROM miembro m\s+INNER JOIN gimnasio g/, filas(fila ? [fila] : [])]);

  test('should give a member token for 30 days and the gym when the phone and the password match', async () => {
    // Arrange
    conMiembro(filaDeLogin());

    // Act
    const r = await entrar({ telefono: '3001234567', password: CLAVE });

    // Assert
    expect(r.status).toBe(200);
    const payload = jwt.verify(r.body.token, SECRETO);
    expect(payload).toMatchObject({ idMiembro: 41, gymId: 7, documento: '1020304050', role: 'cliente' });
    expect(payload.exp - payload.iat).toBe(30 * 24 * 60 * 60);
    expect(r.body.gimnasio).toEqual({ id: 7, nombre: 'Gym Norte', planActivo: 'PRO' });
    expect(r.body.miembro).toMatchObject({ id: 41, nombre: 'Ana Ruiz', codigoQr: 'QR-ANA', appAcceso: true });
    expect(JSON.stringify(r.body)).not.toContain(hashDeLaClave);
    expect(llamadas(/FROM miembro m/)[0].params).toEqual(['3001234567']);
  });

  test.each([
    ['the phone does not start with 3', { telefono: '6011234567', password: CLAVE }, 'Datos invalidos: Telefono debe ser 10 digitos y empezar por 3 (ej. 3001234567)'],
    ['the password is shorter than 6', { telefono: '3001234567', password: '12345' }, 'Datos invalidos: La contrasena debe tener minimo 6 caracteres'],
  ])('should answer 400 VALIDATION_ERROR without reading the database when %s', async (_caso, cuerpo, mensaje) => {
    // Act
    const r = await entrar(cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: mensaje, code: 'VALIDATION_ERROR' });
    expect(mockLlamadas).toHaveLength(0);
  });

  test('should answer 404 MEMBER_NOT_FOUND when no active member of an active gym has that phone', async () => {
    // Arrange
    conMiembro(null);

    // Act
    const r = await entrar({ telefono: '3001234567', password: CLAVE });

    // Assert: la BD solo devuelve miembros activos de gimnasios activos
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
    expect(llamadas(/FROM miembro m/)[0].sql).toMatch(/AND m\.activo = TRUE AND g\.activo = TRUE/);
  });

  test('should answer 403 APP_ACCESS_DENIED even with the right password when the gym turned off the app for the member', async () => {
    // Arrange
    conMiembro(filaDeLogin({ app_acceso: false }));

    // Act
    const r = await entrar({ telefono: '3001234567', password: CLAVE });

    // Assert
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Tu acceso a la app esta desactivado. Habla con el administrador.', code: 'APP_ACCESS_DENIED' });
  });

  test('should answer 403 PASSWORD_NOT_SET when the member has no password yet', async () => {
    // Arrange
    conMiembro(filaDeLogin({ password_hash: null }));

    // Act
    const r = await entrar({ telefono: '3001234567', password: CLAVE });

    // Assert
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PASSWORD_NOT_SET');
  });

  test('should answer 401 BAD_PASSWORD without a token when the password does not match', async () => {
    // Arrange
    conMiembro(filaDeLogin());

    // Act
    const r = await entrar({ telefono: '3001234567', password: 'otra-clave' });

    // Assert
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Contrasena incorrecta.', code: 'BAD_PASSWORD' });
  });

  test('should answer 503 DB_UNREACHABLE when the database fails', async () => {
    // Arrange
    responder([/FROM miembro m/, falla()]);

    // Act
    const r = await entrar({ telefono: '3001234567', password: CLAVE });

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos iniciar sesion. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/cliente/me: the profile', () => {
  test('should answer the member and the gym of the token without the password', async () => {
    // Arrange
    responder([/FROM miembro m\s+INNER JOIN gimnasio g/, filas([{
      ...filaDeLogin(), gym_logo: 'https://example.com/logo.png', gym_telefono: '6015550000', gym_direccion: 'Calle 1',
    }])]);

    // Act
    const r = await pedir('get', '/me');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.gimnasio).toEqual({ id: 7, nombre: 'Gym Norte', logoUrl: 'https://example.com/logo.png', telefono: '6015550000', direccion: 'Calle 1' });
    expect(r.body.miembro).toMatchObject({ id: 41, gymId: 7, nombre: 'Ana Ruiz' });
    expect(r.body.miembro).not.toHaveProperty('password_hash');
    expect(llamadas(/FROM miembro m/)[0].params).toEqual([41, 7]);
  });

  test('should answer 404 MEMBER_NOT_FOUND when the member was deactivated after getting the token', async () => {
    // Arrange
    responder([/FROM miembro m\s+INNER JOIN gimnasio g/, filas([])]);

    // Act
    const r = await pedir('get', '/me');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Miembro no encontrado', code: 'MEMBER_NOT_FOUND' });
  });

  test('should answer 503 DB_UNREACHABLE when the database fails', async () => {
    // Arrange
    responder([/FROM miembro m/, falla()]);

    // Act
    const r = await pedir('get', '/me');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar tu perfil. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('PUT /api/cliente/me: what the member can edit', () => {
  const actualizado = (cambios = {}) => [/UPDATE miembro SET/, filas([{ ...filaDeLogin(), ...cambios }])];
  const sinDuplicado = [/SELECT 1 FROM miembro/, filas([])];

  test('should save only the fields sent, with the email in lower case, on the member of the token', async () => {
    // Arrange
    responder(sinDuplicado, actualizado({ telefono: '3109876543', email: 'ana.ruiz@example.com' }));

    // Act
    const r = await pedir('put', '/me').send({ telefono: '3109876543', email: 'Ana.Ruiz@Example.com', nivel_experiencia: 'AVANZADO' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Perfil actualizado.');
    expect(r.body.miembro).toMatchObject({ telefono: '3109876543', email: 'ana.ruiz@example.com' });
    expect(llamadas(/SELECT 1 FROM miembro/)[0].params).toEqual([7, 'Ana.Ruiz@Example.com', 41]);
    const [update] = llamadas(/UPDATE miembro SET/);
    expect(update.sql).toMatch(/SET telefono = \$1, email = \$2, nivel_experiencia = \$3\s+WHERE id_miembro = \$4 AND id_gimnasio = \$5/);
    expect(update.params).toEqual(['3109876543', 'ana.ruiz@example.com', 'AVANZADO', 41, 7]);
  });

  test('should save no email (NULL) without looking for duplicates when the member clears it', async () => {
    // Arrange
    responder(actualizado({ email: null }));

    // Act
    const r = await pedir('put', '/me').send({ email: '' });

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(/SELECT 1 FROM miembro/)).toHaveLength(0);
    expect(llamadas(/UPDATE miembro SET/)[0].params).toEqual([null, 41, 7]);
  });

  test('should answer 409 EMAIL_TAKEN without updating when another active member of the gym has that email', async () => {
    // Arrange
    responder([/SELECT 1 FROM miembro/, filas([{ '?column?': 1 }])]);

    // Act
    const r = await pedir('put', '/me').send({ email: 'luis@example.com' });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('EMAIL_TAKEN');
    expect(llamadas(/UPDATE miembro/)).toHaveLength(0);
  });

  test.each([
    ['the phone does not start with 3', { telefono: '6011234567' }, 'Telefono debe ser 10 digitos y empezar por 3'],
    ['the email is not an email', { email: 'ana-sin-arroba' }, 'Correo invalido'],
  ])('should answer 400 VALIDATION_ERROR without touching the database when %s', async (_caso, cuerpo, mensaje) => {
    // Act
    const r = await pedir('put', '/me').send(cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: mensaje, code: 'VALIDATION_ERROR' });
    expect(mockLlamadas).toHaveLength(0);
  });

  // Defecto #89: el esquema dejaba pasar textos mas largos que las columnas de
  // miembro; la BD respondia 22001 y el miembro veia un 503.
  // https://github.com/Luis140721/Proyecto_Fitloyalty/issues/89
  test.each([
    ['contacto_emergencia', 101, 'El contacto de emergencia admite máximo 100 caracteres.'],
    ['objetivo', 51, 'El objetivo admite máximo 50 caracteres.'],
    ['telefono_emergencia', 21, 'El teléfono de emergencia admite máximo 20 caracteres.'],
    ['direccion', 201, 'La dirección admite máximo 200 caracteres.'],
    ['alergias', 501, 'Las alergias admite máximo 500 caracteres.'],
  ])('should answer 400 without touching the database when %s has %s characters', async (campo, largo, mensaje) => {
    // Act
    const r = await pedir('put', '/me').send({ [campo]: 'a'.repeat(largo) });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: mensaje, code: 'VALIDATION_ERROR' });
    expect(mockLlamadas).toHaveLength(0);
  });

  test('should answer 400 without touching the database when the email is longer than 150 characters', async () => {
    // Arrange: 151 caracteres con un correo valido (cada parte del dominio < 64)
    const email = `ana@${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(22)}.co`;

    // Act
    const r = await pedir('put', '/me').send({ email });

    // Assert
    expect(email).toHaveLength(151);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'El correo admite máximo 150 caracteres.', code: 'VALIDATION_ERROR' });
    expect(mockLlamadas).toHaveLength(0);
  });

  test.each([
    ['contacto_emergencia', 100],
    ['objetivo', 50],
  ])('should save %s when it has exactly %s characters, the size of the column', async (campo, largo) => {
    // Arrange
    responder(actualizado());

    // Act
    const r = await pedir('put', '/me').send({ [campo]: 'a'.repeat(largo) });

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(/UPDATE miembro SET/)[0].params[0]).toHaveLength(largo);
  });

  test('should count an emoji as one character, like PostgreSQL, so a goal that fits is saved', async () => {
    // Arrange: 50 caracteres, pero 51 unidades UTF-16
    responder(actualizado());
    const objetivo = `${'a'.repeat(49)}💪`;

    // Act
    const r = await pedir('put', '/me').send({ objetivo });

    // Assert
    expect(objetivo.length).toBe(51);
    expect(r.status).toBe(200);
  });

  test('should answer 400 EMPTY_UPDATE when only fields the member cannot edit are sent', async () => {
    // Act: el documento y el QR no estan en el esquema, zod los quita
    const r = await pedir('put', '/me').send({ documento: '999', codigo_qr: 'QR-OTRO' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'No hay campos para actualizar.', code: 'EMPTY_UPDATE' });
    expect(mockLlamadas).toHaveLength(0);
  });

  test('should answer 404 MEMBER_NOT_FOUND when the member is no longer in the gym of the token', async () => {
    // Arrange
    responder([/UPDATE miembro SET/, filas([])]);

    // Act
    const r = await pedir('put', '/me').send({ objetivo: 'Bajar de peso' });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
  });

  test('should answer 503 DB_UNREACHABLE when the update fails', async () => {
    // Arrange
    responder([/UPDATE miembro SET/, falla()]);

    // Act
    const r = await pedir('put', '/me').send({ objetivo: 'Bajar de peso' });

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos actualizar tu perfil. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/cliente/qr: the QR to show at the door', () => {
  // La fila trae el id del miembro y si su gimnasio exige el QR dinamico (migracion 015).
  const conQr = (fila) => responder([
    /SELECT m\.id_miembro, m\.codigo_qr, m\.qr_imagen, g\.qr_dinamico_obligatorio\s+FROM miembro m\s+JOIN gimnasio g/,
    filas(fila ? [{ id_miembro: 41, qr_dinamico_obligatorio: false, ...fila }] : []),
  ]);

  test.each([
    ['the database has the raw base64', 'iVBORw0KGgo', 'data:image/png;base64,iVBORw0KGgo'],
    ['the database already has the data URL', 'data:image/png;base64,iVBORw0KGgo', 'data:image/png;base64,iVBORw0KGgo'],
    ['the database has no image', null, null],
  ])('should answer the code and the image as a data URL when %s', async (_caso, imagen, dataUrl) => {
    // Arrange
    conQr({ codigo_qr: 'QR-ANA', qr_imagen: imagen });

    // Act
    const r = await pedir('get', '/qr');

    // Assert: ademas del QR fijo, lo que la app necesita para el QR dinamico del miembro
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      dinamico: datosParaApp(41, 'QR-ANA', r.body.dinamico.hora_servidor_ms),
      solo_dinamico: false,
      codigo: 'QR-ANA',
      imagenDataUrl: dataUrl,
    });
    expect(llamadas(/FROM miembro/)[0].params).toEqual([41, 7]);
  });

  test('should answer 404 QR_NOT_ASSIGNED when the member has no QR code yet', async () => {
    // Arrange
    conQr({ codigo_qr: null, qr_imagen: null });

    // Act
    const r = await pedir('get', '/qr');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Aun no tienes un QR asignado.', code: 'QR_NOT_ASSIGNED' });
  });

  test('should answer 404 MEMBER_NOT_FOUND when the member is inactive', async () => {
    // Arrange
    conQr(null);

    // Act
    const r = await pedir('get', '/qr');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
  });

  test('should answer 503 DB_UNREACHABLE when the database fails', async () => {
    // Arrange
    responder([/FROM miembro/, falla()]);

    // Act
    const r = await pedir('get', '/qr');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar tu QR. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/cliente/membresia: the current plan', () => {
  test('should answer the active plan of the member of the token', async () => {
    // Arrange
    const plan = { id_plan_cobro: 9, tipo_plan: 'MENSUAL', fecha_fin: '2026-12-01', vencido: false, vencepronto: false, dias_para_vencer: 11 };
    responder([/FROM plan_cobro pc/, filas([plan])]);

    // Act
    const r = await pedir('get', '/membresia');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ membresia: plan });
    expect(llamadas(/FROM plan_cobro/)[0].params).toEqual([41]);
  });

  test('should answer a null plan and a message when the member has no active plan', async () => {
    // Arrange
    responder([/FROM plan_cobro pc/, filas([])]);

    // Act
    const r = await pedir('get', '/membresia');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ membresia: null, mensaje: 'Aun no tienes un plan activo.' });
  });

  test('should answer 503 DB_UNREACHABLE when the database fails', async () => {
    // Arrange
    responder([/FROM plan_cobro/, falla()]);

    // Act
    const r = await pedir('get', '/membresia');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar tu plan. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/cliente/asistencia: the last check-ins', () => {
  const resumen = { total: 30, hoy: 1, este_mes: 9 };
  const conAsistencia = (checkins) => responder(
    [/SELECT c\.id_checkin/, filas(checkins)],
    [/COUNT\(\*\)::int\s+AS total/, filas([resumen])],
  );

  test('should answer the check-ins and the summary of the member of the token', async () => {
    // Arrange
    const checkins = [{ id_checkin: 3, fecha_hora: '2026-11-20T12:00:00.000Z', metodo: 'QR', observacion: null }];
    conAsistencia(checkins);

    // Act
    const r = await pedir('get', '/asistencia');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ checkins, resumen });
    expect(llamadas(/SELECT c\.id_checkin/)[0].params).toEqual([41, 7, 20]);
    expect(llamadas(/COUNT/)[0].params).toEqual([41, 7]);
  });

  test.each([
    [7, '7'],
    [100, '500'],
    [1, '-5'],
    [20, '0'],
    [20, 'muchos'],
  ])('should ask the database for %i check-ins when the app sends limit=%s', async (enviado, limite) => {
    // Arrange
    conAsistencia([]);

    // Act
    const r = await pedir('get', `/asistencia?limit=${limite}`);

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(/SELECT c\.id_checkin/)[0].params[2]).toBe(enviado);
  });

  test('should answer 503 DB_UNREACHABLE when the database fails', async () => {
    // Arrange
    responder([/FROM checkin c/, falla()]);

    // Act
    const r = await pedir('get', '/asistencia');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar tu asistencia. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/cliente/gamificacion: the achievements', () => {
  const hito = (id, logrado, puntos) => ({ id_hito: id, nombre: `Hito ${id}`, logrado, puntos });

  test('should add up only the points of the achieved milestones and round the percentage', async () => {
    // Arrange: 3 hitos, 2 logrados; uno logrado sin valor_objetivo trae puntos null
    const hitos = [hito(1, true, 35), hito(2, true, null), hito(3, false, 200)];
    responder([/FROM hito_gamificacion h/, filas(hitos)]);

    // Act
    const r = await pedir('get', '/gamificacion');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ puntosTotales: 35, totalHitos: 3, totalLogrados: 2, porcentaje: 67 });
    expect(r.body.hitos).toEqual(hitos);
    expect(llamadas(/FROM hito_gamificacion/)[0].params).toEqual([41, 7]);
  });

  test('should answer a zero percentage when the gym has no milestones', async () => {
    // Arrange
    responder([/FROM hito_gamificacion h/, filas([])]);

    // Act
    const r = await pedir('get', '/gamificacion');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ resumen: { puntosTotales: 0, totalHitos: 0, totalLogrados: 0, porcentaje: 0 }, hitos: [] });
  });

  test('should answer 503 DB_UNREACHABLE when the database fails', async () => {
    // Arrange
    responder([/FROM hito_gamificacion/, falla()]);

    // Act
    const r = await pedir('get', '/gamificacion');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar tus logros. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/cliente/retos and POST /api/cliente/logout', () => {
  test('should answer the open challenges of the gym of the token', async () => {
    // Arrange
    const retos = [{ id_reto: 4, nombre: 'Noviembre activo', participa: true, completado: false }];
    responder([/FROM reto r/, filas(retos)]);

    // Act
    const r = await pedir('get', '/retos');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ retos });
    expect(llamadas(/FROM reto r/)[0].params).toEqual([41, 7]);
  });

  test('should answer 503 DB_UNREACHABLE when the challenges cannot be read', async () => {
    // Arrange
    responder([/FROM reto r/, falla()]);

    // Act
    const r = await pedir('get', '/retos');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar los retos. Intenta de nuevo.', code: 'DB_UNREACHABLE' });
  });

  test('should confirm the logout without touching the database when the member logs out', async () => {
    // Act
    const r = await pedir('post', '/logout');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'Sesion cerrada' });
    expect(mockLlamadas).toHaveLength(0);
  });
});
