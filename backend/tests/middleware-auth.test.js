/**
 * middleware/auth.js y miembroSeguro (lib/auth-helpers.js): lo que las demas
 * pruebas no ven porque reemplazan la lectura del personal.
 *
 *  - authenticate lee al personal en la BD en cada peticion (RQF-01, HU-04):
 *    el rol sale de la BD y no del token, y una cuenta inexistente o de otro
 *    gimnasio pierde el acceso aunque su token siga vigente.
 *  - authorize y requireClient sin usuario autenticado responden 401.
 *  - miembroSeguro nunca devuelve los hashes del miembro.
 *
 * Dobles: la BD es un stub de la consulta del personal (o una que falla);
 * req y res son objetos minimos con un spy en status/json y en next.
 */
let mockConsulta;
jest.mock('../src/db/db', () => ({ query: (...a) => mockConsulta(...a) }));

const jwt = require('jsonwebtoken');
const { authenticate, authorize, requireClient, establecerBusquedaPersonal } = require('../src/middleware/auth');
const { miembroSeguro } = require('../src/lib/auth-helpers');

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';

// Respuesta de Express reducida a lo que usan los middlewares.
function crearRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}
const conToken = (payload) => ({ headers: { authorization: `Bearer ${jwt.sign(payload, SECRETO, { expiresIn: '1h' })}` } });

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  // Sin argumento: authenticate vuelve a la lectura real del personal en la BD.
  establecerBusquedaPersonal(null);
  mockConsulta = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('authenticate: the staff member is read from the database', () => {
  test('should take the role from the database, not from the token, when the account is active', async () => {
    // Arrange: el token dice recepcion, la BD dice administrador
    mockConsulta.mockResolvedValue({ rows: [{ activo: true, id_gimnasio: 7, rol_nombre: 'ADMINISTRADOR' }] });
    const req = conToken({ id: 3, role: 'receptionist', gymId: 7 });
    const next = jest.fn();

    // Act
    await authenticate(req, crearRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ id: 3, gymId: 7, role: 'admin' });
    expect(mockConsulta).toHaveBeenCalledWith(expect.stringMatching(/FROM usuario\s+WHERE id_usuario = \$1/), [3]);
  });

  test.each([
    ['the account no longer exists', []],
    ['the account was deactivated', [{ activo: false, id_gimnasio: 7, rol_nombre: 'ADMINISTRADOR' }]],
    ['the account moved to another gym', [{ activo: true, id_gimnasio: 9, rol_nombre: 'ADMINISTRADOR' }]],
  ])('should answer 401 ACCOUNT_DISABLED when %s', async (_caso, filas) => {
    // Arrange
    mockConsulta.mockResolvedValue({ rows: filas });
    const res = crearRes();
    const next = jest.fn();

    // Act
    await authenticate(conToken({ id: 3, role: 'admin', gymId: 7 }), res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_DISABLED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('should pass a 503 DB_UNREACHABLE to the error handler when the staff query fails', async () => {
    // Arrange
    mockConsulta.mockRejectedValue(new Error('conexion perdida'));
    const next = jest.fn();

    // Act
    await authenticate(conToken({ id: 3, role: 'admin', gymId: 7 }), crearRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 503, code: 'DB_UNREACHABLE' }));
  });

  test('should let a member token through without reading the staff table', async () => {
    // Arrange: el token de la app del miembro no tiene id de personal
    const req = conToken({ idMiembro: 5, role: 'cliente', gymId: 7 });
    const next = jest.fn();

    // Act
    await authenticate(req, crearRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ idMiembro: 5, role: 'cliente' });
    expect(mockConsulta).not.toHaveBeenCalled();
  });
});

describe('authorize and requireClient without an authenticated user', () => {
  test.each([
    ['authorize', authorize('admin')],
    ['requireClient', requireClient],
  ])('should answer 401 AUTH_REQUIRED when %s runs without req.user', (_nombre, middleware) => {
    // Arrange
    const res = crearRes();
    const next = jest.fn();

    // Act
    middleware({}, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('miembroSeguro: what the member app receives', () => {
  test('should never return the password hashes of the member', () => {
    // Arrange
    const fila = {
      id_miembro: 5, id_gimnasio: 7, nombre: 'Ana', documento: 'CC1', telefono: '3001234567', email: 'ana@gym.co',
      codigo_qr: 'x:y', activo: true, fecha_registro: '2026-01-01', password_hash: '$2a$10$hash', pin_hash: '$2a$10$pin',
    };

    // Act
    const seguro = miembroSeguro(fila);

    // Assert
    expect(seguro).toEqual({
      id: 5, gymId: 7, nombre: 'Ana', documento: 'CC1', telefono: '3001234567', email: 'ana@gym.co',
      codigoQr: 'x:y', qrImagen: null, fotoUrl: null, activo: true, fechaRegistro: '2026-01-01', appAcceso: true,
    });
  });

  test('should report the app access as off only when the column says false', () => {
    // Arrange
    const fila = { id_miembro: 5, app_acceso: false, qr_imagen: 'data:img', foto_url: 'https://foto' };

    // Act
    const seguro = miembroSeguro(fila);

    // Assert
    expect(seguro).toMatchObject({ appAcceso: false, qrImagen: 'data:img', fotoUrl: 'https://foto' });
  });
});
