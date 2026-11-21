/**
 * RQNF-18: el contrato que el sistema genera para cada miembro informa de
 * forma clara y completa el precio total, la forma de pago, la vigencia, la
 * renovacion, el congelamiento, la terminacion, los datos del gimnasio y el
 * canal de PQR, sin las clausulas que la Ley 1480 de 2011 (arts. 42 y 43)
 * considera abusivas, y se entrega al miembro por WhatsApp y en la app.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { crearBdFalsa } = require('./helpers/bd-falsa-legal');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: () => mockBd.connect(),
}));
const mockWa = { sendWhatsAppText: jest.fn(async () => {}), sendWhatsAppQR: jest.fn(async () => {}), isWhatsAppReady: () => true };
jest.mock('../src/lib/whatsapp', () => mockWa);

process.env.JWT_SECRET = 'secreto-de-pruebas';

const contratoRouter = require('../src/routes/admin-contrato');
const clienteRouter = require('../src/routes/cliente');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');
const { datosContrato, faltantesContrato, contratoMembresia, seccionesContrato, CONTRATO_VERSION } = require('../src/lib/mensajes');
const { hoyEnBogota } = require('../src/lib/autorizaciones');

const GYM_A = 7;
const GYM_B = 9;
const ADMIN_A = jwt.sign({ id: 1, role: 'admin', gymId: GYM_A }, process.env.JWT_SECRET, { expiresIn: '1h' });
const ADMIN_B = jwt.sign({ id: 2, role: 'admin', gymId: GYM_B }, process.env.JWT_SECRET, { expiresIn: '1h' });
const cliente = (idMiembro, gymId) => jwt.sign({ role: 'cliente', idMiembro, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });

const nacidoHace = (anos) => {
  const [y, m, d] = hoyEnBogota().split('-').map(Number);
  return new Date(Date.UTC(y - anos, m - 1, d - 10)).toISOString().slice(0, 10);
};

/** Fila como la que lee lib/contrato.js, para probar el texto sin rutas. */
const FILA = {
  nombre: 'Ana Gomez', tipo_documento: 'CC', documento: '1012345678',
  gym_nombre: 'Gym Demo', gym_nit: '900123456-7', gym_direccion: 'Calle 10 # 5-20, Bogotá',
  gym_telefono: '6015551234', gym_email: 'pqr@gymdemo.co', gym_dias_aviso: 3,
  tipo_plan: 'TRIMESTRAL', fecha_inicio: '2026-11-01', fecha_fin: '2027-01-30',
  valor_total: '210000.00', valor_pagado: '150000.00', metodo_pago: 'TRANSFERENCIA', estado_pago: 'PARCIAL',
  acepto_terminos: true, fecha_registro: new Date('2026-11-01T14:00:00Z'),
};

