/**
 * RQF-06: un acceso bloqueado por membresia vencida (o sin plan) queda
 * registrado y aparece en la campana del administrador.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a) }));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const { registrarAccesoBloqueado, TIPO_ACCESO_BLOQUEADO, TITULO_ACCESO_BLOQUEADO } = require('../src/lib/accesos');
const checkinRouter = require('../src/routes/checkin');
const notifRouter = require('../src/routes/notificaciones');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const pool = { query: (...a) => mockQuery(...a) };
// El personal necesita token con vencimiento y se le vuelve a leer en cada
// peticion; aqui se simula esa lectura (el rol sale de la BD, no del token).
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

const insertsNotificacion = () =>
  mockQuery.mock.calls.filter(([sql]) => /INSERT INTO notificacion/i.test(sql));

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('registrarAccesoBloqueado', () => {
  test('crea el aviso con el tipo, el miembro y el motivo', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const ok = await registrarAccesoBloqueado(pool, { gymId: 7, idMiembro: 12, nombre: 'Ana', motivo: 'VENCIDA' });
    expect(ok).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO notificacion/);
    expect(sql).toMatch(/NOT EXISTS/); // no repite el aviso si ya hay uno reciente sin ver
    expect(params.slice(0, 4)).toEqual([7, 12, TIPO_ACCESO_BLOQUEADO, TITULO_ACCESO_BLOQUEADO]);
    // el tipo debe ser uno de los que admite el CHECK de la tabla notificacion
    expect(['ALERTA', 'RETO', 'CAMPANA', 'SISTEMA']).toContain(TIPO_ACCESO_BLOQUEADO);
    expect(params[4]).toMatch(/Ana.*vencida/);
  });
  test('motivo SIN_PLAN usa su propio texto', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await registrarAccesoBloqueado(pool, { gymId: 7, idMiembro: 12, nombre: 'Ana', motivo: 'SIN_PLAN' });
    expect(mockQuery.mock.calls[0][1][4]).toMatch(/no tiene un plan activo/);
  });
  test('si ya hay un aviso reciente (rowCount 0) devuelve false sin error', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    expect(await registrarAccesoBloqueado(pool, { gymId: 7, idMiembro: 12, nombre: 'Ana', motivo: 'VENCIDA' })).toBe(false);
  });
  test('nunca lanza aunque la base falle', async () => {
    mockQuery.mockRejectedValue(new Error('base caida'));
    await expect(registrarAccesoBloqueado(pool, { gymId: 7, idMiembro: 12, nombre: 'Ana', motivo: 'VENCIDA' })).resolves.toBe(false);
  });
});

describe('POST /api/admin/checkin', () => {
  const preparar = ({ fechaFin, falloAviso = false }) => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
      if (/FROM miembro/i.test(sql)) return { rows: [{ id_miembro: 12, nombre: 'Ana', documento: '123', codigo_qr: 'x', qr_imagen: null }] };
      if (/DISTINCT ON/i.test(sql)) return { rows: fechaFin ? [{ tipo_plan: 'MENSUAL', fecha_fin: fechaFin, estado_pago: 'PAGADO' }] : [] };
      if (/INSERT INTO notificacion/i.test(sql)) {
        if (falloAviso) throw new Error('falla al avisar');
        return { rowCount: 1 };
      }
      if (/FROM checkin/i.test(sql)) return { rows: [] };
      if (/INSERT INTO checkin/i.test(sql)) return { rows: [{ id_checkin: 1, fecha_hora: new Date(), metodo: 'MANUAL' }] };
      throw new Error('consulta inesperada: ' + sql.slice(0, 50));
    });
  };
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  test('membresia vencida: responde VENCIDO, no registra asistencia y avisa', async () => {
    preparar({ fechaFin: ayer });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123', metodo: 'MANUAL' });
    expect(r.status).toBe(200);
    expect(r.body.miembro.estado).toBe('VENCIDO');
    expect(insertsNotificacion()).toHaveLength(1);
    expect(insertsNotificacion()[0][1][4]).toMatch(/vencida/);
    expect(mockQuery.mock.calls.some(([s]) => /INSERT INTO checkin/i.test(s))).toBe(false);
  });
  test('sin plan: avisa con el motivo SIN_PLAN', async () => {
    preparar({ fechaFin: null });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123', metodo: 'MANUAL' });
    expect(r.body.miembro.estado).toBe('VENCIDO');
    expect(insertsNotificacion()[0][1][4]).toMatch(/no tiene un plan activo/);
  });
  test('membresia al dia: registra la entrada y NO crea aviso', async () => {
    preparar({ fechaFin: manana });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123', metodo: 'MANUAL' });
    expect(r.status).toBe(201);
    expect(insertsNotificacion()).toHaveLength(0);
  });
  test('si falla el registro del aviso, el check-in igual responde', async () => {
    preparar({ fechaFin: ayer, falloAviso: true });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123', metodo: 'MANUAL' });
    expect(r.status).toBe(200);
    expect(r.body.miembro.estado).toBe('VENCIDO');
  });
});

describe('campana: GET /api/admin/notificaciones', () => {
  const fila = { id_notificacion: 99, id_miembro: 12, nombre: 'Ana Gomez', telefono: '3001234567', codigo_pais_telefono: null, minutos: 3, dias_vencida: 2 };
  const preparar = (bloqueados) => {
    mockQuery.mockImplementation(async (sql) => {
      if (/recordatorio_cobro_activo/.test(sql)) return { rows: [] };
      if (/umbral_alerta_amarilla/.test(sql)) return { rows: [] };
      if (/SELECT nombre FROM gimnasio/.test(sql)) return { rows: [{ nombre: 'Gym Demo' }] };
      if (/FROM notificacion n/.test(sql)) return { rows: bloqueados };
      if (/pc.fecha_fin < CURRENT_DATE/.test(sql)) return { rows: [{ id_miembro: 12, nombre: 'Ana Gomez', telefono: '3001234567', codigo_pais_telefono: null, dias: 2 }, { id_miembro: 13, nombre: 'Beto', telefono: null, codigo_pais_telefono: null, dias: 5 }] };
      return { rows: [] };
    });
  };

  test('un acceso bloqueado aparece primero y no se repite como vencida', async () => {
    preparar([fila]);
    const r = await call('GET', '/api/admin/notificaciones', RECEP);
    expect(r.status).toBe(200);
    const tipos = r.body.avisos.map((a) => `${a.tipo}:${a.idMiembro}`);
    expect(tipos[0]).toBe('acceso-bloqueado:12');
    expect(tipos).not.toContain('vencida:12');
    expect(tipos).toContain('vencida:13');
    const a = r.body.avisos[0];
    expect(a.idNotificacion).toBe(99);
    expect(a.detalle).toMatch(/Membresia vencida · hace 3 min/);
    expect(a.mensaje).toMatch(/tu plan vencio hace 2 dias/);
    expect(a.telefono).toBeTruthy();
  });
  test('sin plan: el detalle y el mensaje lo dicen', async () => {
    preparar([{ ...fila, dias_vencida: null }]);
    const r = await call('GET', '/api/admin/notificaciones', RECEP);
    expect(r.body.avisos[0].detalle).toMatch(/Sin plan activo/);
    expect(r.body.avisos[0].mensaje).toMatch(/no tienes un plan activo/);
  });
  test('la consulta solo trae avisos sin ver, de las ultimas 24 h y del gimnasio del token', async () => {
    preparar([]);
    await call('GET', '/api/admin/notificaciones', RECEP);
    const [sql, params] = mockQuery.mock.calls.find(([s]) => /FROM notificacion n/.test(s));
    expect(sql).toMatch(/n\.leida = FALSE/);
    expect(sql).toMatch(/24 hours/);
    expect(sql).toMatch(/n\.id_gimnasio = \$1/);
    expect(params[0]).toBe(7);
  });
  test('un token de miembro no puede ver la campana (403)', async () => {
    expect((await call('GET', '/api/admin/notificaciones', MIEMBRO)).status).toBe(403);
  });
});

describe('POST /api/admin/notificaciones/acceso-bloqueado/:id/leida', () => {
  test('marca como visto y filtra por gimnasio y tipo', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const r = await call('POST', '/api/admin/notificaciones/acceso-bloqueado/99/leida', RECEP);
    expect(r.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE notificacion SET leida = TRUE/);
    expect(params).toEqual([99, 7, TIPO_ACCESO_BLOQUEADO, TITULO_ACCESO_BLOQUEADO]);
  });
  test('un aviso de otro gimnasio (0 filas) da 404', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    expect((await call('POST', '/api/admin/notificaciones/acceso-bloqueado/99/leida', RECEP)).status).toBe(404);
  });
  test('id invalido da 400 y no toca la base', async () => {
    expect((await call('POST', '/api/admin/notificaciones/acceso-bloqueado/abc/leida', RECEP)).status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
  test('token de miembro da 403', async () => {
    expect((await call('POST', '/api/admin/notificaciones/acceso-bloqueado/99/leida', MIEMBRO)).status).toBe(403);
  });
});

describe('membresia congelada (RQF-04)', () => {
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const prepararCheckin = (plan) => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
      if (/FROM miembro/i.test(sql)) return { rows: [{ id_miembro: 12, nombre: 'Ana', documento: '123', codigo_qr: 'x', qr_imagen: null }] };
      if (/DISTINCT ON/i.test(sql)) return { rows: [plan] };
      if (/INSERT INTO notificacion/i.test(sql)) return { rowCount: 1 };
      if (/FROM checkin/i.test(sql)) return { rows: [] };
      if (/INSERT INTO checkin/i.test(sql)) return { rows: [{ id_checkin: 1, fecha_hora: new Date(), metodo: 'MANUAL' }] };
      throw new Error('consulta inesperada: ' + sql.slice(0, 50));
    });
  };
  const checkin = () => call('POST', '/api/admin/checkin', RECEP, { documento: '123', metodo: 'MANUAL' });

  test('el check-in pide congelado_desde del plan vigente', async () => {
    prepararCheckin({ tipo_plan: 'MENSUAL', fecha_fin: manana, estado_pago: 'PAGADO', congelado_desde: null });
    await checkin();
    const [sql] = mockQuery.mock.calls.find(([s]) => /DISTINCT ON/i.test(s));
    expect(sql).toMatch(/congelado_desde/);
  });

  test('congelada con fecha vigente: niega con estado CONGELADO y el mensaje para la persona', async () => {
    prepararCheckin({ tipo_plan: 'MENSUAL', fecha_fin: manana, estado_pago: 'PAGADO', congelado_desde: '2026-10-10' });
    const r = await checkin();
    expect(r.status).toBe(200);
    expect(r.body.miembro.estado).toBe('CONGELADO');
    expect(r.body.message).toBe('Tu membresía está congelada. Pide en recepción que la reactiven para poder ingresar.');
    expect(mockQuery.mock.calls.some(([s]) => /INSERT INTO checkin/i.test(s))).toBe(false);
    expect(insertsNotificacion()).toHaveLength(1);
    expect(insertsNotificacion()[0][1][4]).toMatch(/congelada/);
  });

  test('congelada Y con la fecha ya pasada: dice CONGELADO, no VENCIDO', async () => {
    prepararCheckin({ tipo_plan: 'MENSUAL', fecha_fin: ayer, estado_pago: 'PAGADO', congelado_desde: '2026-10-10' });
    const r = await checkin();
    expect(r.body.miembro.estado).toBe('CONGELADO');
    expect(insertsNotificacion()[0][1][4]).toMatch(/congelada/);
    expect(insertsNotificacion()[0][1][4]).not.toMatch(/vencida/);
  });

  test('descongelada con la fecha vigente: entra normal (201)', async () => {
    prepararCheckin({ tipo_plan: 'MENSUAL', fecha_fin: manana, estado_pago: 'PAGADO', congelado_desde: null });
    const r = await checkin();
    expect(r.status).toBe(201);
    expect(insertsNotificacion()).toHaveLength(0);
  });

  describe('campana', () => {
    const base = { id_notificacion: 99, id_miembro: 12, nombre: 'Ana Gomez', telefono: '3001234567', codigo_pais_telefono: null, minutos: 2, dias_vencida: -5, congelada: true };
    const prepararCampana = (bloqueados) => {
      mockQuery.mockImplementation(async (sql) => {
        if (/recordatorio_cobro_activo/.test(sql) || /umbral_alerta_amarilla/.test(sql)) return { rows: [] };
        if (/SELECT nombre FROM gimnasio/.test(sql)) return { rows: [{ nombre: 'Gym Demo' }] };
        if (/FROM notificacion n/.test(sql)) return { rows: bloqueados };
        return { rows: [] };
      });
    };

    // Las congeladas tampoco aparecen "en riesgo": el motor de abandono (RQF-08)
    // no las evalua y cierra su alerta; esa regla se prueba en abandono.test.js.
    test('las consultas de vencidas y por vencer excluyen a las congeladas', async () => {
      prepararCampana([]);
      await call('GET', '/api/admin/notificaciones', RECEP);
      const sqls = mockQuery.mock.calls.map(([s]) => s);
      const vencidas = sqls.find((s) => /pc\.fecha_fin < CURRENT_DATE\s+AND/.test(s) && !/FROM notificacion n/.test(s));
      const porVencer = sqls.find((s) => /pc\.fecha_fin >= CURRENT_DATE/.test(s));
      expect(vencidas).toMatch(/pc\.congelado_desde IS NULL/);
      expect(porVencer).toMatch(/pc\.congelado_desde IS NULL/);
    });

    test('un acceso bloqueado de una congelada se muestra como "Membresia congelada"', async () => {
      prepararCampana([base]);
      const r = await call('GET', '/api/admin/notificaciones', RECEP);
      const a = r.body.avisos[0];
      expect(a.tipo).toBe('acceso-bloqueado');
      expect(a.detalle).toMatch(/Membresia congelada/);
      expect(a.mensaje).toMatch(/tu membresia esta congelada/);
      expect(a.mensaje).not.toMatch(/vencio/);
    });

    test('la consulta de bloqueos incluye a las congeladas aunque no esten vencidas', async () => {
      prepararCampana([]);
      await call('GET', '/api/admin/notificaciones', RECEP);
      const [sql] = mockQuery.mock.calls.find(([s]) => /FROM notificacion n/.test(s));
      expect(sql).toMatch(/pc\.congelado_desde IS NOT NULL/);
    });
  });
});

describe('avisos de vencimiento: miembrosPorVencer excluye a las congeladas', () => {
  test('la consulta del job filtra pc.congelado_desde IS NULL', async () => {
    const { miembrosPorVencer } = require('../src/jobs/expiracion');
    mockQuery.mockResolvedValue({ rows: [] });
    await miembrosPorVencer(7);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/congelado_desde/);
    expect(sql).toMatch(/pc\.congelado_desde IS NULL/);
  });
});
