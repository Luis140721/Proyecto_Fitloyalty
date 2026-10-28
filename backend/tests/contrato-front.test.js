/**
 * Bootcamp semana 4 (capa Front, Luis): el contrato que consume el frontend.
 *
 * Cada describe es un endpoint que llama el front, con los campos EXACTOS que
 * lee la pantalla (el inventario completo, con archivo y linea, va en el PR).
 * Si renombras un campo en el backend, aqui falla antes de que la interfaz
 * muestre "undefined" o un "Tu gimnasio" de relleno.
 *
 * Los errores se miran con los ojos de buildError (frontend/src/api.js): la
 * pantalla muestra `error` y decide con `code` y el status. Un error sin
 * `code` le llega al front como code null.
 *
 * Se usa la app real de src/index.js con la base simulada, como en
 * api-seguridad-errores.test.js: no hace falta Docker ni la BD de desarrollo.
 * Los campos que salen tal cual de una consulta (listas del dashboard,
 * personal, invitaciones) se verifican ademas en el SQL, porque la simulacion
 * devuelve lo que le pidas y no notaria un alias cambiado.
 */
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = 'secreto-de-pruebas';

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const DIA = 24 * 60 * 60 * 1000;
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };
const firmar = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
const ADMIN = firmar({ id: 1, role: 'admin', gymId: 7 });

// Fila del gimnasio 7 como la devuelve pg. Sin trial_ends_at: suscrito.
const GIMNASIO = { id_gimnasio: 7, nombre: 'Gimnasio Central', activo: true, trial_ends_at: null };

/**
 * Simula pool.query con reglas [patron del SQL, filas]: gana la primera que
 * coincide y lo demas responde sin filas. El gimnasio va siempre al final
 * (lo leen requireActiveTrial y el trial), asi cada test solo dice lo suyo.
 */
function simularBd(reglas = []) {
  const todas = [...reglas, [/FROM gimnasio WHERE id_gimnasio/i, [GIMNASIO]]];
  mockQuery.mockImplementation(async (sql) => {
    const regla = todas.find(([patron]) => patron.test(sql));
    return { rows: regla ? regla[1] : [] };
  });
}

/** Primer SQL ejecutado que coincide con el patron. */
const sqlEjecutado = (patron) => mockQuery.mock.calls.map(([sql]) => sql).find((sql) => patron.test(sql));

/** El SQL devuelve la columna `campo`: con alias (AS campo), con tabla (t.campo) o suelta en la lista. */
const seleccionaCampo = (sql, campo) => new RegExp(`(\\bAS ${campo}\\b|\\.${campo}\\b|[\\s,]${campo}\\s*,)`).test(sql);

/**
 * Lo que buildError necesita para que la pantalla muestre el error: JSON con
 * `error` en texto (el mensaje del banner o del formulario) y `code`.
 */
function esErrorQueMuestraElFront(r, status, code) {
  expect(r.status).toBe(status);
  expect(r.headers['content-type']).toMatch(/^application\/json/);
  expect(typeof r.body.error).toBe('string');
  expect(r.body.error.trim()).not.toBe('');
  expect(r.body.code).toBe(code);
}

// Los limites de intentos cuentan por IP (trust proxy 1): cada test usa la
// suya para que un test no le gaste los intentos al siguiente.
let ultimaIp = 0;
const ipNueva = () => `198.51.100.${++ultimaIp}`;
const postLogin = (cuerpo, ip = ipNueva()) => request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send(cuerpo);

