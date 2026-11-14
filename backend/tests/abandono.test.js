/**
 * RQF-08: motor diario de alertas de abandono.
 *  - Amarilla / roja segun los dias sin venir y los umbrales del gimnasio.
 *  - Una sola alerta pendiente por miembro: sube de nivel, se actualiza o se
 *    cierra, pero no se duplica.
 *  - Umbrales editables en /admin/config y alertas en la campana.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const { runJob, nivelPara } = require('../src/jobs/abandono');
const configRouter = require('../src/routes/config');
const notifRouter = require('../src/routes/notificaciones');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

describe('nivelPara: valores limite', () => {
  test.each([
    [0, null],
    [6, null],
    [7, 'AMARILLA'],
    [14, 'AMARILLA'],
    [15, 'ROJA'],
    [40, 'ROJA'],
  ])('%i dias con umbrales 7 y 15 -> %s', (dias, esperado) => {
    expect(nivelPara(dias, 7, 15)).toBe(esperado);
  });

  test('respeta los umbrales del gimnasio', () => {
    expect(nivelPara(4, 3, 5)).toBe('AMARILLA');
    expect(nivelPara(5, 3, 5)).toBe('ROJA');
  });
});

/**
 * Base falsa: `miembros` son los candidatos que devuelve la consulta de
 * miembros y `alertas` las pendientes. Guarda lo que el job escribe.
 */
function prepararBD({ miembros = [], alertas = [] } = {}) {
  const escrito = { inserts: [], updates: [], cierres: [] };
  mockQuery.mockImplementation(async (sql, params) => {
    if (/FROM miembro m/i.test(sql)) return { rows: miembros };
    if (/FROM alerta_abandono/i.test(sql)) return { rows: alertas };
    if (/INSERT INTO alerta_abandono/i.test(sql)) { escrito.inserts.push(params); return { rows: [] }; }
    if (/SET nivel = \$2/i.test(sql)) { escrito.updates.push(params); return { rows: [] }; }
    if (/SET estado = \$2/i.test(sql)) { escrito.cierres.push(params); return { rows: [] }; }
    throw new Error('Consulta inesperada: ' + sql.slice(0, 60));
  });
  return escrito;
}

const miembro = (id, dias, extra = {}) => ({ id_miembro: id, id_gimnasio: 1, dias, amarilla: 7, roja: 15, ...extra });

beforeEach(() => mockQuery.mockReset());

describe('runJob: crear y subir de nivel', () => {
  test('a los 7 dias crea una alerta AMARILLA', async () => {
    const w = prepararBD({ miembros: [miembro(1, 7)] });
    const r = await runJob();
    expect(w.inserts).toEqual([[1, 1, 7, 'AMARILLA']]);
    expect(r).toMatchObject({ evaluados: 1, creadas: 1 });
  });

  test('a los 15 dias crea una alerta ROJA', async () => {
    const w = prepararBD({ miembros: [miembro(1, 15)] });
    await runJob();
    expect(w.inserts).toEqual([[1, 1, 15, 'ROJA']]);
  });

  test('a los 6 dias no crea nada', async () => {
    const w = prepararBD({ miembros: [miembro(1, 6)] });
    const r = await runJob();
    expect(w.inserts).toHaveLength(0);
    expect(r.sinCambio).toBe(1);
  });

  test('de AMARILLA a ROJA actualiza la misma alerta, sin crear otra', async () => {
    const w = prepararBD({
      miembros: [miembro(1, 15)],
      alertas: [{ id_alerta: 50, id_miembro: 1, nivel: 'AMARILLA', dias_inactivo: 14 }],
    });
    const r = await runJob();
    expect(w.inserts).toHaveLength(0);
    expect(w.updates).toEqual([[50, 'ROJA', 15]]);
    expect(r.escaladas).toBe(1);
  });

  test('mismo nivel: solo pone al dia los dias sin venir', async () => {
    const w = prepararBD({
      miembros: [miembro(1, 10)],
      alertas: [{ id_alerta: 50, id_miembro: 1, nivel: 'AMARILLA', dias_inactivo: 9 }],
    });
    const r = await runJob();
    expect(w.updates).toEqual([[50, 'AMARILLA', 10]]);
    expect(r).toMatchObject({ actualizadas: 1, escaladas: 0 });
  });

  test('idempotente: sin cambios no escribe nada', async () => {
    const w = prepararBD({
      miembros: [miembro(1, 10)],
      alertas: [{ id_alerta: 50, id_miembro: 1, nivel: 'AMARILLA', dias_inactivo: 10 }],
    });
    const r = await runJob();
    expect(w).toEqual({ inserts: [], updates: [], cierres: [] });
    expect(r.sinCambio).toBe(1);
  });

  test('usa los umbrales del gimnasio, no los de por defecto', async () => {
    const w = prepararBD({ miembros: [miembro(1, 4, { amarilla: 3, roja: 10 })] });
    await runJob();
    expect(w.inserts).toEqual([[1, 1, 4, 'AMARILLA']]);
  });
});

