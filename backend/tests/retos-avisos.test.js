/**
 * RQF-12 (correcciones del verificador al PR #100), sin base de datos (corren
 * en el CI). Las mismas cosas contra una base real estan en
 * retos-campanas-real.test.js y bandeja-mensajes-real.test.js.
 *
 *   - Los cuatro caminos que completan un reto (check-in, «Unirme»,
 *     «Inscribir elegibles» y bajar la meta) dejan el aviso al gimnasio y el
 *     mensaje al miembro, una sola vez, y en la misma transaccion que el
 *     completado (si el aviso falla, el reto sigue EN_CURSO).
 *   - Cancelar un reto le deja un mensaje a quien iba en curso.
 *   - La bandeja del miembro solo ve sus filas MIEMBRO de su gimnasio.
 *   - La campana del panel no muestra ni marca mensajes del miembro.
 *   - En produccion sin QR_DINAMICO_SECRET no se puede activar el QR dinamico
 *     y el servidor lo avisa al arrancar.
 *
 * La base falsa resuelve cada consulta por su texto y guarda el estado de una
 * participacion (reto_miembro) y de las filas de notificacion, con BEGIN,
 * COMMIT y ROLLBACK de verdad (ROLLBACK deshace lo hecho en la transaccion).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
const mockConnect = jest.fn();
jest.mock('../src/db/db', () => ({
  query: (...a) => mockQuery(...a),
  connect: (...a) => mockConnect(...a),
}));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const retosLib = require('../src/lib/retos');
const qr = require('../src/lib/qr-dinamico');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const GYM = 7;
const ANA = 12;
const RETO = 9;
const token = (p) => jwt.sign(p, process.env.JWT_SECRET, { expiresIn: '1h' });
const ADMIN = token({ id: 2, role: 'admin', gymId: GYM });
const TK_ANA = token({ idMiembro: ANA, role: 'cliente', gymId: GYM });

const app = express();
app.use(express.json());
app.use('/api', require('../src/routes/retos'));
app.use('/api', require('../src/routes/config'));
app.use('/api', require('../src/routes/notificaciones'));
app.use('/api/cliente', require('../src/routes/cliente'));
app.use(errorHandler);

beforeAll(() => {
  const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
});
afterAll(() => establecerBusquedaPersonal(null));

let errorLog;
beforeEach(() => {
  mockQuery.mockReset();
  mockConnect.mockReset();
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// ===========================================================================
// Base falsa de un reto con una participacion
// ===========================================================================
function baseFalsa({ dias = 2, meta = 2, inscrita = true, estadoFila = 'EN_CURSO', fallaAviso = false } = {}) {
  const db = {
    dias, meta, fallaAviso,
    fila: inscrita ? { id_reto_miembro: 30, estado: estadoFila } : null,
    notificaciones: [],
    respaldo: null,
    sqls: [],
  };
  const responder = async (sql, params = []) => {
    db.sqls.push({ sql, params });
    if (/^\s*BEGIN/.test(sql)) {
      db.respaldo = { fila: db.fila && { ...db.fila }, n: db.notificaciones.length };
      return { rows: [] };
    }
    if (/^\s*COMMIT/.test(sql)) { db.respaldo = null; return { rows: [] }; }
    if (/^\s*ROLLBACK/.test(sql)) {
      if (db.respaldo) {
        db.fila = db.respaldo.fila;
        db.notificaciones.length = db.respaldo.n;
        db.respaldo = null;
      }
      return { rows: [] };
    }
    // Prueba gratis del gimnasio (requireActiveTrial).
    if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) {
      return { rows: [{ id_gimnasio: GYM, activo: true, trial_ends_at: null }] };
    }
    if (/UPDATE reto SET estado = CASE/.test(sql)) return { rows: [], rowCount: 0 }; // sincronizarEstados
    // «Unirme»: el reto vigente del gimnasio.
    if (/SELECT id_reto, nombre, segmento_elegible, estado\s+FROM reto/.test(sql)) {
      return { rows: [{ id_reto: RETO, nombre: 'Dos visitas', segmento_elegible: 'TODOS', estado: 'ACTIVO' }] };
    }
    // retoDelGimnasio (panel).
    if (/FROM reto r WHERE r\.id_reto = \$1 AND r\.id_gimnasio = \$2/.test(sql)) {
      return { rows: [{ id_reto: RETO, nombre: 'Dos visitas', descripcion: null, meta_asistencias: db.meta,
        recompensa: 'Batido', segmento_elegible: 'TODOS', estado: 'ACTIVO', activo: true,
        fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' }] };
    }
    if (/FROM miembro m/.test(sql)) return { rows: [{ id_miembro: ANA, nombre: 'Ana' }] }; // segmento
    if (/SELECT id_miembro FROM reto_miembro WHERE id_reto = \$1/.test(sql)) {
      return { rows: db.fila ? [{ id_miembro: ANA }] : [] };
    }
    // Inscripcion manual («Unirme» o «Inscribir elegibles»).
    if (/INSERT INTO reto_miembro \(id_reto, id_miembro\) VALUES/.test(sql)) {
      if (db.fila) return { rows: [] };
      db.fila = { id_reto_miembro: 30, estado: 'EN_CURSO' };
      return { rows: [{ id_reto_miembro: 30 }] };
    }
    // Inscripcion automatica del check-in (retos de segmento TODOS).
    if (/INSERT INTO reto_miembro \(id_reto, id_miembro\)\s+SELECT/.test(sql)) {
      if (!db.fila) db.fila = { id_reto_miembro: 30, estado: 'EN_CURSO' };
      return { rows: [] };
    }
    if (/UPDATE reto SET nombre = \$3/.test(sql)) { db.meta = params[4]; return { rows: [], rowCount: 1 }; }
    // Retos en curso del miembro (check-in) o inscritos en curso (cambio de meta).
    if (/FROM reto_miembro rm\s+JOIN reto r/.test(sql)) {
      return { rows: db.fila && db.fila.estado === 'EN_CURSO'
        ? [{ id_reto_miembro: 30, id_reto: RETO, nombre: 'Dos visitas', meta_asistencias: db.meta, recompensa: 'Batido' }]
        : [] };
    }
    if (/SELECT id_reto_miembro, id_miembro FROM reto_miembro WHERE id_reto = \$1 AND estado = 'EN_CURSO'/.test(sql)) {
      return { rows: db.fila && db.fila.estado === 'EN_CURSO' ? [{ id_reto_miembro: 30, id_miembro: ANA }] : [] };
    }
    if (/COUNT\(DISTINCT/.test(sql)) return { rows: [{ dias: db.dias }] };
    // El UPDATE de recalcularParticipacion solo toca filas EN_CURSO.
    if (/UPDATE reto_miembro rm\s+SET checkins_acumulados/.test(sql)) {
      if (!db.fila || db.fila.estado !== 'EN_CURSO') return { rows: [] };
      if (db.dias >= db.meta) db.fila.estado = 'COMPLETADO';
      return { rows: [{ id_reto_miembro: 30, estado: db.fila.estado, checkins_acumulados: db.dias,
        porcentaje_avance: Math.min(100, (db.dias * 100) / db.meta), fecha_completado: null }] };
    }
    if (/SELECT r\.nombre AS nombre_reto/.test(sql)) {
      return { rows: [{ nombre_reto: 'Dos visitas', recompensa: 'Batido', nombre_miembro: 'Ana' }] };
    }
    if (/INSERT INTO notificacion/.test(sql)) {
      if (db.fallaAviso) throw new Error('sin conexion');
      // VALUES (..., 'GIMNASIO'), (..., 'MIEMBRO') con los textos en $4 y $6.
      db.notificaciones.push(
        { id_gimnasio: params[0], id_miembro: params[1], titulo: params[2], mensaje: params[3], destinatario: 'GIMNASIO' },
        { id_gimnasio: params[0], id_miembro: params[1], titulo: params[4], mensaje: params[5], destinatario: 'MIEMBRO' },
      );
      return { rows: [], rowCount: 2 };
    }
    throw new Error('consulta inesperada: ' + sql.slice(0, 80));
  };
  mockQuery.mockImplementation(responder);
  mockConnect.mockImplementation(async () => ({ query: responder, release: jest.fn() }));
  return db;
}

/** Los dos avisos de un reto completado: uno para el gimnasio y otro para Ana. */
function esperarAvisosDeAna(db) {
  expect(db.notificaciones).toHaveLength(2);
  const [gym, miembro] = db.notificaciones;
  expect(gym).toMatchObject({ id_gimnasio: GYM, id_miembro: ANA, destinatario: 'GIMNASIO', titulo: 'Reto completado' });
  expect(gym.mensaje).toBe('Ana completó el reto «Dos visitas». Recompensa: Batido.');
  expect(miembro).toMatchObject({ id_gimnasio: GYM, id_miembro: ANA, destinatario: 'MIEMBRO', titulo: '¡Completaste un reto!' });
  expect(miembro.mensaje).toBe('¡Completaste el reto «Dos visitas»! Tu recompensa: Batido. Reclámala en recepción.');
}

