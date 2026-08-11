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
 */

const jwt = require('jsonwebtoken');
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