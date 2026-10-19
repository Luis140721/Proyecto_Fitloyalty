/**
 * Tests unitarios sobre `src/lib/auth-helpers.js`.
 *
 * Estos helpers son funciones PURAS (sin BD, sin SMTP, sin variables de
 * entorno excepto `JWT_SECRET` cuando generan tokens). Por eso se pueden
 * cubrir completamente con tests deterministas, sin mocks.
 *
 * Se verifican:
 *  - Mapeo de roles (ADMINISTRADOR / RECEPCIONISTA / ids numéricos).
 *  - Validación de email, contraseña y teléfono colombiano.
 *  - Normalización de emails.
 *  - Generación de códigos OTP de 6 dígitos.
 *  - Proyección de usuarioSeguro (nunca expone password_hash).
 *  - Firma y verificación de tokens JWT.
 *  - RQF-02: el token del personal expira (JWT_EXPIRES_IN, 8 h por defecto),
 *    el middleware rechaza el vencido y el del miembro sigue en 30 días.
 *  - RQF-01: el middleware vuelve a leer al usuario del personal en cada
 *    peticion (desactivado = 401, rol desde la BD). La lectura se reemplaza
 *    con establecerBusquedaPersonal para no tocar la base.
 *
 * Corre con `node --test "tests/*.test.js"` (desde backend/) y con Jest (S8
 * agrega `npm test`). Con node --test no existen los globales de Jest: se
 * toman de node:test y se arma un `expect` mínimo con node:assert para los
 * comparadores de aquí.
 */

const assert = require('node:assert/strict');
const enJest = typeof globalThis.expect === 'function';
const nodeTest = enJest ? null : require('node:test');
const describe = enJest ? globalThis.describe : nodeTest.describe;
const test = enJest ? globalThis.test : nodeTest.test;
const beforeAll = enJest ? globalThis.beforeAll : nodeTest.before;
const afterAll = enJest ? globalThis.afterAll : nodeTest.after;
const afterEach = enJest ? globalThis.afterEach : nodeTest.afterEach;
const expect = enJest ? globalThis.expect : expectMinimo;

function expectMinimo(actual) {
  const tiene = (k) => actual !== null && actual !== undefined && k in Object(actual);
  return {
    toBe: (v) => assert.equal(actual, v),
    toMatch: (re) => assert.match(actual, re),
    toContain: (v) => assert.ok(actual.includes(v), `${actual} no contiene ${v}`),
    toBeDefined: () => assert.notEqual(actual, undefined),
    toHaveProperty: (k) => assert.ok(tiene(k), `falta la propiedad ${k}`),
    not: {
      toHaveProperty: (k) => assert.ok(!tiene(k), `sobra la propiedad ${k}`),
    },
  };
}

const jwt = require('jsonwebtoken');
const { authenticate, establecerBusquedaPersonal } = require('../src/middleware/auth');
const {
  mapRol,
  validarEmail,
  validarContrasena,
  validarTelefonoColombiano,
  normEmail,
  random6,
  usuarioSeguro,
  avatarUrl,
  generarToken,
  generarResetToken,
  generarTokenCliente,
  vigenciaTokenPersonal,
  STAFF_TOKEN_EXPIRES_DEFAULT,
} = require('../src/lib/auth-helpers');

describe('auth-helpers: mapRol', () => {
  test('mapea nombres de rol al formato del frontend', () => {
    expect(mapRol('ADMINISTRADOR')).toBe('admin');
    expect(mapRol('administrador')).toBe('admin');
    expect(mapRol('Administrador FitZone')).toBe('admin');
    expect(mapRol('RECEPCIONISTA')).toBe('receptionist');
    expect(mapRol('recepcionista')).toBe('receptionist');
  });

  test('mapea ids numéricos de rol', () => {
    expect(mapRol(1)).toBe('admin');
    expect(mapRol(2)).toBe('receptionist');
  });

  test('regresa unknown para entradas nulas o vacías', () => {
    expect(mapRol(null)).toBe('unknown');
    expect(mapRol(undefined)).toBe('unknown');
  });

  test('regresa snake_case para roles desconocidos', () => {
    expect(mapRol('Some Role')).toBe('some_role');
  });
});

