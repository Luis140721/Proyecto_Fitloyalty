/**
 * QR dinamico del miembro (lib/qr-dinamico.js) y su uso en el check-in.
 */
const crypto = require('crypto');
const q = require('../src/lib/qr-dinamico');

const T0 = Date.UTC(2026, 10, 20, 15, 0, 0); // 2026-11-20 10:00 en Colombia

describe('codigo de cada paso', () => {
  test('vector fijo: el mismo que prueba la app Flutter (qr_dinamico_test.dart)', () => {
    // Secreto de 32 bytes 0x00..0x1f y paso 59000000.
    const secreto = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
    expect(q.codigoEnPaso(secreto, 59000000)).toBe('06530560');
    expect(q.codigoEnPaso(secreto, 0)).toMatch(/^\d{8}$/);
  });

  test('cambia cada 30 segundos y se repite dentro del mismo paso', () => {
    const a = q.tokenEn(12, 'QR-ANA', T0);
    expect(q.tokenEn(12, 'QR-ANA', T0 + 29 * 1000)).toBe(a);
    expect(q.tokenEn(12, 'QR-ANA', T0 + 30 * 1000)).not.toBe(a);
  });

  test('solo letras y numeros (los lectores HID cambian simbolos segun el teclado)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(q.tokenEn(i + 1, `QR-${i}`, T0 + i * 30000)).toMatch(/^FLD\d+T\d{8}$/);
    }
  });

  test('el secreto depende del miembro y de su codigo_qr', () => {
    expect(q.secretoMiembro(12, 'A').equals(q.secretoMiembro(13, 'A'))).toBe(false);
    expect(q.secretoMiembro(12, 'A').equals(q.secretoMiembro(12, 'B'))).toBe(false);
  });
});

describe('leerToken', () => {
  test('reconoce el formato, sin importar mayusculas ni espacios', () => {
    expect(q.leerToken('FLD12T01234567')).toEqual({ idMiembro: 12, codigo: '01234567' });
    expect(q.leerToken('  fld12t01234567\n')).toEqual({ idMiembro: 12, codigo: '01234567' });
  });

  test.each([
    'FL-7-ABC123',              // QR fijo de miembros.js
    'a1b2c3:ffee00',            // QR fijo cifrado
    'FLD12T1234567',            // 7 digitos
    'FLD12T123456789',          // 9 digitos
    'FLDT12345678',             // sin id
    'XFLD12T12345678',
    '',
  ])('no confunde otros textos: %s', (texto) => {
    expect(q.leerToken(texto)).toBeNull();
  });
});

describe('codigoValido', () => {
  const datos = { idMiembro: 12, codigoQr: 'QR-ANA' };
  const codigo = (ms) => q.leerToken(q.tokenEn(12, 'QR-ANA', ms)).codigo;

  test('acepta el codigo del paso actual', () => {
    expect(q.codigoValido({ ...datos, codigo: codigo(T0), ms: T0 })).toBe(true);
  });

  test('tolera hasta 2 pasos de atraso y 1 de adelanto', () => {
    expect(q.codigoValido({ ...datos, codigo: codigo(T0 - 60000), ms: T0 })).toBe(true);
    expect(q.codigoValido({ ...datos, codigo: codigo(T0 + 30000), ms: T0 })).toBe(true);
  });

  test('una captura de hace 2 minutos ya no sirve', () => {
    expect(q.codigoValido({ ...datos, codigo: codigo(T0 - 120000), ms: T0 })).toBe(false);
  });

  test('el codigo de otro miembro no sirve', () => {
    const ajeno = q.leerToken(q.tokenEn(13, 'QR-BETO', T0)).codigo;
    expect(q.codigoValido({ ...datos, codigo: ajeno, ms: T0 })).toBe(false);
  });

  test('si se regenera el codigo_qr, los codigos viejos dejan de servir', () => {
    expect(q.codigoValido({ idMiembro: 12, codigoQr: 'QR-NUEVO', codigo: codigo(T0), ms: T0 })).toBe(false);
  });
});

describe('datosParaApp', () => {
  test('trae lo necesario para calcular sin internet y el codigo actual coincide', () => {
    const d = q.datosParaApp(12, 'QR-ANA', T0);
    expect(d).toMatchObject({ paso_seg: 30, digitos: 8, prefijo: 'FLD', id: 12, hora_servidor_ms: T0 });
    expect(d.secreto).toMatch(/^[0-9a-f]{64}$/);
    // Lo que calcula la app con el secreto recibido es lo mismo que acepta el servidor.
    const enApp = q.codigoEnPaso(Buffer.from(d.secreto, 'hex'), Math.floor(T0 / 30000));
    expect(d.codigo_actual).toBe(`FLD12T${enApp}`);
  });
});

