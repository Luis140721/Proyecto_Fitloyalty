/**
 * Bootcamp semana 5 (capa API, Luis): dobles de prueba sobre la invitacion
 * del personal (RQF-01, routes/staff.js).
 *
 * La dependencia externa es el correo. La ruta no usa el SDK de Brevo: llama a
 * sendStaffInvite de lib/email.js, que es nuestra interfaz propia sobre Brevo.
 * Por eso se reemplaza ese modulo y no la libreria. Se prueba que:
 *  - el correo sale una vez y con los datos correctos (a quien, quien invita,
 *    gimnasio, rol y un enlace que de verdad abre la invitacion);
 *  - no sale cuando la invitacion no se crea;
 *  - la invitacion se crea igual si el correo falla, y el admin recibe el
 *    enlace para compartirlo a mano.
 * Tambien el reloj: la invitacion vence a los 7 dias exactos.
 *
 * Dobles de este archivo (el tipo de cada test va en un comentario):
 *  - sendStaffInvite: spy, stub o ambos segun el test.
 *  - BD: fake en memoria con las tablas gimnasio, usuario e invitacion_staff.
 *  - Reloj: stub con jest.setSystemTime (solo se finge la fecha).
 *  - Lectura del personal en authenticate: stub con establecerBusquedaPersonal.
 * Sin red, sin BD real y sin depender de la fecha del dia.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: (...a) => mockBd.connect(...a),
}));
let mockSendStaffInvite;
jest.mock('../src/lib/email', () => ({ sendStaffInvite: (...a) => mockSendStaffInvite(...a) }));

const staffRouter = require('../src/routes/staff');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', staffRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const AHORA = new Date('2026-10-28T15:00:00.000Z');
const UN_DIA = 24 * 60 * 60 * 1000;
const ANA = { email: 'Ana@Gym.co', nombre: 'Ana Perez', rol: 'RECEPCIONISTA' };

/**
 * BD falsa (fake): guarda en memoria las filas de gimnasio, usuario e
 * invitacion_staff y responde cada consulta de la ruta como lo haria
 * PostgreSQL con esos datos. Una consulta que no conoce lanza error, asi un
 * cambio en el SQL no pasa en silencio. Con `fallaCon` simulas la BD caida en
 * una consulta.
 */
function crearBdFalsa() {
  const bd = {
    gimnasios: [{ id_gimnasio: 7, nombre: 'Gym Demo', activo: true, trial_ends_at: null }],
    usuarios: [{ id_usuario: 1, id_gimnasio: 7, nombre: 'Luis Admin', email: 'luis@gym.co', id_rol: 1 }],
    invitaciones: [],
    fallaCon: null,
  };
  const vigente = (i) => !i.fecha_aceptacion && !i.fecha_revocado && i.fecha_expiracion > new Date();
  const delGimnasio = (id) => bd.gimnasios.filter((g) => g.id_gimnasio === id);

  async function query(sql, params = []) {
    if (bd.fallaCon && bd.fallaCon.test(sql)) throw new Error('conexion perdida');
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql)) return { rows: [] };
    if (/information_schema/.test(sql)) {
      return { rows: [{ rol_exists: false, roles_exists: false, has_fecha_creacion: true, has_ultimo_acceso: false, has_rol_column: false }] };
    }
    if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: delGimnasio(params[0]) };
    if (/SELECT nombre FROM gimnasio/.test(sql)) return { rows: delGimnasio(params[0]).map(({ nombre }) => ({ nombre })) };
    if (/SELECT id_usuario FROM usuario WHERE LOWER\(email\) = \$1 AND id_gimnasio = \$2/.test(sql)) {
      const [email, gym] = params;
      return { rows: bd.usuarios.filter((u) => u.email.toLowerCase() === email && u.id_gimnasio === gym).map(({ id_usuario }) => ({ id_usuario })) };
    }
    if (/SELECT id_invitacion FROM invitacion_staff/.test(sql)) {
      const [email, gym] = params;
      return { rows: bd.invitaciones.filter((i) => i.email === email && i.id_gimnasio === gym && vigente(i)).map(({ id_invitacion }) => ({ id_invitacion })) };
    }
    if (/INSERT INTO invitacion_staff/.test(sql)) {
      const [id_gimnasio, email, nombre, rol_asignado, token_hash, id_usuario_creador, fecha_expiracion] = params;
      const inv = {
        id_invitacion: bd.invitaciones.length + 1, id_gimnasio, email, nombre, rol_asignado, token_hash,
        id_usuario_creador, fecha_creacion: new Date(), fecha_expiracion, fecha_aceptacion: null, fecha_revocado: null,
      };
      bd.invitaciones.push(inv);
      return { rows: [{ id_invitacion: inv.id_invitacion, email, nombre, rol_asignado, fecha_creacion: inv.fecha_creacion, fecha_expiracion }] };
    }
    if (/FROM invitacion_staff\s+WHERE id_gimnasio = \$1\s+ORDER BY/.test(sql)) {
      return { rows: bd.invitaciones.filter((i) => i.id_gimnasio === params[0]).map((i) => ({ ...i, pendiente: vigente(i) })) };
    }
    if (/UPDATE invitacion_staff\s+SET fecha_revocado/.test(sql)) {
      const inv = bd.invitaciones.find((i) => i.id_invitacion === params[0] && i.id_gimnasio === params[1] && !i.fecha_aceptacion && !i.fecha_revocado);
      if (!inv) return { rows: [] };
      inv.fecha_revocado = new Date();
      return { rows: [{ id_invitacion: inv.id_invitacion, fecha_revocado: inv.fecha_revocado }] };
    }
    if (/FROM invitacion_staff i\s+INNER JOIN gimnasio g/.test(sql)) {
      const inv = bd.invitaciones.find((i) => i.token_hash === params[0]);
      return { rows: inv ? [{ ...inv, gym_nombre: delGimnasio(inv.id_gimnasio)[0].nombre }] : [] };
    }
    if (/FROM invitacion_staff\s+WHERE token_hash = \$1\s+FOR UPDATE/.test(sql)) {
      return { rows: bd.invitaciones.filter((i) => i.token_hash === params[0]) };
    }
    if (/INSERT INTO usuario/.test(sql)) {
      const columnas = sql.match(/INSERT INTO usuario \(([^)]+)\)/)[1].split(',').map((c) => c.trim());
      const usuario = { id_usuario: bd.usuarios.length + 1 };
      columnas.forEach((c, n) => { usuario[c] = params[n]; });
      bd.usuarios.push(usuario);
      const { id_usuario, nombre, email, id_gimnasio, id_rol } = usuario;
      return { rows: [{ id_usuario, nombre, email, id_gimnasio, id_rol }] };
    }
    if (/UPDATE invitacion_staff\s+SET fecha_aceptacion/.test(sql)) {
      bd.invitaciones.find((i) => i.id_invitacion === params[1]).fecha_aceptacion = new Date();
      return { rows: [] };
    }
    throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 60));
  }

  bd.query = query;
  bd.connect = async () => ({ query, release: () => {} });
  return bd;
}

