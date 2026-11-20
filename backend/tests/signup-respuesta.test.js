/**
 * Regresion: el registro devolvia `gym.nombre` mientras login y /me devuelven
 * `gym.name`, que es lo que lee el panel (AdminLayout, MenuPerfil y
 * EliminarCuentaPage). Justo despues de registrarse salia "Tu gimnasio" y solo
 * al recargar aparecia el nombre real.
 *
 * La base se simula: pool.connect() entrega un cliente falso que responde cada
 * consulta de la transaccion del signup, y pool.query responde la del login.
 * No hay red, ni base real, ni dependencia de la fecha.
 */
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const mockClientQuery = jest.fn();
const mockPoolQuery = jest.fn();
jest.mock('../src/db/db', () => ({
  connect: async () => ({ query: (...a) => mockClientQuery(...a), release: () => {} }),
  query: (...a) => mockPoolQuery(...a),
}));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const authRouter = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const ID_GIMNASIO = 42;
const ID_DUENO = 7;
const VENCE_TRIAL = '2030-01-08T00:00:00.000Z';
const NOMBRE_GIMNASIO = 'Gimnasio Central';
const PASSWORD = 'clave123';

const registro = (cambios = {}) => ({
  gymName: `  ${NOMBRE_GIMNASIO}  `,
  gymPhone: '3001234567',
  ownerName: 'Luis Prueba',
  ownerEmail: 'dueno@gimnasio-prueba.test',
  password: PASSWORD,
  ...cambios,
});

// Responde cada consulta de la transaccion del signup como lo haria
// PostgreSQL: sin duplicados y devolviendo lo que se inserto.
async function transaccionSignup(sql, params) {
  if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/.test(sql.trim())) return { rows: [] };
  if (/FROM (gimnasio|usuario) WHERE LOWER\(email\)/.test(sql)) return { rows: [] };
  if (/INSERT INTO gimnasio/.test(sql)) {
    return {
      rows: [{
        id_gimnasio: ID_GIMNASIO, nombre: params[0], telefono: params[1],
        email: params[2], trial_ends_at: VENCE_TRIAL, activo: true,
      }],
    };
  }
  if (/INSERT INTO usuario/.test(sql)) {
    return { rows: [{ id_usuario: ID_DUENO, nombre: params[1], email: params[2], id_gimnasio: params[0], id_rol: 1 }] };
  }
  if (/UPDATE gimnasio SET id_dueno|INSERT INTO configuracion_gimnasio/.test(sql)) return { rows: [] };
  throw new Error(`Consulta no prevista en el test: ${sql}`);
}

let app;
let hashDueno;
beforeAll(async () => {
  // Costo 4: el hash solo sirve para que el login compare, no para proteger nada.
  hashDueno = await bcrypt.hash(PASSWORD, 4);
  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  mockClientQuery.mockImplementation(transaccionSignup);
  // El login lee el mismo gimnasio que acaba de crear el registro.
  mockPoolQuery.mockImplementation(async () => ({
    rows: [{
      id_usuario: ID_DUENO, nombre: 'Luis Prueba', email: 'dueno@gimnasio-prueba.test',
      password_hash: hashDueno, id_gimnasio: ID_GIMNASIO, activo: true,
      gym_activo: true, trial_ends_at: VENCE_TRIAL, gym_nombre: NOMBRE_GIMNASIO,
      gym_logo: null, rol_nombre: 'ADMINISTRADOR',
    }],
  }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/auth/signup: datos del gimnasio en la respuesta', () => {
  test('should return 201 with gym.name equal to the trimmed gym name when the signup data is valid', async () => {
    // Arrange
    const datos = registro();

    // Act
    const r = await request(app).post('/api/auth/signup').send(datos);

    // Assert
    expect(r.status).toBe(201);
    expect(r.body.gym.name).toBe(NOMBRE_GIMNASIO);
    expect(r.body.gym).not.toHaveProperty('nombre');
  });

  test('should return the same gym id, name and active as login when the owner signs up and then logs in', async () => {
    // Arrange
    const datos = registro();

    // Act
    const signup = await request(app).post('/api/auth/signup').send(datos);
    const login = await request(app).post('/api/auth/login').send({ email: datos.ownerEmail, password: PASSWORD });

    // Assert
    expect(signup.status).toBe(201);
    expect(login.status).toBe(200);
    // Son las claves que lee el panel; si una cambia de nombre, el panel
    // muestra otra cosa hasta que recargas.
    for (const clave of ['id', 'name', 'active']) {
      expect(signup.body.gym[clave]).toBeDefined();
      expect(signup.body.gym[clave]).toEqual(login.body.gym[clave]);
    }
  });
});
