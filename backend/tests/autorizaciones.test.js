/**
 * RQNF-17: autorizacion separada y opcional de datos sensibles, menores de
 * edad con representante legal y prueba de cada autorizacion (fecha, version
 * del texto y canal). Ley 1581 de 2012, arts. 5, 6 y 7; Decreto 1377 de 2013,
 * arts. 6, 7, 8 y 12.
 *
 * Corre contra una base falsa con estado (tests/helpers/bd-falsa-legal.js):
 * se mira que filas quedan en miembro y autorizacion_miembro.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { crearBdFalsa } = require('./helpers/bd-falsa-legal');

let mockBd;
jest.mock('../src/db/db', () => ({
  query: (...a) => mockBd.query(...a),
  connect: () => mockBd.connect(),
}));
jest.mock('../src/lib/email', () => ({ sendMemberQR: jest.fn(async () => {}) }));
jest.mock('../src/lib/whatsapp', () => ({
  sendWhatsAppQR: jest.fn(async () => {}),
  sendWhatsAppText: jest.fn(async () => {}),
  isWhatsAppReady: () => true,
}));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const miembrosRouter = require('../src/routes/miembros');
const clienteRouter = require('../src/routes/cliente');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');
const { esMenorDeEdad, edadEnAnios, fechaNacimientoValida, hoyEnBogota } = require('../src/lib/autorizaciones');

const GYM_A = 7;
const GYM_B = 9;
const staff = (id, gymId, role = 'receptionist') => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
const cliente = (idMiembro, gymId) => jwt.sign({ role: 'cliente', idMiembro, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
const RECEP_A = staff(21, GYM_A);
const RECEP_B = staff(31, GYM_B);

/** Fecha de nacimiento para alguien que hoy tiene `anos` anos. */
function nacidoHace(anos) {
  const [y, m, d] = hoyEnBogota().split('-').map(Number);
  const f = new Date(Date.UTC(y - anos, m - 1, d));
  f.setUTCDate(f.getUTCDate() - 10); // ya cumplio
  return f.toISOString().slice(0, 10);
}

const ALTA = {
  nombre: 'Ana Gomez',
  tipo_documento: 'CC',
  documento: '1012345678',
  telefono: '3001234567',
  fecha_nacimiento: nacidoHace(30),
  condiciones_medicas: 'Asma leve',
  alergias: 'Penicilina',
  tipo_plan: 'MENSUAL',
  fecha_inicio: '2026-11-01',
  valor_total: '80000',
  valor_pagado: '80000',
  metodo_pago: 'NEQUI',
  acepto_terminos: true,
  autorizo_datos: true,
};

const REPRESENTANTE = {
  representante_nombre: 'Marta Ruiz',
  representante_tipo_documento: 'CC',
  representante_documento: '52123456',
  representante_parentesco: 'Madre',
  representante_telefono: '3109876543',
};

