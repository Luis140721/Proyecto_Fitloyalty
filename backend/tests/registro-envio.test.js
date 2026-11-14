/**
 * RQF-09: POST /api/admin/notificaciones/enviado deja constancia de cada envio
 * en envio_mensaje, con la fecha y el estado (issue #24).
 *
 * La base es simulada y guarda los canales creados, para probar que el canal
 * del gimnasio se busca y, la primera vez, se crea. Los nombres de columna se
 * comparan con el DDL de produccion (ConsultasDB) y con el de Docker (002).
 * La prueba contra una base real esta en registro-envio-real.test.js.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
const mockRelease = jest.fn();
// El mismo mockQuery atiende al pool y al cliente de la transaccion, para ver
// todas las consultas en orden (BEGIN, COMMIT, ROLLBACK incluidos).
jest.mock('../src/db/db', () => ({
  query: (...a) => mockQuery(...a),
  connect: async () => ({ query: (...a) => mockQuery(...a), release: () => mockRelease() }),
}));

process.env.JWT_SECRET = 'secreto-de-pruebas';

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
  app.use('/api', notifRouter);
  app.use(errorHandler);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll(() => new Promise((resolve) => {
  establecerBusquedaPersonal(null);
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

const enviar = async (body, tk = RECEP) => {
  const r = await fetch(base + '/api/admin/notificaciones/enviado', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

beforeEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const TEXTO = 'Hola Ana, te saludamos de Gym Demo. Tu plan vencio hace 2 dias.';

/**
 * Base falsa con estado: `canales` es el catalogo canal_comunicacion.
 * `canalTrasBloqueo` simula que otra peticion creo el canal mientras esta
 * esperaba el bloqueo: la busqueda de despues del bloqueo ya lo encuentra.
 */
function prepararBD({ miembro = { nombre: 'Ana' }, canales = [], alerta = null, canalTrasBloqueo = null, fallaEnvio = false } = {}) {
  const estado = { canales: [...canales], siguiente: 50, bloqueado: false };
  mockQuery.mockImplementation(async (sql, params = []) => {
    const s = sql.trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return {};
    if (/FROM miembro/.test(s)) return { rows: miembro ? [miembro] : [] };
    if (/FROM alerta_abandono/.test(s)) return { rows: alerta && params[0] === alerta ? [{ id_alerta: alerta }] : [] };
    if (/pg_advisory_xact_lock/.test(s)) {
      estado.bloqueado = true;
      if (canalTrasBloqueo) estado.canales.push(canalTrasBloqueo);
      return { rows: [{}] };
    }
    if (/^SELECT id_canal FROM canal_comunicacion/.test(s)) {
      const [gym, tipo] = params;
      return { rows: estado.canales.filter((c) => c.id_gimnasio === gym && c.tipo === tipo).map((c) => ({ id_canal: c.id_canal })) };
    }
    if (/^INSERT INTO canal_comunicacion/.test(s)) {
      const c = { id_canal: estado.siguiente++, id_gimnasio: params[0], tipo: params[1] };
      estado.canales.push(c);
      return { rows: [{ id_canal: c.id_canal }] };
    }
    if (/^INSERT INTO envio_mensaje/.test(s)) {
      if (fallaEnvio) throw new Error('caida');
      return { rows: [{ id_envio: 900, estado: 'ENVIADO', fecha_envio: new Date() }] };
    }
    if (/^INSERT INTO notificacion/.test(s)) return { rowCount: 1 };
    throw new Error('consulta inesperada: ' + s.slice(0, 60));
  });
  return estado;
}

const llamadas = (re) => mockQuery.mock.calls.filter(([s]) => re.test(s));
const indice = (re) => mockQuery.mock.calls.findIndex(([s]) => re.test(s));
const insertEnvio = () => llamadas(/INSERT INTO envio_mensaje/)[0];