describe('runJob: cerrar alertas', () => {
  test('si el miembro volvio a venir, la alerta se cierra como GESTIONADA', async () => {
    const w = prepararBD({
      miembros: [miembro(1, 1)],
      alertas: [{ id_alerta: 50, id_miembro: 1, nivel: 'ROJA', dias_inactivo: 20 }],
    });
    const r = await runJob();
    expect(w.cierres).toEqual([[[50], 'GESTIONADA']]);
    expect(r.cerradas).toBe(1);
  });

  test('si ya no se evalua (congelo, vencio o se dio de baja), se cierra como IGNORADA', async () => {
    const w = prepararBD({
      miembros: [],
      alertas: [{ id_alerta: 60, id_miembro: 2, nivel: 'AMARILLA', dias_inactivo: 8 }],
    });
    await runJob();
    expect(w.cierres).toEqual([[[60], 'IGNORADA']]);
  });

  test('si hay dos pendientes del mismo miembro, deja la mas reciente y cierra la otra', async () => {
    const w = prepararBD({
      miembros: [miembro(3, 20)],
      alertas: [
        { id_alerta: 70, id_miembro: 3, nivel: 'AMARILLA', dias_inactivo: 12 },
        { id_alerta: 71, id_miembro: 3, nivel: 'ROJA', dias_inactivo: 20 },
      ],
    });
    await runJob();
    expect(w.cierres).toEqual([[[70], 'IGNORADA']]);
    expect(w.inserts).toHaveLength(0);
  });
});

describe('runJob: opciones', () => {
  test('dryRun cuenta pero no escribe', async () => {
    const w = prepararBD({
      miembros: [miembro(1, 9), miembro(2, 1)],
      alertas: [{ id_alerta: 80, id_miembro: 2, nivel: 'AMARILLA', dias_inactivo: 8 }],
    });
    const r = await runJob({ dryRun: true });
    expect(r).toMatchObject({ dryRun: true, creadas: 1, cerradas: 1 });
    expect(w).toEqual({ inserts: [], updates: [], cierres: [] });
  });

  test('con gymId filtra los candidatos y las alertas de ese gimnasio', async () => {
    prepararBD();
    await runJob({ gymId: 9 });
    const consultas = mockQuery.mock.calls.filter(([s]) => /FROM miembro m|FROM alerta_abandono/i.test(s));
    expect(consultas).toHaveLength(2);
    consultas.forEach(([, params]) => expect(params).toEqual([9]));
  });

  test('solo evalua a miembros activos con plan vigente y NO congelado', async () => {
    prepararBD();
    await runJob();
    const [sql] = mockQuery.mock.calls.find(([s]) => /FROM miembro m/i.test(s));
    expect(sql).toMatch(/m\.activo = TRUE/);
    expect(sql).toMatch(/pc\.congelado_desde IS NULL/);
    expect(sql).toMatch(/pc\.fecha_fin >= CURRENT_DATE/);
    expect(sql).toMatch(/c\.valido = TRUE/);
  });

  test('un fallo de la base se propaga (el scheduler lo registra)', async () => {
    mockQuery.mockRejectedValue(new Error('caida'));
    await expect(runJob()).rejects.toThrow('caida');
  });
});

// ---------------------------------------------------------------------------
// Rutas: umbrales en /admin/config y alertas en la campana
// ---------------------------------------------------------------------------
const token = (p) => jwt.sign(p, process.env.JWT_SECRET, { expiresIn: '1h' });
const ADMIN = token({ id: 1, role: 'admin', gymId: 7 });
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };

let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
  const app = express();
  app.use(express.json());
  app.use('/api', configRouter);
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

