/**
 * Al arrancar (index.js, iniciar) el servidor avisa si esta en produccion sin
 * QR_DINAMICO_SECRET (lib/qr-dinamico.js). Se simulan la base, las
 * migraciones, el scheduler y app.listen: no abre puertos ni toca nada.
 */
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas';

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...a) => mockQuery(...a), on: jest.fn() }));
jest.mock('../src/db/migrate', () => ({ applyMigrations: jest.fn(async () => {}) }));
jest.mock('../src/jobs/scheduler', () => ({ start: jest.fn() }));

const { app, iniciar } = require('../src/index');

const ENV = { NODE_ENV: process.env.NODE_ENV, QR_DINAMICO_SECRET: process.env.QR_DINAMICO_SECRET };
let warn;
beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql) => (/COUNT\(\*\)/.test(sql)
    ? { rows: [{ n: 1 }] }
    : { rows: [{ hora: '2026-11-21 08:00' }] }));
  jest.spyOn(app, 'listen').mockImplementation((port, cb) => { if (cb) cb(); return {}; });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env.NODE_ENV = ENV.NODE_ENV;
  if (ENV.QR_DINAMICO_SECRET === undefined) delete process.env.QR_DINAMICO_SECRET;
  else process.env.QR_DINAMICO_SECRET = ENV.QR_DINAMICO_SECRET;
});

const avisosQr = () => warn.mock.calls.map(([t]) => String(t)).filter((t) => t.includes('QR_DINAMICO_SECRET'));

test('produccion sin QR_DINAMICO_SECRET: lo avisa al arrancar', async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.QR_DINAMICO_SECRET;
  await iniciar();
  expect(app.listen).toHaveBeenCalled();
  expect(avisosQr()).toHaveLength(1);
  expect(avisosQr()[0]).toMatch(/1 gimnasio\(s\) ya lo tienen activado/);
});

test('con la clave, o fuera de produccion, no avisa', async () => {
  process.env.NODE_ENV = 'production';
  process.env.QR_DINAMICO_SECRET = 'una-clave-larga-y-propia-de-render';
  await iniciar();
  process.env.NODE_ENV = 'development';
  delete process.env.QR_DINAMICO_SECRET;
  await iniciar();
  expect(avisosQr()).toHaveLength(0);
});