/** Columnas de una tabla segun un CREATE TABLE: nombre y si es obligatoria (NOT NULL sin DEFAULT). */
function columnasDe(archivo, tabla) {
  const ddl = fs.readFileSync(path.join(__dirname, '..', '..', archivo), 'utf8');
  const bloque = ddl.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${tabla} \\(([\\s\\S]*?)\\n\\);`))[1];
  return bloque.split('\n').map((l) => l.trim())
    .filter((l) => /^[a-z_]+\s+[A-Z]/.test(l))
    .map((l) => ({ nombre: l.split(/\s+/)[0], obligatoria: /NOT NULL/.test(l) && !/DEFAULT|SERIAL/.test(l) }));
}
const columnasDelInsert = (sql, tabla) =>
  sql.match(new RegExp(`INSERT INTO ${tabla} \\(([^)]*)\\)`))[1].split(',').map((c) => c.trim());

describe('POST /api/admin/notificaciones/enviado: canal del gimnasio', () => {
  test('canal existente: lo usa, no toma bloqueo ni crea otro', async () => {
    prepararBD({ canales: [{ id_canal: 4, id_gimnasio: 7, tipo: 'WHATSAPP' }] });
    const r = await enviar({ idMiembro: 12, tipo: 'vencida', mensaje: TEXTO });
    expect(r.status).toBe(201);
    expect(r.body.envio).toMatchObject({ id_envio: 900, estado: 'ENVIADO' });
    expect(llamadas(/INSERT INTO canal_comunicacion/)).toHaveLength(0);
    expect(llamadas(/pg_advisory_xact_lock/)).toHaveLength(0);
    // [id_gimnasio, id_miembro, id_canal, id_alerta, mensaje_copiado, enviado_por]
    expect(insertEnvio()[1]).toEqual([7, 12, 4, null, TEXTO, 2]);
    expect(llamadas(/^COMMIT$/)).toHaveLength(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test('primera vez: crea el canal WHATSAPP del gimnasio bajo bloqueo y lo usa', async () => {
    const estado = prepararBD();
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO }); // canal por defecto: WHATSAPP
    expect(r.status).toBe(201);
    const [, params] = llamadas(/INSERT INTO canal_comunicacion/)[0];
    expect(params).toEqual([7, 'WHATSAPP']);
    expect(estado.canales).toEqual([{ id_canal: 50, id_gimnasio: 7, tipo: 'WHATSAPP' }]);
    expect(insertEnvio()[1][2]).toBe(50);
    // Orden: miembro, BEGIN, buscar, bloquear, buscar otra vez, crear, envio, aviso, COMMIT.
    const orden = mockQuery.mock.calls.map(([s]) => s.trim().match(/^(BEGIN|COMMIT|SELECT \w+|INSERT INTO \w+)/)[1]);
    expect(orden).toEqual([
      'SELECT nombre', 'BEGIN', 'SELECT id_canal', 'SELECT pg_advisory_xact_lock', 'SELECT id_canal',
      'INSERT INTO canal_comunicacion', 'INSERT INTO envio_mensaje', 'INSERT INTO notificacion', 'COMMIT',
    ]);
    // El bloqueo es por gimnasio.
    expect(llamadas(/pg_advisory_xact_lock/)[0][1]).toEqual([7]);
  });

  test('el segundo envio reutiliza el canal creado en el primero', async () => {
    const estado = prepararBD(); // la misma base para los dos envios
    expect((await enviar({ idMiembro: 12, mensaje: TEXTO })).status).toBe(201);
    expect((await enviar({ idMiembro: 12, mensaje: TEXTO })).status).toBe(201);
    expect(llamadas(/INSERT INTO canal_comunicacion/)).toHaveLength(1);
    expect(estado.canales).toHaveLength(1);
    expect(llamadas(/INSERT INTO envio_mensaje/).map(([, p]) => p[2])).toEqual([50, 50]);
  });

  test('dos a la vez: si otra peticion lo creo mientras esperaba el bloqueo, no crea un segundo', async () => {
    prepararBD({ canalTrasBloqueo: { id_canal: 61, id_gimnasio: 7, tipo: 'WHATSAPP' } });
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO });
    expect(r.status).toBe(201);
    expect(llamadas(/pg_advisory_xact_lock/)).toHaveLength(1);
    expect(llamadas(/INSERT INTO canal_comunicacion/)).toHaveLength(0);
    expect(insertEnvio()[1][2]).toBe(61);
  });

  test('el canal de otro gimnasio no sirve: busca por el gimnasio del token y crea el suyo', async () => {
    prepararBD({ canales: [{ id_canal: 4, id_gimnasio: 8, tipo: 'WHATSAPP' }] });
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO });
    expect(r.status).toBe(201);
    expect(llamadas(/^\s*SELECT id_canal FROM canal_comunicacion/)[0][1]).toEqual([7, 'WHATSAPP']);
    expect(insertEnvio()[1][2]).toBe(50);
  });

  test('canal EMAIL: busca y crea el de ese tipo', async () => {
    prepararBD();
    const r = await enviar({ idMiembro: 12, canal: 'EMAIL', mensaje: TEXTO });
    expect(r.status).toBe(201);
    expect(llamadas(/INSERT INTO canal_comunicacion/)[0][1]).toEqual([7, 'EMAIL']);
  });
});

describe('POST /api/admin/notificaciones/enviado: validaciones', () => {
  test('miembro de otro gimnasio: 404 y no escribe nada', async () => {
    prepararBD({ miembro: null });
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('MEMBER_NOT_FOUND');
    expect(mockQuery.mock.calls[0][1]).toEqual([12, 7]);
    expect(llamadas(/INSERT|BEGIN/)).toHaveLength(0);
  });

  // 400 y no un mensaje inventado: mensaje_copiado es NOT NULL y es lo que
  // demuestra que se le dijo al miembro; el servidor no sabe que texto se abrio.
  test.each([
    ['sin mensaje', { idMiembro: 12 }],
    ['mensaje vacio', { idMiembro: 12, mensaje: '' }],
    ['mensaje solo con espacios', { idMiembro: 12, mensaje: '   ' }],
    ['mensaje de mas de 2000 caracteres', { idMiembro: 12, mensaje: 'x'.repeat(2001) }],
  ])('%s: 400 y no toca la base', async (_, body) => {
    prepararBD();
    const r = await enviar(body);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('sin mensaje: el error dice que falta el mensaje', async () => {
    const r = await enviar({ idMiembro: 12 });
    expect(r.body.error).toMatch(/Falta el mensaje/);
  });

  test('guarda el mensaje sin los espacios de los extremos', async () => {
    prepararBD({ canales: [{ id_canal: 4, id_gimnasio: 7, tipo: 'WHATSAPP' }] });
    await enviar({ idMiembro: 12, mensaje: `  ${TEXTO}\n` });
    expect(insertEnvio()[1][4]).toBe(TEXTO);
  });

  test.each(['PALOMA', 'SMS'])('canal %s: 400 (canal_comunicacion solo admite EMAIL y WHATSAPP)', async (canal) => {
    const r = await enviar({ idMiembro: 12, canal, mensaje: TEXTO });
    expect(r.status).toBe(400);
  });

  test('idAlerta del miembro: queda en id_alerta', async () => {
    prepararBD({ canales: [{ id_canal: 4, id_gimnasio: 7, tipo: 'WHATSAPP' }], alerta: 33 });
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO, idAlerta: 33 });
    expect(r.status).toBe(201);
    expect(llamadas(/FROM alerta_abandono/)[0][1]).toEqual([33, 12, 7]);
    expect(insertEnvio()[1][3]).toBe(33);
  });

  test('idAlerta que no es de ese miembro o de este gimnasio: 404 y no escribe nada', async () => {
    prepararBD({ alerta: 33 });
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO, idAlerta: 34 });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('ALERT_NOT_FOUND');
    expect(llamadas(/INSERT|BEGIN/)).toHaveLength(0);
  });

  test('token de miembro: 403', async () => {
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO }, MIEMBRO);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/admin/notificaciones/enviado: lo que se guarda', () => {
  test('el INSERT en envio_mensaje usa columnas reales e incluye todas las obligatorias', async () => {
    prepararBD({ canales: [{ id_canal: 4, id_gimnasio: 7, tipo: 'WHATSAPP' }] });
    await enviar({ idMiembro: 12, mensaje: TEXTO });
    const [sql] = insertEnvio();
    const usadas = columnasDelInsert(sql, 'envio_mensaje');
    expect(usadas).toEqual(['id_gimnasio', 'id_miembro', 'id_canal', 'id_alerta',
      'mensaje_copiado', 'estado', 'fecha_envio', 'enviado_por']);
    expect(usadas).not.toContain('canal'); // la columna de Docker que no existe en produccion (issue #24)

    const reales = columnasDe('ConsultasDB/Query_Inicial_Crear_Tablas.sql', 'envio_mensaje');
    const nombres = reales.map((c) => c.nombre);
    usadas.forEach((c) => expect(nombres).toContain(c));
    reales.filter((c) => c.obligatoria).forEach((c) => expect(usadas).toContain(c.nombre));
    // Estado ENVIADO (lo admite el CHECK) y la fecha del momento.
    expect(sql).toMatch(/'ENVIADO', NOW\(\)/);
  });

  test('el INSERT en canal_comunicacion usa columnas que existen en produccion y en Docker', async () => {
    prepararBD();
    await enviar({ idMiembro: 12, mensaje: TEXTO });
    const [sql] = llamadas(/INSERT INTO canal_comunicacion/)[0];
    const usadas = columnasDelInsert(sql, 'canal_comunicacion');
    expect(usadas).toEqual(['id_gimnasio', 'tipo', 'activo']);
    const prod = columnasDe('ConsultasDB/Query_Inicial_Crear_Tablas.sql', 'canal_comunicacion');
    const docker = columnasDe('backend/migrations/002_esquema_inicial.sql', 'canal_comunicacion');
    usadas.forEach((c) => {
      expect(prod.map((x) => x.nombre)).toContain(c);
      expect(docker.map((x) => x.nombre)).toContain(c);
    });
    prod.filter((c) => c.obligatoria).forEach((c) => expect(usadas).toContain(c.nombre));
  });

  test('mantiene el aviso en notificacion, dentro de la misma transaccion', async () => {
    prepararBD({ canales: [{ id_canal: 4, id_gimnasio: 7, tipo: 'WHATSAPP' }] });
    await enviar({ idMiembro: 12, tipo: 'vencida', mensaje: TEXTO });
    const [, params] = llamadas(/INSERT INTO notificacion/)[0];
    expect(params.slice(0, 4)).toEqual([7, 2, 'SISTEMA', 'Recordatorio enviado']);
    expect(params[4]).toMatch(/Ana.*WHATSAPP.*vencida/);
    expect(indice(/INSERT INTO notificacion/)).toBeLessThan(indice(/^COMMIT$/));
  });

  test('si la base falla al guardar: 503, ROLLBACK y libera la conexion', async () => {
    prepararBD({ fallaEnvio: true });
    const r = await enviar({ idMiembro: 12, mensaje: TEXTO });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNREACHABLE');
    expect(llamadas(/^ROLLBACK$/)).toHaveLength(1);
    expect(llamadas(/^COMMIT$/)).toHaveLength(0);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/admin/notificaciones: los avisos en riesgo traen la alerta', () => {
  test('idAlerta sale de alerta_abandono para que el envio quede ligado a ella', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/SELECT nombre FROM gimnasio/.test(sql)) return { rows: [{ nombre: 'Gym Demo' }] };
      if (/FROM alerta_abandono a/.test(sql)) {
        return { rows: [{ id_alerta: 33, nivel: 'ROJA', dias: 20, id_miembro: 12, nombre: 'Ana', telefono: '3001234567', codigo_pais_telefono: null }] };
      }
      return { rows: [] };
    });
    const r = await fetch(base + '/api/admin/notificaciones', { headers: { Authorization: `Bearer ${RECEP}` } });
    const { avisos } = await r.json();
    expect(avisos[0]).toMatchObject({ tipo: 'riesgo', idMiembro: 12, idAlerta: 33 });
    expect(avisos[0].mensaje).toBeTruthy();
  });
});
