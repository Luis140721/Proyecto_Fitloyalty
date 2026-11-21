/**
 * RQF-12: retos de asistencia, con la base simulada.
 *   - lib/retos.js: inscripcion, progreso y completado en el check-in (transaccion,
 *     una sola vez, avisos, tolerancia a fallos).
 *   - El check-in: devuelve los retos, no se frena si fallan y no los toca en
 *     los ingresos rechazados o repetidos.
 *   - routes/retos.js: CRUD con validaciones, rol y aislamiento por gimnasio,
 *     progreso y avisos de la campana.
 *   - La bandeja del miembro (routes/cliente.js) y el filtro de la campana.
 * Lo que depende del SQL de verdad (segmentos, conteos, concurrencia) se prueba
 * contra una base real en retos-real.test.js.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();
jest.mock('../src/db/db', () => ({
  query: (...a) => mockQuery(...a),
  connect: (...a) => mockConnect(...a),
}));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const {
  registrarProgresoRetos, textosCompletado, mensajeCheckin, SEGMENTOS,
} = require('../src/lib/retos');
const retosRouter = require('../src/routes/retos');
const checkinRouter = require('../src/routes/checkin');
const notifRouter = require('../src/routes/notificaciones');
const clienteRouter = require('../src/routes/cliente');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const token = (p) => jwt.sign(p, process.env.JWT_SECRET, { expiresIn: '1h' });
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };
const ADMIN = token({ id: 1, role: 'admin', gymId: 7 });
const RECEP = token({ id: 2, role: 'receptionist', gymId: 7 });
const ADMIN_G9 = token({ id: 3, role: 'admin', gymId: 9 });
const MIEMBRO = token({ role: 'cliente', idMiembro: 12, gymId: 7 });

let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((payload) => ({ activo: true, id_gimnasio: payload.gymId, rol_nombre: ROL_BD[payload.role] }));
  const app = express();
  app.use(express.json());
  app.use('/api', retosRouter);
  app.use('/api', checkinRouter);
  app.use('/api', notifRouter);
  app.use('/api/cliente', clienteRouter);
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
  mockClientQuery.mockReset();
  mockRelease.mockReset();
  mockConnect.mockReset();
  mockConnect.mockImplementation(async () => ({ query: (...a) => mockClientQuery(...a), release: mockRelease }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const sqls = (mock) => mock.mock.calls.map(([s]) => s);
const llamadaCon = (mock, re) => mock.mock.calls.find(([s]) => re.test(s));

/** Fechas AAAA-MM-DD a partir de hoy en Colombia. */
const hoy = retosRouter.hoyGimnasio();
const enDias = (n) => {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const GYM_ACTIVO = { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };

// ===========================================================================
// lib/retos.js
// ===========================================================================
describe('registrarProgresoRetos (check-in)', () => {
  const RETO = { id_reto: 4, nombre: 'Noviembre', recompensa: 'Camiseta', meta_asistencias: 10 };

  /** Cliente falso de la transaccion: responde por el texto de la consulta. */
  function transaccion({ inscritos = [], avance = [], fallaEn = null } = {}) {
    mockClientQuery.mockImplementation(async (sql) => {
      if (fallaEn && fallaEn.test(sql)) throw new Error('caida');
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (/INSERT INTO reto_miembro/.test(sql)) return { rows: inscritos };
      if (/UPDATE reto_miembro/.test(sql)) return { rows: avance };
      if (/INSERT INTO notificacion/.test(sql)) return { rows: [], rowCount: 2 };
      throw new Error(`consulta inesperada: ${sql.slice(0, 60)}`);
    });
  }

  test('sin retos vigentes en el gimnasio: una consulta y no abre transaccion', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const r = await registrarProgresoRetos({ query: mockQuery, connect: mockConnect }, { gymId: 7, idMiembro: 12, idCheckin: 99 });
    expect(r).toEqual({ inscritos: [], progreso: [], completados: [], mensaje: null });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/FROM reto r WHERE r\.id_gimnasio = \$1/);
    expect(mockQuery.mock.calls[0][1]).toEqual([7]);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('con reto vigente: inscribe, suma 1 y confirma, sin avisos si no completa', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    transaccion({
      inscritos: [{ id_reto: 4 }],
      avance: [{ ...RETO, checkins_acumulados: 1, porcentaje_avance: 10, estado: 'EN_CURSO' }],
    });
    const r = await registrarProgresoRetos({ query: mockQuery, connect: mockConnect },
      { gymId: 7, idMiembro: 12, idCheckin: 99, nombre: 'Ana' });

    expect(sqls(mockClientQuery).map((s) => s.trim().split(/\s+/).slice(0, 3).join(' '))).toEqual([
      'BEGIN', 'INSERT INTO reto_miembro', 'UPDATE reto_miembro rm', 'COMMIT',
    ]);
    // La inscripcion es del miembro y gimnasio del ingreso, y excluye este check-in
    // al mirar si es inactivo.
    expect(llamadaCon(mockClientQuery, /INSERT INTO reto_miembro/)[1]).toEqual([7, 12, 99]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(r).toEqual({
      inscritos: [4],
      progreso: [{ id: 4, nombre: 'Noviembre', acumulados: 1, meta: 10, porcentaje: 10, completado: false, recompensa: 'Camiseta' }],
      completados: [],
      mensaje: null,
    });
  });

  test('la inscripcion pide el segmento, evita duplicados y solo retos vigentes', () => {
    mockQuery.mockResolvedValue({ rows: [{ x: 1 }] });
    transaccion();
    return registrarProgresoRetos({ query: mockQuery, connect: mockConnect }, { gymId: 7, idMiembro: 12, idCheckin: 99 })
      .then(() => {
        const [sql] = llamadaCon(mockClientQuery, /INSERT INTO reto_miembro/);
        expect(sql).toMatch(/CASE r\.segmento_elegible/);
        for (const s of SEGMENTOS) expect(sql).toContain(`'${s}'`);
        expect(sql).toMatch(/umbral_alerta_amarilla/);           // INACTIVOS con el umbral del gimnasio
        expect(sql).toMatch(/c\.id_checkin <> \$3/);              // sin contar el ingreso actual
        expect(sql).toMatch(/ON CONFLICT \(id_reto, id_miembro\) DO NOTHING/);
        expect(sql).toMatch(/r\.activo = TRUE AND r\.estado <> 'CANCELADO'/);
        expect(sql).toMatch(/BETWEEN r\.fecha_inicio AND r\.fecha_fin/);
      });
  });

  test('solo suma en inscripciones EN_CURSO: un reto completado no se vuelve a completar', async () => {
    mockQuery.mockResolvedValue({ rows: [{ x: 1 }] });
    transaccion();
    await registrarProgresoRetos({ query: mockQuery, connect: mockConnect }, { gymId: 7, idMiembro: 12, idCheckin: 99 });
    const [sql, params] = llamadaCon(mockClientQuery, /UPDATE reto_miembro/);
    expect(sql).toMatch(/rm\.estado = 'EN_CURSO'/);
    expect(sql).toMatch(/rm\.id_miembro = \$2/);
    expect(sql).toMatch(/r\.id_gimnasio = \$1/);
    expect(params).toEqual([7, 12]);
    // Sin completados no hay avisos.
    expect(sqls(mockClientQuery).some((s) => /INSERT INTO notificacion/.test(s))).toBe(false);
  });

  test('al completar: avisa al gimnasio y al miembro dentro de la transaccion', async () => {
    mockQuery.mockResolvedValue({ rows: [{ x: 1 }] });
    transaccion({ avance: [{ ...RETO, checkins_acumulados: 10, porcentaje_avance: 100, estado: 'COMPLETADO' }] });
    const r = await registrarProgresoRetos({ query: mockQuery, connect: mockConnect },
      { gymId: 7, idMiembro: 12, idCheckin: 99, nombre: 'Ana Prueba' });

    const [sql, params] = llamadaCon(mockClientQuery, /INSERT INTO notificacion/);
    expect(sql).toMatch(/'RETO', \$3, \$4, 'GIMNASIO'/);
    expect(sql).toMatch(/'RETO', \$5, \$6, 'MIEMBRO'/);
    expect(params).toEqual([7, 12,
      'Reto completado', 'Ana Prueba completó el reto «Noviembre». Recompensa: Camiseta.',
      '¡Completaste un reto!', '¡Completaste el reto «Noviembre»! Tu recompensa: Camiseta. Reclámala en recepción.']);
    const orden = sqls(mockClientQuery);
    expect(orden.findIndex((s) => /INSERT INTO notificacion/.test(s))).toBeLessThan(orden.indexOf('COMMIT'));
    expect(r.completados).toEqual([expect.objectContaining({ id: 4, completado: true, porcentaje: 100 })]);
    expect(r.mensaje).toBe('¡Completaste el reto «Noviembre»!');
  });

  test('si algo falla: ROLLBACK, suelta la conexion y devuelve null sin lanzar', async () => {
    mockQuery.mockResolvedValue({ rows: [{ x: 1 }] });
    transaccion({ fallaEn: /INSERT INTO notificacion/, avance: [{ ...RETO, checkins_acumulados: 10, porcentaje_avance: 100, estado: 'COMPLETADO' }] });
    await expect(registrarProgresoRetos({ query: mockQuery, connect: mockConnect }, { gymId: 7, idMiembro: 12, idCheckin: 99 }))
      .resolves.toBeNull();
    expect(sqls(mockClientQuery)).toContain('ROLLBACK');
    expect(sqls(mockClientQuery)).not.toContain('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test('si la base no responde ni para la primera consulta: null', async () => {
    mockQuery.mockRejectedValue(new Error('caida'));
    await expect(registrarProgresoRetos({ query: mockQuery, connect: mockConnect }, { gymId: 7, idMiembro: 12 }))
      .resolves.toBeNull();
  });

  test('sin id de check-in pasa 0 (con NULL cualquiera pareceria inactivo)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ x: 1 }] });
    transaccion();
    await registrarProgresoRetos({ query: mockQuery, connect: mockConnect }, { gymId: 7, idMiembro: 12 });
    expect(llamadaCon(mockClientQuery, /INSERT INTO reto_miembro/)[1]).toEqual([7, 12, 0]);
  });

  test('textos: sin recompensa no la menciona; dos retos a la vez en el mensaje', () => {
    expect(textosCompletado({ nombre: 'Ana', reto: 'R', recompensa: null })).toEqual({
      gimnasio: 'Ana completó el reto «R».',
      miembro: '¡Completaste el reto «R»!',
    });
    expect(mensajeCheckin([{ nombre: 'A' }, { nombre: 'B' }])).toBe('¡Completaste los retos «A» y «B»!');
    expect(mensajeCheckin([])).toBeNull();
  });
});

// ===========================================================================
// POST /api/admin/checkin con retos
// ===========================================================================
describe('check-in y retos', () => {
  const ANA = { id_miembro: 12, nombre: 'Ana', documento: '123', codigo_qr: 'QR-ANA', qr_imagen: null };
  const manana = enDias(1);

  function preparar({ fechaFin = manana, repetido = [], retosVigentes = true } = {}) {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM gimnasio/i.test(sql)) return GYM_ACTIVO;
      if (/documento = \$2/.test(sql)) return { rows: [ANA] };
      if (/DISTINCT ON/i.test(sql)) return { rows: [{ tipo_plan: 'MENSUAL', fecha_fin: fechaFin, estado_pago: 'PAGADO' }] };
      if (/INSERT INTO checkin/i.test(sql)) return { rows: [{ id_checkin: 55, fecha_hora: new Date(), metodo: 'MANUAL' }] };
      if (/INSERT INTO notificacion/i.test(sql)) return { rows: [], rowCount: 1 };
      if (/FROM reto r WHERE/.test(sql)) return { rows: retosVigentes ? [{ x: 1 }] : [] };
      if (/SELECT DISTINCT to_char/i.test(sql)) return { rows: [{ dia: '2026-11-17' }] };
      if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total: 1 }] };
      if (/FROM hito_gamificacion/i.test(sql)) return { rows: [] };
      if (/FROM checkin/i.test(sql)) return { rows: repetido };
      throw new Error('consulta inesperada: ' + sql.slice(0, 60));
    });
    mockClientQuery.mockImplementation(async (sql) => {
      if (/UPDATE reto_miembro/.test(sql)) {
        return { rows: [{ id_reto: 4, nombre: 'Noviembre', recompensa: 'Camiseta', meta_asistencias: 1,
          checkins_acumulados: 1, porcentaje_avance: 100, estado: 'COMPLETADO' }] };
      }
      return { rows: [] };
    });
  }

  test('ingreso valido: 201 con los retos y el id del check-in nuevo', async () => {
    preparar();
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123' });
    expect(r.status).toBe(201);
    expect(r.body.retos.mensaje).toBe('¡Completaste el reto «Noviembre»!');
    expect(r.body.retos.completados[0]).toMatchObject({ id: 4, recompensa: 'Camiseta' });
    expect(llamadaCon(mockClientQuery, /INSERT INTO reto_miembro/)[1]).toEqual([7, 12, 55]);
    // El aviso lleva el nombre del miembro.
    expect(llamadaCon(mockClientQuery, /INSERT INTO notificacion/)[1][3]).toMatch(/^Ana completó el reto/);
  });

  test('si los retos fallan, el ingreso igual queda: 201 y retos null', async () => {
    preparar();
    mockConnect.mockRejectedValue(new Error('sin conexiones'));
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123' });
    expect(r.status).toBe(201);
    expect(r.body.retos).toBeNull();
    expect(r.body.checkin.id_checkin).toBe(55);
  });

  test('membresia vencida: no toca los retos', async () => {
    preparar({ fechaFin: '2020-01-01' });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123' });
    expect(r.body.miembro.estado).toBe('VENCIDO');
    expect(sqls(mockQuery).some((s) => /FROM reto r/.test(s))).toBe(false);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test('ingreso repetido en la ventana antirrebote: no suma en los retos', async () => {
    preparar({ repetido: [{ id_checkin: 50, fecha_hora: new Date(), metodo: 'QR' }] });
    const r = await call('POST', '/api/admin/checkin', RECEP, { documento: '123' });
    expect(r.body.duplicado).toBe(true);
    expect(sqls(mockQuery).some((s) => /FROM reto r/.test(s))).toBe(false);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// routes/retos.js: CRUD
// ===========================================================================
describe('CRUD de retos', () => {
  const VALIDO = () => ({
    nombre: 'Reto de noviembre',
    descripcion: 'Ven 12 veces',
    meta_asistencias: 12,
    recompensa: 'Una camiseta',
    segmento_elegible: 'TODOS',
    fecha_inicio: hoy,
    fecha_fin: enDias(30),
  });
  const FILA = { id_reto: 4, nombre: 'Reto de noviembre', estado: 'ACTIVO' };

  function base() {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM gimnasio/i.test(sql)) return GYM_ACTIVO;
      if (/INSERT INTO reto/.test(sql)) return { rows: [FILA] };
      if (/FROM reto r/.test(sql)) return { rows: [FILA] };
      throw new Error('consulta inesperada: ' + sql.slice(0, 60));
    });
  }

  test('crear: 201 con el gimnasio y el usuario del token', async () => {
    base();
    const r = await call('POST', '/api/admin/retos', ADMIN, { ...VALIDO(), id_gimnasio: 9 });
    expect(r.status).toBe(201);
    expect(r.body.reto).toMatchObject({ id_reto: 4, inscritos: 0, completados: 0 });
    const [sql, params] = llamadaCon(mockQuery, /INSERT INTO reto/);
    expect(sql).toMatch(/creado_por/);
    expect(params).toEqual([7, 'Reto de noviembre', 'Ven 12 veces', 12, 'Una camiseta', 'TODOS', hoy, enDias(30), 1]);
  });

  test.each([
    ['sin nombre', { nombre: '' }],
    ['sin recompensa', { recompensa: '   ' }],
    ['meta 0', { meta_asistencias: 0 }],
    ['meta con decimales', { meta_asistencias: 2.5 }],
    ['meta que no es numero', { meta_asistencias: 'diez' }],
    ['segmento desconocido', { segmento_elegible: 'VIP' }],
    ['segmento POR_VENCER (se llama PROXIMOS_A_VENCER)', { segmento_elegible: 'POR_VENCER' }],
    ['fecha con otro formato', { fecha_inicio: '17/11/2026' }],
    ['fecha que no existe', { fecha_fin: '2026-02-30' }],
    ['fin antes del inicio', { fecha_inicio: enDias(5), fecha_fin: enDias(4) }],
    ['reto que ya termino', { fecha_inicio: enDias(-10), fecha_fin: enDias(-1) }],
  ])('crear %s: 400 y no escribe', async (_caso, cambio) => {
    base();
    const r = await call('POST', '/api/admin/retos', ADMIN, { ...VALIDO(), ...cambio });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(sqls(mockQuery).some((s) => /INSERT INTO reto/.test(s))).toBe(false);
  });

  test('un reto de un solo dia (hoy a hoy) si se puede', async () => {
    base();
    const r = await call('POST', '/api/admin/retos', ADMIN, { ...VALIDO(), fecha_fin: hoy });
    expect(r.status).toBe(201);
  });

  test('recepcion y miembros no pueden: 403', async () => {
    base();
    expect((await call('POST', '/api/admin/retos', RECEP, VALIDO())).status).toBe(403);
    expect((await call('GET', '/api/admin/retos', RECEP)).status).toBe(403);
    expect((await call('GET', '/api/admin/retos', MIEMBRO)).status).toBe(403);
    expect(sqls(mockQuery).some((s) => /reto/.test(s))).toBe(false);
  });

  test('listar filtra por el gimnasio del token', async () => {
    base();
    await call('GET', '/api/admin/retos', ADMIN_G9);
    const [sql, params] = llamadaCon(mockQuery, /FROM reto r/);
    expect(sql).toMatch(/WHERE r\.id_gimnasio = \$1/);
    expect(params).toEqual([9]);
  });

  test('id invalido: 400', async () => {
    base();
    expect((await call('PUT', '/api/admin/retos/abc', ADMIN, { nombre: 'x' })).status).toBe(400);
    expect((await call('DELETE', '/api/admin/retos/-3', ADMIN)).status).toBe(400);
    expect((await call('GET', '/api/admin/retos/0/progreso', ADMIN)).status).toBe(400);
  });

  describe('editar', () => {
    const ACTUAL = {
      id_reto: 4, activo: true, estado: 'ACTIVO', meta_asistencias: 12, segmento_elegible: 'TODOS',
      fecha_inicio: hoy, fecha_fin: enDias(30),
    };
    function transaccion({ actual = ACTUAL, inscritos = 0 } = {}) {
      base();
      mockClientQuery.mockReset();
      mockClientQuery.mockImplementation(async (sql) => {
        if (/FOR UPDATE/.test(sql)) return { rows: actual ? [actual] : [] };
        if (/COUNT\(\*\)::int AS n FROM reto_miembro/.test(sql)) return { rows: [{ n: inscritos }] };
        if (/UPDATE reto r/.test(sql)) return { rows: [{ ...ACTUAL, nombre: 'Nuevo' }] };
        return { rows: [] };
      });
    }

    test('reto de otro gimnasio: 404, ROLLBACK y sin UPDATE', async () => {
      transaccion({ actual: null });
      const r = await call('PUT', '/api/admin/retos/4', ADMIN_G9, { nombre: 'Nuevo' });
      expect(r.status).toBe(404);
      expect(llamadaCon(mockClientQuery, /FOR UPDATE/)[1]).toEqual([4, 9]);
      expect(sqls(mockClientQuery)).toContain('ROLLBACK');
      expect(sqls(mockClientQuery).some((s) => /UPDATE reto r/.test(s))).toBe(false);
      expect(mockRelease).toHaveBeenCalled();
    });

    test('con inscritos: cambiar la meta, las fechas o el segmento es 409', async () => {
      for (const cambio of [{ meta_asistencias: 20 }, { fecha_fin: enDias(40) }, { segmento_elegible: 'NUEVOS' }]) {
        transaccion({ inscritos: 3 });
        const r = await call('PUT', '/api/admin/retos/4', ADMIN, cambio);
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('RETO_CON_INSCRITOS');
        expect(sqls(mockClientQuery).some((s) => /UPDATE reto r/.test(s))).toBe(false);
      }
    });

    test('con inscritos: el nombre y la recompensa si (y mandar la misma meta no cuenta como cambio)', async () => {
      transaccion({ inscritos: 3 });
      const r = await call('PUT', '/api/admin/retos/4', ADMIN, { nombre: 'Nuevo', recompensa: 'Gorra', meta_asistencias: 12 });
      expect(r.status).toBe(200);
      const [sql, params] = llamadaCon(mockClientQuery, /UPDATE reto r/);
      expect(sql).toMatch(/nombre = \$1, meta_asistencias = \$2, recompensa = \$3/);
      expect(sql).toMatch(/WHERE r\.id_reto = \$5 AND r\.id_gimnasio = \$6/);
      expect(params.slice(-2)).toEqual([4, 7]);
      expect(sqls(mockClientQuery)).toContain('COMMIT');
    });

    test('sin inscritos: las fechas se revalidan', async () => {
      transaccion();
      const r = await call('PUT', '/api/admin/retos/4', ADMIN, { fecha_fin: enDias(-1) });
      expect(r.status).toBe(400);
      transaccion();
      expect((await call('PUT', '/api/admin/retos/4', ADMIN, { fecha_inicio: enDias(31) })).status).toBe(400);
    });

    test('cancelado o terminado: 409', async () => {
      transaccion({ actual: { ...ACTUAL, activo: false, estado: 'CANCELADO' } });
      expect((await call('PUT', '/api/admin/retos/4', ADMIN, { nombre: 'x' })).body.code).toBe('RETO_CANCELADO');
      transaccion({ actual: { ...ACTUAL, fecha_inicio: enDias(-30), fecha_fin: enDias(-1) } });
      expect((await call('PUT', '/api/admin/retos/4', ADMIN, { nombre: 'x' })).body.code).toBe('RETO_FINALIZADO');
    });

    test('nada que cambiar: 400 sin abrir transaccion', async () => {
      transaccion();
      expect((await call('PUT', '/api/admin/retos/4', ADMIN, { activo: false })).status).toBe(400);
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  describe('cancelar (DELETE)', () => {
    function transaccion({ actual = { id_reto: 4, nombre: 'Noviembre', activo: true, estado: 'ACTIVO' }, enCurso = [] } = {}) {
      base();
      mockClientQuery.mockReset();
      mockClientQuery.mockImplementation(async (sql) => {
        if (/FOR UPDATE/.test(sql)) return { rows: actual ? [actual] : [] };
        if (/UPDATE reto r SET activo = FALSE/.test(sql)) return { rows: [{ id_reto: 4, estado: 'CANCELADO' }] };
        if (/UPDATE reto_miembro SET estado = 'CANCELADO'/.test(sql)) return { rows: enCurso };
        return { rows: [] };
      });
    }

    test('cancela, pasa a CANCELADO solo las inscripciones en curso y les avisa', async () => {
      transaccion({ enCurso: [{ id_miembro: 12 }, { id_miembro: 13 }] });
      const r = await call('DELETE', '/api/admin/retos/4', ADMIN);
      expect(r.status).toBe(200);
      expect(r.body.inscripcionesCanceladas).toBe(2);
      expect(llamadaCon(mockClientQuery, /UPDATE reto_miembro/)[0]).toMatch(/estado = 'EN_CURSO'/);
      const [sql, params] = llamadaCon(mockClientQuery, /INSERT INTO notificacion/);
      expect(sql).toMatch(/'MIEMBRO'/);
      expect(params[0]).toBe(7);
      expect(params[1]).toEqual([12, 13]);
      expect(params[2]).toContain('«Noviembre»');
      expect(sqls(mockClientQuery)).toContain('COMMIT');
    });

    test('sin inscritos en curso: no escribe avisos', async () => {
      transaccion();
      await call('DELETE', '/api/admin/retos/4', ADMIN);
      expect(sqls(mockClientQuery).some((s) => /INSERT INTO notificacion/.test(s))).toBe(false);
    });

    test('ya cancelado: 409; de otro gimnasio: 404', async () => {
      transaccion({ actual: { id_reto: 4, nombre: 'x', activo: false, estado: 'CANCELADO' } });
      expect((await call('DELETE', '/api/admin/retos/4', ADMIN)).status).toBe(409);
      transaccion({ actual: null });
      expect((await call('DELETE', '/api/admin/retos/4', ADMIN_G9)).status).toBe(404);
      expect(llamadaCon(mockClientQuery, /FOR UPDATE/)[1]).toEqual([4, 9]);
      expect(sqls(mockClientQuery)).toContain('ROLLBACK');
    });

    test('si la base falla: 503, ROLLBACK y suelta la conexion', async () => {
      transaccion();
      mockClientQuery.mockImplementation(async (sql) => {
        if (/FOR UPDATE/.test(sql)) throw new Error('caida');
        return { rows: [] };
      });
      const r = await call('DELETE', '/api/admin/retos/4', ADMIN);
      expect(r.status).toBe(503);
      expect(sqls(mockClientQuery)).toContain('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('progreso', () => {
    test('reto de otro gimnasio: 404', async () => {
      mockQuery.mockImplementation(async (sql) => (/FROM gimnasio/i.test(sql) ? GYM_ACTIVO : { rows: [] }));
      const r = await call('GET', '/api/admin/retos/4/progreso', ADMIN_G9);
      expect(r.status).toBe(404);
      expect(llamadaCon(mockQuery, /FROM reto r WHERE/)[1]).toEqual([4, 9]);
    });

    test('filtra por estado y por el gimnasio del token', async () => {
      mockQuery.mockImplementation(async (sql) => {
        if (/FROM gimnasio/i.test(sql)) return GYM_ACTIVO;
        if (/FROM reto r WHERE/.test(sql)) return { rows: [{ id_reto: 4 }] };
        if (/COUNT\(\*\)/.test(sql)) return { rows: [{ inscritos: 2, en_curso: 1, completados: 1, cancelados: 0 }] };
        return { rows: [{ id_miembro: 12, estado: 'COMPLETADO', checkins_acumulados: 10, porcentaje_avance: 100 }] };
      });
      const r = await call('GET', '/api/admin/retos/4/progreso?estado=completado', ADMIN);
      expect(r.status).toBe(200);
      expect(r.body.resumen.completados).toBe(1);
      const lista = mockQuery.mock.calls.find(([s]) => /ORDER BY \(rm\.estado = 'COMPLETADO'\) DESC/.test(s));
      expect(lista[1]).toEqual([4, 7, 'COMPLETADO']);
      expect(lista[0]).toMatch(/m\.id_gimnasio = \$2/);
    });

    test('estado desconocido: 400', async () => {
      mockQuery.mockResolvedValue(GYM_ACTIVO);
      expect((await call('GET', '/api/admin/retos/4/progreso?estado=GANADO', ADMIN)).status).toBe(400);
    });
  });
});

// ===========================================================================
// Campana: retos completados y filtro por destinatario
// ===========================================================================
describe('campana del administrador', () => {
  test('avisos de retos: solo filas del gimnasio (destinatario GIMNASIO) sin leer', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id_notificacion: 30, mensaje: 'Ana completó el reto «R».', id_miembro: 12, nombre: 'Ana', minutos: 3 }] });
    const r = await call('GET', '/api/admin/retos/avisos', RECEP);
    expect(r.status).toBe(200);
    expect(r.body.avisos).toEqual([expect.objectContaining({
      id: 'reto-completado-30', tipo: 'reto-completado', titulo: 'Ana completó el reto «R».',
      detalle: 'Reto completado · hace 3 min', idMiembro: 12, idNotificacion: 30,
    })]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/n\.destinatario = 'GIMNASIO'/);
    expect(sql).toMatch(/n\.leida = FALSE/);
    expect(params).toEqual([7, 'Reto completado', 5]);
  });

  test('marcar visto un aviso de otro gimnasio: 404', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const r = await call('POST', '/api/admin/retos/avisos/30/leida', ADMIN_G9);
    expect(r.status).toBe(404);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/destinatario = 'GIMNASIO'/);
    expect(params).toEqual([30, 9, 'Reto completado']);
  });

  test('el miembro no puede ver los avisos del gimnasio: 403', async () => {
    expect((await call('GET', '/api/admin/retos/avisos', MIEMBRO)).status).toBe(403);
  });

  test('GET /admin/notificaciones: el acceso bloqueado se lee solo con destinatario GIMNASIO', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const r = await call('GET', '/api/admin/notificaciones', RECEP);
    expect(r.status).toBe(200);
    const bloqueados = mockQuery.mock.calls.find(([s]) => /FROM notificacion n/.test(s));
    expect(bloqueados[0]).toMatch(/n\.destinatario = 'GIMNASIO'/);
  });
});

