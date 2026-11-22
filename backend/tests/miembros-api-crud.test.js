/**
 * Semana 4, capa API: el CRUD de un miembro por id, el recurso principal del
 * API (routes/miembros.js).
 *
 *  - GET /api/admin/miembros/:id: caso feliz, inexistente, miembro de otro
 *    gimnasio e id que no es un numero.
 *  - PUT /api/admin/miembros/:id: caso feliz, validacion e inexistente.
 *
 * Cada caso mira la respuesta (codigo, Content-Type y cuerpo) y lo que quedo
 * guardado. La BD es un doble con estado: una tabla miembro en memoria que
 * aplica el SELECT y el UPDATE que manda la ruta, con su WHERE. Asi un PUT
 * seguido de un GET muestra lo que de verdad se guardo, y un 400 o un 404 deja
 * la tabla como estaba. Si llega un SQL que el doble no conoce, lanza.
 *
 * El alta, la baja y la seguridad (401, 403, JSON mal formado) estan en
 * miembros-api-seguridad.test.js.
 *
 * Se usa la app real de src/index.js. Otros dobles: la lectura del personal en
 * authenticate y el correo y WhatsApp (lib/email y lib/whatsapp).
 */
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = 'secreto-de-pruebas';

let mockTabla = [];
let mockEscrituras = 0;
let mockLecturas = 0;

/** "id_miembro = $1 AND id_gimnasio = $2" -> las filas que cumplen todas las condiciones. */
function mockDondeSe(where, params) {
  const condiciones = where.trim().split(/\s+AND\s+/i).map((c) => {
    const m = c.trim().match(/^(\w+)\s*=\s*\$(\d+)$/);
    if (!m) throw new Error('Condicion inesperada: ' + c);
    return [m[1], params[Number(m[2]) - 1]];
  });
  return mockTabla.filter((fila) => condiciones.every(([columna, valor]) => fila[columna] === valor));
}

/** Las columnas pedidas de una fila; una columna que la tabla no tiene es un error, como en la BD. */
function mockProyectar(lista, fila) {
  const salida = {};
  for (const expresion of lista.split(',').map((c) => c.trim())) {
    if (/^\(password_hash IS NOT NULL\) AS password_asignada$/.test(expresion)) {
      salida.password_asignada = fila.password_hash !== null;
      continue;
    }
    if (!(expresion in fila)) throw new Error('Columna inesperada: ' + expresion);
    salida[expresion] = fila[expresion];
  }
  return salida;
}

async function mockEjecutar(sql, params = []) {
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
  // GET /:id lee las autorizaciones del miembro (RQNF-17, #102): aqui no tiene ninguna.
  if (/FROM autorizacion_miembro/.test(sql)) return { rows: [] };

  const lectura = sql.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM miembro\s+WHERE\s+([\s\S]+?)\s*$/);
  if (lectura) {
    mockLecturas += 1;
    return { rows: mockDondeSe(lectura[2], params).map((fila) => mockProyectar(lectura[1], fila)) };
  }

  const escritura = sql.match(/^\s*UPDATE miembro SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+?)\s+RETURNING\s+([\s\S]+?)\s*$/);
  if (escritura) {
    mockEscrituras += 1;
    const cambios = escritura[1].split(',').map((asignacion) => {
      const m = asignacion.trim().match(/^(\w+)\s*=\s*\$(\d+)$/);
      if (!m) throw new Error('Asignacion inesperada: ' + asignacion);
      return [m[1], params[Number(m[2]) - 1]];
    });
    const filas = mockDondeSe(escritura[2], params);
    for (const fila of filas) {
      for (const [columna, valor] of cambios) {
        if (!(columna in fila)) throw new Error('Columna inesperada: ' + columna);
        fila[columna] = valor;
      }
    }
    return { rows: filas.map((fila) => mockProyectar(escritura[3], fila)) };
  }

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

