/**
 * RQNF-07: pruebas de las rutas de check-in y de los avisos de la campana.
 * Complementan acceso-bloqueado.test.js (membresia vencida) y gamificacion.test.js.
 */
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const checkinRouter = require('../src/routes/checkin');
const notifRouter = require('../src/routes/notificaciones');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const token = (p) => jwt.sign(p, process.env.JWT_SECRET, p.role === 'cliente' ? {} : { expiresIn: '1h' });
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };
const RECEP = token({ id: 2, role: 'receptionist', gymId: 7 });
const MIEMBRO = token({ id: 5, role: 'cliente', idMiembro: 5, gymId: 7 });

let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((payload) => ({ activo: true, id_gimnasio: payload.gymId, rol_nombre: ROL_BD[payload.role] }));
  const app = express();
  app.use(express.json());
  app.use('/api', checkinRouter);
  app.use('/api', notifRouter);
  app.use(errorHandler);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll(() => new Promise((resolve) => {
  establecerBusquedaPersonal(null);
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

const call = async (method, url, tk, body) => {
  const r = await fetch(base + url, {
    method,
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const ANA = { id_miembro: 12, nombre: 'Ana', documento: '123', codigo_qr: 'QR-ANA', qr_imagen: null };

/** Cifra como lo hace miembros.js: AES-256-CBC con la clave por defecto de las pruebas. */
function cifrar(texto) {
  const key = crypto.scryptSync(process.env.QR_ENCRYPTION_KEY || 'FitLoyalty2024SecretKey', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  return `${iv.toString('hex')}:${c.update(texto, 'utf8', 'hex') + c.final('hex')}`;
}

/** Base falsa: cada consulta se resuelve por su texto. */
function preparar({ directo = [ANA], todos = [ANA], porDocumento = [ANA], repetido = [], fechaFin = manana } = {}) {
  mockQuery.mockImplementation(async (sql) => {
    if (/FROM gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
    if (/codigo_qr = \$2/.test(sql)) return { rows: directo };
    if (/documento = \$2/.test(sql)) return { rows: porDocumento };
    if (/FROM miembro/i.test(sql)) return { rows: todos };
    if (/DISTINCT ON/i.test(sql)) return { rows: [{ tipo_plan: 'MENSUAL', fecha_fin: fechaFin, estado_pago: 'PAGADO' }] };
    if (/INSERT INTO checkin/i.test(sql)) return { rows: [{ id_checkin: 1, fecha_hora: new Date(), metodo: 'QR' }] };
    if (/SELECT DISTINCT to_char/i.test(sql)) return { rows: [{ dia: '2026-10-20' }] };
    if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total: 1 }] };
    if (/FROM hito_gamificacion/i.test(sql)) return { rows: [] };
    if (/FROM checkin/i.test(sql)) return { rows: repetido };
    throw new Error('consulta inesperada: ' + sql.slice(0, 60));
  });
}

describe('POST /api/admin/checkin: busqueda del miembro', () => {
  test('por QR que coincide directo: 201 y registra la asistencia', async () => {
    preparar();
    const r = await call('POST', '/api/admin/checkin', RECEP, { codigo: 'QR-ANA', metodo: 'QR' });
    expect(r.status).toBe(201);
    expect(r.body.duplicado).toBe(false);
    expect(r.body.miembro.id).toBe(12);
    expect(mockQuery.mock.calls.some(([q]) => /INSERT INTO checkin/i.test(q))).toBe(true);
  });

  test('por QR cifrado: lo descifra y lo encuentra', async () => {
    preparar();
    const r = await call('POST', '/api/admin/checkin', RECEP, { codigo: cifrar('QR-ANA'), metodo: 'QR' });
    expect(r.status).toBe(201);
    const consultaDirecta = mockQuery.mock.calls.find(([s]) => /codigo_qr = \$2/.test(s));
    expect(consultaDirecta[1][1]).toBe('QR-ANA');
  });

  test('QR que no coincide directo: busca entre los QR cifrados del gimnasio', async () => {
    preparar({ directo: [], todos: [{ ...ANA, codigo_qr: cifrar('QR-ANA') }] });
    const r = await call('POST', '/api/admin/checkin', RECEP, { codigo: 'QR-ANA', metodo: 'QR' });
    expect(r.status).toBe(201);
    expect(r.body.miembro.codigo_qr).toBe('QR-ANA');
  });

  test('QR desconocido: 404', async () => {
    preparar({ directo: [], todos: [] });
    const r = await call('POST', '/api/admin/checkin', RECEP, { codigo: 'NO-EXISTE', metodo: 'QR' });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
  });

  test('documento desconocido: 404', async () => {
    preparar({ porDocumento: [] });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '999' });
    expect(r.status).toBe(404);
  });

  test('todas las busquedas filtran por el gimnasio del token', async () => {
    preparar();
    await call('POST', '/api/admin/checkin', RECEP, { documento: '123' });
    const busqueda = mockQuery.mock.calls.find(([s]) => /documento = \$2/.test(s));
    expect(busqueda[1][0]).toBe(7);
  });

  test('sin codigo ni documento: 400 y no consulta miembros', async () => {
    preparar();
    const r = await call('POST', '/api/admin/checkin', RECEP, { metodo: 'MANUAL' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(mockQuery.mock.calls.some(([s]) => /FROM miembro/i.test(s))).toBe(false);
  });
});

describe('POST /api/admin/checkin: registro y permisos', () => {
  test('un segundo ingreso dentro de la ventana es duplicado: 200, sin nuevo INSERT', async () => {
    preparar({ repetido: [{ id_checkin: 9, fecha_hora: new Date(), metodo: 'QR' }] });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123' });
    expect(r.status).toBe(200);
    expect(r.body.duplicado).toBe(true);
    expect(mockQuery.mock.calls.some(([s]) => /INSERT INTO checkin/i.test(s))).toBe(false);
  });

  test('error de base de datos al registrar: 503', async () => {
    preparar();
    const original = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (sql, p) => {
      if (/INSERT INTO checkin/i.test(sql)) throw new Error('caida');
      return original(sql, p);
    });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123' });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
  });

  test('un token de miembro (app movil) no puede hacer check-in: 403', async () => {
    const r = await call('POST', '/api/admin/checkin', MIEMBRO, { documento: '123' });
    expect(r.status).toBe(403);
  });

  test('sin token: 401', async () => {
    const r = await fetch(base + '/api/admin/checkin', { method: 'POST' });
    expect(r.status).toBe(401);
  });
});

describe('GET /api/admin/checkin (historial)', () => {
  test('filtra por gimnasio y limita entre 1 y 200', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
      return { rows: [{ id_checkin: 1, nombre: 'Ana' }] };
    });
    const r = await call('GET', '/api/admin/checkin?limit=5000', RECEP);
    expect(r.status).toBe(200);
    expect(r.body.checkins).toHaveLength(1);
    const [sql, params] = mockQuery.mock.calls.find(([s]) => /FROM checkin c/i.test(s));
    expect(params).toEqual([7]);
    expect(sql).toMatch(/LIMIT 200/);
  });

  test('error de base de datos: 503', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
      throw new Error('caida');
    });
    const r = await call('GET', '/api/admin/checkin', RECEP);
    expect(r.status).toBe(503);
  });
});