// ------------------------------------------------------------ en el check-in
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
// El check-in busca el ingreso repetido e inserta con un cliente del pool, en
// una transaccion (#80): el cliente usa la misma base falsa.
jest.mock('../src/db/db', () => ({
  query: (...a) => mockQuery(...a),
  connect: async () => ({ query: (...a) => mockQuery(...a), release: () => {} }),
}));
process.env.JWT_SECRET = 'secreto-de-pruebas';

const checkinRouter = require('../src/routes/checkin');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

describe('POST /api/admin/checkin con el QR dinamico', () => {
  const RECEP = jwt.sign({ id: 2, role: 'receptionist', gymId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const ANA = { id_miembro: 12, nombre: 'Ana', documento: '123', codigo_qr: 'QR-ANA', qr_imagen: null };
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let server, base, inserts, soloDinamico;

  beforeAll((done) => {
    establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'RECEPCIONISTA' }));
    const app = express();
    app.use(express.json());
    app.use('/api', checkinRouter);
    app.use(errorHandler);
    server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
  });
  afterAll(() => new Promise((r) => { establecerBusquedaPersonal(null); server.close(() => r()); }));

  beforeEach(() => {
    inserts = [];
    soloDinamico = false;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql, params) => {
      if (/qr_dinamico_obligatorio FROM gimnasio/.test(sql)) return { rows: [{ qr_dinamico_obligatorio: soloDinamico }] };
      if (/FROM gimnasio/i.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
      if (/id_miembro = \$2 LIMIT 1/.test(sql)) return { rows: params[1] === 12 ? [ANA] : [] };
      if (/codigo_qr = \$2/.test(sql)) return { rows: params[1] === 'QR-ANA' ? [ANA] : [] };
      if (/FROM miembro/i.test(sql)) return { rows: [ANA] };
      if (/DISTINCT ON/i.test(sql)) return { rows: [{ tipo_plan: 'MENSUAL', fecha_fin: manana, estado_pago: 'PAGADO' }] };
      if (/INSERT INTO checkin/i.test(sql)) { inserts.push(params); return { rows: [{ id_checkin: 1, fecha_hora: new Date(), metodo: params[2] }] }; }
      if (/FROM checkin/i.test(sql) && /interval/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const checkin = async (body) => {
    const r = await fetch(`${base}/api/admin/checkin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RECEP}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };

  test('registra el ingreso con el codigo vigente y lo guarda como QR', async () => {
    const r = await checkin({ codigo: q.tokenEn(12, 'QR-ANA'), metodo: 'MANUAL' });
    expect(r.status).toBe(201);
    expect(r.body.qr_dinamico).toBe(true);
    expect(inserts[0][0]).toBe(12);
    expect(inserts[0][2]).toBe('QR');
  });

  test('un codigo vencido responde 400 QR_DINAMICO_VENCIDO y no registra', async () => {
    const r = await checkin({ codigo: q.tokenEn(12, 'QR-ANA', Date.now() - 5 * 60000) });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('QR_DINAMICO_VENCIDO');
    expect(inserts).toHaveLength(0);
  });

  test('el codigo de un miembro de otro gimnasio: 404', async () => {
    const r = await checkin({ codigo: q.tokenEn(99, 'QR-OTRO') });
    expect(r.status).toBe(404);
    expect(inserts).toHaveLength(0);
  });

  test('si el gimnasio exige el dinamico, el QR fijo se rechaza con QR_ESTATICO_NO_PERMITIDO', async () => {
    soloDinamico = true;
    const r = await checkin({ codigo: 'QR-ANA', metodo: 'QR' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('QR_ESTATICO_NO_PERMITIDO');
    expect(inserts).toHaveLength(0);
  });

  test('si no lo exige, el QR fijo sigue entrando', async () => {
    const r = await checkin({ codigo: 'QR-ANA', metodo: 'QR' });
    expect(r.status).toBe(201);
  });

  test('aunque se exija el dinamico, el documento sigue sirviendo', async () => {
    soloDinamico = true;
    mockQuery.mockImplementationOnce(async () => ({ rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] }));
    const r = await checkin({ documento: '123', metodo: 'MANUAL' });
    expect([200, 201]).toContain(r.status);
  });
});

describe('vector independiente', () => {
  test('el truncado coincide con una implementacion directa de RFC 4226 sobre SHA-256', () => {
    const secreto = crypto.randomBytes(32);
    const paso = 123456;
    const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(paso));
    const h = crypto.createHmac('sha256', secreto).update(c).digest();
    const o = h[31] & 15;
    const n = (h.readUInt32BE(o) & 0x7fffffff) % 1e8;
    expect(q.codigoEnPaso(secreto, paso)).toBe(String(n).padStart(8, '0'));
  });
});