const RECEPCION = jwt.sign({ id: 2, role: 'receptionist', gymId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Una fila completa de miembro, con todas las columnas que leen y escriben las rutas. */
function filaDeMiembro(cambios) {
  return {
    id_miembro: 88, id_gimnasio: 7, nombre: 'Ana Maria Ruiz', tipo_documento: 'CC', documento: 'CC12345',
    telefono: '3001234567', codigo_pais_telefono: '+57', email: 'ana@fitloyalty.test', codigo_qr: 'FL-7-QR88', qr_imagen: null,
    activo: true, fecha_registro: '2026-01-15T10:00:00.000Z', fecha_nacimiento: '1994-03-02', genero: 'Femenino',
    ciudad: 'Bogota', direccion: 'Calle 1 # 2-3', contacto_emergencia: 'Luz Ruiz', telefono_emergencia: '3107654321',
    condiciones_medicas: null, alergias: 'Penicilina', objetivo: 'Resistencia', nivel_experiencia: 'Intermedio',
    observaciones: null, app_acceso: false, password_hash: null, password_set_at: null,
    acepto_terminos: true, autorizo_datos: true, representante_nombre: null, representante_tipo_documento: null,
    representante_documento: null, representante_parentesco: null, representante_telefono: null,
    ...cambios,
  };
}
// El 88 del gimnasio 7 y el 41 de otro gimnasio (el 8).
const ANA = () => mockTabla.find((f) => f.id_miembro === 88);
const DEL_OTRO_GIMNASIO = () => mockTabla.find((f) => f.id_miembro === 41);

const pedir = (metodo, ruta) => request(app)[metodo](`/api/admin/miembros${ruta}`).set('Authorization', `Bearer ${RECEPCION}`);

function esJson(r, status) {
  expect(r.status).toBe(status);
  expect(r.headers['content-type']).toMatch(/^application\/json/);
}

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'RECEPCIONISTA' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  mockTabla = [filaDeMiembro(), filaDeMiembro({ id_miembro: 41, id_gimnasio: 8, nombre: 'Pedro Gomez', documento: 'CC98765' })];
  mockEscrituras = 0;
  mockLecturas = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/admin/miembros/:id: one member of the gym', () => {
  test('should answer 200 in JSON with the member as it is stored, without the password hash nor the gym', async () => {
    // Arrange: la fila 88 del gimnasio 7 (beforeEach)
    const { id_gimnasio, password_hash, password_set_at, app_acceso, ...visible } = ANA();

    // Act
    const r = await pedir('get', '/88');

    // Assert: lo guardado, mas lo que el #102 (RQNF-17) calcula para la ficha
    esJson(r, 200);
    expect(r.body.miembro).toEqual({
      ...visible, autorizo_datos_sensibles: false, menor_de_edad: false, datos_sensibles_sin_autorizacion: true,
    });
  });

  test('should answer 404 MEMBER_NOT_FOUND without its data when the member belongs to another gym', async () => {
    // Arrange: el 41 existe, pero en el gimnasio 8

    // Act
    const r = await pedir('get', '/41');

    // Assert
    esJson(r, 404);
    expect(r.body).toEqual({ error: 'Miembro no encontrado', code: 'MEMBER_NOT_FOUND' });
    expect(r.text).not.toMatch(/Pedro|CC98765/);
  });

  test('should answer 404 MEMBER_NOT_FOUND when no member has that id', async () => {
    // Arrange

    // Act
    const r = await pedir('get', '/999');

    // Assert
    esJson(r, 404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
  });

  test('should answer 400 VALIDATION_ERROR without reading the table when the id is not a number', async () => {
    // Arrange

    // Act
    const r = await pedir('get', '/ana');

    // Assert
    esJson(r, 400);
    expect(r.body).toEqual({ error: 'Id inválido', code: 'VALIDATION_ERROR' });
    expect(mockLecturas).toBe(0);
  });
});

describe('PUT /api/admin/miembros/:id: edit one member of the gym', () => {
  test('should answer 200 with the new data and save only the fields that were sent', async () => {
    // Arrange
    const antes = { ...ANA() };
    const cambios = { nombre: 'Ana Maria Ruiz Diaz', telefono: '3109876543', ciudad: 'Medellin', objetivo: 'Fuerza' };

    // Act
    const r = await pedir('put', '/88').send(cambios);

    // Assert
    esJson(r, 200);
    expect(r.body.message).toBe('Miembro actualizado.');
    expect(r.body.miembro).toMatchObject({ id_miembro: 88, nombre: cambios.nombre, telefono: cambios.telefono, documento: 'CC12345', password_asignada: false });
    expect(ANA()).toEqual({ ...antes, ...cambios });
    expect(mockEscrituras).toBe(1);
  });

  test('should show the saved changes on the next GET, also the fields the PUT response does not bring', async () => {
    // Arrange: la respuesta del PUT no trae ciudad, observaciones ni nivel_experiencia. Las
    // alergias no van aqui: con el #102 pasan por las autorizaciones de datos sensibles.
    await pedir('put', '/88').send({ ciudad: 'Cali', observaciones: 'Viene en la manana', nivel_experiencia: 'Avanzado' });

    // Act
    const r = await pedir('get', '/88');

    // Assert
    esJson(r, 200);
    expect(r.body.miembro).toMatchObject({ ciudad: 'Cali', observaciones: 'Viene en la manana', nivel_experiencia: 'Avanzado', nombre: 'Ana Maria Ruiz' });
  });

  // [caso, cuerpo, campo que debe nombrar el error]
  test.each([
    ['the name has one letter', { nombre: 'A' }, 'nombre'],
    ['the email has no at sign', { email: 'ana.fitloyalty.test' }, 'email'],
    ['the phone has six digits', { telefono: '300123' }, 'telefono'],
    ['activo is not a boolean', { activo: 'si' }, 'activo'],
    ['one field is valid and another is not', { ciudad: 'Cali', nombre: 'A' }, 'nombre'],
  ])('should answer 400 VALIDATION_ERROR and change nothing when %s', async (_caso, cuerpo, campo) => {
    // Arrange
    const antes = { ...ANA() };

    // Act
    const r = await pedir('put', '/88').send(cuerpo);

    // Assert
    esJson(r, 400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues.map((i) => i.path[0])).toContain(campo);
    expect(ANA()).toEqual(antes);
    expect(mockEscrituras).toBe(0);
  });

  test.each([
    ['the body is empty', {}],
    ['it only brings the id and the gym, which are not editable', { id_miembro: 5, id_gimnasio: 8 }],
  ])('should answer 400 VALIDATION_ERROR and change nothing when %s', async (_caso, cuerpo) => {
    // Arrange
    const antes = { ...ANA() };

    // Act
    const r = await pedir('put', '/88').send(cuerpo);

    // Assert
    esJson(r, 400);
    expect(r.body).toEqual({ error: 'Nada que actualizar', code: 'VALIDATION_ERROR' });
    expect(ANA()).toEqual(antes);
    expect(mockEscrituras).toBe(0);
  });

  test('should answer 404 MEMBER_NOT_FOUND and leave the member of the other gym as it was', async () => {
    // Arrange: el 41 es del gimnasio 8; el token es del 7
    const antes = { ...DEL_OTRO_GIMNASIO() };

    // Act
    const r = await pedir('put', '/41').send({ nombre: 'Cambiado' });

    // Assert
    esJson(r, 404);
    expect(r.body).toEqual({ error: 'Miembro no encontrado', code: 'MEMBER_NOT_FOUND' });
    expect(DEL_OTRO_GIMNASIO()).toEqual(antes);
  });

  test('should answer 404 MEMBER_NOT_FOUND and change nothing when no member has that id', async () => {
    // Arrange
    const antes = mockTabla.map((f) => ({ ...f }));

    // Act
    const r = await pedir('put', '/999').send({ nombre: 'Nadie' });

    // Assert
    esJson(r, 404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
    expect(mockTabla).toEqual(antes);
  });
});