let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: p.role === 'admin' ? 'ADMINISTRADOR' : 'RECEPCIONISTA' }));
  const app = express();
  app.use(express.json());
  app.use('/api/cliente', clienteRouter);
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
  mockBd.agregarGimnasio({ id_gimnasio: GYM_A, nombre: 'Gym A', telefono: '6011111111' });
  mockBd.agregarGimnasio({ id_gimnasio: GYM_B, nombre: 'Gym B', telefono: '6022222222' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
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
const autorizacionesDe = (id) => mockBd.autorizaciones.filter((a) => a.id_miembro === id);
const porTipo = (id) => Object.fromEntries(autorizacionesDe(id).map((a) => [a.tipo, a]));

// ---------------------------------------------------------------------------
describe('edad y menores (lib/autorizaciones)', () => {
  test('cuenta la edad cumplida y usa la TI cuando no hay fecha', () => {
    expect(edadEnAnios('2008-11-18', '2026-11-17')).toBe(17); // cumple manana
    expect(edadEnAnios('2008-11-17', '2026-11-17')).toBe(18);
    expect(esMenorDeEdad({ fecha_nacimiento: '2008-11-18' }, '2026-11-17')).toBe(true);
    expect(esMenorDeEdad({ fecha_nacimiento: '2008-11-17' }, '2026-11-17')).toBe(false);
    expect(esMenorDeEdad({ tipo_documento: 'TI' })).toBe(true);
    expect(esMenorDeEdad({ tipo_documento: 'CC' })).toBe(false);
  });

  test('rechaza fechas mal escritas, imposibles o futuras', () => {
    expect(fechaNacimientoValida('2010-05-04', '2026-11-17')).toBe(true);
    expect(fechaNacimientoValida('04/05/2010', '2026-11-17')).toBe(false);
    expect(fechaNacimientoValida('2010-02-31', '2026-11-17')).toBe(false);
    expect(fechaNacimientoValida('2027-01-01', '2026-11-17')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('alta en el panel: POST /api/admin/miembros', () => {
  test('adulto sin autorizar datos sensibles: no guarda condiciones ni alergias y deja la prueba de cada autorizacion', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, ALTA);
    expect(r.status).toBe(201);
    expect(r.body.datos_sensibles_descartados).toBe(true);
    expect(r.body.message).toMatch(/No se guardaron las condiciones médicas/);

    const id = r.body.miembro.id_miembro;
    const m = mockBd.miembros.get(id);
    expect(m.condiciones_medicas).toBeNull();
    expect(m.alergias).toBeNull();
    expect(m.acepto_terminos).toBe(true);  // los booleanos viejos se siguen llenando
    expect(m.autorizo_datos).toBe(true);
    expect(m.representante_nombre).toBeNull();

    const a = porTipo(id);
    expect(Object.keys(a).sort()).toEqual(['DATOS_SENSIBLES', 'TERMINOS', 'TRATAMIENTO_DATOS']);
    expect(a.DATOS_SENSIBLES).toMatchObject({ otorgada: false, version_texto: 'v2', canal: 'PANEL', registrada_por: 21, id_gimnasio: GYM_A });
    expect(a.TERMINOS).toMatchObject({ otorgada: true, version_texto: 'v2', canal: 'PANEL' });
    expect(a.TRATAMIENTO_DATOS).toMatchObject({ otorgada: true });
    for (const fila of Object.values(a)) expect(fila.fecha).toBeInstanceOf(Date);

    // Todo en una transaccion: BEGIN, miembro, plan, autorizaciones, COMMIT.
    const sqls = mockBd.sqls();
    const i = (re) => sqls.findIndex((q) => re.test(q));
    expect(i(/^BEGIN$/)).toBeLessThan(i(/^INSERT INTO miembro/));
    expect(i(/^INSERT INTO plan_cobro/)).toBeLessThan(i(/^INSERT INTO autorizacion_miembro/));
    expect(i(/^INSERT INTO autorizacion_miembro/)).toBeLessThan(i(/^COMMIT$/));
  });

  test('adulto que autoriza datos sensibles: los guarda y la autorizacion queda otorgada', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, autorizo_datos_sensibles: true });
    expect(r.status).toBe(201);
    expect(r.body.datos_sensibles_descartados).toBe(false);
    const id = r.body.miembro.id_miembro;
    expect(mockBd.miembros.get(id)).toMatchObject({ condiciones_medicas: 'Asma leve', alergias: 'Penicilina' });
    expect(porTipo(id).DATOS_SENSIBLES).toMatchObject({ otorgada: true, version_texto: 'v2', canal: 'PANEL' });
  });

  test('menor sin representante: 400 REPRESENTANTE_REQUERIDO y no escribe nada', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, tipo_documento: 'TI', fecha_nacimiento: nacidoHace(15) });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REPRESENTANTE_REQUERIDO');
    expect(r.body.error).toMatch(/representante legal/i);
    expect(mockBd.miembros.size).toBe(0);
    expect(mockBd.autorizaciones).toHaveLength(0);
    expect(mockBd.conexiones).toBe(0);
  });

  test('menor con los datos del representante pero sin su autorizacion: 400', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, fecha_nacimiento: nacidoHace(16), ...REPRESENTANTE });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REPRESENTANTE_REQUERIDO');
    expect(r.body.error).toMatch(/autorización de su representante/);
    expect(mockBd.miembros.size).toBe(0);
  });

  test('menor con representante incompleto (sin telefono): 400 con el campo que falta', async () => {
    const { representante_telefono: _t, ...sinTel } = REPRESENTANTE;
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, fecha_nacimiento: nacidoHace(16), ...sinTel, autoriza_representante: true });
    expect(r.status).toBe(400);
    expect(r.body.details.issues.map((x) => x.path[0])).toContain('representante_telefono');
  });

  test('tarjeta de identidad sin fecha de nacimiento cuenta como menor', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, tipo_documento: 'TI', fecha_nacimiento: '' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REPRESENTANTE_REQUERIDO');
  });

  test('fecha de nacimiento mal escrita o futura: 400 (no deja pasar a un menor por adulto)', async () => {
    for (const fecha of ['15/03/2012', '2099-01-01']) {
      const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, fecha_nacimiento: fecha });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/fecha de nacimiento no es válida/);
    }
    expect(mockBd.miembros.size).toBe(0);
  });

  test('menor con representante y su autorizacion: 201, guarda al representante y la foto de sus datos', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, {
      ...ALTA, fecha_nacimiento: nacidoHace(15), ...REPRESENTANTE, representante_nombre: '  Marta Ruiz  ',
      autoriza_representante: true, autorizo_datos_sensibles: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.menor_de_edad).toBe(true);
    const id = r.body.miembro.id_miembro;
    expect(mockBd.miembros.get(id)).toMatchObject({ ...REPRESENTANTE, condiciones_medicas: 'Asma leve' });

    const a = porTipo(id);
    expect(a.REPRESENTANTE_MENOR).toMatchObject({ otorgada: true, version_texto: 'v2', canal: 'PANEL', registrada_por: 21 });
    expect(a.REPRESENTANTE_MENOR.detalle).toMatchObject({ ...REPRESENTANTE, edad_miembro: 15 });
    // Las demas las da el representante.
    for (const t of ['TERMINOS', 'TRATAMIENTO_DATOS', 'DATOS_SENSIBLES']) {
      expect(a[t].detalle).toEqual({ otorgada_por: 'REPRESENTANTE_LEGAL' });
    }
  });

  test('adulto que trae datos de representante: no se guardan', async () => {
    const r = await pedir('POST', '/api/admin/miembros', RECEP_A, { ...ALTA, ...REPRESENTANTE, autoriza_representante: true });
    expect(r.status).toBe(201);
    const id = r.body.miembro.id_miembro;
    expect(mockBd.miembros.get(id).representante_nombre).toBeNull();
    expect(porTipo(id).REPRESENTANTE_MENOR).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('edicion en el panel: PUT /api/admin/miembros/:id', () => {
  const crearAdulto = (extra = {}) => mockBd.agregarMiembro({
    id_miembro: 50, id_gimnasio: GYM_A, nombre: 'Luis Perez', fecha_nacimiento: nacidoHace(40),
    condiciones_medicas: 'Hipertension', alergias: 'Mani', ...extra,
  });

  test('revocar la autorizacion de datos sensibles borra esos datos y deja constancia en el historial', async () => {
    crearAdulto();
    mockBd.agregarAutorizacion({ id_miembro: 50, id_gimnasio: GYM_A, tipo: 'DATOS_SENSIBLES', otorgada: true, registrada_por: 21 });

    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, {
      nombre: 'Luis Perez', autorizo_datos_sensibles: false, condiciones_medicas: 'Hipertension', alergias: 'Mani',
    });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/Se revocó la autorización de datos sensibles/);
    expect(r.body.datos_sensibles_borrados).toBe(true);
    expect(mockBd.miembros.get(50)).toMatchObject({ condiciones_medicas: null, alergias: null });

    // Historial: la otorgada y la revocacion, la mas reciente primero.
    const h = r.body.autorizaciones.historial.filter((x) => x.tipo === 'DATOS_SENSIBLES');
    expect(h.map((x) => x.otorgada)).toEqual([false, true]);
    expect(h[0]).toMatchObject({ canal: 'PANEL', version: 'v2', registrada_por: 'Usuario 21' });
    expect(r.body.autorizaciones.vigentes.DATOS_SENSIBLES.otorgada).toBe(false);
  });

  test('otorgarla en la edicion guarda los datos de salud que vienen', async () => {
    crearAdulto({ condiciones_medicas: null, alergias: null });
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, {
      autorizo_datos_sensibles: true, condiciones_medicas: 'Rodilla operada', alergias: '',
    });
    expect(r.status).toBe(200);
    expect(mockBd.miembros.get(50)).toMatchObject({ condiciones_medicas: 'Rodilla operada', alergias: null });
    expect(autorizacionesDe(50).map((a) => [a.tipo, a.otorgada])).toEqual([['DATOS_SENSIBLES', true]]);
  });

  test('datos de salud viejos sin autorizacion: se borran al guardar sin marcarla, sin inventar una revocacion', async () => {
    crearAdulto();
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { condiciones_medicas: 'Hipertension', alergias: 'Mani' });
    expect(r.status).toBe(200);
    expect(r.body.datos_sensibles_borrados).toBe(true);
    expect(r.body.message).toMatch(/Sin autorización de datos sensibles/);
    expect(mockBd.miembros.get(50)).toMatchObject({ condiciones_medicas: null, alergias: null });
    expect(autorizacionesDe(50)).toHaveLength(0);
  });

  test('una edicion sin campos de RQNF-17 sigue el camino simple (sin transaccion)', async () => {
    crearAdulto();
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { nombre: 'Luis P.', fecha_nacimiento: '' });
    expect(r.status).toBe(200);
    expect(mockBd.conexiones).toBe(0);
    expect(mockBd.miembros.get(50)).toMatchObject({ nombre: 'Luis P.', condiciones_medicas: 'Hipertension' });
  });

  test('menor: cambiar al representante exige marcar de nuevo su autorizacion', async () => {
    mockBd.agregarMiembro({ id_miembro: 60, id_gimnasio: GYM_A, nombre: 'Sofi', tipo_documento: 'TI', fecha_nacimiento: nacidoHace(14), ...REPRESENTANTE });
    mockBd.agregarAutorizacion({ id_miembro: 60, id_gimnasio: GYM_A, tipo: 'REPRESENTANTE_MENOR', otorgada: true });

    // Mismos datos: no hace falta volver a autorizar.
    const igual = await pedir('PUT', '/api/admin/miembros/60', RECEP_A, { ...REPRESENTANTE, nombre: 'Sofia' });
    expect(igual.status).toBe(200);
    expect(autorizacionesDe(60)).toHaveLength(1);

    const sin = await pedir('PUT', '/api/admin/miembros/60', RECEP_A, { ...REPRESENTANTE, representante_nombre: 'Pedro Ruiz', representante_parentesco: 'Padre' });
    expect(sin.status).toBe(400);
    expect(sin.body.code).toBe('REPRESENTANTE_REQUERIDO');
    expect(mockBd.miembros.get(60).representante_nombre).toBe('Marta Ruiz');

    const con = await pedir('PUT', '/api/admin/miembros/60', RECEP_A, {
      ...REPRESENTANTE, representante_nombre: 'Pedro Ruiz', representante_parentesco: 'Padre', autoriza_representante: true,
    });
    expect(con.status).toBe(200);
    expect(mockBd.miembros.get(60)).toMatchObject({ representante_nombre: 'Pedro Ruiz', representante_parentesco: 'Padre' });
    const reps = autorizacionesDe(60).filter((a) => a.tipo === 'REPRESENTANTE_MENOR');
    expect(reps).toHaveLength(2);
    expect(reps[1].detalle).toMatchObject({ representante_nombre: 'Pedro Ruiz', edad_miembro: 14 });
  });

  test('poner una fecha de nacimiento de menor sin representante: 400', async () => {
    crearAdulto();
    const r = await pedir('PUT', '/api/admin/miembros/50', RECEP_A, { fecha_nacimiento: nacidoHace(12) });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REPRESENTANTE_REQUERIDO');
  });
});