// ===========================================================================
describe('avisos del reto completado (lib/retos.js)', () => {
  test('textos: con y sin recompensa', () => {
    expect(retosLib.textosCompletado({ nombreMiembro: 'Ana', nombreReto: 'X' })).toEqual({
      gimnasio: 'Ana completó el reto «X».',
      miembro: '¡Completaste el reto «X»!',
    });
    expect(retosLib.textoCancelado('X')).toMatch(/^El gimnasio canceló el reto «X»\./);
  });

  test('avisarRetoCompletado lee los nombres filtrando por gimnasio y escribe GIMNASIO y MIEMBRO', async () => {
    const db = baseFalsa();
    await retosLib.avisarRetoCompletado({ query: mockQuery }, { gymId: GYM, idMiembro: ANA, idReto: RETO });
    const lectura = db.sqls.find((c) => /nombre_reto/.test(c.sql));
    expect(lectura.sql).toMatch(/m\.id_gimnasio = r\.id_gimnasio/);
    expect(lectura.sql).toMatch(/r\.id_gimnasio = \$3/);
    expect(lectura.params).toEqual([RETO, ANA, GYM]);
    const insert = db.sqls.find((c) => /INSERT INTO notificacion/.test(c.sql));
    expect(insert.sql).toMatch(/'GIMNASIO'\),\s+\(\$1, \$2, 'RETO', \$5, \$6, 'MIEMBRO'\)/);
    esperarAvisosDeAna(db);
  });

  test('recalcularYAvisar: transaccion propia, avisa al completar y no repite', async () => {
    const db = baseFalsa();
    const pool = require('../src/db/db');
    const r1 = await retosLib.recalcularYAvisar(pool, { idRetoMiembro: 30, idReto: RETO, idMiembro: ANA, gymId: GYM });
    expect(r1.completado).toBe(true);
    const orden = db.sqls.map((c) => c.sql.trim().split(/\s+/)[0]);
    expect(orden[0]).toBe('BEGIN');
    expect(orden[orden.length - 1]).toBe('COMMIT');
    esperarAvisosDeAna(db);

    // Otra vez (otro check-in, otra pantalla): la fila ya no esta EN_CURSO.
    const r2 = await retosLib.recalcularYAvisar(pool, { idRetoMiembro: 30, idReto: RETO, idMiembro: ANA, gymId: GYM });
    expect(r2).toEqual({ fila: null, completado: false });
    expect(db.notificaciones).toHaveLength(2);
  });

  test('si no llega a la meta no avisa', async () => {
    const db = baseFalsa({ dias: 1, meta: 3 });
    const r = await retosLib.recalcularYAvisar(require('../src/db/db'), { idRetoMiembro: 30, idReto: RETO, idMiembro: ANA, gymId: GYM });
    expect(r.completado).toBe(false);
    expect(db.notificaciones).toHaveLength(0);
    expect(db.fila.estado).toBe('EN_CURSO');
  });

  test('si el aviso falla se deshace el completado y el siguiente intento avisa', async () => {
    const db = baseFalsa({ fallaAviso: true });
    const pool = require('../src/db/db');
    const args = { idRetoMiembro: 30, idReto: RETO, idMiembro: ANA, gymId: GYM };
    await expect(retosLib.recalcularYAvisar(pool, args)).rejects.toThrow('sin conexion');
    expect(db.sqls.some((c) => /^\s*ROLLBACK/.test(c.sql))).toBe(true);
    expect(db.fila.estado).toBe('EN_CURSO');
    expect(db.notificaciones).toHaveLength(0);

    db.fallaAviso = false;
    expect((await retosLib.recalcularYAvisar(pool, args)).completado).toBe(true);
    esperarAvisosDeAna(db);
  });

  test('con un cliente que ya esta en una transaccion no abre otra', async () => {
    const db = baseFalsa();
    const cliente = { query: mockQuery, connect: jest.fn(), release: jest.fn() };
    await retosLib.recalcularYAvisar(cliente, { idRetoMiembro: 30, idReto: RETO, idMiembro: ANA, gymId: GYM });
    expect(cliente.connect).not.toHaveBeenCalled();
    expect(db.sqls.some((c) => /^\s*BEGIN/.test(c.sql))).toBe(false);
    esperarAvisosDeAna(db);
  });

  test('cancelarParticipaciones: solo las EN_CURSO del reto del gimnasio, con mensaje MIEMBRO', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 3 });
    const n = await retosLib.cancelarParticipaciones({ query: mockQuery }, { idReto: RETO, gymId: GYM, nombreReto: 'Dos visitas' });
    expect(n).toBe(3);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/rm\.estado = 'EN_CURSO'/);
    expect(sql).toMatch(/r\.id_gimnasio = \$2/);
    expect(sql).toMatch(/'RETO', \$3, \$4, 'MIEMBRO'/);
    expect(params.slice(0, 3)).toEqual([RETO, GYM, 'Reto cancelado']);
    expect(params[3]).toContain('«Dos visitas»');
  });
});

