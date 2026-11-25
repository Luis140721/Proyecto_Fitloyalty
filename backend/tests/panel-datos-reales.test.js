/**
 * El panel muestra datos reales (2026-11-24): lo que el Dashboard y el Check-in
 * le piden a la API para no mostrar numeros fijos ni ingresos de otros dias.
 *
 * Que se prueba:
 *  - GET /api/admin/dashboard: nuevosMes sale de la misma consulta de los
 *    miembros activos y se cuenta desde el inicio del mes de Colombia; el monto
 *    de un miembro en riesgo sin plan es null (antes 89900) y los check-ins
 *    recientes son solo los de hoy.
 *  - GET /api/admin/checkin: con ?dia=hoy filtra desde el inicio de hoy en
 *    Colombia; sin el, o con otro valor, devuelve el historial de siempre.
 *
 * Que las expresiones de fecha corten de verdad en la medianoche de Colombia se
 * comprueba contra PostgreSQL en tests/integracion/hora-de-colombia.test.js.
 *
 * Dobles: la BD es un stub por patron del SQL; authenticate, authorize y
 * requireActiveTrial son los reales.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: () => { throw new Error('estas rutas no piden conexiones al pool'); },
}));

const dashboardRouter = require('../src/routes/dashboard');
const checkinRouter = require('../src/routes/checkin');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', dashboardRouter);
app.use('/api', checkinRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const ROL_BD = { admin: 'ADMINISTRADOR', receptionist: 'RECEPCIONISTA' };

const pedir = (ruta, role = 'admin') => request(app)
  .get(ruta)
  .set('Authorization', `Bearer ${jwt.sign({ id: 1, role, gymId: 7 }, SECRETO, { expiresIn: '1h' })}`);

/** Stub de la BD: gana la primera regla [patron, filas] que coincide con el SQL. */
function crearStub(reglas) {
  const stub = {
    consultas: [],
    async query(sql, params) {
      stub.consultas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const regla = reglas.find(([patron]) => patron.test(sql));
      if (!regla) throw new Error(`SQL inesperado en el stub: ${sql.trim().slice(0, 80)}`);
      return { rows: regla[1] };
    },
  };
  return stub;
}
const sqlDe = (patron) => mockBd.consultas.map((c) => c.sql).find((sql) => patron.test(sql));

const PRUEBA_VIGENTE = [/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/, [{ id_gimnasio: 7, activo: true, trial_ends_at: null }]];

// Las 12 consultas de los KPIs; cada test cambia solo lo suyo.
const reglasDashboard = ({ miembros = { total: 10, nuevos_mes: 2 }, enRiesgo = [] } = {}) => [
  PRUEBA_VIGENTE,
  [/FROM miembro WHERE id_gimnasio = \$1 AND activo = TRUE/, [miembros]],
  [/AS total FROM checkin/, [{ total: 3 }]],
  [/INTERVAL '7 days'/, [{ total: 1 }]],
  [/COUNT\(DISTINCT m\.id_miembro\)/, [{ activos: 6 }]],
  [/AS total FROM miembro m\s+LEFT JOIN LATERAL/, [{ total: 4 }]],
  [/AS dias_sin/, enRiesgo],
  [/AS dow/, []],
  [/AS dias_restantes/, []],
  [/c\.id_checkin/, [{ id_checkin: 9, fecha_hora: '2026-11-24T13:00:00.000Z', metodo: 'QR', nombre: 'Ana Pérez', codigo_qr: 'qr-ana' }]],
  [/SUM\(pc\.valor_pagado\)/, [{ total: 0 }]],
  [/estado_pago IN/, [{ total: 0 }]],
  [/AS cnt/, [{ plan: 'Mensual', cnt: 7 }]],
];

const INICIO_DE_HOY = `((date_trunc('day', now() AT TIME ZONE 'America/Bogota') - INTERVAL '0 days') AT TIME ZONE 'America/Bogota') AT TIME ZONE current_setting('TimeZone')`;
const INICIO_DEL_MES = INICIO_DE_HOY.replace("'day'", "'month'");

beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: ROL_BD[p.role] }));
});
afterAll(() => establecerBusquedaPersonal(null));

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO };
});
afterEach(() => {
  process.env = ENV_ORIGINAL;
});

describe('GET /api/admin/dashboard: datos reales', () => {
  test('should send the members registered this month of Colombia next to the active members', async () => {
    mockBd = crearStub(reglasDashboard({ miembros: { total: 10, nuevos_mes: 2 } }));

    const r = await pedir('/api/admin/dashboard');

    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ totalMiembros: 10, nuevosMes: 2 }));
    expect(sqlDe(/AS nuevos_mes/)).toBe(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE fecha_registro >= ${INICIO_DEL_MES})::int AS nuevos_mes `
      + 'FROM miembro WHERE id_gimnasio = $1 AND activo = TRUE',
    );
  });

  test('should send a null amount, not an invented one, when a member at risk has no plan', async () => {
    mockBd = crearStub(reglasDashboard({ enRiesgo: [{ nombre: 'Sin Plan', dias_sin: 20, monto: null }] }));

    const r = await pedir('/api/admin/dashboard');

    expect(r.status).toBe(200);
    expect(r.body.enRiesgoList).toEqual([{ nombre: 'Sin Plan', dias_sin: 20, monto: null }]);
    expect(sqlDe(/AS dias_sin/)).toContain('p.valor_total::int AS monto');
    expect(sqlDe(/AS dias_sin/)).not.toMatch(/COALESCE\(p\.valor_total/);
  });

  test('should ask only for the check-ins of today of that gym when it fills the recent activity', async () => {
    mockBd = crearStub(reglasDashboard());

    const r = await pedir('/api/admin/dashboard');

    expect(r.status).toBe(200);
    expect(r.body.recientes).toHaveLength(1);
    expect(sqlDe(/c\.id_checkin/)).toContain(`WHERE c.id_gimnasio = $1 AND c.fecha_hora >= ${INICIO_DE_HOY} ORDER BY c.fecha_hora DESC LIMIT 8`);
  });
});

describe('GET /api/admin/checkin: los ingresos de hoy', () => {
  const FILA = { id_checkin: 1, fecha_hora: '2026-11-24T13:00:00.000Z', metodo: 'QR', valido: true, id_miembro: 3, nombre: 'Ana Pérez', documento: '1020304050', codigo_qr: 'qr-ana' };
  const historial = () => mockBd.consultas.find((c) => /FROM checkin c/.test(c.sql));
  beforeEach(() => { mockBd = crearStub([PRUEBA_VIGENTE, [/FROM checkin c/, [FILA]]]); });

  test.each(['admin', 'receptionist'])('should filter from the start of today in Colombia when the %s asks for dia=hoy', async (role) => {
    const r = await pedir('/api/admin/checkin?dia=hoy&limit=200', role);

    expect(r.status).toBe(200);
    expect(r.body.checkins).toEqual([FILA]);
    expect(historial().sql).toMatch(
      /WHERE c\.id_gimnasio = \$1 AND c\.fecha_hora >= \(\(\(\(NOW\(\) AT TIME ZONE 'America\/Bogota'\)::date\)::timestamp AT TIME ZONE 'America\/Bogota'\) AT TIME ZONE current_setting\('TimeZone'\)\) ORDER BY c\.fecha_hora DESC LIMIT 200$/,
    );
    expect(historial().params).toEqual([7]);
  });

  test.each([
    ['dia is not sent', '/api/admin/checkin?limit=5'],
    ['dia has another value', "/api/admin/checkin?limit=5&dia=ayer'%20OR%201=1"],
  ])('should send the history of any day when %s', async (_caso, ruta) => {
    const r = await pedir(ruta);

    expect(r.status).toBe(200);
    expect(historial().sql).toMatch(/WHERE c\.id_gimnasio = \$1 ORDER BY c\.fecha_hora DESC LIMIT 5$/);
    expect(historial().params).toEqual([7]);
  });
});