describe('auth-helpers: validarEmail', () => {
  test('acepta emails válidos', () => {
    expect(validarEmail('a@b.co')).toBe(true);
    expect(validarEmail('user.name+tag@example.com')).toBe(true);
  });

  test('rechaza emails inválidos', () => {
    expect(validarEmail('foo')).toBe(false);
    expect(validarEmail('a@b')).toBe(false);
    expect(validarEmail('@b.co')).toBe(false);
    expect(validarEmail('a@.co')).toBe(false);
    expect(validarEmail('a@b.')).toBe(false);
    expect(validarEmail('')).toBe(false);
    expect(validarEmail(null)).toBe(false);
    expect(validarEmail(undefined)).toBe(false);
  });
});

describe('auth-helpers: validarContrasena', () => {
  test('acepta contraseñas válidas (>=6 chars, con dígito, sin espacios)', () => {
    expect(validarContrasena('admin123')).toBe(true);
    expect(validarContrasena('abc123')).toBe(true);
    expect(validarContrasena('000000')).toBe(true);
  });

  test('rechaza contraseñas muy cortas', () => {
    expect(validarContrasena('12345')).toBe(false);
    expect(validarContrasena('')).toBe(false);
  });

  test('rechaza contraseñas sin dígitos', () => {
    expect(validarContrasena('abcdefgh')).toBe(false);
  });

  test('rechaza contraseñas con espacios (incluso si tienen dígitos)', () => {
    expect(validarContrasena('abc 123')).toBe(false);
    expect(validarContrasena(' abc123')).toBe(false);
    expect(validarContrasena('abc123 ')).toBe(false);
  });

  test('rechaza entradas no-string o vacías', () => {
    expect(validarContrasena(null)).toBe(false);
    expect(validarContrasena(undefined)).toBe(false);
    expect(validarContrasena(123456)).toBe(false);
  });
});

describe('auth-helpers: validarTelefonoColombiano', () => {
  test('acepta teléfonos móviles colombianos (10 dígitos empezando con 3)', () => {
    expect(validarTelefonoColombiano('3101234567')).toBe(true);
    expect(validarTelefonoColombiano('+57 310 123 4567')).toBe(true);
    expect(validarTelefonoColombiano('310-123-4567')).toBe(true);
  });

  test('rechaza teléfonos que no empiezan con 3', () => {
    expect(validarTelefonoColombiano('1101234567')).toBe(false);
    expect(validarTelefonoColombiano('2101234567')).toBe(false);
  });

  test('rechaza teléfonos con longitud incorrecta', () => {
    expect(validarTelefonoColombiano('310123456')).toBe(false);
    expect(validarTelefonoColombiano('31012345678')).toBe(false);
  });

  test('rechaza entradas no-string o vacías', () => {
    expect(validarTelefonoColombiano('')).toBe(false);
    expect(validarTelefonoColombiano(null)).toBe(false);
  });
});