// ---------------------------------------------------------------------------
describe('aislamiento entre gimnasios en el panel', () => {
  beforeEach(() => {
    mockBd.agregarMiembro({ id_miembro: 50, id_gimnasio: GYM_A, nombre: 'Luis Perez', fecha_nacimiento: nacidoHace(40), condiciones_medicas: 'Asma' });
    mockBd.agregarAutorizacion({ id_miembro: 50, id_gimnasio: GYM_A, tipo: 'DATOS_SENSIBLES', otorgada: true });
  });

  test('otro gimnasio no puede revocar ni ver: 404 y no escribe nada', async () => {
    const put = await pedir('PUT', '/api/admin/miembros/50', RECEP_B, { autorizo_datos_sensibles: false });
    expect(put.status).toBe(404);
    expect(mockBd.miembros.get(50).condiciones_medicas).toBe('Asma');
    expect(autorizacionesDe(50)).toHaveLength(1);

    const get = await pedir('GET', '/api/admin/miembros/50', RECEP_B);
    expect(get.status).toBe(404);
  });

  test('GET del propio gimnasio trae autorizaciones vigentes, historial y el aviso de datos viejos', async () => {
    mockBd.agregarMiembro({ id_miembro: 51, id_gimnasio: GYM_A, nombre: 'Viejo', fecha_nacimiento: nacidoHace(50), alergias: 'Polen' });
    const r = await pedir('GET', '/api/admin/miembros/51', RECEP_A);
    expect(r.status).toBe(200);
    expect(r.body.miembro).toMatchObject({ autorizo_datos_sensibles: false, datos_sensibles_sin_autorizacion: true, menor_de_edad: false });
    expect(r.body.autorizaciones.historial).toEqual([]);

    const r50 = await pedir('GET', '/api/admin/miembros/50', RECEP_A);
    expect(r50.body.miembro.autorizo_datos_sensibles).toBe(true);
    expect(r50.body.autorizaciones.vigentes.DATOS_SENSIBLES).toMatchObject({ otorgada: true, version: 'v1', texto: expect.stringMatching(/no estoy obligado/) });
    // Las consultas de autorizaciones filtran por miembro y gimnasio.
    for (const [sql, params] of mockBd.log.filter(([q]) => /FROM autorizacion_miembro/.test(q))) {
      expect(sql).toMatch(/a\.id_miembro = \$1 AND a\.id_gimnasio = \$2/);
      expect(params[1]).toBe(GYM_A);
    }
  });
});