beforeEach(() => {
  mockQuery.mockReset();
  simularBd();
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => establecerBusquedaPersonal(null));

// ---------------------------------------------------------------------------
// Sesion: AuthContext guarda user y gym; AdminLayout, MenuPerfil, Sidebar,
// UserAvatar y EliminarCuentaPage los leen.
// ---------------------------------------------------------------------------
const CAMPOS_USUARIO = ['email', 'gymId', 'id', 'name', 'photoUrl', 'role'];
const CAMPOS_GIMNASIO_SESION = ['active', 'id', 'logoUrl', 'name', 'trialEndsAt'];
// normalizeRole (AuthContext.jsx) solo entiende estos valores; otro deja al usuario sin rutas.
const ROLES_QUE_ENTIENDE_EL_FRONT = ['admin', 'administrador', 'receptionist', 'recepcionista', 'trainer', 'entrenador'];

const HASH = bcrypt.hashSync('clave123', 4);
const FILA_LOGIN = {
  id_usuario: 1, nombre: 'Luis Prueba', email: 'luis@gym.co', password_hash: HASH, id_gimnasio: 7,
  activo: true, gym_activo: true, trial_ends_at: new Date('2026-11-10T05:00:00Z'),
  gym_nombre: 'Gimnasio Central', gym_logo: null, rol_nombre: 'ADMINISTRADOR',
};
const reglaLogin = (fila) => [/WHERE LOWER\(u\.email\) = \$1/, fila ? [fila] : []];

describe('POST /api/auth/login (AuthContext.login)', () => {
  test('should return the token, the user and the gym with the exact fields the session reads when the credentials are valid', async () => {
    // Arrange
    simularBd([reglaLogin(FILA_LOGIN)]);

    // Act
    const r = await postLogin({ email: 'Luis@Gym.co', password: 'clave123' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(typeof r.body.token).toBe('string');
    expect(Object.keys(r.body.user).sort()).toEqual(CAMPOS_USUARIO);
    expect(r.body.user).toEqual({
      id: 1, name: 'Luis Prueba', email: 'luis@gym.co', role: 'admin', gymId: 7, photoUrl: expect.stringMatching(/^https:\/\//),
    });
    expect(Object.keys(r.body.gym).sort()).toEqual(CAMPOS_GIMNASIO_SESION);
    expect(r.body.gym).toEqual(expect.objectContaining({ id: 7, name: 'Gimnasio Central', active: true }));
    expect(r.text).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  test.each([['ADMINISTRADOR'], ['RECEPCIONISTA'], ['ENTRENADOR']])(
    'should send a role the front can normalize when the user is %s',
    async (rolNombre) => {
      // Arrange
      simularBd([reglaLogin({ ...FILA_LOGIN, rol_nombre: rolNombre })]);

      // Act
      const r = await postLogin({ email: 'luis@gym.co', password: 'clave123' });

      // Assert
      expect(r.status).toBe(200);
      expect(ROLES_QUE_ENTIENDE_EL_FRONT).toContain(r.body.user.role);
    },
  );

  test('should answer 401 with exactly the error text and code LoginPage shows when the password is wrong', async () => {
    // Arrange
    simularBd([reglaLogin(FILA_LOGIN)]);

    // Act
    const r = await postLogin({ email: 'luis@gym.co', password: 'otra-clave1' });

    // Assert: codigo, Content-Type y cuerpo completo (buildError muestra `error`)
    expect(r.status).toBe(401);
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(r.body).toEqual({ error: 'Credenciales incorrectas', code: 'BAD_CREDENTIALS' });
  });

  test('should answer 400 VALIDATION_ERROR with details.issues by field when the email is missing', async () => {
    // Act
    const r = await postLogin({ password: 'clave123' });

    // Assert: RegisterOwnerPage marca cada campo con issues[].path[0] y issues[].message
    esErrorQueMuestraElFront(r, 400, 'VALIDATION_ERROR');
    expect(r.body.details.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['email'], message: expect.any(String) }),
    ]));
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('should answer 403 ACCOUNT_DISABLED with a message when an admin deactivated the account', async () => {
    // Arrange
    simularBd([reglaLogin({ ...FILA_LOGIN, activo: false })]);

    // Act
    const r = await postLogin({ email: 'luis@gym.co', password: 'clave123' });

    // Assert
    esErrorQueMuestraElFront(r, 403, 'ACCOUNT_DISABLED');
    expect(r.body).not.toHaveProperty('token');
  });

  test('should answer 429 with error and code RATE_LIMITED when the sixth attempt arrives within a minute', async () => {
    // Arrange: cinco intentos desde la misma IP (se cortan en la validacion, sin base)
    const ip = ipNueva();
    for (let i = 0; i < 5; i += 1) await postLogin({}, ip).expect(400);

    // Act
    const r = await postLogin({}, ip);

    // Assert: sin `code`, buildError le pasa null a la pantalla
    esErrorQueMuestraElFront(r, 429, 'RATE_LIMITED');
  });
});

describe('GET /api/auth/me (AuthContext al recargar)', () => {
  // `SELECT u.*` trae toda la fila de usuario, incluida la clave.
  const FILA_ME = {
    id_usuario: 1, id_gimnasio: 7, nombre: 'Luis Prueba', email: 'luis@gym.co', password_hash: HASH,
    rol: 'ADMINISTRADOR', id_rol: 1, activo: true, ultimo_acceso: null, debe_cambiar_clave: false,
    foto_url: null, fecha_creacion: new Date('2026-10-01T12:00:00Z'),
    gym_activo: true, trial_ends_at: null, gym_nombre: 'Gimnasio Central', gym_logo: 'https://cdn.example/logo.png',
  };

  test('should return the same user and gym fields as the login when the token is valid', async () => {
    // Arrange
    simularBd([[/WHERE u\.id_usuario = \$1 AND u\.activo = TRUE/, [FILA_ME]]]);

    // Act
    const r = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ADMIN}`);

    // Assert
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.user).sort()).toEqual(CAMPOS_USUARIO);
    expect(r.body.user).toEqual(expect.objectContaining({ id: 1, name: 'Luis Prueba', email: 'luis@gym.co', role: 'admin' }));
    expect(Object.keys(r.body.gym).sort()).toEqual(CAMPOS_GIMNASIO_SESION);
    expect(r.body.gym).toEqual(expect.objectContaining({ name: 'Gimnasio Central', active: true, logoUrl: 'https://cdn.example/logo.png' }));
    expect(r.text).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  test('should answer 401 AUTH_REQUIRED when there is no token', async () => {
    // Act
    const r = await request(app).get('/api/auth/me');

    // Assert: AuthContext suelta el token con 401, 403 o 404
    esErrorQueMuestraElFront(r, 401, 'AUTH_REQUIRED');
  });

  test('should answer 404 USER_NOT_FOUND when the user no longer exists', async () => {
    // Act (la base no devuelve la fila)
    const r = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ADMIN}`);

    // Assert
    esErrorQueMuestraElFront(r, 404, 'USER_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// TrialContext guarda data.trial; AdminLayout pinta los avisos con
// trial.expired, trial.active y trial.daysLeft.
// ---------------------------------------------------------------------------
describe('GET /api/billing/trial-status (TrialContext)', () => {
  const conTrial = (finTrial) => simularBd([[/FROM gimnasio WHERE id_gimnasio/i, [{ ...GIMNASIO, trial_ends_at: finTrial }]]]);
  const pedir = () => request(app).get('/api/billing/trial-status').set('Authorization', `Bearer ${ADMIN}`);

  test('should return active, expired, reason, daysLeft and endsAt when the gym is in its trial', async () => {
    // Arrange: vence en 3 dias y medio
    conTrial(new Date(Date.now() + 3.5 * DIA));

    // Act
    const r = await pedir();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.trial).toEqual({
      active: true, expired: false, reason: 'trial-activo', daysLeft: 4, endsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  test('should name the gym with `name`, like the login and /auth/me, when it answers', async () => {
    // Act
    const r = await pedir();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.gym).toEqual({ id: 7, name: 'Gimnasio Central', active: true });
  });

  test('should report expired with daysLeft 0 when the trial already ended', async () => {
    // Arrange
    conTrial(new Date(Date.now() - DIA));

    // Act
    const r = await pedir();

    // Assert: AdminLayout muestra "Tu prueba gratuita ha finalizado"
    expect(r.status).toBe(200);
    expect(r.body.trial).toEqual(expect.objectContaining({ active: false, expired: true, daysLeft: 0 }));
  });

  test('should answer 401 AUTH_REQUIRED when there is no token', async () => {
    // Act
    const r = await request(app).get('/api/billing/trial-status');

    // Assert: TrialContext pasa a 'sin-sesion' con el 401
    esErrorQueMuestraElFront(r, 401, 'AUTH_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// DashboardPage: 9 KPIs, 4 listas y la grafica de horas pico.
// ---------------------------------------------------------------------------
const KPIS_NUMERICOS = ['checkinsHoy', 'cobrosPendientes', 'enRiesgo', 'ingresosMes', 'planTopCount', 'qrsActivos', 'retention', 'totalMiembros', 'vencen7'];
// Campos que DashboardPage.jsx lee de cada fila de las listas.
const FILAS_DASHBOARD = {
  enRiesgoList: { patron: /AS dias_sin/, campos: ['nombre', 'dias_sin', 'monto'] },
  proximos: { patron: /AS dias_restantes/, campos: ['id_miembro', 'miembro', 'documento', 'plan', 'fecha_fin', 'dias_restantes'] },
  recientes: { patron: /c\.id_checkin/, campos: ['id_checkin', 'nombre', 'metodo', 'fecha_hora'] },
};

function simularDashboard() {
  simularBd([
    [/AS dias_sin/, [{ nombre: 'Ana Perez', dias_sin: 20, monto: 89900 }]],
    [/AS dow/, [{ dow: 1, count: 5 }]],
    [/AS dias_restantes/, [{ id_miembro: 3, miembro: 'Luis Gomez', documento: '1020304050', plan: 'Mensual', fecha_fin: '2026-11-01', dias_restantes: 5 }]],
    [/c\.id_checkin/, [{ id_checkin: 9, fecha_hora: '2026-10-27T13:00:00.000Z', metodo: 'QR', nombre: 'Ana Perez', codigo_qr: 'qr-ana' }]],
    [/COUNT\(DISTINCT/, [{ activos: 6 }]],
    [/SUM\(pc\.valor_pagado\)/, [{ total: 450000 }]],
    [/estado_pago IN/, [{ total: 2 }]],
    [/AS cnt/, [{ plan: 'Mensual', cnt: 7 }]],
    [/LEFT JOIN LATERAL/, [{ total: 4 }]],
    [/INTERVAL '7 days'/, [{ total: 1 }]],
    [/FROM checkin\s+WHERE/, [{ total: 3 }]],
    [/FROM miembro WHERE id_gimnasio = \$1 AND activo = TRUE/, [{ total: 10 }]],
  ]);
}

describe('GET /api/admin/dashboard (DashboardPage)', () => {
  const pedir = () => request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${ADMIN}`);

  test('should return every KPI as a number and the four lists the page draws when the admin opens it', async () => {
    // Arrange
    simularDashboard();

    // Act
    const r = await pedir();

    // Assert
    expect(r.status).toBe(200);
    for (const kpi of KPIS_NUMERICOS) expect(typeof r.body[kpi]).toBe('number');
    expect(r.body).toEqual(expect.objectContaining({
      totalMiembros: 10, checkinsHoy: 3, vencen7: 1, enRiesgo: 4, retention: 60, ingresosMes: 450000,
      cobrosPendientes: 2, planTop: 'Mensual', planTopCount: 7, qrsActivos: 10,
    }));
    // BarsWeekly dibuja 7 barras con d.day.toUpperCase() y d.count
    expect(r.body.weekly).toHaveLength(7);
    expect(r.body.weekly[1]).toEqual({ day: 'Lun', count: 5 });
    for (const [lista, { campos }] of Object.entries(FILAS_DASHBOARD)) {
      expect(Array.isArray(r.body[lista])).toBe(true);
      expect(Object.keys(r.body[lista][0])).toEqual(expect.arrayContaining(campos));
    }
  });

  test('should select in SQL every field the page reads from each list row', async () => {
    // Arrange
    simularDashboard();

    // Act
    await pedir().expect(200);

    // Assert
    for (const { patron, campos } of Object.values(FILAS_DASHBOARD)) {
      const sql = sqlEjecutado(patron);
      for (const campo of campos) expect({ campo, enSql: seleccionaCampo(sql, campo) }).toEqual({ campo, enSql: true });
    }
  });

  test('should answer 402 TRIAL_EXPIRED with a message when the gym trial ended', async () => {
    // Arrange
    simularBd([[/FROM gimnasio WHERE id_gimnasio/i, [{ ...GIMNASIO, trial_ends_at: new Date(Date.now() - DIA) }]]]);

    // Act
    const r = await pedir();

    // Assert: el banner muestra "Tu periodo de prueba expiro" y la pagina el mensaje
    esErrorQueMuestraElFront(r, 402, 'TRIAL_EXPIRED');
  });
});

describe('GET /api/admin/dashboard/horas-pico (grafica de DashboardPage)', () => {
  const pedir = (periodo) => request(app).get('/api/admin/dashboard/horas-pico').query({ periodo }).set('Authorization', `Bearer ${ADMIN}`);

  test('should return 24 hours, the total, the peak hour and the label when the period is valid', async () => {
    // Arrange
    simularBd([[/EXTRACT\(HOUR/, [{ hora: 7, total: 4 }, { hora: 18, total: 9 }]]]);

    // Act
    const r = await pedir('semana');

    // Assert: la pagina usa horas[].hora/total, horaPico.hora/total, total y etiqueta.toLowerCase()
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ periodo: 'semana', etiqueta: 'Últimos 7 días', total: 13, horaPico: { hora: 18, total: 9 } }));
    expect(r.body.horas).toHaveLength(24);
    expect(r.body.horas[7]).toEqual({ hora: 7, total: 4 });
    expect(r.body.horas[0]).toEqual({ hora: 0, total: 0 });
  });

  test('should send horaPico null when there are no entries in the period', async () => {
    // Act
    const r = await pedir('hoy');

    // Assert: la pagina muestra el texto de "sin entradas" con horaPico vacio
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ etiqueta: 'Hoy', total: 0, horaPico: null }));
  });

  test('should answer 503 DB_UNREACHABLE with the message the page shows when the database fails', async () => {
    // Arrange: el gimnasio responde, la consulta de horas no
    simularBd();
    const original = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (sql, params) => {
      if (/EXTRACT\(HOUR/.test(sql)) throw new Error('connection terminated: SELECT EXTRACT(HOUR FROM c.fecha_hora)');
      return original(sql, params);
    });

    // Act
    const r = await pedir('mes');

    // Assert
    esErrorQueMuestraElFront(r, 503, 'DB_UNREACHABLE');
    expect(r.body.error).toBe('No pudimos cargar las horas pico. Intenta de nuevo.');
  });
});

// ---------------------------------------------------------------------------
// StaffPage pide las dos listas a la vez y lee u.* e i.* de cada fila.
// ---------------------------------------------------------------------------
describe('GET /api/admin/staff y /api/admin/staff/invitations (StaffPage)', () => {
  test('should wrap the lists in staff and invitations and select every field the page reads', async () => {
    // Arrange
    simularBd([
      [/FROM usuario WHERE id_gimnasio/, [{ id_usuario: 1, nombre: 'Luis', email: 'luis@gym.co', id_rol: 1, activo: true, rol: 'ADMINISTRADOR', es_dueno: true }]],
      [/FROM invitacion_staff/, [{ id_invitacion: 4, email: 'ana@gym.co', nombre: 'Ana', rol_asignado: 'RECEPCIONISTA', pendiente: true }]],
    ]);

    // Act
    const [staff, invitaciones] = await Promise.all([
      request(app).get('/api/admin/staff').set('Authorization', `Bearer ${ADMIN}`),
      request(app).get('/api/admin/staff/invitations').set('Authorization', `Bearer ${ADMIN}`),
    ]);

    // Assert
    expect(staff.status).toBe(200);
    expect(staff.body.staff[0]).toEqual(expect.objectContaining({ id_usuario: 1, rol: 'ADMINISTRADOR', es_dueno: true }));
    expect(invitaciones.status).toBe(200);
    expect(invitaciones.body.invitations[0]).toEqual(expect.objectContaining({ id_invitacion: 4, pendiente: true }));
    const sqlStaff = sqlEjecutado(/FROM usuario WHERE id_gimnasio/);
    for (const campo of ['id_usuario', 'nombre', 'email', 'activo', 'rol', 'es_dueno']) expect({ campo, enSql: seleccionaCampo(sqlStaff, campo) }).toEqual({ campo, enSql: true });
    const sqlInv = sqlEjecutado(/FROM invitacion_staff/);
    for (const campo of ['id_invitacion', 'email', 'nombre', 'rol_asignado', 'fecha_expiracion', 'fecha_aceptacion', 'fecha_revocado', 'pendiente']) {
      expect({ campo, enSql: seleccionaCampo(sqlInv, campo) }).toEqual({ campo, enSql: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AcceptInvitePage muestra la invitacion antes de crear la cuenta.
// ---------------------------------------------------------------------------
describe('GET /api/auth/accept-invite/:token (AcceptInvitePage)', () => {
  const INVITACION = {
    email: 'ana@gym.co', nombre: 'Ana', rol_asignado: 'RECEPCIONISTA', fecha_expiracion: new Date(Date.now() + 2 * DIA),
    fecha_aceptacion: null, fecha_revocado: null, gym_nombre: 'Gimnasio Central',
  };
  const pedir = () => request(app).get('/api/auth/accept-invite/token-de-prueba');

  test('should return the gym name as text, the role, the email and the expiry when the invitation is valid', async () => {
    // Arrange
    simularBd([[/FROM invitacion_staff i/, [INVITACION]]]);

    // Act
    const r = await pedir();

    // Assert: la pagina usa preview.gym.slice(), ROL_LABEL[preview.rol], preview.email y new Date(preview.expiresAt)
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ email: 'ana@gym.co', nombre: 'Ana', rol: 'RECEPCIONISTA', gym: 'Gimnasio Central', expiresAt: expect.any(String) });
    expect(Number.isNaN(new Date(r.body.expiresAt).getTime())).toBe(false);
  });

  test('should answer 410 INVITE_EXPIRED when the invitation expired', async () => {
    // Arrange
    simularBd([[/FROM invitacion_staff i/, [{ ...INVITACION, fecha_expiracion: new Date(Date.now() - DIA) }]]]);

    // Act
    const r = await pedir();

    // Assert: la pagina reconoce el 410 y el code INVITE_EXPIRED
    esErrorQueMuestraElFront(r, 410, 'INVITE_EXPIRED');
  });

  test('should answer 404 INVITE_NOT_FOUND when the token does not exist', async () => {
    // Act
    const r = await pedir();

    // Assert
    esErrorQueMuestraElFront(r, 404, 'INVITE_NOT_FOUND');
  });
});