let tokenAdmin;
const invitar = (datos) => request(app).post('/api/admin/staff/invite').set('Authorization', `Bearer ${tokenAdmin}`).send(datos);
const verInvitacion = (token) => request(app).get(`/api/auth/accept-invite/${token}`);
const aceptar = (token) => request(app).post('/api/auth/accept-invite').send({ token, password: 'clave123' });
// El enlace que recibio la persona en el unico correo del test, y su token.
const enlaceDelCorreo = () => mockSendStaffInvite.mock.calls[0][0].acceptUrl;
const tokenDelCorreo = () => new URL(enlaceDelCorreo()).searchParams.get('token');

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: p.role === 'admin' ? 'ADMINISTRADOR' : 'RECEPCIONISTA' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  // Copia del entorno: el enlace no depende de tu .env.
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: 'secreto-de-pruebas', FRONTEND_URL: 'https://app.test/' };
  // Solo se finge la fecha: los timers reales siguen para que supertest funcione.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'] });
  jest.setSystemTime(AHORA);
  tokenAdmin = jwt.sign({ id: 1, name: 'Luis Admin', email: 'luis@gym.co', role: 'admin', gymId: 7 }, 'secreto-de-pruebas', { expiresIn: '1h' });
  mockBd = crearBdFalsa();
  // Por defecto el correo sale bien, con la misma forma que devuelve email.js.
  mockSendStaffInvite = jest.fn().mockResolvedValue({ delivered: true, id: 'msg-1' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('POST /api/admin/staff/invite: the invitation email', () => {
  test('should send one email with the invitee, the inviter, the gym, the role and the link when the data is valid', async () => {
    // Doble: spy en sendStaffInvite. Verifica comportamiento (con que se llamo),
    // porque el correo es el efecto hacia afuera que le importa a la persona invitada.
    // Arrange: la BD falsa ya tiene el gimnasio 7 y su admin

    // Act
    const r = await invitar(ANA);

    // Assert
    expect(r.status).toBe(201);
    expect(mockSendStaffInvite).toHaveBeenCalledTimes(1);
    expect(mockSendStaffInvite).toHaveBeenCalledWith({
      to: 'ana@gym.co',
      invitedName: 'Ana Perez',
      invitedBy: 'Luis Admin',
      gymName: 'Gym Demo',
      role: 'RECEPCIONISTA',
      acceptUrl: r.body.acceptUrl,
      expiresDays: 7,
    });
    expect(enlaceDelCorreo()).toMatch(/^https:\/\/app\.test\/accept-invite\?token=[\w-]{43}$/);
    expect(r.body.emailDelivered).toBe(true);
    expect(r.body).not.toHaveProperty('devAcceptToken');
  });

  test('should build the email link with the first origin when FRONTEND_URL lists several', async () => {
    // Doble: spy en sendStaffInvite. Verifica comportamiento: el enlace que recibe
    // la persona. FRONTEND_URL es la lista de origenes de CORS separada por comas
    // (index.js); entera dentro del enlace lo rompia.
    // Arrange
    process.env.FRONTEND_URL = 'https://app.test, https://admin.app.test';

    // Act
    await invitar(ANA);

    // Assert
    expect(enlaceDelCorreo()).toMatch(/^https:\/\/app\.test\/accept-invite\?token=[\w-]{43}$/);
  });

  test('should send a link that opens the invitation it just created', async () => {
    // Dobles: spy en sendStaffInvite para leer el enlace que recibio la persona,
    // y fake de la BD que guarda la invitacion. Verifica estado: lo que muestra
    // la invitacion al abrir ese enlace (si el token del correo no fuera el
    // guardado, nadie podria unirse al equipo).
    // Arrange
    await invitar(ANA);

    // Act
    const r = await verInvitacion(tokenDelCorreo());

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ email: 'ana@gym.co', nombre: 'Ana Perez', rol: 'RECEPCIONISTA', gym: 'Gym Demo' });
  });

  test.each([
    ['the email already belongs to a user of the gym', (bd) => bd.usuarios.push({ id_usuario: 2, id_gimnasio: 7, nombre: 'Ana', email: 'ana@gym.co', id_rol: 2 }), ANA, 409, 'USER_EMAIL_TAKEN'],
    ['the email already has an active invitation', (bd) => bd.invitaciones.push({
      id_invitacion: 1, id_gimnasio: 7, email: 'ana@gym.co', nombre: 'Ana', rol_asignado: 'RECEPCIONISTA', token_hash: 'h',
      fecha_creacion: AHORA, fecha_expiracion: new Date(AHORA.getTime() + UN_DIA), fecha_aceptacion: null, fecha_revocado: null,
    }), ANA, 409, 'INVITE_DUPLICATED'],
    ['the email is not valid', () => {}, { ...ANA, email: 'ana-gym.co' }, 400, 'VALIDATION_ERROR'],
    ['the invitation cannot be saved', (bd) => { bd.fallaCon = /INSERT INTO invitacion_staff/; }, ANA, 503, 'DB_UNREACHABLE'],
    ['the gym trial has ended', (bd) => { bd.gimnasios[0].trial_ends_at = new Date(AHORA.getTime() - 1); }, ANA, 402, 'TRIAL_EXPIRED'],
  ])('should not send any email when %s', async (_caso, prepararBd, datos, status, code) => {
    // Doble: spy en sendStaffInvite con not.toHaveBeenCalled. Un correo de mas le
    // llega a una persona real y no se puede deshacer. El fake de la BD prepara el caso.
    // Arrange
    prepararBd(mockBd);
    const invitacionesAntes = mockBd.invitaciones.length;

    // Act
    const r = await invitar(datos);

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
    expect(mockSendStaffInvite).not.toHaveBeenCalled();
    expect(mockBd.invitaciones).toHaveLength(invitacionesAntes);
  });

  test('should keep the invitation and return the link to share by hand when the mail provider rejects the email', async () => {
    // Doble: stub de sendStaffInvite que responde { delivered: false, reason: 'api-error' },
    // lo mismo que devuelve email.js cuando Brevo rechaza el envio (no lanza).
    // Verifica estado: la respuesta y la lista de invitaciones del admin.
    // Arrange
    mockSendStaffInvite.mockResolvedValue({ delivered: false, reason: 'api-error', error: 'Unauthorized' });

    // Act
    const r = await invitar(ANA);
    const lista = await request(app).get('/api/admin/staff/invitations').set('Authorization', `Bearer ${tokenAdmin}`);

    // Assert
    expect(r.status).toBe(201);
    expect(r.body.emailDelivered).toBe(false);
    expect(r.body.acceptUrl).toBe(`https://app.test/accept-invite?token=${r.body.devAcceptToken}`);
    expect(lista.body.invitations).toEqual([expect.objectContaining({ email: 'ana@gym.co', pendiente: true })]);
  });

  test('should still create the invitation and log the error when the mailer throws', async () => {
    // Dobles: stub de sendStaffInvite que lanza (pasa si el SDK de Brevo falla al
    // crearse: getClient queda fuera del try de sendViaBrevo) y spy en
    // console.error para verificar el registro sin ensuciar la salida del test.
    // Arrange
    mockSendStaffInvite.mockRejectedValue(new Error('sdk sin red'));

    // Act
    const r = await invitar(ANA);

    // Assert
    expect(r.status).toBe(201);
    expect(r.body.emailDelivered).toBe(false);
    expect(r.body.devAcceptToken).toEqual(expect.any(String));
    expect(mockBd.invitaciones).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith('[POST /admin/staff/invite] Error enviando mail (no bloqueante):', 'sdk sin red');
  });
});