// ---------------------------------------------------------------------------
describe('app del miembro: /api/cliente/autorizaciones', () => {
  beforeEach(() => {
    mockBd.agregarMiembro({ id_miembro: 70, id_gimnasio: GYM_A, nombre: 'Ana', fecha_nacimiento: nacidoHace(25), condiciones_medicas: 'Asma', alergias: 'Polvo' });
    mockBd.agregarAutorizacion({ id_miembro: 70, id_gimnasio: GYM_A, tipo: 'TERMINOS', otorgada: true });
    mockBd.agregarAutorizacion({ id_miembro: 70, id_gimnasio: GYM_A, tipo: 'DATOS_SENSIBLES', otorgada: true });
    // Otro miembro, de otro gimnasio, con sus propias autorizaciones.
    mockBd.agregarMiembro({ id_miembro: 80, id_gimnasio: GYM_B, nombre: 'Beto', fecha_nacimiento: nacidoHace(30) });
    mockBd.agregarAutorizacion({ id_miembro: 80, id_gimnasio: GYM_B, tipo: 'DATOS_SENSIBLES', otorgada: false });
  });

  test('el miembro ve solo lo suyo, con el texto de cada version', async () => {
    const r = await pedir('GET', '/api/cliente/autorizaciones', cliente(70, GYM_A));
    expect(r.status).toBe(200);
    expect(r.body.vigentes.TERMINOS).toMatchObject({ otorgada: true, version: 'v1', canal: 'PANEL' });
    expect(r.body.vigentes.DATOS_SENSIBLES.texto).toMatch(/no estoy obligado/);
    expect(r.body.historial).toHaveLength(2);
    expect(r.body.puede_revocar_datos_sensibles).toBe(true);
    expect(r.body.textos_actuales.DATOS_SENSIBLES).toMatch(/datos sensibles/);
    for (const [, params] of mockBd.log.filter(([q]) => /FROM autorizacion_miembro|FROM miembro/.test(q))) {
      expect(params.slice(0, 2)).toEqual([70, GYM_A]);
    }
  });

  test('un token con el id de otro miembro pero de otro gimnasio no ve nada: 404', async () => {
    const r = await pedir('GET', '/api/cliente/autorizaciones', cliente(70, GYM_B));
    expect(r.status).toBe(404);
  });

  test('un token del personal no entra a la ruta del miembro: 403', async () => {
    const r = await pedir('GET', '/api/cliente/autorizaciones', RECEP_A);
    expect(r.status).toBe(403);
  });

  test('revocar desde la app: fila con canal APP, sin usuario del personal, y borra los datos de salud', async () => {
    const r = await pedir('PATCH', '/api/cliente/autorizaciones/datos-sensibles', cliente(70, GYM_A), { otorgada: false });
    expect(r.status).toBe(200);
    expect(r.body.cambio).toBe(true);
    expect(r.body.message).toMatch(/Revocaste la autorización/);
    expect(mockBd.miembros.get(70)).toMatchObject({ condiciones_medicas: null, alergias: null });
    const ultima = autorizacionesDe(70).at(-1);
    expect(ultima).toMatchObject({ tipo: 'DATOS_SENSIBLES', otorgada: false, canal: 'APP', registrada_por: null, version_texto: 'v2' });
    expect(r.body.vigentes.DATOS_SENSIBLES.otorgada).toBe(false);
    expect(r.body.historial.map((h) => [h.tipo, h.otorgada, h.canal])[0]).toEqual(['DATOS_SENSIBLES', false, 'APP']);
    // El miembro del otro gimnasio no se toco.
    expect(autorizacionesDe(80)).toHaveLength(1);
  });

  test('revocar dos veces no duplica la constancia', async () => {
    await pedir('PATCH', '/api/cliente/autorizaciones/datos-sensibles', cliente(70, GYM_A), { otorgada: false });
    const r = await pedir('PATCH', '/api/cliente/autorizaciones/datos-sensibles', cliente(70, GYM_A), { otorgada: false });
    expect(r.status).toBe(200);
    expect(r.body.cambio).toBe(false);
    expect(autorizacionesDe(70).filter((a) => a.tipo === 'DATOS_SENSIBLES')).toHaveLength(2);
  });

  test('un menor no puede otorgarla desde la app: 403 y no escribe nada', async () => {
    mockBd.agregarMiembro({ id_miembro: 71, id_gimnasio: GYM_A, nombre: 'Sofi', tipo_documento: 'TI', fecha_nacimiento: nacidoHace(14), ...REPRESENTANTE });
    const r = await pedir('PATCH', '/api/cliente/autorizaciones/datos-sensibles', cliente(71, GYM_A), { otorgada: true });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('REPRESENTANTE_REQUERIDO');
    expect(autorizacionesDe(71)).toHaveLength(0);
  });

  test('cuerpo invalido: 400', async () => {
    const r = await pedir('PATCH', '/api/cliente/autorizaciones/datos-sensibles', cliente(70, GYM_A), { otorgada: 'no' });
    expect(r.status).toBe(400);
  });

  test('PUT /me sin la autorizacion: condiciones y alergias quedan en NULL', async () => {
    mockBd.agregarMiembro({ id_miembro: 72, id_gimnasio: GYM_A, nombre: 'Caro', fecha_nacimiento: nacidoHace(33) });
    const r = await pedir('PUT', '/api/cliente/me', cliente(72, GYM_A), { condiciones_medicas: 'Diabetes', alergias: 'Gluten', objetivo: 'Fuerza' });
    expect(r.status).toBe(200);
    expect(r.body.datos_sensibles_descartados).toBe(true);
    expect(mockBd.miembros.get(72)).toMatchObject({ condiciones_medicas: null, alergias: null, objetivo: 'Fuerza' });
  });

  test('PUT /me con la autorizacion: los guarda', async () => {
    const r = await pedir('PUT', '/api/cliente/me', cliente(70, GYM_A), { condiciones_medicas: 'Asma moderada' });
    expect(r.status).toBe(200);
    expect(r.body.datos_sensibles_descartados).toBe(false);
    expect(mockBd.miembros.get(70).condiciones_medicas).toBe('Asma moderada');
  });
});
