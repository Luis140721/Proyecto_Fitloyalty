/**
 * Cuentas y perfil (2026-11-25):
 *  - RQF-17: el codigo de recuperacion sale de un generador criptografico y
 *    pedir uno nuevo anula los anteriores de esa persona.
 *  - RQF-01: al desactivar o bajar de rol a un administrador se revocan sus
 *    invitaciones pendientes, y una invitacion solo sirve mientras quien la
 *    creo siga siendo administrador activo del gimnasio.
 *  - RQF-15: guardar el perfil en la app no borra los campos que la pantalla
 *    manda vacios.
 *
 * Dobles: BD en memoria (staff-bd-falsa.js para el personal y una minima aqui
 * para los codigos y el perfil) y el correo. Las sentencias se comprueban
 * contra PostgreSQL en la descripcion del PR.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: (...a) => mockBd.connect(...a),
}));
const mockCorreos = [];
jest.mock('../src/lib/email', () => ({
  ...jest.requireActual('../src/lib/email'),
  sendRecoveryCode: async (datos) => { mockCorreos.push(datos); return { delivered: true }; },
  sendStaffInvite: async (datos) => { mockCorreos.push(datos); return { delivered: true }; },
}));

const authRouter = require('../src/routes/auth');
const staffRouter = require('../src/routes/staff');
const clienteRouter = require('../src/routes/cliente');
const { random6, generarTokenCliente } = require('../src/lib/auth-helpers');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');
const { crearBdFalsa } = require('./staff-bd-falsa');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api', staffRouter);
app.use('/api/cliente', clienteRouter);
app.use(errorHandler);

const SECRETO = 'secreto-de-pruebas';
const ENV_ORIGINAL = process.env;

beforeAll(() => {
  // Como authenticate: el rol y el estado salen de la base, no del token.
  establecerBusquedaPersonal((p) => {
    const u = mockBd.usuarios.find((x) => x.id_usuario === p.id);
    return u && { activo: u.activo, id_gimnasio: u.id_gimnasio, rol_nombre: u.id_rol === 1 ? 'ADMINISTRADOR' : 'RECEPCIONISTA' };
  });
});
afterAll(() => establecerBusquedaPersonal(null));
beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO, FRONTEND_URL: 'https://app.test' };
  mockCorreos.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('recovery code', () => {
  test('should come from the cryptographic generator, between 100000 and 999999', () => {
    const randomInt = jest.spyOn(crypto, 'randomInt').mockReturnValue(654321);
    const mathRandom = jest.spyOn(Math, 'random');

    expect(random6()).toBe('654321');

    expect(randomInt.mock.calls).toEqual([[100000, 1000000]]);
    expect(mathRandom).not.toHaveBeenCalled();
  });

  /** Usuarios 5 y 6, y la tabla password_reset con lo que hace cada sentencia de auth.js. */
  function bdDeCodigos() {
    const codigos = [];
    const usuarios = [{ id_usuario: 5, nombre: 'Ana', email: 'ana@gym.co' }, { id_usuario: 6, nombre: 'Beto', email: 'beto@gym.co' }];
    return {
      codigos,
      usuarios,
      async query(sql, params = []) {
        if (/CREATE TABLE IF NOT EXISTS password_reset/.test(sql)) return { rows: [] };
        if (/FROM usuario WHERE LOWER\(email\) = \$1 AND activo = TRUE/.test(sql)) return { rows: usuarios.filter((u) => u.email === params[0]) };
        if (/INSERT INTO password_reset/.test(sql)) {
          if (/^WITH anteriores AS \(\s*UPDATE password_reset SET used = TRUE WHERE id_usuario = \$1 AND used = FALSE\s*\)/.test(sql.trim())) {
            for (const c of codigos) if (c.id_usuario === params[0]) c.used = true;
          }
          codigos.push({ id_reset: codigos.length + 1, id_usuario: params[0], code: params[1], expires_at: params[2], used: false });
          return { rows: [] };
        }
        if (/FROM password_reset/.test(sql)) return { rows: codigos.filter((c) => c.id_usuario === params[0] && c.code === params[1]).reverse().slice(0, 1) };
        if (/UPDATE password_reset SET used = TRUE WHERE id_reset = \$1/.test(sql)) { codigos.find((c) => c.id_reset === params[0]).used = true; return { rows: [] }; }
        throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 60));
      },
    };
  }
  const pedirCodigo = async (email) => {
    await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
    return mockCorreos.at(-1).code;
  };
  const verificar = (email, code) => request(app).post('/api/auth/verify-reset-code').send({ email, code });

  test('should reject the first code and accept the second when a new one is requested', async () => {
    mockBd = bdDeCodigos();
    const primero = await pedirCodigo('ana@gym.co');
    const segundo = await pedirCodigo('ana@gym.co');

    const conElPrimero = await verificar('ana@gym.co', primero);
    const conElSegundo = await verificar('ana@gym.co', segundo);

    expect([conElPrimero.status, conElPrimero.body.error]).toEqual([400, 'Codigo ya usado']);
    expect(conElSegundo.status).toBe(200);
  });

  test('should keep the code of another person alive when someone requests a new one', async () => {
    mockBd = bdDeCodigos();
    const deBeto = await pedirCodigo('beto@gym.co');
    await pedirCodigo('ana@gym.co');

    expect((await verificar('beto@gym.co', deBeto)).status).toBe(200);
  });
});