describe('PUT /api/admin/config: umbrales de abandono', () => {
  /** Simula configuracion_gimnasio con los umbrales `actual` (o sin fila). */
  function prepararConfig(actual) {
    const escrito = [];
    mockQuery.mockImplementation(async (sql, params) => {
      if (/FROM gimnasio WHERE id_gimnasio/i.test(sql) && /trial_ends_at/i.test(sql)) {
        return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
      }
      if (/FROM gimnasio/i.test(sql)) return { rows: [{ dias_aviso_vencimiento: 3 }] };
      if (/FROM configuracion_gimnasio/i.test(sql)) return { rows: actual ? [actual] : [] };
      if (/INSERT INTO configuracion_gimnasio|UPDATE configuracion_gimnasio/i.test(sql)) {
        escrito.push(params);
        return { rows: [] };
      }
      if (/FROM config_gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7 }] };
      return { rows: [] };
    });
    return escrito;
  }

  test('guarda los dos umbrales', async () => {
    const escrito = prepararConfig({ umbral_alerta_amarilla: 7, umbral_alerta_roja: 15 });
    const r = await call('PUT', '/api/admin/config', ADMIN, { umbral_alerta_amarilla: 5, umbral_alerta_roja: 20 });
    expect(r.status).toBe(200);
    expect(escrito).toEqual([[7, 5, 20, 1]]);
  });

  test('la roja igual a la amarilla se rechaza: 400 y no guarda', async () => {
    const escrito = prepararConfig({ umbral_alerta_amarilla: 7, umbral_alerta_roja: 15 });
    const r = await call('PUT', '/api/admin/config', ADMIN, { umbral_alerta_amarilla: 10, umbral_alerta_roja: 10 });
    expect(r.status).toBe(400);
    expect(escrito).toHaveLength(0);
  });

  test('cambiar solo la amarilla se compara con la roja guardada', async () => {
    const escrito = prepararConfig({ umbral_alerta_amarilla: 7, umbral_alerta_roja: 15 });
    const r = await call('PUT', '/api/admin/config', ADMIN, { umbral_alerta_amarilla: 15 });
    expect(r.status).toBe(400);
    expect(escrito).toHaveLength(0);
  });

  test('valores fuera de rango: 400', async () => {
    prepararConfig({ umbral_alerta_amarilla: 7, umbral_alerta_roja: 15 });
    expect((await call('PUT', '/api/admin/config', ADMIN, { umbral_alerta_amarilla: 0 })).status).toBe(400);
    expect((await call('PUT', '/api/admin/config', ADMIN, { umbral_alerta_roja: 366 })).status).toBe(400);
  });

  test('sin fila de configuracion usa 7 y 15 y la crea', async () => {
    const escrito = prepararConfig(null);
    const r = await call('PUT', '/api/admin/config', ADMIN, { umbral_alerta_amarilla: 3 });
    expect(r.status).toBe(200);
    expect(escrito).toEqual([[7, 3, 15, 1]]);
  });
});

describe('GET /api/admin/notificaciones: alertas de abandono', () => {
  test('las alertas pendientes salen como avisos de riesgo, con su nivel', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM alerta_abandono/i.test(sql)) {
        return {
          rows: [
            { id_alerta: 1, nivel: 'ROJA', dias: 20, id_miembro: 4, nombre: 'Luisa', telefono: '3001234567', codigo_pais_telefono: null },
            { id_alerta: 2, nivel: 'AMARILLA', dias: 8, id_miembro: 5, nombre: 'Pedro', telefono: null, codigo_pais_telefono: null },
          ],
        };
      }
      if (/SELECT nombre FROM gimnasio/i.test(sql)) return { rows: [{ nombre: 'Gym Demo' }] };
      return { rows: [] };
    });
    const r = await call('GET', '/api/admin/notificaciones', ADMIN);
    expect(r.status).toBe(200);
    const riesgo = r.body.avisos.filter((a) => a.tipo === 'riesgo');
    expect(riesgo.map((a) => [a.nivel, a.idMiembro])).toEqual([['ROJA', 4], ['AMARILLA', 5]]);
    expect(riesgo[0].titulo).toMatch(/Alerta roja/);
    expect(riesgo[0].detalle).toBe('20 dias sin ingresar');
    expect(r.body.umbrales).toMatchObject({ diasRiesgo: 7, diasRiesgoAlto: 15 });
  });

  test('la consulta de alertas solo mira las PENDIENTE del gimnasio del token', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [] }));
    await call('GET', '/api/admin/notificaciones', ADMIN);
    const [sql, params] = mockQuery.mock.calls.find(([s]) => /FROM alerta_abandono/i.test(s));
    expect(sql).toMatch(/estado = 'PENDIENTE'/);
    expect(params[0]).toBe(7);
  });
});
