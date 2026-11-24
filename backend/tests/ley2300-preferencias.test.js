/**
 * RQNF-16 (Ley 2300 de 2023, arts. 2 y 5) y los ajustes que pidio el
 * verificador del #102 (RQNF-17 y RQNF-18), contra la base falsa con estado
 * de tests/helpers/bd-falsa-legal.js:
 *
 *   - aceptacion explicita de mensajes comerciales con su historial (fecha,
 *     version del texto, canal y canales autorizados), por defecto "no";
 *   - baja desde la app (PATCH /api/cliente/preferencias), con el enlace
 *     firmado (/api/baja/:token) y desde la ficha del panel (PUT
 *     /api/admin/miembros/:id);
 *   - observaciones 1, 2, 4, 5, 8, 9 y 10 del #102.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { crearBdFalsa } = require('./helpers/bd-falsa-legal');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: () => mockBd.connect(),
}));
jest.mock('../src/lib/email', () => ({ sendMemberQR: jest.fn(async () => {}) }));
const mockWa = { sendWhatsAppQR: jest.fn(async () => {}), sendWhatsAppText: jest.fn(async () => {}), isWhatsAppReady: () => true };
jest.mock('../src/lib/whatsapp', () => mockWa);

process.env.JWT_SECRET = 'secreto-de-pruebas';

const miembrosRouter = require('../src/routes/miembros');
const preferenciasRouter = require('../src/routes/preferencias');
const contratoRouter = require('../src/routes/admin-contrato');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');
const { tokenBaja, urlBaja } = require('../src/lib/baja-mensajes');
const aut = require('../src/lib/autorizaciones');
const { datosContrato, seccionesContrato, CONTRATO_VERSION } = require('../src/lib/mensajes');

const GYM_A = 7;
const GYM_B = 9;
const staff = (id, gymId, role = 'receptionist') => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
const cliente = (idMiembro, gymId) => jwt.sign({ role: 'cliente', idMiembro, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
const RECEP_A = staff(21, GYM_A);
const ADMIN_A = staff(1, GYM_A, 'admin');

const nacidoHace = (anos) => {
  const [y, m, d] = aut.hoyEnBogota().split('-').map(Number);
  return new Date(Date.UTC(y - anos, m - 1, d - 10)).toISOString().slice(0, 10);
};
const REP = {
  representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52123456',
  representante_parentesco: 'Madre', representante_telefono: '3109876543',
};

let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: p.role === 'admin' ? 'ADMINISTRADOR' : 'RECEPCIONISTA' }));
  const app = express();
  app.use(express.json());
  app.use('/api', preferenciasRouter);
  app.use('/api/admin/miembros', contratoRouter);
  app.use('/api', miembrosRouter);
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
  mockBd.agregarGimnasio({ id_gimnasio: GYM_A, nombre: 'Gym A', telefono: '6011111111', email: 'pqr@gyma.co' });
  mockBd.agregarGimnasio({ id_gimnasio: GYM_B, nombre: 'Gym B', telefono: '6022222222' });
  mockBd.agregarMiembro({ id_miembro: 50, id_gimnasio: GYM_A, nombre: 'Luis Perez', fecha_nacimiento: nacidoHace(30) });
  mockBd.agregarMiembro({ id_miembro: 60, id_gimnasio: GYM_A, nombre: 'Sofi Ruiz', tipo_documento: 'TI', fecha_nacimiento: nacidoHace(14), ...REP });
  mockBd.agregarMiembro({ id_miembro: 70, id_gimnasio: GYM_B, nombre: 'Otro Gym' });
  mockWa.sendWhatsAppText.mockReset();
  mockWa.sendWhatsAppText.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const pedir = async (metodo, url, tk, body) => {
  const headers = { 'Content-Type': 'application/json' };
  if (tk) headers.Authorization = `Bearer ${tk}`;
  const r = await fetch(base + url, { method: metodo, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const comercialesDe = (id) => mockBd.autorizaciones.filter((a) => a.id_miembro === id && a.tipo === 'MENSAJES_COMERCIALES');

// ===========================================================================
describe('app del miembro: /api/cliente/preferencias', () => {
  test('por defecto no acepta mensajes comerciales y ve el texto que aceptaria', async () => {
    const r = await pedir('GET', '/api/cliente/preferencias', cliente(50, GYM_A));
    expect(r.status).toBe(200);
    expect(r.body.preferencias).toMatchObject({ aceptaComerciales: false, canalesAutorizados: [], fecha: null });
    expect(r.body.texto).toMatch(/no estoy obligado\(a\) a aceptarlos/);
    expect(r.body.horario).toMatch(/sábados de 8:00 a\. m\. a 3:00 p\. m\./);
    expect(r.body.puede_aceptar).toBe(true);
  });

  test('aceptar por WhatsApp deja la constancia con canal APP, version y canales', async () => {
    const r = await pedir('PATCH', '/api/cliente/preferencias', cliente(50, GYM_A), { aceptaComerciales: true, canalesAutorizados: ['WHATSAPP'] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cambio: true, preferencias: { aceptaComerciales: true, canalesAutorizados: ['WHATSAPP'], canal: 'APP', version: 'v2' } });
    expect(comercialesDe(50)).toEqual([expect.objectContaining({
      otorgada: true, canal: 'APP', version_texto: 'v2', registrada_por: null, canales_autorizados: ['WHATSAPP'], id_gimnasio: GYM_A,
    })]);
  });

  test('aceptar sin ningun canal: 400 SIN_CANAL y no escribe nada', async () => {
    const r = await pedir('PATCH', '/api/cliente/preferencias', cliente(50, GYM_A), { aceptaComerciales: true });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SIN_CANAL');
    expect(comercialesDe(50)).toHaveLength(0);
  });

  test('el mismo cambio dos veces (doble toque) no duplica la constancia', async () => {
    const tk = cliente(50, GYM_A);
    await pedir('PATCH', '/api/cliente/preferencias', tk, { aceptaComerciales: true, canalesAutorizados: ['EMAIL', 'WHATSAPP'] });
    const r = await pedir('PATCH', '/api/cliente/preferencias', tk, { aceptaComerciales: true, canalesAutorizados: ['WHATSAPP', 'EMAIL'] });
    expect(r.body.cambio).toBe(false);
    expect(comercialesDe(50)).toHaveLength(1);
    expect(comercialesDe(50)[0].canales_autorizados).toEqual(['WHATSAPP', 'EMAIL']);
  });

  test('cancelar en cualquier momento: fila otorgada = false y sin canales', async () => {
    const tk = cliente(50, GYM_A);
    await pedir('PATCH', '/api/cliente/preferencias', tk, { aceptaComerciales: true, canalesAutorizados: ['WHATSAPP'] });
    const r = await pedir('PATCH', '/api/cliente/preferencias', tk, { aceptaComerciales: false });
    expect(r.body.message).toMatch(/ya no recibirás mensajes comerciales/);
    expect(comercialesDe(50).map((a) => [a.otorgada, a.canales_autorizados])).toEqual([[true, ['WHATSAPP']], [false, null]]);
  });

  test('un menor no puede aceptarlos desde la app (403), pero si cancelarlos', async () => {
    mockBd.agregarAutorizacion({ id_miembro: 60, id_gimnasio: GYM_A, tipo: 'MENSAJES_COMERCIALES', otorgada: true, canales_autorizados: ['WHATSAPP'], version_texto: 'v2' });
    const tk = cliente(60, GYM_A);
    const g = await pedir('GET', '/api/cliente/preferencias', tk);
    expect(g.body).toMatchObject({ menor_de_edad: true, puede_aceptar: false, preferencias: { aceptaComerciales: true } });
    const agregar = await pedir('PATCH', '/api/cliente/preferencias', tk, { canalesAutorizados: ['WHATSAPP', 'EMAIL'] });
    expect(agregar.status).toBe(403);
    expect(agregar.body.code).toBe('REPRESENTANTE_REQUERIDO');
    const baja = await pedir('PATCH', '/api/cliente/preferencias', tk, { aceptaComerciales: false });
    expect(baja.status).toBe(200);
    expect(comercialesDe(60).pop()).toMatchObject({ otorgada: false, canal: 'APP' });
  });

  test('solo ve lo suyo: otro gimnasio en el token no encuentra al miembro; el personal no entra', async () => {
    expect((await pedir('GET', '/api/cliente/preferencias', cliente(50, GYM_B))).status).toBe(404);
    expect((await pedir('GET', '/api/cliente/preferencias', RECEP_A)).status).toBe(403);
    expect((await pedir('GET', '/api/cliente/preferencias')).status).toBe(401);
  });

  test('cuerpo invalido: 400', async () => {
    expect((await pedir('PATCH', '/api/cliente/preferencias', cliente(50, GYM_A), {})).status).toBe(400);
    expect((await pedir('PATCH', '/api/cliente/preferencias', cliente(50, GYM_A), { canalesAutorizados: ['SMS'] })).status).toBe(400);
  });
});

// ===========================================================================
describe('enlace publico de baja: /api/baja/:token', () => {
  beforeEach(() => {
    mockBd.agregarAutorizacion({ id_miembro: 50, id_gimnasio: GYM_A, tipo: 'MENSAJES_COMERCIALES', otorgada: true, canales_autorizados: ['WHATSAPP'], version_texto: 'v2' });
  });

  test('el enlace va al frontend y el token lleva solo los ids y la firma', () => {
    const t = tokenBaja(50, GYM_A);
    expect(t).toMatch(/^50\.7\.[A-Za-z0-9_-]{22}$/);
    expect(urlBaja(50, GYM_A)).toMatch(new RegExp(`/baja/${t.replace(/\./g, '\\.')}$`));
  });

  test('GET muestra solo el primer nombre y el gimnasio, y no cambia nada', async () => {
    const r = await pedir('GET', `/api/baja/${tokenBaja(50, GYM_A)}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ nombre: 'Luis', gimnasio: 'Gym A', aceptaComerciales: true });
    expect(comercialesDe(50)).toHaveLength(1);
  });

  test('POST da de baja con canal ENLACE; repetirlo no duplica', async () => {
    const url = `/api/baja/${tokenBaja(50, GYM_A)}`;
    const r = await pedir('POST', url);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cambio: true, aceptaComerciales: false });
    expect(comercialesDe(50).pop()).toMatchObject({ otorgada: false, canal: 'ENLACE', registrada_por: null, version_texto: 'v2' });
    const otra = await pedir('POST', url);
    expect(otra.body).toMatchObject({ cambio: false, message: expect.stringMatching(/Ya no recibes/) });
    expect(comercialesDe(50)).toHaveLength(2);
  });

  test.each([
    ['firma alterada', () => `${tokenBaja(50, GYM_A).slice(0, -2)}xx`],
    ['otro miembro con la firma de este', () => tokenBaja(50, GYM_A).replace(/^50\./, '51.')],
    ['otro gimnasio con la firma de este', () => tokenBaja(50, GYM_A).replace(/^50\.7\./, '50.9.')],
    ['basura', () => 'abc'],
  ])('%s: 404 y no escribe nada', async (_, token) => {
    const r = await pedir('POST', `/api/baja/${token()}`);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('ENLACE_INVALIDO');
    expect(comercialesDe(50)).toHaveLength(1);
  });

  test('un token valido de un miembro que no es de ese gimnasio: 404', async () => {
    expect((await pedir('GET', `/api/baja/${tokenBaja(70, GYM_A)}`)).status).toBe(404);
  });
});

// ===========================================================================
describe('panel: interruptor en la ficha del miembro y en el alta', () => {
  test('aceptar por WhatsApp y correo: fila PANEL con quien la registro; la ficha lo muestra', async () => {
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { acepta_mensajes_comerciales: true, canales_comerciales: ['EMAIL', 'WHATSAPP'] });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/aceptación de mensajes comerciales/);
    expect(comercialesDe(50)).toEqual([expect.objectContaining({ otorgada: true, canal: 'PANEL', registrada_por: 21, canales_autorizados: ['WHATSAPP', 'EMAIL'] })]);
    const g = await pedir('GET', '/api/admin/miembros/50', RECEP_A);
    expect(g.body.miembro).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP', 'EMAIL'] });
    expect(g.body.autorizaciones.vigentes.MENSAJES_COMERCIALES).toMatchObject({ otorgada: true, canales: ['WHATSAPP', 'EMAIL'], texto: expect.stringMatching(/Ley 2300/) });
  });

  test('apagarlo en la ficha: fila otorgada = false', async () => {
    await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { acepta_mensajes_comerciales: false });
    expect(r.body.message).toMatch(/ya no recibirá mensajes comerciales/);
    expect(comercialesDe(50).pop()).toMatchObject({ otorgada: false, canales_autorizados: null });
  });

  test('aceptar sin canal: 400 SIN_CANAL', async () => {
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { acepta_mensajes_comerciales: true, canales_comerciales: [] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SIN_CANAL');
  });

  test('de un menor la da el representante (queda en el detalle)', async () => {
    mockBd.agregarAutorizacion({ id_miembro: 60, id_gimnasio: GYM_A, tipo: 'REPRESENTANTE_MENOR', otorgada: true });
    const r = await pedir('PUT', '/api/admin/miembros/60', RECEP_A, { acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
    expect(r.status).toBe(200);
    expect(comercialesDe(60)[0].detalle).toEqual({ otorgada_por: 'REPRESENTANTE_LEGAL' });
  });

  test('otro gimnasio no la cambia: 404 y no escribe', async () => {
    const r = await pedir('PUT', '/api/admin/miembros/70', RECEP_A, { acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
    expect(r.status).toBe(404);
    expect(comercialesDe(70)).toHaveLength(0);
  });

  const ALTA = {
    nombre: 'Nueva Persona', tipo_documento: 'CC', documento: '1099887766', telefono: '3001112233',
    fecha_nacimiento: nacidoHace(25), tipo_plan: 'MENSUAL', fecha_inicio: '2026-11-01', valor_total: '80000',
    valor_pagado: '80000', metodo_pago: 'NEQUI', acepto_terminos: true, autorizo_datos: true,
  };

  test('alta que acepta por WhatsApp: fila otorgada con el canal', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
    expect(r.status).toBe(201);
    expect(comercialesDe(r.body.miembro.id_miembro)).toEqual([expect.objectContaining({ otorgada: true, canales_autorizados: ['WHATSAPP'], canal: 'PANEL' })]);
  });

  test('alta que acepta sin canal: 400 y no crea al miembro', async () => {
    const antes = mockBd.miembros.size;
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, acepta_mensajes_comerciales: true });
    expect(r.status).toBe(400);
    expect(mockBd.miembros.size).toBe(antes);
  });
});

// ===========================================================================
describe('ajustes del verificador del #102', () => {
  test('(1) PUT { autorizo_datos_sensibles: true } solo: 200 y la autorizacion, no 503', async () => {
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { autorizo_datos_sensibles: true });
    expect(r.status).toBe(200);
    expect(r.body.miembro).toMatchObject({ id_miembro: 50, nombre: 'Luis Perez' });
    expect(mockBd.autorizaciones.filter((a) => a.id_miembro === 50 && a.tipo === 'DATOS_SENSIBLES')).toEqual([expect.objectContaining({ otorgada: true })]);
    expect(mockBd.sqls().some((s) => /UPDATE miembro SET\s+WHERE/.test(s))).toBe(false);
  });

  test('(2) un menor con TI y sin fecha no pasa a CC sin una fecha que lo muestre mayor: 400', async () => {
    mockBd.agregarMiembro({ id_miembro: 61, id_gimnasio: GYM_A, nombre: 'Tomas', tipo_documento: 'TI', fecha_nacimiento: null, ...REP });
    const r = await pedir('PUT', '/api/admin/miembros/61', RECEP_A, { tipo_documento: 'CC' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('MENOR_SIN_CONSTANCIA');
    expect(mockBd.miembros.get(61).tipo_documento).toBe('TI');
  });

  test('(2) vaciar la fecha de nacimiento de un menor: 400 y no cambia nada', async () => {
    const r = await pedir('PUT', '/api/admin/miembros/60', RECEP_A, { fecha_nacimiento: '', tipo_documento: 'CC' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('MENOR_SIN_CONSTANCIA');
    expect(mockBd.miembros.get(60).fecha_nacimiento).toBe(nacidoHace(14));
  });

  test('(2) con una fecha que lo muestra mayor de edad: se admite y queda constancia', async () => {
    const r = await pedir('PUT', '/api/admin/miembros/60', RECEP_A, { tipo_documento: 'CC', fecha_nacimiento: nacidoHace(19) });
    expect(r.status).toBe(200);
    expect(r.body.menor_de_edad).toBe(false);
    const constancia = mockBd.autorizaciones.filter((a) => a.id_miembro === 60 && a.tipo === 'REPRESENTANTE_MENOR').pop();
    expect(constancia).toMatchObject({
      otorgada: false, canal: 'PANEL', registrada_por: 21,
      detalle: { motivo: 'MAYOR_DE_EDAD', antes: { tipo_documento: 'TI' }, despues: { tipo_documento: 'CC', fecha_nacimiento: nacidoHace(19) }, edad_miembro: 19 },
    });
  });

  test('(4) menor sin telefono del representante: el contrato no se envia al telefono del menor', async () => {
    mockBd.agregarMiembro({ id_miembro: 62, id_gimnasio: GYM_A, nombre: 'Juana', tipo_documento: 'TI', fecha_nacimiento: nacidoHace(15), ...REP, representante_telefono: null, telefono: '3005550000' });
    mockBd.agregarPlan({ id_miembro: 62, id_gimnasio: GYM_A, tipo_plan: 'MENSUAL', fecha_inicio: '2026-11-01', fecha_fin: '2026-12-01', valor_total: 80000, valor_pagado: 80000, metodo_pago: 'NEQUI' });
    const r = await pedir('POST', '/api/admin/miembros/62/contrato/enviar', ADMIN_A, {});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/no se envia al telefono del menor/);
    expect(mockWa.sendWhatsAppText).not.toHaveBeenCalled();
  });

  test('(5) el texto del representante es una version nueva (v2) que registra que escucho al menor', () => {
    expect(aut.VERSION_AUTORIZACIONES).toBe('v2');
    expect(aut.textoAutorizacion('REPRESENTANTE_MENOR', 'v2')).toMatch(/escuché al menor y tuve en cuenta su opinión según su madurez/);
    expect(aut.textoAutorizacion('REPRESENTANTE_MENOR', 'v1')).not.toMatch(/escuché/);
    // Los demas textos de la v1 no cambian.
    for (const t of ['TERMINOS', 'TRATAMIENTO_DATOS', 'DATOS_SENSIBLES']) {
      expect(aut.textoAutorizacion(t, 'v2')).toBe(aut.textoAutorizacion(t, 'v1'));
    }
    expect(aut.textoAutorizacion('MENSAJES_COMERCIALES', 'v1')).toBeNull();
  });

  test('(5) el panel muestra los mismos textos que guarda el backend', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'autorizaciones.js'), 'utf8');
    const modulo = new Function(`${fuente.replace(/export (const|function)/g, '$1')}\nreturn { VERSION_AUTORIZACIONES, TEXTOS_AUTORIZACION };`)();
    expect(modulo.VERSION_AUTORIZACIONES).toBe(aut.VERSION_AUTORIZACIONES);
    expect(modulo.TEXTOS_AUTORIZACION).toEqual(aut.TEXTOS[aut.VERSION_AUTORIZACIONES]);
  });

  // Contrato (lib/mensajes), sin rutas.
  const FILA = {
    nombre: 'Ana Gomez', tipo_documento: 'CC', documento: '1012345678',
    gym_nombre: 'Gym Demo', gym_telefono: '6015551234', gym_email: 'pqr@gymdemo.co', gym_dias_aviso: 3,
    tipo_plan: 'MENSUAL', fecha_inicio: '2026-11-01', fecha_fin: '2026-12-01',
    valor_total: '80000', valor_pagado: '80000', metodo_pago: 'NEQUI', estado_pago: 'PAGADO',
    acepto_terminos: true, fecha_registro: new Date('2026-11-01T14:00:00Z'),
  };
  const TERMINOS = { otorgada: true, fecha: new Date('2026-11-01T14:00:00Z'), canal: 'PANEL', version_texto: 'v2' };
  const clausula = (secciones, titulo) => secciones.find((s) => s.titulo.startsWith(titulo));

  test('(8) la clausula 12 dice si acepto mensajes comerciales y como cancelarlos', () => {
    const no = clausula(seccionesContrato(datosContrato(FILA, { TERMINOS })), 'Datos personales');
    expect(no.numero).toBe(12);
    expect(no.texto).toMatch(/mensajes comerciales \(opcional\), no\./);
    expect(no.texto).toMatch(/con el enlace que va al final de cada uno/);
    expect(no.texto).toMatch(/nunca los domingos ni los festivos/);
    const si = clausula(seccionesContrato(datosContrato(FILA, {
      TERMINOS, MENSAJES_COMERCIALES: { otorgada: true, canales_autorizados: ['EMAIL', 'WHATSAPP'] },
    })), 'Datos personales');
    expect(si.texto).toMatch(/mensajes comerciales \(opcional\), sí, por WhatsApp y correo\./);
  });

  test('(9) sin plan la numeracion no se corre: la 6 es Congelamiento, la 11 PQR y hay 15', () => {
    const s = seccionesContrato(datosContrato({ ...FILA, tipo_plan: null }, { TERMINOS }));
    expect(s).toHaveLength(15);
    expect(s.map((x) => x.numero)).toEqual([...Array(15)].map((_, i) => i + 1));
    expect(s[3].titulo).toBe('Precio total y forma de pago');
    expect(s[5].titulo).toBe('Congelamiento');
    expect(s[7].titulo).toBe('Terminación por el miembro');
    expect(s[10].titulo).toMatch(/^Peticiones, quejas y reclamos/);
  });

  test('(10) la clausula 10 incluye las demas obligaciones de ley', () => {
    expect(clausula(seccionesContrato(datosContrato(FILA, { TERMINOS })), 'Salud').texto)
      .toMatch(/y por las demás obligaciones que le impone la ley/);
  });

  test('(10) para un menor, la clausula 15 dice que acepto su representante', () => {
    const menor = { ...FILA, es_menor: true, ...REP };
    const s = clausula(seccionesContrato(datosContrato(menor, { TERMINOS })), 'Entrega');
    expect(s.texto).toMatch(/^Tu representante legal, Marta Ruiz, aceptó las condiciones del gimnasio en tu nombre el 01 de noviembre de 2026/);
    const adulto = clausula(seccionesContrato(datosContrato(FILA, { TERMINOS })), 'Entrega');
    expect(adulto.texto).toMatch(/^Aceptaste las condiciones del gimnasio el/);
  });

  test('el contrato sube de version por estos cambios', () => {
    expect(CONTRATO_VERSION).toBe('v3');
  });
});