describe('texto del contrato (lib/mensajes)', () => {
  const texto = contratoMembresia(datosContrato(FILA, {
    TERMINOS: { otorgada: true, fecha: new Date('2026-11-01T14:00:00Z'), canal: 'PANEL', version_texto: 'v1' },
    TRATAMIENTO_DATOS: { otorgada: true },
    DATOS_SENSIBLES: { otorgada: false },
  }));

  test('informa todos los campos obligatorios con los datos reales', () => {
    // Precio total y forma de pago
    expect(texto).toMatch(/Precio total del plan: \$210\.000 COP/);
    expect(texto).toMatch(/Pagado: \$150\.000 COP\. Saldo pendiente: \$60\.000 COP \(pago parcial\)/);
    expect(texto).toMatch(/Forma de pago: transferencia bancaria/);
    // Vigencia
    expect(texto).toMatch(/Plan Trimestral, del 01 de noviembre de 2026 al 30 de enero de 2027 \(90 días\)/);
    // Renovacion: nunca automatica, y con aviso
    expect(texto).toMatch(/NO se renueva automáticamente/);
    expect(texto).toMatch(/nunca se te cobrará un periodo nuevo sin tu aceptación/);
    expect(texto).toMatch(/Te avisaremos por WhatsApp 3 días antes del vencimiento/);
    // Congelamiento (RQF-04) y terminacion
    expect(texto).toMatch(/\*6\. Congelamiento\.\*.*la fecha de vencimiento se corre tantos días como estuvo congelada/);
    expect(texto).toMatch(/\*8\. Terminación por el miembro\.\*.*sin multas ni requisitos adicionales.*te devuelve la parte de lo pagado/);
    expect(texto).toMatch(/\*9\. Terminación o suspensión por el gimnasio\.\*.*te avisa por escrito/);
    // Datos del gimnasio
    expect(texto).toMatch(/El gimnasio: Gym Demo, NIT 900123456-7, dirección Calle 10 # 5-20, Bogotá, teléfono 6015551234, correo pqr@gymdemo\.co\./);
    // Canal de PQR
    expect(texto).toMatch(/\*11\. Peticiones, quejas y reclamos \(PQR\)\.\* .*recepción del gimnasio \(Calle 10 # 5-20, Bogotá\), al teléfono o WhatsApp 6015551234 o al correo pqr@gymdemo\.co/);
    expect(texto).toMatch(/15 días hábiles/);
    expect(texto).toMatch(/Superintendencia de Industria y Comercio/);
    // Autorizaciones separadas y version
    expect(texto).toMatch(/tratamiento de datos, sí; datos de salud \(opcional\), no/);
    expect(texto).toMatch(new RegExp(`versión ${CONTRATO_VERSION}`));
  });

  test('no trae las clausulas abusivas de la version anterior (Ley 1480, arts. 42 y 43)', () => {
    const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const frase of [
      'no hay devolucion',                 // nunca devolver el dinero (art. 43 num. 5)
      'sin devolucion',
      'no es transferible ni reembolsable',
      'no se hace responsable',            // exonerar al gimnasio (art. 43 num. 1)
      'bajo tu propia responsabilidad',    // trasladar la responsabilidad (art. 43 num. 4)
      'tampoco responde por objetos',
      'salvo que indiques lo contrario',   // uso de imagen presumido (art. 43 num. 9)
      'constituye tu aceptacion',          // aceptacion presumida (art. 43 num. 9)
      'promociones y comunicaciones',      // publicidad metida en el contrato
      'datos biomedicos',                  // datos sensibles metidos en el contrato
    ]) {
      expect(t).not.toContain(frase);
    }
  });

  test('faltantes: sin plan, precio o forma de pago no se puede entregar', () => {
    expect(faltantesContrato(datosContrato(FILA))).toEqual([]);
    expect(faltantesContrato(datosContrato({ ...FILA, tipo_plan: null }))).toEqual(['plan vigente']);
    expect(faltantesContrato(datosContrato({ ...FILA, metodo_pago: null, valor_total: null })))
      .toEqual(['precio total del plan', 'forma de pago']);
  });

  test('el representante solo aparece si el miembro es menor', () => {
    const rep = { representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52123456', representante_parentesco: 'Madre', representante_telefono: '3109876543' };
    const adulto = seccionesContrato(datosContrato({ ...FILA, ...rep, es_menor: false }))[0].texto;
    const menor = seccionesContrato(datosContrato({ ...FILA, ...rep, es_menor: true }))[0].texto;
    expect(adulto).not.toMatch(/Representante legal/);
    expect(menor).toMatch(/Representante legal del miembro, que es menor de edad: Marta Ruiz, CC 52123456, Madre/);
  });

  test('una membresia congelada lo dice en la vigencia', () => {
    const t = contratoMembresia(datosContrato({ ...FILA, congelado_desde: '2026-12-01' }));
    expect(t).toMatch(/congelada desde el 01 de diciembre de 2026/);
  });

  test('sin aceptacion registrada no la presume', () => {
    const t = contratoMembresia(datosContrato({ ...FILA, acepto_terminos: false }));
    expect(t).toMatch(/No hay constancia de que hayas aceptado/);
  });
});

// ---------------------------------------------------------------------------
let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
  const app = express();
  app.use(express.json());
  app.use('/api/admin/miembros', contratoRouter);
  app.use('/api/cliente', clienteRouter);
  app.use(errorHandler);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll(() => new Promise((resolve) => {
  establecerBusquedaPersonal(null);
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

beforeEach(() => {
  mockBd = crearBdFalsa();
  mockBd.agregarGimnasio({ id_gimnasio: GYM_A, nombre: 'Gym A', telefono: '6011111111', email: 'pqr@gyma.co', direccion: 'Cra 7 # 1-1' });
  mockBd.agregarGimnasio({ id_gimnasio: GYM_B, nombre: 'Gym B', telefono: '6022222222' });
  mockBd.agregarMiembro({ id_miembro: 12, id_gimnasio: GYM_A, nombre: 'Ana Gomez', fecha_nacimiento: nacidoHace(30) });
  mockBd.agregarPlan({ id_miembro: 12, id_gimnasio: GYM_A, tipo_plan: 'MENSUAL', fecha_inicio: '2026-11-01', fecha_fin: '2026-12-01', valor_total: 80000, valor_pagado: 80000, metodo_pago: 'NEQUI' });
  mockBd.agregarMiembro({ id_miembro: 13, id_gimnasio: GYM_A, nombre: 'Sin Plan' });
  mockWa.sendWhatsAppText.mockReset();
  mockWa.sendWhatsAppText.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const pedir = async (metodo, url, tk, body) => {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

describe('entrega por WhatsApp: POST /api/admin/miembros/:id/contrato/enviar', () => {
  test('envia el contrato completo y guarda canal, version y el texto entregado', async () => {
    const r = await pedir('POST', '/api/admin/miembros/12/contrato/enviar', ADMIN_A, { version: 'v1' });
    expect(r.status).toBe(200);
    expect(r.body.exito).toBe(true);
    expect(r.body.version).toBe(CONTRATO_VERSION);
    const [tel, texto] = mockWa.sendWhatsAppText.mock.calls[0];
    expect(tel).toBe('573001234567');
    expect(texto).toMatch(/Precio total del plan: \$80\.000 COP/);
    expect(mockBd.contratos).toHaveLength(1);
    expect(mockBd.contratos[0]).toMatchObject({ canal: 'WHATSAPP', plantilla_version: CONTRATO_VERSION, exito: true, contenido: texto, telefono_destino: '573001234567' });
  });

  test('sin plan: 409 CONTRACT_INCOMPLETE y no envia nada', async () => {
    const r = await pedir('POST', '/api/admin/miembros/13/contrato/enviar', ADMIN_A);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONTRACT_INCOMPLETE');
    expect(r.body.faltantes).toEqual(['plan vigente']);
    expect(mockWa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mockBd.contratos).toHaveLength(0);
  });

  test('miembro de otro gimnasio: 404 sin enviar ni registrar nada', async () => {
    const r = await pedir('POST', '/api/admin/miembros/12/contrato/enviar', ADMIN_B);
    expect(r.status).toBe(404);
    expect(mockWa.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mockBd.contratos).toHaveLength(0);
    const prev = await pedir('GET', '/api/admin/miembros/12/contrato/preview', ADMIN_B);
    expect(prev.status).toBe(404);
    const hist = await pedir('GET', '/api/admin/miembros/12/contrato/historial', ADMIN_B);
    expect(hist.status).toBe(404);
  });

  test('miembro menor de edad: el contrato va al telefono de su representante', async () => {
    mockBd.agregarMiembro({
      id_miembro: 14, id_gimnasio: GYM_A, nombre: 'Sofi', tipo_documento: 'TI', fecha_nacimiento: nacidoHace(15),
      representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52123456',
      representante_parentesco: 'Madre', representante_telefono: '3109876543',
    });
    mockBd.agregarPlan({ id_miembro: 14, id_gimnasio: GYM_A, tipo_plan: 'MENSUAL', fecha_inicio: '2026-11-01', fecha_fin: '2026-12-01', valor_total: 60000, valor_pagado: 0, metodo_pago: 'EFECTIVO', estado_pago: 'PENDIENTE' });
    const r = await pedir('POST', '/api/admin/miembros/14/contrato/enviar', ADMIN_A);
    expect(r.status).toBe(200);
    expect(r.body.destinatario).toBe('representante');
    const [tel, texto] = mockWa.sendWhatsAppText.mock.calls[0];
    expect(tel).toBe('573109876543');
    expect(texto).toMatch(/Representante legal del miembro, que es menor de edad: Marta Ruiz/);
  });

  test('vista previa: secciones, faltantes y version', async () => {
    const r = await pedir('GET', '/api/admin/miembros/12/contrato/preview', ADMIN_A);
    expect(r.status).toBe(200);
    expect(r.body.faltantes).toEqual([]);
    expect(r.body.secciones.map((s) => s.titulo)).toEqual(expect.arrayContaining([
      'Partes', 'Plan y vigencia', 'Precio total y forma de pago', 'Renovación', 'Congelamiento',
      'Terminación por el miembro', 'Terminación o suspensión por el gimnasio', 'Peticiones, quejas y reclamos (PQR)',
    ]));
  });
});

describe('entrega en la app: GET /api/cliente/contrato', () => {
  test('el miembro ve su contrato y queda una constancia por cada texto distinto', async () => {
    const r = await pedir('GET', '/api/cliente/contrato', cliente(12, GYM_A));
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(CONTRATO_VERSION);
    expect(r.body.gimnasio).toBe('Gym A');
    expect(r.body.contrato).toMatch(/correo pqr@gyma\.co/);
    expect(r.body.secciones.length).toBeGreaterThanOrEqual(15);
    expect(r.body.entregado_en).toBeTruthy();
    expect(mockBd.contratos).toEqual([expect.objectContaining({ canal: 'APP', telefono_destino: null, contenido: r.body.contrato, id_miembro: 12 })]);

    // Abrirla de nuevo no duplica la constancia.
    await pedir('GET', '/api/cliente/contrato', cliente(12, GYM_A));
    expect(mockBd.contratos).toHaveLength(1);
  });

  test('la app solo ve lo propio: con el gimnasio de otro token no encuentra el miembro', async () => {
    const r = await pedir('GET', '/api/cliente/contrato', cliente(12, GYM_B));
    expect(r.status).toBe(404);
    for (const [sql, params] of mockBd.log.filter(([q]) => /FROM miembro m JOIN gimnasio/.test(q))) {
      expect(sql).toMatch(/m\.id_miembro = \$1 AND m\.id_gimnasio = \$2/);
      expect(params).toEqual([12, GYM_B]);
    }
    expect(mockBd.contratos).toHaveLength(0);
  });

  test('sin plan: 404 CONTRACT_INCOMPLETE y no registra entrega', async () => {
    const r = await pedir('GET', '/api/cliente/contrato', cliente(13, GYM_A));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('CONTRACT_INCOMPLETE');
    expect(mockBd.contratos).toHaveLength(0);
  });

  test('un token del personal no entra: 403', async () => {
    const r = await pedir('GET', '/api/cliente/contrato', ADMIN_A);
    expect(r.status).toBe(403);
  });
});