describe('accept link: the clock and the invitation state', () => {
  test('should make the invitation expire exactly 7 days after it is sent', async () => {
    // Doble: stub del reloj (jest.setSystemTime fija "ahora"), asi la fecha esperada
    // no depende del dia en que corras el test. Verifica estado: la fecha que
    // queda guardada en el fake de la BD y la que devuelve la respuesta.
    // Arrange
    const vence = new Date(AHORA.getTime() + 7 * UN_DIA);

    // Act
    const r = await invitar(ANA);

    // Assert
    expect(mockBd.invitaciones[0].fecha_expiracion).toEqual(vence);
    expect(r.body.invitation.fecha_expiracion).toBe(vence.toISOString());
  });

  test.each([
    { momento: 'at the last millisecond of the 7 days', despues: 0, status: 200 },
    { momento: '1 ms after the 7 days', despues: 1, status: 410 },
  ])('should answer $status when the link is opened $momento', async ({ despues, status }) => {
    // Doble: stub del reloj. Muevo "ahora" hasta el limite de la vigencia; la
    // comparacion es estricta (<), asi que el ultimo milisegundo aun vale.
    // El spy en sendStaffInvite solo entrega el enlace.
    // Arrange
    await invitar(ANA);
    jest.setSystemTime(AHORA.getTime() + 7 * UN_DIA + despues);

    // Act
    const r = await verInvitacion(tokenDelCorreo());

    // Assert
    expect(r.status).toBe(status);
    if (status === 410) expect(r.body.code).toBe('INVITE_EXPIRED');
  });

  test('should create the account only once with the link from the email', async () => {
    // Dobles: spy en sendStaffInvite (de ahi sale el enlace) y fake de la BD, que
    // guarda el usuario y marca la invitacion. Verifica estado: el usuario creado
    // y que el segundo uso del mismo enlace ya no crea otro.
    // Arrange
    await invitar(ANA);
    const token = tokenDelCorreo();

    // Act
    const primera = await aceptar(token);
    const segunda = await aceptar(token);

    // Assert
    expect(primera.status).toBe(201);
    expect(primera.body.user).toMatchObject({ name: 'Ana Perez', email: 'ana@gym.co', role: 'receptionist', gymId: 7 });
    expect(mockBd.usuarios.filter((u) => u.email === 'ana@gym.co')).toEqual([expect.objectContaining({ id_rol: 2, id_gimnasio: 7 })]);
    expect(mockBd.invitaciones[0].fecha_aceptacion).toEqual(AHORA);
    expect(segunda.status).toBe(410);
    expect(segunda.body.code).toBe('INVITE_ALREADY_ACCEPTED');
  });

  test('should say the invitation was already used when the link is opened after creating the account', async () => {
    // Dobles: fake de la BD (la invitacion queda aceptada) y spy en sendStaffInvite
    // solo para leer el enlace. Verifica estado: lo que ve la persona si vuelve a
    // abrir el correo. Lo agregue porque el mutante que quita este chequeo en la
    // vista previa quedaba vivo.
    // Arrange
    await invitar(ANA);
    await aceptar(tokenDelCorreo());

    // Act
    const r = await verInvitacion(tokenDelCorreo());

    // Assert
    expect(r.status).toBe(410);
    expect(r.body.code).toBe('INVITE_ALREADY_ACCEPTED');
  });

  test('should stop the emailed link from working when the admin revokes the invitation', async () => {
    // Dobles: fake de la BD (la revocacion queda guardada) y spy en sendStaffInvite
    // solo para leer el enlace. Verifica estado: el enlace ya no abre ni crea la cuenta.
    // Arrange
    const invitacion = await invitar(ANA);
    const id = invitacion.body.invitation.id_invitacion;

    // Act
    const revocar = await request(app).post(`/api/admin/staff/invitations/${id}/revoke`).set('Authorization', `Bearer ${tokenAdmin}`);
    const vista = await verInvitacion(tokenDelCorreo());
    const cuenta = await aceptar(tokenDelCorreo());

    // Assert
    expect(revocar.status).toBe(200);
    expect(vista.status).toBe(410);
    expect(vista.body.code).toBe('INVITE_REVOKED');
    expect(cuenta.status).toBe(410);
    expect(cuenta.body.code).toBe('INVITE_REVOKED');
    expect(mockBd.usuarios).toHaveLength(1);
  });
});