// ===========================================================================
describe('los cuatro caminos que completan un reto avisan una sola vez', () => {
  test('1. check-in (actualizarRetos)', async () => {
    const db = baseFalsa({ inscrita: false });
    const pool = require('../src/db/db');
    const r = await retosLib.actualizarRetos(pool, { gymId: GYM, idMiembro: ANA });
    expect(r).toEqual([expect.objectContaining({ id_reto: RETO, completado: true, acumulados: 2, meta: 2 })]);
    esperarAvisosDeAna(db);
    // Segundo check-in: el reto ya no esta en curso.
    expect(await retosLib.actualizarRetos(pool, { gymId: GYM, idMiembro: ANA })).toEqual([]);
    expect(db.notificaciones).toHaveLength(2);
  });

  test('2. «Unirme» en la app', async () => {
    const db = baseFalsa({ inscrita: false });
    const r = await request(app).post(`/api/cliente/retos/${RETO}/unirse`).set('Authorization', `Bearer ${TK_ANA}`);
    expect(r.status).toBe(201);
    expect(r.body.completado).toBe(true);
    expect(r.body.message).toContain('ya lo completaste');
    esperarAvisosDeAna(db);
    const otraVez = await request(app).post(`/api/cliente/retos/${RETO}/unirse`).set('Authorization', `Bearer ${TK_ANA}`);
    expect(otraVez.status).toBe(409);
    expect(db.notificaciones).toHaveLength(2);
  });

  test('3. «Inscribir elegibles» en el panel', async () => {
    const db = baseFalsa({ inscrita: false });
    const r = await request(app).post(`/api/admin/retos/${RETO}/inscribir`).set('Authorization', `Bearer ${ADMIN}`).send({});
    expect(r.status).toBe(201);
    expect(r.body.inscritos).toBe(1);
    esperarAvisosDeAna(db);
    const otraVez = await request(app).post(`/api/admin/retos/${RETO}/inscribir`).set('Authorization', `Bearer ${ADMIN}`).send({});
    expect(otraVez.body.inscritos).toBe(0);
    expect(db.notificaciones).toHaveLength(2);
  });

  test('4. bajar la meta en el panel', async () => {
    const db = baseFalsa({ dias: 2, meta: 5 });
    const put = (meta) => request(app).put(`/api/admin/retos/${RETO}`).set('Authorization', `Bearer ${ADMIN}`)
      .send({ meta_asistencias: meta });
    expect((await put(4)).status).toBe(200);
    expect(db.notificaciones).toHaveLength(0); // 2 de 4: sigue en curso
    expect((await put(2)).status).toBe(200);
    esperarAvisosDeAna(db);
    expect((await put(1)).status).toBe(200);
    expect(db.notificaciones).toHaveLength(2);
  });

  test('cancelar el reto le avisa a quien iba en curso, en la misma transaccion', async () => {
    const db = baseFalsa({ dias: 1, meta: 5 });
    const llamadas = [];
    mockConnect.mockImplementation(async () => ({
      query: async (sql, params) => {
        llamadas.push(sql.trim().split(/\s+/)[0]);
        if (/WITH cancelados AS/.test(sql)) {
          llamadas.push(params[2]);
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: jest.fn(),
    }));
    const r = await request(app).post(`/api/admin/retos/${RETO}/cancelar`).set('Authorization', `Bearer ${ADMIN}`);
    expect(r.status).toBe(200);
    expect(llamadas).toEqual(['BEGIN', 'UPDATE', 'WITH', 'Reto cancelado', 'COMMIT']);
    expect(db.notificaciones).toHaveLength(0); // no es un reto completado
  });
});

// ===========================================================================
// Tabla notificacion falsa para la bandeja y la campana. Cada consulta filtra
// por lo que dice su SQL: si a una le faltara el filtro de destinatario, la
// prueba veria la fila que no le toca.
// ===========================================================================
function tablaNotificaciones(filas) {
  const tabla = filas.map((f) => ({ leida: false, fecha_creacion: new Date('2026-11-20T15:00:00Z'), ...f }));
  const filtraDest = (sql, dest) => sql.includes(`destinatario = '${dest}'`);
  mockQuery.mockImplementation(async (sql, p = []) => {
    if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) {
      return { rows: [{ id_gimnasio: GYM, activo: true, trial_ends_at: null }] };
    }
    // Bandeja del miembro: $1 gimnasio, $2 miembro.
    const delMiembro = (f) => f.id_gimnasio === p[0] && f.id_miembro === p[1]
      && (!filtraDest(sql, 'MIEMBRO') || f.destinatario === 'MIEMBRO');
    if (/SELECT id_notificacion AS id/.test(sql)) {
      return { rows: tabla.filter(delMiembro).map((f) => ({ id: f.id, tipo: f.tipo, titulo: f.titulo, mensaje: f.mensaje, leida: f.leida })) };
    }
    if (/SELECT COUNT\(\*\)::int AS n FROM notificacion/.test(sql)) {
      return { rows: [{ n: tabla.filter((f) => delMiembro(f) && !f.leida).length }] };
    }
    if (/UPDATE notificacion SET leida = TRUE WHERE id_gimnasio = \$1 AND id_miembro = \$2/.test(sql)) {
      const hits = tabla.filter((f) => delMiembro(f) && (p[2] === undefined || f.id === p[2]));
      hits.forEach((f) => { f.leida = true; });
      return { rows: [], rowCount: hits.length };
    }
    // Campana del panel.
    const delGimnasio = (f) => f.id_gimnasio === GYM && (!filtraDest(sql, 'GIMNASIO') || f.destinatario === 'GIMNASIO');
    if (/FROM notificacion n/.test(sql) && /n\.tipo = \$2/.test(sql)) {
      return { rows: tabla.filter((f) => delGimnasio(f) && f.tipo === p[1] && f.titulo === p[3] && !f.leida)
        .map((f) => ({ id_notificacion: f.id, id_miembro: f.id_miembro, nombre: 'Ana', telefono: null, minutos: 3, dias_vencida: 2, congelada: false })) };
    }
    if (/FROM notificacion n/.test(sql) && /n\.tipo = 'RETO'/.test(sql)) {
      return { rows: tabla.filter((f) => delGimnasio(f) && f.tipo === 'RETO' && f.titulo === p[1] && !f.leida)
        .map((f) => ({ id_notificacion: f.id, id_miembro: f.id_miembro, nombre: 'Ana', telefono: null, texto_reto: f.mensaje })) };
    }
    if (/UPDATE notificacion SET leida = TRUE\s+WHERE id_notificacion = \$1/.test(sql)) {
      const titulo = /tipo = 'RETO'/.test(sql) ? p[2] : p[3];
      const hits = tabla.filter((f) => f.id === p[0] && delGimnasio(f) && f.titulo === titulo);
      hits.forEach((f) => { f.leida = true; });
      return { rows: [], rowCount: hits.length };
    }
    return { rows: [] }; // umbrales, nombre del gimnasio, planes y alertas: vacios
  });
  return tabla;
}

const FILAS = [
  // Para el gimnasio, sobre Ana (la campana).
  { id: 1, id_gimnasio: GYM, id_miembro: ANA, tipo: 'ALERTA', titulo: 'Acceso bloqueado', mensaje: 'Ana intento ingresar', destinatario: 'GIMNASIO' },
  { id: 3, id_gimnasio: GYM, id_miembro: ANA, tipo: 'RETO', titulo: 'Reto completado', mensaje: 'Ana completó el reto «A».', destinatario: 'GIMNASIO' },
  // Para Ana (su bandeja). La 2 y la 4 llevan a proposito los titulos que
  // busca la campana.
  { id: 2, id_gimnasio: GYM, id_miembro: ANA, tipo: 'ALERTA', titulo: 'Acceso bloqueado', mensaje: 'Para Ana', destinatario: 'MIEMBRO' },
  { id: 4, id_gimnasio: GYM, id_miembro: ANA, tipo: 'RETO', titulo: 'Reto completado', mensaje: '¡Completaste el reto «A»!', destinatario: 'MIEMBRO' },
  { id: 5, id_gimnasio: GYM, id_miembro: ANA, tipo: 'RETO', titulo: 'Reto cancelado', mensaje: 'El gimnasio canceló el reto «B».', destinatario: 'MIEMBRO' },
  // De otro miembro del mismo gimnasio y de Ana en otro gimnasio.
  { id: 6, id_gimnasio: GYM, id_miembro: 13, tipo: 'RETO', titulo: '¡Completaste un reto!', mensaje: 'Para Beto', destinatario: 'MIEMBRO' },
  { id: 7, id_gimnasio: 8, id_miembro: ANA, tipo: 'RETO', titulo: '¡Completaste un reto!', mensaje: 'Otro gimnasio', destinatario: 'MIEMBRO' },
];

describe('bandeja del miembro (GET/PATCH /api/cliente/mensajes)', () => {
  test('solo sus mensajes MIEMBRO de su gimnasio, con el conteo sin leer', async () => {
    tablaNotificaciones(FILAS);
    const r = await request(app).get('/api/cliente/mensajes').set('Authorization', `Bearer ${TK_ANA}`);
    expect(r.status).toBe(200);
    expect(r.body.mensajes.map((m) => m.id).sort()).toEqual([2, 4, 5]);
    expect(r.body.no_leidos).toBe(3);
    const [sql, params] = mockQuery.mock.calls.find(([s]) => /SELECT id_notificacion AS id/.test(s));
    expect(sql).toMatch(/id_gimnasio = \$1 AND id_miembro = \$2 AND destinatario = 'MIEMBRO'/);
    expect(params).toEqual([GYM, ANA, 50]);
  });

  test('marcar uno ajeno, de otro gimnasio o del gimnasio responde 404; uno propio, 200', async () => {
    const tabla = tablaNotificaciones(FILAS);
    for (const id of [6, 7, 1, 3]) {
      const r = await request(app).patch(`/api/cliente/mensajes/${id}/leido`).set('Authorization', `Bearer ${TK_ANA}`);
      expect(r.status).toBe(404);
    }
    expect(tabla.filter((f) => f.leida)).toHaveLength(0);
    const ok = await request(app).patch('/api/cliente/mensajes/4/leido').set('Authorization', `Bearer ${TK_ANA}`);
    expect(ok.status).toBe(200);
    expect(ok.body.no_leidos).toBe(2);
  });

  test('marcar todos solo toca los suyos', async () => {
    const tabla = tablaNotificaciones(FILAS);
    const r = await request(app).patch('/api/cliente/mensajes/leidos').set('Authorization', `Bearer ${TK_ANA}`);
    expect(r.status).toBe(200);
    expect(r.body.marcados).toBe(3);
    expect(tabla.filter((f) => f.leida).map((f) => f.id).sort()).toEqual([2, 4, 5]);
  });

  test('id invalido: 400; token del personal: 403', async () => {
    tablaNotificaciones(FILAS);
    for (const id of ['abc', '0', '-3', '99999999999']) {
      expect((await request(app).patch(`/api/cliente/mensajes/${id}/leido`).set('Authorization', `Bearer ${TK_ANA}`)).status).toBe(400);
    }
    expect((await request(app).get('/api/cliente/mensajes').set('Authorization', `Bearer ${ADMIN}`)).status).toBe(403);
  });
});

describe('la campana del panel no muestra ni marca mensajes del miembro', () => {
  test('GET /admin/notificaciones: solo las filas GIMNASIO', async () => {
    tablaNotificaciones(FILAS);
    const r = await request(app).get('/api/admin/notificaciones').set('Authorization', `Bearer ${ADMIN}`);
    expect(r.status).toBe(200);
    expect(r.body.avisos.map((a) => a.id).sort()).toEqual(['acceso-bloqueado-1', 'reto-completado-3']);
  });

  test('marcar como visto un mensaje del miembro: 404', async () => {
    const tabla = tablaNotificaciones(FILAS);
    expect((await request(app).post('/api/admin/notificaciones/reto/4/leida').set('Authorization', `Bearer ${ADMIN}`)).status).toBe(404);
    expect((await request(app).post('/api/admin/notificaciones/acceso-bloqueado/2/leida').set('Authorization', `Bearer ${ADMIN}`)).status).toBe(404);
    expect(tabla.find((f) => f.id === 4).leida).toBe(false);
    expect((await request(app).post('/api/admin/notificaciones/reto/3/leida').set('Authorization', `Bearer ${ADMIN}`)).status).toBe(200);
  });
});

// ===========================================================================
describe('secreto del QR dinamico en produccion', () => {
  const ENV = { NODE_ENV: process.env.NODE_ENV, QR_DINAMICO_SECRET: process.env.QR_DINAMICO_SECRET };
  const entorno = (nodeEnv, secreto) => {
    process.env.NODE_ENV = nodeEnv;
    if (secreto === undefined) delete process.env.QR_DINAMICO_SECRET;
    else process.env.QR_DINAMICO_SECRET = secreto;
  };
  afterEach(() => {
    process.env.NODE_ENV = ENV.NODE_ENV;
    if (ENV.QR_DINAMICO_SECRET === undefined) delete process.env.QR_DINAMICO_SECRET;
    else process.env.QR_DINAMICO_SECRET = ENV.QR_DINAMICO_SECRET;
  });

  test('puedeExigirse segun el entorno y la clave', () => {
    entorno('development', undefined);
    expect(qr.puedeExigirse()).toBe(true);
    entorno('production', undefined);
    expect(qr.puedeExigirse()).toBe(false);
    entorno('production', '   ');
    expect(qr.puedeExigirse()).toBe(false);
    entorno('production', qr.CLAVE_DEL_REPO); // la del repositorio no cuenta
    expect(qr.puedeExigirse()).toBe(false);
    entorno('production', 'una-clave-larga-y-propia-de-render');
    expect(qr.puedeExigirse()).toBe(true);
  });

  /** Base falsa de la configuracion: guarda gimnasio.qr_dinamico_obligatorio. */
  function configFalsa(activo) {
    const estado = { activo, updates: [] };
    mockQuery.mockImplementation(async (sql, p = []) => {
      if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) {
        return { rows: [{ id_gimnasio: GYM, activo: true, trial_ends_at: null }] };
      }
      if (/SELECT qr_dinamico_obligatorio FROM gimnasio/.test(sql)) return { rows: [{ qr_dinamico_obligatorio: estado.activo }] };
      if (/UPDATE gimnasio SET qr_dinamico_obligatorio/.test(sql)) { estado.activo = p[0]; estado.updates.push(p[0]); return { rows: [] }; }
      if (/SELECT dias_aviso_vencimiento, qr_dinamico_obligatorio FROM gimnasio/.test(sql)) {
        return { rows: [{ dias_aviso_vencimiento: 3, qr_dinamico_obligatorio: estado.activo }] };
      }
      if (/FROM config_gimnasio/.test(sql)) return { rows: [{ id_config: 1, id_gimnasio: GYM }] };
      return { rows: [] };
    });
    return estado;
  }
  const guardar = (body) => request(app).put('/api/admin/config').set('Authorization', `Bearer ${ADMIN}`).send(body);

  test('produccion sin QR_DINAMICO_SECRET: activarlo responde 409 con un error claro y no guarda nada', async () => {
    entorno('production', undefined);
    const estado = configFalsa(false);
    const r = await guardar({ qr_dinamico_obligatorio: true, dias_aviso_vencimiento: 5 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('QR_DINAMICO_SIN_SECRETO');
    expect(r.body.error).toMatch(/QR_DINAMICO_SECRET/);
    expect(estado.updates).toEqual([]);
    expect(mockQuery.mock.calls.some(([s]) => /UPDATE gimnasio SET dias_aviso_vencimiento/.test(s))).toBe(false);
  });

  test('produccion sin QR_DINAMICO_SECRET: la pantalla lo sabe, se puede apagar y guardar lo demas', async () => {
    entorno('production', undefined);
    configFalsa(false);
    const g = await request(app).get('/api/admin/config').set('Authorization', `Bearer ${ADMIN}`);
    expect(g.body.config.qr_dinamico_disponible).toBe(false);

    // Ya estaba activo (de antes): reenviarlo encendido con el resto no falla, y apagarlo si se puede.
    const estado = configFalsa(true);
    expect((await guardar({ qr_dinamico_obligatorio: true, dias_aviso_vencimiento: 4 })).status).toBe(200);
    const off = await guardar({ qr_dinamico_obligatorio: false });
    expect(off.status).toBe(200);
    expect(estado.activo).toBe(false);
    // Y ya apagado, no se puede volver a encender.
    expect((await guardar({ qr_dinamico_obligatorio: true })).status).toBe(409);
  });

  test('con QR_DINAMICO_SECRET o fuera de produccion se activa', async () => {
    entorno('production', 'una-clave-larga-y-propia-de-render');
    let estado = configFalsa(false);
    const r = await guardar({ qr_dinamico_obligatorio: true });
    expect(r.status).toBe(200);
    expect(r.body.config).toMatchObject({ qr_dinamico_obligatorio: true, qr_dinamico_disponible: true });
    entorno('development', undefined);
    estado = configFalsa(false);
    expect((await guardar({ qr_dinamico_obligatorio: true })).status).toBe(200);
    expect(estado.activo).toBe(true);
  });

  test('aviso al arrancar: solo en produccion sin la clave, con los gimnasios que ya lo usan', async () => {
    const log = { warn: jest.fn() };
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ n: 2 }] }) };
    entorno('development', undefined);
    expect(await qr.avisarSecretoAlArrancar(pool, log)).toBeNull();
    entorno('production', 'una-clave-larga-y-propia-de-render');
    expect(await qr.avisarSecretoAlArrancar(pool, log)).toBeNull();
    expect(log.warn).not.toHaveBeenCalled();

    entorno('production', undefined);
    const texto = await qr.avisarSecretoAlArrancar(pool, log);
    expect(texto).toMatch(/QR_DINAMICO_SECRET/);
    expect(texto).toMatch(/2 gimnasio\(s\) ya lo tienen activado/);
    expect(log.warn).toHaveBeenCalledWith(texto);

    // Si la base no responde, avisa igual y no lanza.
    const caida = { query: jest.fn().mockRejectedValue(new Error('sin conexion')) };
    await expect(qr.avisarSecretoAlArrancar(caida, log)).resolves.toMatch(/QR_DINAMICO_SECRET/);
  });

  test('la clave del dinamico sale de QR_DINAMICO_SECRET (el QR fijo sigue con QR_ENCRYPTION_KEY)', () => {
    entorno('production', 'clave-a');
    const a = qr.secretoMiembro(1, 'QR-1').toString('hex');
    entorno('production', 'clave-b');
    expect(qr.secretoMiembro(1, 'QR-1').toString('hex')).not.toBe(a);
    expect(errorLog).not.toHaveBeenCalled();
  });
});