describe('auth-helpers: normEmail', () => {
  test('lowercase + trim', () => {
    expect(normEmail('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });

  test('maneja entradas null/undefined/number sin explotar', () => {
    expect(normEmail(null)).toBe('');
    expect(normEmail(undefined)).toBe('');
    expect(normEmail(123)).toBe('123');
  });
});

describe('auth-helpers: random6', () => {
  test('devuelve exactamente 6 dígitos numéricos como string', () => {
    for (let i = 0; i < 50; i++) {
      const code = random6();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe('auth-helpers: usuarioSeguro + avatarUrl', () => {
  test('nunca expone password_hash', () => {
    const u = {
      id_usuario: 7,
      nombre: 'Ana',
      email: 'ana@x.co',
      password_hash: 'SECRET_HASH',
      rol_nombre: 'ADMINISTRADOR',
      id_gimnasio: 3,
      foto_url: null,
    };
    const safe = usuarioSeguro(u);
    expect(safe).not.toHaveProperty('password_hash');
    expect(safe.id).toBe(7);
    expect(safe.role).toBe('admin');
    expect(safe.gymId).toBe(3);
    expect(safe.photoUrl).toMatch(/^https:\/\/ui-avatars\.com/);
  });

  test('respeta foto_url cuando viene en la fila', () => {
    const u = { nombre: 'Ana', foto_url: 'https://i.pravatar.cc/150?u=ana' };
    expect(usuarioSeguro({ ...u, rol_nombre: 'RECEPCIONISTA' }).photoUrl)
      .toBe('https://i.pravatar.cc/150?u=ana');
  });

  test('avatarUrl hace encode del nombre', () => {
    const url = avatarUrl({ nombre: 'Ana Ríos' });
    expect(url).toContain(encodeURIComponent('Ana Ríos'));
  });
});

describe('auth-helpers: generarToken + generarResetToken', () => {
  // Firmamos con un secret fijo para poder verificar con la misma clave.
  const SECRET = 'test-secret-only-for-jest';
  const prevSecret = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = SECRET; });
  afterAll(() => { process.env.JWT_SECRET = prevSecret; });

  test('generarToken incluye id, name, email, role, gymId y omite password_hash', () => {
    const u = {
      id_usuario: 11,
      nombre: 'Carlos',
      email: 'c@x.co',
      password_hash: 'SECRET',
      rol_nombre: 'ADMINISTRADOR',
      id_gimnasio: 5,
    };
    const token = generarToken(u, { expiresIn: '1h' });
    const payload = jwt.verify(token, SECRET);
    expect(payload.id).toBe(11);
    expect(payload.name).toBe('Carlos');
    expect(payload.email).toBe('c@x.co');
    expect(payload.role).toBe('admin');
    expect(payload.gymId).toBe(5);
    expect(payload).not.toHaveProperty('password_hash');
  });

  test('generarResetToken lleva purpose=reset y expira', () => {
    const u = { id_usuario: 99, email: 'a@b.co' };
    const token = generarResetToken(u, { expiresIn: '5m' });
    const payload = jwt.verify(token, SECRET);
    expect(payload.purpose).toBe('reset');
    expect(payload.id).toBe(99);
    expect(payload.email).toBe('a@b.co');
    expect(payload.exp).toBeDefined();
  });
});

describe('RQF-02: vigencia del token del personal', () => {
  const SECRET = 'test-secret-only-for-jest';
  const prevSecret = process.env.JWT_SECRET;
  const prevExpires = process.env.JWT_EXPIRES_IN;
  const admin = { id_usuario: 1, nombre: 'Ana', email: 'a@x.co', rol_nombre: 'ADMINISTRADOR', id_gimnasio: 2 };
  const vigencia = (token) => { const p = jwt.verify(token, SECRET); return p.exp - p.iat; };

  beforeAll(() => { process.env.JWT_SECRET = SECRET; });
  afterEach(() => {
    if (prevExpires === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = prevExpires;
  });
  afterAll(() => { process.env.JWT_SECRET = prevSecret; });

  test('sin JWT_EXPIRES_IN el token del personal vence a las 8 horas', () => {
    delete process.env.JWT_EXPIRES_IN;
    expect(STAFF_TOKEN_EXPIRES_DEFAULT).toBe('8h');
    expect(vigenciaTokenPersonal()).toBe('8h');
    expect(vigencia(generarToken(admin))).toBe(8 * 3600);
  });

  test('JWT_EXPIRES_IN cambia la vigencia', () => {
    process.env.JWT_EXPIRES_IN = '30m';
    expect(vigencia(generarToken(admin))).toBe(30 * 60);
  });

  test('un número sin unidad en JWT_EXPIRES_IN son segundos, no milisegundos', () => {
    process.env.JWT_EXPIRES_IN = '3600';
    expect(vigenciaTokenPersonal()).toBe(3600);
    expect(vigencia(generarToken(admin))).toBe(3600);
  });

  test('expiresIn explícito tiene prioridad sobre JWT_EXPIRES_IN', () => {
    process.env.JWT_EXPIRES_IN = '30m';
    expect(vigencia(generarToken(admin, { expiresIn: '1h' }))).toBe(3600);
  });

  test('pasadas las 8 horas jwt.verify rechaza el token', () => {
    delete process.env.JWT_EXPIRES_IN;
    const token = generarToken(admin);
    const { iat } = jwt.decode(token);
    expect(jwt.verify(token, SECRET, { clockTimestamp: iat + 8 * 3600 - 1 }).id).toBe(1);
    assert.throws(
      () => jwt.verify(token, SECRET, { clockTimestamp: iat + 8 * 3600 + 1 }),
      { name: 'TokenExpiredError' },
    );
  });

  test('el middleware authenticate responde 401 con un token vencido', async () => {
    const haceUnaHora = Math.floor(Date.now() / 1000) - 3600;
    const vencido = jwt.sign({ id: 1, role: 'admin', gymId: 2, iat: haceUnaHora }, SECRET, { expiresIn: 60 });
    const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    let siguio = false;
    await authenticate({ headers: { authorization: `Bearer ${vencido}` } }, res, () => { siguio = true; });
    expect(siguio).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/expirado/);
  });

  test('el token del miembro (app Flutter) sigue en 30 días aunque cambie JWT_EXPIRES_IN', () => {
    process.env.JWT_EXPIRES_IN = '30m';
    const token = generarTokenCliente({ id_miembro: 4, id_gimnasio: 2, documento: '123' });
    expect(vigencia(token)).toBe(30 * 86400);
    expect(jwt.decode(token).role).toBe('cliente');
  });

  test('una vigencia inválida en JWT_EXPIRES_IN cae en 8 horas en vez de romper el login', () => {
    process.env.JWT_EXPIRES_IN = '8 horas';
    const avisar = console.warn;
    console.warn = () => {};
    try {
      expect(vigenciaTokenPersonal()).toBe('8h');
      expect(vigencia(generarToken(admin))).toBe(8 * 3600);
    } finally {
      console.warn = avisar;
    }
  });

  // authenticate con un token dado: devuelve el status (0 si dejo pasar), el
  // cuerpo, el req.user resultante y lo que recibio next().
  const autenticar = async (token) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    let siguiente;
    await authenticate(req, res, (err) => { siguiente = err || 'ok'; });
    return { statusCode: res.statusCode, body: res.body, user: req.user, siguiente };
  };
  // Usuario del personal "en la BD" para estas pruebas.
  const enBD = (fila) => establecerBusquedaPersonal(async () => fila);
  afterAll(() => establecerBusquedaPersonal());

  test('authenticate rechaza (401) un token del personal sin exp, emitido antes de RQF-02', async () => {
    const viejo = jwt.sign({ id: 1, role: 'admin', gymId: 2 }, SECRET);
    const res = await autenticar(viejo);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_SIN_VENCIMIENTO');
  });

  test('authenticate deja pasar un token del personal con exp y el del miembro', async () => {
    delete process.env.JWT_EXPIRES_IN;
    enBD({ activo: true, id_gimnasio: 2, rol_nombre: 'ADMINISTRADOR' });
    expect((await autenticar(generarToken(admin))).statusCode).toBe(0);
    const miembro = await autenticar(generarTokenCliente({ id_miembro: 4, id_gimnasio: 2, documento: '123' }));
    expect(miembro.statusCode).toBe(0);
    expect(miembro.user.role).toBe('cliente');
  });

  test('RQF-01: un usuario desactivado pierde el acceso aunque su token siga vigente', async () => {
    enBD({ activo: false, id_gimnasio: 2, rol_nombre: 'ADMINISTRADOR' });
    const r = await autenticar(generarToken(admin));
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe('ACCOUNT_DISABLED');
    expect(r.siguiente).toBe(undefined);
  });

  test('RQF-01: un usuario que ya no existe o que pasó a otro gimnasio recibe 401', async () => {
    enBD(null);
    expect((await autenticar(generarToken(admin))).statusCode).toBe(401);
    enBD({ activo: true, id_gimnasio: 99, rol_nombre: 'ADMINISTRADOR' });
    expect((await autenticar(generarToken(admin))).statusCode).toBe(401);
  });

  test('RQF-01: el rol sale de la BD, no del token (un admin bajado a recepción deja de ser admin)', async () => {
    enBD({ activo: true, id_gimnasio: 2, rol_nombre: 'RECEPCIONISTA' });
    const r = await autenticar(generarToken(admin));
    expect(r.statusCode).toBe(0);
    expect(jwt.decode(generarToken(admin)).role).toBe('admin');
    expect(r.user.role).toBe('receptionist');
  });

  test('RQF-01: si la base falla, responde 503 por el manejador de errores', async () => {
    establecerBusquedaPersonal(async () => { throw new Error('sin conexion'); });
    const errorLog = console.error;
    console.error = () => {};
    try {
      const r = await autenticar(generarToken(admin));
      expect(r.statusCode).toBe(0);
      expect(r.siguiente.status).toBe(503);
      expect(r.siguiente.code).toBe('DB_UNREACHABLE');
    } finally {
      console.error = errorLog;
    }
  });
});