describe('invitations of an administrator who is no longer one', () => {
  const token = (id) => jwt.sign({ id, name: `Usuario ${id}`, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
  const DUENO = 1;
  const OTRO = 2;
  const invitar = async (quien, datos) => {
    const r = await request(app).post('/api/admin/staff/invite').set('Authorization', `Bearer ${token(quien)}`).send(datos);
    expect(r.status).toBe(201);
    return new URL(mockCorreos.at(-1).acceptUrl).searchParams.get('token');
  };
  const editar = (id, cambios) => request(app).patch(`/api/admin/staff/${id}`).set('Authorization', `Bearer ${token(DUENO)}`).send(cambios);
  const ver = (t) => request(app).get(`/api/auth/accept-invite/${t}`);
  const aceptar = (t) => request(app).post('/api/auth/accept-invite').send({ token: t, password: 'clave123' });
  const NUEVO = { email: 'nuevo@gym.co', nombre: 'Nuevo Admin', rol: 'ADMINISTRADOR' };

  beforeEach(() => {
    mockBd = crearBdFalsa();
    mockBd.usuarios.push({ id_usuario: OTRO, id_gimnasio: 7, nombre: 'Otro Admin', email: 'otro@gym.co', id_rol: 1, activo: true, fecha_creacion: new Date('2026-02-01T00:00:00Z') });
  });

  test.each([
    ['deactivated', { activo: false }],
    ['demoted', { rol: 'RECEPCIONISTA' }],
  ])('should stop working when the admin who created it is %s', async (_caso, cambios) => {
    const t = await invitar(OTRO, NUEVO);
    expect((await ver(t)).status).toBe(200);

    expect((await editar(OTRO, cambios)).status).toBe(200);

    expect(mockBd.invitaciones[0].fecha_revocado).toBeInstanceOf(Date);
    expect([(await ver(t)).status, (await ver(t)).body.code]).toEqual([410, 'INVITE_REVOKED']);
    const r = await aceptar(t);
    expect([r.status, r.body.code]).toEqual([410, 'INVITE_REVOKED']);
    expect(mockBd.usuarios.map((u) => u.email)).toEqual(['luis@gym.co', 'otro@gym.co']);
  });

  test('should stay revoked when the admin is reactivated', async () => {
    const t = await invitar(OTRO, NUEVO);
    await editar(OTRO, { activo: false });
    await editar(OTRO, { activo: true });

    expect((await aceptar(t)).status).toBe(410);
  });

  // Invitaciones de antes de este cambio: nadie las revoco, pero su creador ya no es admin activo.
  test.each([
    ['is inactive', { activo: false }],
    ['is a receptionist', { id_rol: 2 }],
    ['belongs to another gym', { id_gimnasio: 9 }],
  ])('should not work, although nobody revoked it, when its creator %s', async (_caso, cambios) => {
    const t = await invitar(OTRO, NUEVO);
    Object.assign(mockBd.usuarios[1], cambios);

    expect((await ver(t)).body.code).toBe('INVITE_REVOKED');
    expect((await aceptar(t)).body.code).toBe('INVITE_REVOKED');
    expect(mockBd.usuarios).toHaveLength(2);
  });

  test.each([
    ['renamed', { nombre: 'Otro Nombre' }],
    ['saved again as an active admin', { activo: true, rol: 'ADMINISTRADOR' }],
  ])('should keep working when the admin who created it is only %s', async (_caso, cambios) => {
    const t = await invitar(OTRO, NUEVO);

    expect((await editar(OTRO, cambios)).status).toBe(200);

    expect(mockBd.invitaciones[0].fecha_revocado).toBeNull();
    expect((await aceptar(t)).status).toBe(201);
  });

  test('should not touch the invitations of the other admins, of other gyms nor the ones already accepted', async () => {
    const delDueno = await invitar(DUENO, { ...NUEVO, email: 'dos@gym.co' });
    await invitar(OTRO, NUEVO);
    mockBd.invitaciones.push(
      { id_invitacion: 90, id_gimnasio: 9, email: 'x@otro.co', nombre: 'X', rol_asignado: 'RECEPCIONISTA', token_hash: 'h', id_usuario_creador: OTRO, fecha_aceptacion: null, fecha_revocado: null },
      { id_invitacion: 91, id_gimnasio: 7, email: 'y@gym.co', nombre: 'Y', rol_asignado: 'RECEPCIONISTA', token_hash: 'i', id_usuario_creador: OTRO, fecha_aceptacion: new Date(), fecha_revocado: null },
    );

    await editar(OTRO, { activo: false });

    expect(mockBd.invitaciones.filter((i) => i.fecha_revocado).map((i) => i.email)).toEqual(['nuevo@gym.co']);
    expect((await aceptar(delDueno)).status).toBe(201);
  });

  // Neon tiene ademas la columna legacy `rol`: un parametro mas en el mismo UPDATE.
  test.each([false, true])('should revoke the right invitations when name, role and state change together (rol column: %s)', async (hasRol) => {
    mockBd.esquema.has_rol_column = hasRol;
    const delDueno = await invitar(DUENO, { ...NUEVO, email: 'dos@gym.co' });
    await invitar(OTRO, NUEVO);

    expect((await editar(OTRO, { nombre: 'Otro Nombre', rol: 'RECEPCIONISTA', activo: false })).status).toBe(200);

    expect(mockBd.invitaciones.filter((i) => i.fecha_revocado).map((i) => i.email)).toEqual(['nuevo@gym.co']);
    expect(mockBd.usuarios[1]).toEqual(expect.objectContaining({ nombre: 'Otro Nombre', id_rol: 2, activo: false, ...(hasRol && { rol: 'RECEPCIONISTA' }) }));
    expect((await ver(delDueno)).status).toBe(200);
  });

  test('should not revoke anything when a receptionist is deactivated', async () => {
    mockBd.usuarios.push({ id_usuario: 3, id_gimnasio: 7, nombre: 'Recep', email: 'recep@gym.co', id_rol: 2, activo: true, fecha_creacion: new Date() });
    await invitar(OTRO, NUEVO);

    expect((await editar(3, { activo: false })).status).toBe(200);

    expect(mockBd.invitaciones[0].fecha_revocado).toBeNull();
  });
});

describe('PUT /api/cliente/me: the fields the app sends empty', () => {
  const FILA = { id_miembro: 41, id_gimnasio: 7, nombre: 'Ana', documento: '1020304050', telefono: '3109876543', email: null, codigo_qr: 'QR', qr_imagen: null, foto_url: null, activo: true, fecha_registro: '2026-01-10T00:00:00.000Z' };
  let consultas;
  let autorizado;
  beforeEach(() => {
    consultas = [];
    autorizado = true;
    mockBd = {
      usuarios: [],
      async query(sql, params = []) {
        consultas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        if (/^\s*UPDATE miembro SET/.test(sql)) return { rows: [FILA] };
        if (/SELECT 1 FROM miembro/.test(sql)) return { rows: [] };
        if (/autorizacion/.test(sql)) return { rows: autorizado ? [{ tipo: 'DATOS_SENSIBLES', otorgada: true, version: 'v1', fecha: new Date() }] : [] };
        throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 60));
      },
    };
  });
  const guardar = (cuerpo) => request(app).put('/api/cliente/me')
    .set('Authorization', `Bearer ${generarTokenCliente({ id_miembro: 41, id_gimnasio: 7, documento: '1020304050' })}`).send(cuerpo);
  const update = () => consultas.find((c) => c.sql.startsWith('UPDATE miembro SET'));
  const VACIOS = { direccion: '', contacto_emergencia: '', telefono_emergencia: '', condiciones_medicas: '', alergias: '', objetivo: '' };

  // Lo que manda la pantalla «Editar perfil» cuando solo se cambia el telefono.
  test('should change only the phone and the email when the other fields arrive empty', async () => {
    const r = await guardar({ telefono: '3109876543', email: 'ana@gym.co', ...VACIOS });

    expect(r.status).toBe(200);
    expect(update().sql).toMatch(/^UPDATE miembro SET telefono = \$1, email = \$2 WHERE id_miembro = \$3 AND id_gimnasio = \$4/);
    expect(update().params).toEqual(['3109876543', 'ana@gym.co', 41, 7]);
    expect(r.body.datos_sensibles_descartados).toBe(false);
  });

  test('should not look at the authorizations when the health data is not sent', async () => {
    expect((await guardar({ telefono: '3109876543' })).status).toBe(200);

    expect(consultas.some((c) => /autorizacion/.test(c.sql))).toBe(false);
  });

  // RQNF-17 (docs/evidencias/rqnf-17-datos-sensibles-menores.md): sin autorizacion quedan en NULL.
  test.each([
    ['both arrive empty', { condiciones_medicas: '', alergias: '' }, false],
    ['only the conditions are written', { condiciones_medicas: 'Asma', alergias: '' }, true],
    ['only the allergies are written', { condiciones_medicas: '', alergias: 'Polen' }, true],
    ['only the allergies are sent', { alergias: 'Polen' }, true],
  ])('should leave both health fields in NULL without authorization when %s', async (_caso, salud, descartados) => {
    autorizado = false;

    const r = await guardar({ telefono: '3109876543', ...salud });

    expect(r.status).toBe(200);
    expect(r.body.datos_sensibles_descartados).toBe(descartados);
    expect(update().sql).toMatch(/condiciones_medicas = \$\d, alergias = \$\d|alergias = \$\d, condiciones_medicas = \$\d/);
    expect(update().params).toEqual(['3109876543', null, null, 41, 7]);
  });

  test('should save only the health field the member writes when it is authorized', async () => {
    const r = await guardar({ telefono: '3109876543', condiciones_medicas: '', alergias: 'Polen' });

    expect(r.body.datos_sensibles_descartados).toBe(false);
    expect(update().sql).toMatch(/SET telefono = \$1, alergias = \$2 WHERE/);
    expect(update().params).toEqual(['3109876543', 'Polen', 41, 7]);
  });

  test.each(Object.keys(VACIOS))('should not erase %s when it arrives empty or with spaces', async (campo) => {
    expect((await guardar({ telefono: '3109876543', [campo]: '' })).status).toBe(200);
    expect((await guardar({ telefono: '3109876543', [campo]: '   ' })).status).toBe(200);

    for (const c of consultas.filter(({ sql }) => sql.startsWith('UPDATE miembro'))) expect(c.sql).not.toContain(campo);
  });

  test.each(['direccion', 'contacto_emergencia', 'telefono_emergencia', 'objetivo'])('should save %s when the member writes it', async (campo) => {
    expect((await guardar({ [campo]: 'Texto nuevo' })).status).toBe(200);

    expect(update().sql).toContain(`${campo} = $1`);
    expect(update().params).toEqual(['Texto nuevo', 41, 7]);
  });

  test('should save no email as NULL, not as an empty text that clashes with other members without email', async () => {
    expect((await guardar({ telefono: '3109876543', email: '' })).status).toBe(200);

    expect(update().params).toEqual(['3109876543', null, 41, 7]);
  });

  test('should answer 400 EMPTY_UPDATE without writing when everything arrives empty', async () => {
    const r = await guardar(VACIOS);

    expect([r.status, r.body.code]).toEqual([400, 'EMPTY_UPDATE']);
    expect(consultas).toEqual([]);
  });
});