// ===========================================================================
// Bandeja de la app del miembro
// ===========================================================================
describe('bandeja del miembro (/api/cliente/mensajes)', () => {
  test('lista solo los mensajes del miembro y gimnasio del token, con el contador', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/COUNT\(\*\)/.test(sql)) return { rows: [{ n: 1 }] };
      return { rows: [{ id: 30, tipo: 'RETO', titulo: '¡Completaste un reto!', mensaje: 'x', leida: false }] };
    });
    const r = await call('GET', '/api/cliente/mensajes?limit=500', MIEMBRO);
    expect(r.status).toBe(200);
    expect(r.body.no_leidos).toBe(1);
    expect(r.body.mensajes).toHaveLength(1);
    for (const [sql, params] of mockQuery.mock.calls) {
      expect(sql).toMatch(/id_gimnasio = \$1 AND id_miembro = \$2 AND destinatario = 'MIEMBRO'/);
      expect(params.slice(0, 2)).toEqual([7, 12]);
    }
    // El limite se recorta a 100.
    expect(mockQuery.mock.calls.find(([s]) => /LIMIT \$3/.test(s))[1][2]).toBe(100);
  });

  test('marcar un mensaje ajeno (o del gimnasio): 404', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    const r = await call('PATCH', '/api/cliente/mensajes/30/leido', MIEMBRO);
    expect(r.status).toBe(404);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/destinatario = 'MIEMBRO' AND id_notificacion = \$3/);
    expect(params).toEqual([7, 12, 30]);
  });

  test('marcar uno propio: 200 con el contador nuevo', async () => {
    mockQuery.mockImplementation(async (sql) => (/COUNT/.test(sql) ? { rows: [{ n: 2 }] } : { rowCount: 1, rows: [] }));
    const r = await call('PATCH', '/api/cliente/mensajes/30/leido', MIEMBRO);
    expect(r.status).toBe(200);
    expect(r.body.no_leidos).toBe(2);
  });

  test('marcar todos: solo los del miembro', async () => {
    mockQuery.mockResolvedValue({ rowCount: 3, rows: [] });
    const r = await call('PATCH', '/api/cliente/mensajes/leidos', MIEMBRO);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ marcados: 3, no_leidos: 0 });
    expect(mockQuery.mock.calls[0][1]).toEqual([7, 12]);
  });

  test('id invalido: 400; token del personal: 403', async () => {
    expect((await call('PATCH', '/api/cliente/mensajes/abc/leido', MIEMBRO)).status).toBe(400);
    expect((await call('GET', '/api/cliente/mensajes', ADMIN)).status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('si la base falla: 503', async () => {
    mockQuery.mockRejectedValue(new Error('caida'));
    expect((await call('GET', '/api/cliente/mensajes', MIEMBRO)).status).toBe(503);
  });

  test('/cliente/retos: los del gimnasio del miembro, filtrados por su segmento', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const r = await call('GET', '/api/cliente/retos', MIEMBRO);
    expect(r.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([12, 7]);
    expect(sql).toMatch(/CASE r\.segmento_elegible/);
    expect(sql).toMatch(/t\.participa OR t\.elegible/);
  });
});