describe('POST /api/admin/notificaciones/enviado', () => {
  const preparar2 = ({ existe = true, falla = false } = {}) => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM miembro/i.test(sql)) return { rows: existe ? [{ nombre: 'Ana' }] : [] };
      if (falla) throw new Error('caida');
      return { rows: [], rowCount: 1 };
    });
  };

  test('deja constancia del envio y de la notificacion: 201', async () => {
    preparar2();
    const r = await call('POST', '/api/admin/notificaciones/enviado', RECEP, { idMiembro: 12, canal: 'WHATSAPP', tipo: 'vencida' });
    expect(r.status).toBe(201);
    const envio = mockQuery.mock.calls.find(([s]) => /INSERT INTO envio_mensaje/i.test(s));
    expect(envio[1]).toEqual([7, 12, 'WHATSAPP']);
    const aviso = mockQuery.mock.calls.find(([s]) => /INSERT INTO notificacion/i.test(s));
    expect(aviso[1][4]).toMatch(/Ana.*WHATSAPP.*vencida/);
  });

  test('el miembro debe ser del gimnasio del token: si no, 404 y no escribe nada', async () => {
    preparar2({ existe: false });
    const r = await call('POST', '/api/admin/notificaciones/enviado', RECEP, { idMiembro: 12 });
    expect(r.status).toBe(404);
    expect(mockQuery.mock.calls.some(([s]) => /INSERT/i.test(s))).toBe(false);
    expect(mockQuery.mock.calls[0][1]).toEqual([12, 7]);
  });

  test('canal invalido: 400', async () => {
    preparar2();
    const r = await call('POST', '/api/admin/notificaciones/enviado', RECEP, { idMiembro: 12, canal: 'PALOMA' });
    expect(r.status).toBe(400);
  });

  test('si la base falla al guardar: 503', async () => {
    preparar2({ falla: true });
    const r = await call('POST', '/api/admin/notificaciones/enviado', RECEP, { idMiembro: 12 });
    expect(r.status).toBe(503);
  });

  test('token de miembro: 403', async () => {
    const r = await call('POST', '/api/admin/notificaciones/enviado', MIEMBRO, { idMiembro: 12 });
    expect(r.status).toBe(403);
  });
});
