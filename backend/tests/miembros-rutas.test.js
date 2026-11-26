/**
 * Rutas de miembros (routes/miembros.js): lista, alta, busqueda, detalle,
 * edicion, baja, plan y congelamiento (RQF-03, RQF-04, RQF-21).
 *
 * Punto de partida: los escenarios de backend/tests/miembros-rutas.test.js de
 * la rama chore/ci-completo-semana-08-e2e, reescritos con el arnes de las demas
 * pruebas: el authenticate real con JWT, un caso por test y sin simular
 * librerias de terceros (bcrypt y qrcode son los reales).
 *
 * Dobles:
 *  - BD: stub por consulta. Cada test declara que responde a que SQL; una
 *    consulta que no esta declarada lanza error. Las llamadas quedan anotadas
 *    para verificar que se escribio y con que datos.
 *  - Lectura del personal en authenticate: stub (admin o recepcion segun el token).
 *  - Correo y WhatsApp: lib/email y lib/whatsapp, nuestras interfaces sobre
 *    Brevo y whatsapp-web.js; stubs que responden o fallan.
 *  - Reloj: stub con jest.setSystemTime donde importa la fecha de hoy.
 *
 * El caso de la fecha de nacimiento vacia del PUT esta en miembros-update.test.js.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

let mockReglas = [];
let mockLlamadas = [];
let mockLiberadas = 0;
const mockGimnasio = { id_gimnasio: 7, activo: true, trial_ends_at: null };

async function mockEjecutar(sql, params = [], enTransaccion = false) {
  mockLlamadas.push({ sql, params, enTransaccion });
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [mockGimnasio] };
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql)) return { rows: [] };
  if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
  for (const [patron, respuesta] of mockReglas) if (patron.test(sql)) return respuesta(params, sql);
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
}
jest.mock('../src/db/db', () => ({
  query: (...a) => mockEjecutar(...a),
  connect: async () => ({ query: (sql, params) => mockEjecutar(sql, params, true), release: () => { mockLiberadas += 1; } }),
}));
let mockSendMemberQR;
let mockSendWhatsAppQR;
jest.mock('../src/lib/email', () => ({ sendMemberQR: (...a) => mockSendMemberQR(...a) }));
jest.mock('../src/lib/whatsapp', () => ({ sendWhatsAppQR: (...a) => mockSendWhatsAppQR(...a) }));

const miembrosRouter = require('../src/routes/miembros');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', miembrosRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const ADMIN = () => jwt.sign({ id: 1, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const RECEPCION = () => jwt.sign({ id: 2, role: 'receptionist', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const SOLO_FECHA = ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'];

const pedir = (metodo, ruta, token = ADMIN()) => request(app)[metodo](`/api${ruta}`).set('Authorization', `Bearer ${token}`);
// Responde cada consulta que coincida con el patron; el orden importa (gana la primera).
const responder = (...reglas) => { mockReglas = reglas; };
const filas = (rows) => () => ({ rows });
const falla = () => () => { throw new Error('conexion perdida'); };
const llamadas = (patron) => mockLlamadas.filter(({ sql }) => patron.test(sql));

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: p.role === 'admin' ? 'ADMINISTRADOR' : 'RECEPCIONISTA' }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
  mockReglas = [];
  mockLlamadas = [];
  mockLiberadas = 0;
  mockSendMemberQR = jest.fn().mockResolvedValue({ delivered: true });
  mockSendWhatsAppQR = jest.fn().mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('GET /api/admin/miembros: the paged list', () => {
  const listaCon = (miembros, cfg = [{ dias_aviso: 5, dias_riesgo: 12 }]) => responder(
    [/COALESCE\(cg\.dias_recordatorio_default/, filas(cfg)],
    [/SELECT m\.id_miembro/, filas(miembros)],
    [/SELECT COUNT\(\*\)::int AS total FROM miembro/, filas([{ total: miembros.length }])],
    [/SELECT nombre FROM gimnasio/, filas([{ nombre: 'Gym Norte' }])],
  );

  test('should search by name, document, email or QR, only active members and page the result when q is sent', async () => {
    // Arrange
    listaCon([]);

    // Act
    const r = await pedir('get', '/admin/miembros?page=2&pageSize=5&q=%20ANA%20');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 0, page: 2, pageSize: 5 });
    const [lista] = llamadas(/SELECT m\.id_miembro/);
    expect(lista.sql).toMatch(/WHERE m\.id_gimnasio = \$1 AND m\.activo = TRUE AND \(LOWER\(m\.nombre\) LIKE \$2/);
    expect(lista.sql).toMatch(/LIMIT 5 OFFSET 10/);
    expect(lista.params).toEqual([7, '%ana%', 'ANA', 5, 12]);
    expect(llamadas(/SELECT COUNT/)[0].params).toEqual([7, '%ana%', 'ANA']);
  });

  test.each([
    ['page is negative and pageSize too big', '?page=-2&pageSize=500', 0, 100],
    ['page and pageSize are not numbers', '?page=x&pageSize=y', 0, 10],
    ['pageSize is zero', '?pageSize=0', 0, 10],
  ])('should clamp the paging when %s', async (_caso, query, page, pageSize) => {
    // Arrange
    listaCon([]);

    // Act
    const r = await pedir('get', `/admin/miembros${query}`);

    // Assert
    expect(r.body).toMatchObject({ page, pageSize });
    expect(llamadas(/SELECT m\.id_miembro/)[0].sql).toMatch(new RegExp(`LIMIT ${pageSize} OFFSET ${page * pageSize}`));
  });

  test('should list inactive members too when includeInactive is true', async () => {
    // Arrange
    listaCon([]);

    // Act
    await pedir('get', '/admin/miembros?includeInactive=true');

    // Assert
    expect(llamadas(/SELECT m\.id_miembro/)[0].sql).not.toMatch(/m\.activo = TRUE/);
  });

  test('should use 7 days for the expiration notice and 15 for the risk when the gym has no configuration', async () => {
    // Arrange
    listaCon([], []);

    // Act
    await pedir('get', '/admin/miembros');

    // Assert
    expect(llamadas(/SELECT m\.id_miembro/)[0].params).toEqual([7, 7, 15]);
  });

  test('should suggest one WhatsApp message per reason and none for frozen or up-to-date members', async () => {
    // Arrange
    listaCon([
      { id_miembro: 1, nombre: 'Congelada', congelada: true, vencido: true, telefono: '3001234567' },
      { id_miembro: 2, nombre: 'Vence', vencido: true, dias_vencido: 3, telefono: '3001234567' },
      { id_miembro: 3, nombre: 'Pronto', vencePronto: true, dias_para_vencer: 2, telefono: '3001234567' },
      { id_miembro: 4, nombre: 'Lejos', enRiesgo: true, dias_sin_venir: 20, telefono: '3001234567' },
      { id_miembro: 5, nombre: 'AlDia', telefono: '3001234567' },
    ]);

    // Act
    const r = await pedir('get', '/admin/miembros');

    // Assert
    expect(r.body.miembros.map((m) => m.whatsapp?.motivo ?? null)).toEqual([null, 'vencida', 'por-vencer', 'riesgo', null]);
    expect(r.body.miembros[1].whatsapp).toMatchObject({ telefono: '573001234567', mensaje: expect.stringContaining('Gym Norte') });
  });

  test('should answer 503 DB_UNREACHABLE when the list query fails', async () => {
    // Arrange
    responder([/COALESCE\(cg\.dias_recordatorio_default/, filas([])], [/SELECT m\.id_miembro/, falla()]);

    // Act
    const r = await pedir('get', '/admin/miembros');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/admin/miembros: creating a member', () => {
  const ANA = { nombre: ' Ana Maria ', documento: 'CC12345', telefono: '3001234567' };
  const altaSinDuplicados = ({ gym = [{ nombre: 'Gym Norte' }], qrOcupados = 0 } = {}) => {
    let revisados = 0;
    responder(
      [/SELECT id_miembro FROM miembro WHERE id_gimnasio = \$1 AND (documento|LOWER\(email\))/, filas([])],
      [/SELECT 1 FROM miembro WHERE codigo_qr/, () => ({ rows: (revisados++ < qrOcupados) ? [{}] : [] })],
      [/INSERT INTO miembro/, (p) => ({ rows: [{ id_miembro: 88, nombre: p[1], documento: p[3], codigo_qr: p[18] }] })],
      [/INSERT INTO plan_cobro/, filas([])],
      // El #102 (RQNF-17) registra las autorizaciones del alta en la misma transaccion.
      [/INSERT INTO autorizacion_miembro/, (p) => ({ rows: [{ id_autorizacion: 1, tipo: p[2], otorgada: p[3], version_texto: p[4], canal: p[5], fecha: new Date('2026-11-17T15:00:00Z') }] })],
      [/SELECT nombre FROM gimnasio/, filas(gym)],
    );
  };
  const insertMiembro = () => llamadas(/INSERT INTO miembro/)[0];
  const insertPlan = () => llamadas(/INSERT INTO plan_cobro/)[0];

  test.each([
    ['the name has one letter', { ...ANA, nombre: 'A' }],
    ['the phone is too short', { ...ANA, telefono: '300' }],
    ['the email is not valid', { ...ANA, email: 'ana-sin-arroba' }],
  ])('should answer 400 and save nothing when %s', async (_caso, cuerpo) => {
    // Arrange
    altaSinDuplicados();

    // Act
    const r = await pedir('post', '/admin/miembros').send(cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(insertMiembro()).toBeUndefined();
  });

  test.each([
    ['the document belongs to an active member', /documento = \$2/, {}, 'MEMBER_DOC_TAKEN'],
    ['the email belongs to an active member', /LOWER\(email\) = \$2/, { email: 'ANA@Gym.co' }, 'MEMBER_EMAIL_TAKEN'],
  ])('should answer 409 and save nothing when %s', async (_caso, patron, extra, code) => {
    // Arrange
    responder(
      [patron, filas([{ id_miembro: 90 }])],
      [/SELECT id_miembro FROM miembro/, filas([])],
      [/SELECT 1 FROM miembro WHERE codigo_qr/, filas([])],
    );

    // Act
    const r = await pedir('post', '/admin/miembros').send({ ...ANA, ...extra });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(code);
    expect(insertMiembro()).toBeUndefined();
    expect(mockLlamadas[mockLlamadas.length - 1].sql).toBe('ROLLBACK');
    expect(mockLiberadas).toBe(1);
  });

  // #87: la busqueda y el INSERT en una transaccion, con un candado por documento y otro por correo.
  test('should lock and look for the document and then the email, inside the transaction, before saving the member', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    await pedir('post', '/admin/miembros').send({ ...ANA, email: 'ANA@Gym.co' });

    // Assert
    const pasos = mockLlamadas.map(({ sql }) => sql).filter((sql) => /^BEGIN$|advisory|SELECT id_miembro FROM miembro|INSERT INTO miembro /.test(sql))
      .map((sql) => (/miembro_documento/.test(sql) && 'candado documento') || (/miembro_correo/.test(sql) && 'candado correo')
        || (/documento = \$2/.test(sql) && 'buscar documento') || (/LOWER\(email\)/.test(sql) && 'buscar correo')
        || (/INSERT/.test(sql) ? 'guardar' : sql));
    expect(pasos).toEqual(['BEGIN', 'candado documento', 'buscar documento', 'candado correo', 'buscar correo', 'guardar']);
    expect(llamadas(/miembro_documento/)[0].params).toEqual([`7:${ANA.documento}`]);
    expect(llamadas(/miembro_correo/)[0].params).toEqual(['7:ana@gym.co']);
  });

  test('should not lock nor look for an email when the member has none', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    await pedir('post', '/admin/miembros').send(ANA);

    // Assert
    expect(llamadas(/miembro_documento/)).toHaveLength(1);
    expect(llamadas(/miembro_correo|LOWER\(email\)/)).toHaveLength(0);
  });

  test('should look for the duplicated email in lower case when the email has capitals', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    await pedir('post', '/admin/miembros').send({ ...ANA, email: 'ANA@Gym.co' });

    // Assert
    expect(llamadas(/LOWER\(email\) = \$2/)[0].params).toEqual([7, 'ana@gym.co']);
  });

  test('should save the member with the trimmed name, the encrypted QR and the hashed password when the data is valid', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    const r = await pedir('post', '/admin/miembros').send({ ...ANA, email: 'ANA@Gym.co', password: 'clave-segura' });

    // Assert
    expect(r.status).toBe(201);
    const p = insertMiembro().params;
    expect(p[0]).toBe(7);
    expect(p[1]).toBe('Ana Maria');
    expect(p[18]).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
    expect(r.body.qr_data).toBe(p[18]);
    expect(await bcrypt.compare('clave-segura', p[20])).toBe(true);
    expect(p[21]).toEqual(expect.any(Date));
    expect(p[22]).toBe(true);
  });

  test('should save no gender, no email and no password when the form sends them empty', async () => {
    // Arrange: el select de genero en «Seleccionar...» y los campos opcionales en blanco llegan como ''
    altaSinDuplicados();

    // Act
    const r = await pedir('post', '/admin/miembros').send({ ...ANA, genero: '', email: '', password: '' });

    // Assert
    expect(r.status).toBe(201);
    const p = insertMiembro().params;
    expect([p[5], p[7], p[20]]).toEqual([null, null, null]);
    expect(llamadas(/LOWER\(email\) = \$2/)).toHaveLength(0);
    expect(mockSendMemberQR).not.toHaveBeenCalled();
  });

  test('should leave the app password empty when none is sent', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    await pedir('post', '/admin/miembros').send(ANA);

    // Assert
    expect(insertMiembro().params.slice(20, 22)).toEqual([null, null]);
  });

  test.each([
    ['MENSUAL', '2026-01-01', '2026-01-31', '2026-02-01'],
    ['TRIMESTRAL', '2026-01-01', '2026-04-01', '2026-04-02'],
    ['SEMESTRAL', '2026-01-01', '2026-06-30', '2026-07-01'],
    ['ANUAL', '2026-01-01', '2027-01-01', '2027-01-02'],
    ['CLASES_SUELTAS', '2026-01-01', '2026-01-31', '2026-02-01'],
  ])('should save a %s plan that starts %s, ends %s and is charged again %s', async (tipo, inicio, fin, proxima) => {
    // Arrange
    altaSinDuplicados();

    // Act
    const r = await pedir('post', '/admin/miembros').send({ ...ANA, tipo_plan: tipo, fecha_inicio: inicio, valor_total: '100000', valor_pagado: '25000', estado_pago: 'PARCIAL' });

    // Assert
    expect(r.body.plan_cobro).toEqual({ tipo_plan: tipo, fecha_inicio: inicio, fecha_fin: fin, valor_total: 100000, valor_pagado: 25000, estado_pago: 'PARCIAL', proxima_fecha_cobro: proxima });
    expect(insertPlan().params.slice(0, 7)).toEqual([88, 7, tipo, inicio, fin, 100000, 25000]);
  });

  test('should start the plan today when no start date is sent', async () => {
    // Arrange: hoy es el 19 de noviembre en el reloj fijo
    jest.useFakeTimers({ doNotFake: SOLO_FECHA });
    jest.setSystemTime(new Date('2026-11-19T15:00:00Z'));
    altaSinDuplicados();

    // Act
    const r = await pedir('post', '/admin/miembros').send(ANA);

    // Assert
    expect(r.body.plan_cobro).toMatchObject({ fecha_inicio: '2026-11-19', fecha_fin: '2026-12-19', valor_total: 0, valor_pagado: 0 });
  });

  test('should keep the end date sent by the admin instead of calculating it', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    const r = await pedir('post', '/admin/miembros').send({ ...ANA, fecha_inicio: '2026-01-01', fecha_fin: '2026-01-15' });

    // Assert
    expect(r.body.plan_cobro).toMatchObject({ fecha_fin: '2026-01-15', proxima_fecha_cobro: '2026-01-16' });
  });

  test('should send the plain QR and its image by email and WhatsApp when the member has both', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    await pedir('post', '/admin/miembros').send({ ...ANA, email: 'ana@gym.co' });

    // Assert
    const codigo = mockSendMemberQR.mock.calls[0][0].qrCode;
    expect(codigo).toMatch(/^FL-7-[A-HJ-NP-Z2-9]{8}$/);
    expect(mockSendMemberQR).toHaveBeenCalledWith({ to: 'ana@gym.co', memberName: ' Ana Maria ', gymName: 'Gym Norte', qrCode: codigo, qrImageUrl: expect.stringMatching(/^data:image\/png;base64,/) });
    expect(mockSendWhatsAppQR).toHaveBeenCalledWith('3001234567', ' Ana Maria ', 'Gym Norte', codigo, expect.stringMatching(/^data:image\/png;base64,/));
  });

  test('should not send any email when the member has no email', async () => {
    // Arrange
    altaSinDuplicados();

    // Act
    await pedir('post', '/admin/miembros').send(ANA);

    // Assert
    expect(mockSendMemberQR).not.toHaveBeenCalled();
    expect(mockSendWhatsAppQR).toHaveBeenCalledTimes(1);
  });

  test('should still answer 201 and log both errors when the email and WhatsApp fail', async () => {
    // Arrange
    altaSinDuplicados({ gym: [] });
    mockSendMemberQR.mockRejectedValue(new Error('correo caido'));
    mockSendWhatsAppQR.mockRejectedValue(new Error('whatsapp caido'));

    // Act
    const r = await pedir('post', '/admin/miembros').send({ ...ANA, email: 'ana@gym.co' });

    // Assert
    expect(r.status).toBe(201);
    expect(mockSendMemberQR.mock.calls[0][0].gymName).toBe('tu gimnasio');
    expect(console.error).toHaveBeenCalledWith('[POST /admin/miembros] Error enviando email:', 'correo caido');
    expect(console.error).toHaveBeenCalledWith('[POST /admin/miembros] Error enviando WhatsApp:', 'whatsapp caido');
  });

  test('should try another QR code when the first one is already taken', async () => {
    // Arrange
    altaSinDuplicados({ qrOcupados: 1 });

    // Act
    const r = await pedir('post', '/admin/miembros').send(ANA);

    // Assert
    expect(r.status).toBe(201);
    const revisados = llamadas(/SELECT 1 FROM miembro WHERE codigo_qr/).map(({ params }) => params[0]);
    expect(revisados).toHaveLength(2);
    expect(revisados[0]).not.toBe(revisados[1]);
  });

  test('should answer 500 QR_GENERATION_FAILED and save nothing when five QR codes in a row are taken', async () => {
    // Arrange
    altaSinDuplicados({ qrOcupados: 5 });

    // Act
    const r = await pedir('post', '/admin/miembros').send(ANA);

    // Assert
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('QR_GENERATION_FAILED');
    expect(insertMiembro()).toBeUndefined();
  });

  // El resto del API responde 503 cuando la BD falla; el INSERT del miembro tambien.
  test.each([
    ['the member insert fails', /INSERT INTO miembro/],
    ['the plan insert fails', /INSERT INTO plan_cobro/],
    ['the duplicate check fails', /SELECT id_miembro FROM miembro/],
  ])('should answer 503 DB_UNREACHABLE when %s', async (_caso, patron) => {
    // Arrange
    altaSinDuplicados();
    mockReglas.unshift([patron, falla()]);

    // Act
    const r = await pedir('post', '/admin/miembros').send(ANA);

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/admin/miembros/lookup: finding a member for the check-in', () => {
  test('should answer 400 without querying when neither code nor document is sent', async () => {
    // Arrange
    responder();

    // Act
    const r = await pedir('get', '/admin/miembros/lookup?documento=%20%20');

    // Assert
    expect(r.status).toBe(400);
    expect(llamadas(/FROM miembro/)).toHaveLength(0);
  });

  test.each([
    ['documento', 'CC12345', /documento = \$2/],
    ['codigo', 'FL-7-ABCDEFGH', /codigo_qr = \$2/],
  ])('should find an active member of the gym by %s and return the current plan', async (campo, valor, filtro) => {
    // Arrange
    responder(
      [/FROM miembro WHERE id_gimnasio = \$1 AND activo = TRUE/, filas([{ id_miembro: 88, nombre: 'Ana' }])],
      [/INITCAP\(LOWER\(tipo_plan\)\)/, filas([{ estado: 'PAGADO', plan: 'Mensual' }])],
    );

    // Act
    const r = await pedir('get', `/admin/miembros/lookup?${campo}=${valor}`, RECEPCION());

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ miembro: { id_miembro: 88, nombre: 'Ana' }, membresia: { estado: 'PAGADO', plan: 'Mensual' } });
    const [busqueda] = llamadas(/FROM miembro WHERE id_gimnasio/);
    expect(busqueda.sql).toMatch(filtro);
    expect(busqueda.params).toEqual([7, valor]);
    expect(llamadas(/INITCAP/)[0].params).toEqual([88]);
  });

  test('should return a null plan when the member has none', async () => {
    // Arrange
    responder([/FROM miembro WHERE id_gimnasio/, filas([{ id_miembro: 88 }])], [/INITCAP/, filas([])]);

    // Act
    const r = await pedir('get', '/admin/miembros/lookup?documento=CC1');

    // Assert
    expect(r.body.membresia).toBeNull();
  });

  test.each([
    ['no member matches', filas([]), 404, 'MEMBER_NOT_FOUND'],
    ['the database fails', falla(), 503, 'DB_UNREACHABLE'],
  ])('should answer with an error code when %s', async (_caso, respuesta, status, code) => {
    // Arrange
    responder([/FROM miembro WHERE id_gimnasio/, respuesta]);

    // Act
    const r = await pedir('get', '/admin/miembros/lookup?documento=CC1');

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/admin/miembros/:id: the member detail', () => {
  test('should return the member of the gym when the id exists', async () => {
    // Arrange
    // El #102 (RQNF-17) suma las autorizaciones vigentes y su historial.
    responder(
      [/FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2/, filas([{ id_miembro: 88, nombre: 'Ana' }])],
      [/FROM autorizacion_miembro/, filas([])],
    );

    // Act
    const r = await pedir('get', '/admin/miembros/88');

    // Assert: el #108 (RQNF-16, Ley 2300) suma la aceptacion de mensajes comerciales;
    // sin fila de MENSAJES_COMERCIALES el miembro no los acepta por ningun canal
    expect(r.status).toBe(200);
    expect(r.body.miembro).toEqual({
      id_miembro: 88, nombre: 'Ana', autorizo_datos_sensibles: false, menor_de_edad: false, datos_sensibles_sin_autorizacion: false,
      acepta_mensajes_comerciales: false, canales_comerciales: [],
    });
    expect(llamadas(/FROM miembro WHERE id_miembro/)[0].params).toEqual([88, 7]);
  });

  test.each([
    ['accepted and the channels in a fixed order when the member accepted them', true, ['EMAIL', 'WHATSAPP'], true, ['WHATSAPP', 'EMAIL']],
    ['not accepted and no channels when the member cancelled them', false, null, false, []],
  ])('should answer the commercial messages as %s', async (_caso, otorgada, canales, acepta, canalesComerciales) => {
    // Arrange: la aceptacion vigente de mensajes comerciales (RQNF-16, Ley 2300 de 2023)
    const vigente = {
      id_autorizacion: 5, tipo: 'MENSAJES_COMERCIALES', otorgada, version_texto: 'v2', canal: 'PANEL',
      fecha: '2026-11-02T15:00:00.000Z', detalle: null, canales_autorizados: canales, registrada_por: 'Luz Recepcion',
    };
    responder(
      [/FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2/, filas([{ id_miembro: 88, nombre: 'Ana' }])],
      [/FROM autorizacion_miembro/, filas([vigente])],
    );

    // Act
    const r = await pedir('get', '/admin/miembros/88');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.miembro).toEqual({
      id_miembro: 88, nombre: 'Ana', autorizo_datos_sensibles: false, menor_de_edad: false, datos_sensibles_sin_autorizacion: false,
      acepta_mensajes_comerciales: acepta, canales_comerciales: canalesComerciales,
    });
    expect(llamadas(/FROM autorizacion_miembro/)[0].params).toEqual([88, 7]);
  });

  test.each([
    ['the id is not a number', 'abc', filas([]), 400, 'VALIDATION_ERROR'],
    ['the member is not in the gym', '99', filas([]), 404, 'MEMBER_NOT_FOUND'],
    ['the database fails', '88', falla(), 503, 'DB_UNREACHABLE'],
  ])('should answer with an error code when %s', async (_caso, id, respuesta, status, code) => {
    // Arrange
    responder([/FROM miembro WHERE id_miembro/, respuesta]);

    // Act
    const r = await pedir('get', `/admin/miembros/${id}`);

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
  });
});

// ---------------------------------------------------------------------------
describe('PUT /api/admin/miembros/:id: editing a member', () => {
  // La fila que ya esta guardada: la lee el control de duplicados (RQF-03).
  const GUARDADO = { documento: '1020304050', email: 'ana@vieja.co', activo: true };
  const FILA_GUARDADA = /SELECT documento, email, activo FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2 FOR NO KEY UPDATE/;
  const actualizar = (respuesta = (p) => ({ rows: [{ id_miembro: p[p.length - 2] }] })) => responder(
    [FILA_GUARDADA, filas([GUARDADO])],
    [/SELECT id_miembro FROM miembro/, filas([])],
    [/UPDATE miembro SET/, respuesta],
  );
  const update = () => llamadas(/UPDATE miembro SET/)[0];

  test('should save the email in lower case and the new password hashed when both are sent', async () => {
    // Arrange
    actualizar();

    // Act
    const r = await pedir('put', '/admin/miembros/88', RECEPCION()).send({ email: 'ANA@Gym.co', password: 'clave123' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Miembro actualizado.');
    const { sql, params } = update();
    expect(sql).toMatch(/password_set_at = CURRENT_TIMESTAMP/);
    expect(params).toContain('ana@gym.co');
    expect(await bcrypt.compare('clave123', params.find((v) => typeof v === 'string' && v.startsWith('$2')))).toBe(true);
    expect(params.slice(-2)).toEqual([88, 7]);
  });

  // ------------------------------------------------ RQF-03: duplicados al editar
  const conGuardado = (fila, repetidos = []) => responder(
    [FILA_GUARDADA, filas(fila ? [fila] : [])],
    ...repetidos.map((patron) => [patron, filas([{ id_miembro: 90 }])]),
    [/SELECT id_miembro FROM miembro/, filas([])],
    [/UPDATE miembro SET/, (p) => ({ rows: [{ id_miembro: p[p.length - 2] }] })],
  );
  const DOC = /documento = \$2/;
  const CORREO = /LOWER\(email\) = \$2/;

  test.each([
    ['the new document belongs to another active member', { documento: '999888' }, DOC, 'MEMBER_DOC_TAKEN', [7, '999888', 88]],
    ['the new email belongs to another active member', { email: 'Otra@Gym.co' }, CORREO, 'MEMBER_EMAIL_TAKEN', [7, 'otra@gym.co', 88]],
  ])('should answer 409 and update nothing when %s', async (_caso, cuerpo, patron, code, params) => {
    // Arrange
    conGuardado(GUARDADO, [patron]);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send(cuerpo);

    // Assert
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(code);
    const [busqueda] = llamadas(patron);
    expect(busqueda.sql).toMatch(/activo = TRUE AND id_miembro <> \$3$/);
    expect(busqueda.params).toEqual(params);
    expect(update()).toBeUndefined();
    expect(mockLlamadas[mockLlamadas.length - 1].sql).toBe('ROLLBACK');
    expect(mockLiberadas).toBe(1);
  });

  test('should look for duplicates before the update, in one transaction, when the document and the email change', async () => {
    // Arrange
    conGuardado(GUARDADO);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send({ documento: '999888', email: 'otra@gym.co' });

    // Assert
    expect(r.status).toBe(200);
    const orden = mockLlamadas.map(({ sql }) => sql).filter((sql) => /^(BEGIN|COMMIT)$|advisory|FOR NO KEY UPDATE|SELECT id_miembro FROM miembro|UPDATE miembro/.test(sql));
    expect(orden).toHaveLength(8);
    expect(orden[0]).toBe('BEGIN');
    expect(orden[1]).toMatch(FILA_GUARDADA);
    expect(orden[2]).toMatch(/miembro_documento/);
    expect(orden[3]).toMatch(DOC);
    expect(orden[4]).toMatch(/miembro_correo/);
    expect(orden[5]).toMatch(CORREO);
    expect(orden[6]).toMatch(/UPDATE miembro SET/);
    expect(orden[7]).toBe('COMMIT');
    expect(update().enTransaccion).toBe(true);
    expect(mockLiberadas).toBe(1);
  });

  // La ficha manda siempre el documento y el correo.
  test('should not look for duplicates when the document and the email are the saved ones', async () => {
    // Arrange
    conGuardado(GUARDADO, [DOC, CORREO]);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send({ nombre: 'Ana Maria', documento: '1020304050', email: 'ANA@vieja.co', activo: true });

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(/SELECT id_miembro FROM miembro|advisory/)).toHaveLength(0);
  });

  test('should look for the saved document and email when the member is activated again', async () => {
    // Arrange
    conGuardado({ ...GUARDADO, activo: false }, [CORREO]);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send({ activo: true });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('MEMBER_EMAIL_TAKEN');
    expect(llamadas(DOC)[0].params).toEqual([7, '1020304050', 88]);
    expect(llamadas(CORREO)[0].params).toEqual([7, 'ana@vieja.co', 88]);
    expect(update()).toBeUndefined();
  });

  test('should activate again a member without email when nobody has the document', async () => {
    // Arrange
    conGuardado({ ...GUARDADO, email: null, activo: false });

    // Act
    const r = await pedir('put', '/admin/miembros/88').send({ activo: true });

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(CORREO)).toHaveLength(0);
  });

  test.each([
    ['stays inactive', { ...GUARDADO, activo: false }, { documento: '999888' }],
    ['is deactivated with the change', GUARDADO, { documento: '999888', activo: false }],
  ])('should not look for duplicates when the member %s', async (_caso, fila, cuerpo) => {
    // Arrange
    conGuardado(fila, [DOC, CORREO]);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send(cuerpo);

    // Assert
    expect(r.status).toBe(200);
    expect(llamadas(/SELECT id_miembro FROM miembro/)).toHaveLength(0);
  });

  test('should answer 404 and update nothing when the document changes and the member is not in the gym', async () => {
    // Arrange
    conGuardado(null);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send({ documento: '999888' });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
    expect(update()).toBeUndefined();
  });

  test('should look for duplicates too when the edit also changes the birth date', async () => {
    // Arrange: ese cambio va por la transaccion de RQNF-17
    conGuardado(GUARDADO, [DOC]);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send({ documento: '999888', fecha_nacimiento: '1990-05-20' });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('MEMBER_DOC_TAKEN');
    expect(update()).toBeUndefined();
    expect(mockLlamadas[mockLlamadas.length - 1].sql).toBe('ROLLBACK');
  });

  // La restriccion unica de la base cuenta tambien a los desactivados.
  test.each([
    ['the simple edit', { documento: '999888' }],
    ['the edit with authorizations', { documento: '999888', fecha_nacimiento: '1990-05-20' }],
  ])('should answer 409 MEMBER_DUPLICATED when the database refuses the duplicate in %s', async (_caso, cuerpo) => {
    // Arrange
    responder(
      [FILA_GUARDADA, filas([GUARDADO])],
      [/SELECT id_miembro FROM miembro/, filas([])],
      [/FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2\s+FOR UPDATE/, filas([{ id_miembro: 88, tipo_documento: 'CC', fecha_nacimiento: null }])],
      [/FROM autorizacion_miembro/, filas([])],
      [/UPDATE miembro SET/, () => { throw Object.assign(new Error('duplicate key'), { code: '23505' }); }],
    );

    // Act
    const r = await pedir('put', '/admin/miembros/88').send(cuerpo);

    // Assert
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('MEMBER_DUPLICATED');
  });

  test('should clear the email when it is sent empty', async () => {
    // Arrange
    actualizar();

    // Act
    await pedir('put', '/admin/miembros/88').send({ email: '' });

    // Assert
    expect(update().params).toEqual([null, 88, 7]);
    expect(llamadas(/BEGIN|advisory|FOR (NO KEY )?UPDATE/)).toHaveLength(0);
    expect(update().enTransaccion).toBe(false);
  });

  test('should turn the app access off without touching the password when only app_acceso is sent', async () => {
    // Arrange
    actualizar();

    // Act
    await pedir('put', '/admin/miembros/88').send({ app_acceso: false });

    // Assert
    const { sql, params } = update();
    expect(sql).toMatch(/SET app_acceso = \$1\s/);
    expect(sql).not.toMatch(/password_hash =/);
    expect(params).toEqual([false, 88, 7]);
  });

  test.each([
    ['the body has nothing to change', '88', {}, 'Nada que actualizar'],
    ['the id is not a number', 'abc', { nombre: 'Ana Maria' }, 'Id inválido'],
    ['the new password is too short', '88', { password: '123' }, 'La contrasena debe tener minimo 6 caracteres'],
  ])('should answer 400 and update nothing when %s', async (_caso, id, cuerpo, mensaje) => {
    // Arrange
    actualizar();

    // Act
    const r = await pedir('put', `/admin/miembros/${id}`).send(cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.error).toBe(mensaje);
    expect(update()).toBeUndefined();
  });

  test.each([
    ['the member is not in the gym', filas([]), 404, 'MEMBER_NOT_FOUND'],
    ['the database fails', falla(), 503, 'DB_UNREACHABLE'],
  ])('should answer with an error code when %s', async (_caso, respuesta, status, code) => {
    // Arrange
    actualizar(respuesta);

    // Act
    const r = await pedir('put', '/admin/miembros/88').send({ nombre: 'Ana Maria' });

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /api/admin/miembros/:id and /permanent: removing a member', () => {
  test('should deactivate the active member of the gym when the admin removes it', async () => {
    // Arrange
    responder([/UPDATE miembro SET activo = FALSE/, filas([{ id_miembro: 88 }])]);

    // Act
    const r = await pedir('delete', '/admin/miembros/88');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Miembro desactivado.');
    const [baja] = llamadas(/UPDATE miembro SET activo = FALSE/);
    expect(baja.sql).toMatch(/AND activo = TRUE/);
    expect(baja.params).toEqual([88, 7]);
  });

  test.each([
    ['a receptionist tries it', '88', RECEPCION, filas([]), 403, 'FORBIDDEN'],
    ['the id is not a number', 'abc', ADMIN, filas([]), 400, 'VALIDATION_ERROR'],
    ['the member was already inactive', '88', ADMIN, filas([]), 404, 'MEMBER_NOT_FOUND'],
    ['the database fails', '88', ADMIN, falla(), 503, 'DB_UNREACHABLE'],
  ])('should not deactivate when %s', async (_caso, id, token, respuesta, status, code) => {
    // Arrange
    responder([/UPDATE miembro SET activo = FALSE/, respuesta]);

    // Act
    const r = await pedir('delete', `/admin/miembros/${id}`, token());

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
  });

  test('should delete the member and its sent messages in one transaction when the admin deletes it permanently', async () => {
    // Arrange
    responder(
      [/DELETE FROM envio_mensaje/, filas([])],
      [/DELETE FROM miembro/, filas([{ id_miembro: 88 }])],
    );

    // Act
    const r = await pedir('delete', '/admin/miembros/88/permanent');

    // Assert
    expect(r.status).toBe(200);
    expect(mockLlamadas.map(({ sql }) => sql.split(/\s/)[0] + (/envio_mensaje/.test(sql) ? ' envio_mensaje' : /FROM miembro/.test(sql) ? ' miembro' : ''))
      .filter((s) => !/^SELECT/.test(s))).toEqual(['BEGIN', 'DELETE envio_mensaje', 'DELETE miembro', 'COMMIT']);
    expect(llamadas(/DELETE FROM/).map(({ params }) => params)).toEqual([[88, 7], [88, 7]]);
    expect(mockLiberadas).toBe(1);
  });

  test.each([
    ['the member is not in the gym', filas([]), 404, 'MEMBER_NOT_FOUND'],
    ['the database fails', falla(), 503, 'DB_UNREACHABLE'],
  ])('should roll back and answer %s when deleting permanently', async (_caso, respuesta, status, code) => {
    // Arrange
    responder([/DELETE FROM envio_mensaje/, filas([])], [/DELETE FROM miembro/, respuesta]);

    // Act
    const r = await pedir('delete', '/admin/miembros/88/permanent');

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
    expect(llamadas(/^ROLLBACK$/)).toHaveLength(1);
    expect(llamadas(/^COMMIT$/)).toHaveLength(0);
    expect(mockLiberadas).toBe(1);
  });

  test('should answer 400 without opening a transaction when the id to delete permanently is not a number', async () => {
    // Arrange
    responder();

    // Act
    const r = await pedir('delete', '/admin/miembros/abc/permanent');

    // Assert
    expect(r.status).toBe(400);
    expect(llamadas(/^BEGIN$/)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('GET and PUT /api/admin/miembros/:id/plan: the current plan', () => {
  const PLAN = { tipo_plan: 'MENSUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-02-01', valor_total: 100000, valor_pagado: 50000, metodo_pago: 'EFECTIVO' };

  test('should return the current plan and the last freezes of a member of the gym', async () => {
    // Arrange
    responder(
      [/FROM plan_cobro pc\s+INNER JOIN miembro m/, filas([{ id_plan_cobro: 5, tipo_plan: 'MENSUAL' }])],
      [/FROM congelacion_plan cp/, filas([{ id_congelacion: 30, congelada_por: 'Luis' }])],
    );

    // Act
    const r = await pedir('get', '/admin/miembros/88/plan', RECEPCION());

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ plan: { id_plan_cobro: 5, tipo_plan: 'MENSUAL' }, congelaciones: [{ id_congelacion: 30, congelada_por: 'Luis' }] });
    expect(llamadas(/FROM plan_cobro pc|FROM congelacion_plan/).map(({ params }) => params)).toEqual([['88', 7], ['88', 7]]);
  });

  test('should return a null plan when the member has none', async () => {
    // Arrange
    responder([/FROM plan_cobro pc/, filas([])], [/FROM congelacion_plan/, filas([])]);

    // Act
    const r = await pedir('get', '/admin/miembros/88/plan');

    // Assert
    expect(r.body).toEqual({ plan: null, congelaciones: [] });
  });

  test.each([
    ['the paid value is above the plan value', { valor_pagado: 100001 }, 'Lo pagado no puede superar el valor del plan.'],
    ['the plan ends before it starts', { fecha_inicio: '2026-03-01' }, 'El vencimiento no puede ser anterior al inicio.'],
    ['the plan type does not exist', { tipo_plan: 'DIARIO' }, expect.any(String)],
  ])('should answer 400 and save no plan when %s', async (_caso, cambios, mensaje) => {
    // Arrange
    responder();

    // Act
    const r = await pedir('put', '/admin/miembros/88/plan').send({ ...PLAN, ...cambios });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.error).toEqual(mensaje);
    expect(llamadas(/plan_cobro/)).toHaveLength(0);
  });

  test('should answer 404 MEMBER_NOT_FOUND when the member is not in the gym', async () => {
    // Arrange
    responder([/SELECT id_miembro FROM miembro WHERE id_miembro = \$1 AND id_gimnasio = \$2/, filas([])]);

    // Act
    const r = await pedir('put', '/admin/miembros/88/plan').send(PLAN);

    // Assert
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
    expect(llamadas(/plan_cobro/)).toHaveLength(0);
  });

  test.each([
    ['all of it is paid', 100000, 100000, 'PAGADO'],
    ['part of it is paid', 100000, 50000, 'PARCIAL'],
    ['nothing is paid', 100000, 0, 'PENDIENTE'],
    ['the plan is free', 0, 0, 'PENDIENTE'],
  ])('should update the current plan as %4$s when %s', async (_caso, total, pagado, estado) => {
    // Arrange
    responder(
      [/SELECT id_miembro FROM miembro WHERE id_miembro/, filas([{ id_miembro: 88 }])],
      [/SELECT id_plan_cobro FROM plan_cobro/, filas([{ id_plan_cobro: 5 }])],
      [/UPDATE plan_cobro/, (p) => ({ rows: [{ id_plan_cobro: 5, estado_pago: p[7] }] })],
    );

    // Act
    const r = await pedir('put', '/admin/miembros/88/plan').send({ ...PLAN, valor_total: total, valor_pagado: pagado });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.plan.estado_pago).toBe(estado);
    expect(llamadas(/UPDATE plan_cobro/)[0].params.slice(-2)).toEqual([1, 5]);
  });

  test('should create the plan when the member has none', async () => {
    // Arrange
    responder(
      [/SELECT id_miembro FROM miembro WHERE id_miembro/, filas([{ id_miembro: 88 }])],
      [/SELECT id_plan_cobro FROM plan_cobro/, filas([])],
      [/INSERT INTO plan_cobro/, (p) => ({ rows: [{ id_plan_cobro: 6, estado_pago: p[9] }] })],
    );

    // Act
    const r = await pedir('put', '/admin/miembros/88/plan').send({ ...PLAN, referencia_pago: '', proxima_fecha_cobro: '' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.plan).toEqual({ id_plan_cobro: 6, estado_pago: 'PARCIAL' });
    expect(llamadas(/INSERT INTO plan_cobro/)[0].params).toEqual(['88', 7, 'MENSUAL', '2026-01-01', '2026-02-01', 100000, 50000, 'EFECTIVO', null, 'PARCIAL', null, 1]);
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/admin/miembros/:id/congelar and /descongelar: freezing a plan', () => {
  const PLAN_VIGENTE = { id_plan_cobro: 5, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', congelado_desde: null };
  const fechas = (f) => [/AS futura/, filas([{ inicio: '2026-02-01', futura: false, antes_del_plan: false, vencida: false, ...f }])];
  const congelarCon = (plan = PLAN_VIGENTE, f = {}) => responder(
    [/FOR UPDATE OF pc/, filas(plan ? [plan] : [])],
    fechas(f),
    [/UPDATE plan_cobro\s+SET congelado_desde/, filas([])],
    [/INSERT INTO congelacion_plan/, (p) => ({ rows: [{ id_congelacion: 30, fecha_inicio: p[3], motivo: p[4] }] })],
  );

  test('should freeze the plan from the given date and save who did it when the admin freezes it', async () => {
    // Arrange
    congelarCon();

    // Act
    const r = await pedir('post', '/admin/miembros/88/congelar').send({ motivo: ' Viaje ', fecha_inicio: '2026-02-01' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'Membresía congelada.', congelacion: { id_congelacion: 30, fecha_inicio: '2026-02-01', motivo: 'Viaje' } });
    expect(llamadas(/AS futura/)[0].params).toEqual(['2026-02-01', 5]);
    expect(llamadas(/SET congelado_desde/)[0].params).toEqual(['2026-02-01', 1, 5]);
    expect(llamadas(/INSERT INTO congelacion_plan/)[0].params).toEqual([5, 88, 7, '2026-02-01', 'Viaje', 1]);
    expect(llamadas(/^COMMIT$/)).toHaveLength(1);
    expect(mockLiberadas).toBe(1);
  });

  test('should freeze from today and save no reason when the body is empty', async () => {
    // Arrange
    congelarCon();

    // Act
    await pedir('post', '/admin/miembros/88/congelar').send({});

    // Assert
    expect(llamadas(/AS futura/)[0].params).toEqual([null, 5]);
    expect(llamadas(/INSERT INTO congelacion_plan/)[0].params[4]).toBeNull();
  });

  test.each([
    ['the plan is already frozen', { ...PLAN_VIGENTE, congelado_desde: '2026-01-10' }, {}, 409, 'ALREADY_FROZEN'],
    ['the start date is in the future', PLAN_VIGENTE, { futura: true }, 400, 'VALIDATION_ERROR'],
    ['the start date is before the plan', PLAN_VIGENTE, { antes_del_plan: true }, 400, 'VALIDATION_ERROR'],
    ['the plan had already expired', PLAN_VIGENTE, { vencida: true }, 409, 'PLAN_EXPIRED'],
    ['the member has no current plan', null, {}, 404, 'PLAN_NOT_FOUND'],
  ])('should roll back and freeze nothing when %s', async (_caso, plan, f, status, code) => {
    // Arrange
    congelarCon(plan, f);

    // Act
    const r = await pedir('post', '/admin/miembros/88/congelar').send({});

    // Assert
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
    expect(llamadas(/SET congelado_desde|INSERT INTO congelacion_plan/)).toHaveLength(0);
    expect(llamadas(/^ROLLBACK$/)).toHaveLength(1);
  });

  test.each([
    ['the id is not a number', 'abc', {}, ADMIN],
    ['the date has another format', '88', { fecha_inicio: '01/02/2026' }, ADMIN],
  ])('should answer 400 without opening a transaction when %s', async (_caso, id, cuerpo, token) => {
    // Arrange
    congelarCon();

    // Act
    const r = await pedir('post', `/admin/miembros/${id}/congelar`, token()).send(cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(llamadas(/^BEGIN$/)).toHaveLength(0);
  });

  test('should answer 403 when a receptionist tries to freeze a plan', async () => {
    // Arrange
    congelarCon();

    // Act
    const r = await pedir('post', '/admin/miembros/88/congelar', RECEPCION()).send({});

    // Assert
    expect(r.status).toBe(403);
    expect(llamadas(/FOR UPDATE/)).toHaveLength(0);
  });

  test('should answer 503 DB_UNREACHABLE and roll back when the freeze cannot be saved', async () => {
    // Arrange
    congelarCon();
    mockReglas.unshift([/INSERT INTO congelacion_plan/, falla()]);

    // Act
    const r = await pedir('post', '/admin/miembros/88/congelar').send({});

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(llamadas(/^ROLLBACK$/)).toHaveLength(1);
  });

  const descongelarCon = (congeladoDesde, dias) => responder(
    [/FOR UPDATE OF pc/, filas([{ ...PLAN_VIGENTE, congelado_desde: congeladoDesde }])],
    [/GREATEST\(CURRENT_DATE - congelado_desde/, filas([{ dias }])],
    [/UPDATE plan_cobro\s+SET fecha_fin = fecha_fin \+/, filas([{ fecha_fin: '2027-01-14', proxima_fecha_cobro: null }])],
    [/UPDATE congelacion_plan/, filas([])],
  );

  test.each([
    [14, 'Membresía descongelada. El vencimiento se corrió 14 días.'],
    [1, 'Membresía descongelada. El vencimiento se corrió 1 día.'],
    [0, 'Membresía descongelada. No pasó ningún día, el vencimiento no cambia.'],
  ])('should move the expiration %i days and close the freeze when the admin unfreezes the plan', async (dias, mensaje) => {
    // Arrange
    descongelarCon('2026-01-01', dias);

    // Act
    const r = await pedir('post', '/admin/miembros/88/descongelar').send({});

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: mensaje, dias, fecha_fin: '2027-01-14', proxima_fecha_cobro: null });
    expect(llamadas(/SET fecha_fin = fecha_fin \+/)[0].params).toEqual([dias, 1, 5]);
    expect(llamadas(/UPDATE congelacion_plan/)[0].params).toEqual([dias, 1, 5]);
    expect(llamadas(/^COMMIT$/)).toHaveLength(1);
  });

  test('should answer 409 NOT_FROZEN and change nothing when the plan is not frozen', async () => {
    // Arrange
    descongelarCon(null, 0);

    // Act
    const r = await pedir('post', '/admin/miembros/88/descongelar').send({});

    // Assert
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NOT_FROZEN');
    expect(llamadas(/^\s*UPDATE/)).toHaveLength(0);
    expect(llamadas(/^ROLLBACK$/)).toHaveLength(1);
  });

  test('should answer 503 DB_UNREACHABLE and roll back when unfreezing fails', async () => {
    // Arrange
    descongelarCon('2026-01-01', 3);
    mockReglas.unshift([/UPDATE congelacion_plan/, falla()]);

    // Act
    const r = await pedir('post', '/admin/miembros/88/descongelar').send({});

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(llamadas(/^ROLLBACK$/)).toHaveLength(1);
    expect(llamadas(/^COMMIT$/)).toHaveLength(0);
  });

  test('should answer 400 without opening a transaction when the id to unfreeze is not a number', async () => {
    // Arrange
    responder();

    // Act
    const r = await pedir('post', '/admin/miembros/abc/descongelar').send({});

    // Assert
    expect(r.status).toBe(400);
    expect(llamadas(/^BEGIN$/)).toHaveLength(0);
  });
});
