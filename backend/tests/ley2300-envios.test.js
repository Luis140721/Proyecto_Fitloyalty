/**
 * RQNF-16 (Ley 2300 de 2023) en POST /api/admin/notificaciones/enviado
 * (RQF-09): antes de registrar un envio se revisa el horario, la frecuencia
 * y, si es comercial, la aceptacion y el canal. Si no se puede, 409
 * CONTACTO_NO_PERMITIDO y no se guarda nada.
 *
 * Base falsa: un miembro, su autorizacion comercial (o ninguna) y los
 * contactos de la semana.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({
  query: (...a) => mockQuery(...a),
  connect: async () => ({ query: (...a) => mockQuery(...a), release: () => {} }),
}));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const legal = require('../src/lib/contacto-legal');
const notifRouter = require('../src/routes/notificaciones');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');
const { verificarTokenBaja } = require('../src/lib/baja-mensajes');

const co = (texto) => new Date(`${texto.replace(' ', 'T')}:00-05:00`);
const MARTES = co('2026-11-17 10:00');
const RECEP = jwt.sign({ id: 2, role: 'receptionist', gymId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });

let server, base;
beforeAll((done) => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'RECEPCIONISTA' }));
  const app = express();
  app.use(express.json());
  app.use('/api', notifRouter);
  app.use(errorHandler);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll(() => new Promise((resolve) => {
  legal.establecerReloj(null);
  establecerBusquedaPersonal(null);
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

function prepararBD({ comercial = null, contactos = [] } = {}) {
  const estado = { envios: [] };
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
    if (/pg_advisory_xact_lock/.test(s)) return { rows: [] };
    if (/^SELECT id_miembro, nombre FROM miembro/.test(s)) return { rows: [{ id_miembro: 12, nombre: 'Ana Gomez' }] };
    if (/FROM autorizacion_miembro a/.test(s)) {
      return { rows: comercial ? [{ id_miembro: 12, otorgada: comercial.otorgada, canales_autorizados: comercial.canales, canal: 'APP', version_texto: 'v2', fecha: co('2026-11-01 09:00') }] : [] };
    }
    if (/FROM envio_mensaje e/.test(s)) return { rows: contactos.filter((c) => c.fecha >= params[1]).map((c) => ({ id_miembro: 12, ...c })) };
    if (/to_regclass/.test(s)) return { rows: [{ existe: false }] };
    if (/^SELECT id_canal FROM canal_comunicacion/.test(s)) return { rows: [{ id_canal: 4 }] };
    if (/^INSERT INTO envio_mensaje/.test(s)) {
      estado.envios.push(params);
      return { rows: [{ id_envio: 900, estado: 'ENVIADO', fecha_envio: params[8] }] };
    }
    if (/^INSERT INTO notificacion/.test(s)) return { rowCount: 1 };
    throw new Error(`Consulta inesperada: ${s.slice(0, 80)}`);
  });
  return estado;
}

const enviar = async (body) => {
  const r = await fetch(`${base}/api/admin/notificaciones/enviado`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RECEP}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idMiembro: 12, mensaje: 'Hola Ana', ...body }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

beforeEach(() => {
  legal.establecerReloj(() => MARTES);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const ACEPTA_WA = { otorgada: true, canales: ['WHATSAPP'] };

describe('mensajes comerciales (en riesgo, reto completado o sin tipo)', () => {
  test.each(['riesgo', 'reto-completado', undefined])('tipo %s sin aceptacion: 409 NO_AUTORIZA y no guarda nada', async (tipo) => {
    const estado = prepararBD();
    const r = await enviar({ tipo });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'CONTACTO_NO_PERMITIDO', details: { motivo: 'NO_AUTORIZA', clase: 'COMERCIAL' } });
    expect(estado.envios).toHaveLength(0);
  });

  test('con aceptacion por WhatsApp: 201 y, antes de abrir, el texto trae el enlace de baja', async () => {
    const estado = prepararBD({ comercial: ACEPTA_WA });
    const r = await enviar({ tipo: 'riesgo', antesDeAbrir: true });
    expect(r.status).toBe(201);
    expect(r.body.clase).toBe('COMERCIAL');
    expect(r.body.mensaje).toMatch(/^Hola Ana\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: .*\/baja\//);
    expect(verificarTokenBaja(r.body.mensaje.split('/baja/')[1])).toEqual({ idMiembro: 12, idGimnasio: 7 });
    expect(estado.envios[0][6]).toBe(r.body.mensaje); // se guarda lo que se abre
  });

  test('aceptado solo por WhatsApp, por correo: 409 CANAL_NO_AUTORIZADO', async () => {
    prepararBD({ comercial: ACEPTA_WA });
    const r = await enviar({ tipo: 'riesgo', canal: 'EMAIL' });
    expect(r.body.details.motivo).toBe('CANAL_NO_AUTORIZADO');
  });
});

describe('avisos del plan (vencida, por vencer, acceso bloqueado)', () => {
  test.each(['vencida', 'por-vencer', 'acceso-bloqueado'])('%s sin aceptacion comercial: 201, sin enlace de baja', async (tipo) => {
    const estado = prepararBD();
    const r = await enviar({ tipo, antesDeAbrir: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ clase: 'AVISO', mensaje: 'Hola Ana' });
    expect(estado.envios).toHaveLength(1);
  });

  test('un aviso por correo: 409 (el contrato dice que el aviso va por WhatsApp)', async () => {
    prepararBD();
    const r = await enviar({ tipo: 'vencida', canal: 'EMAIL' });
    expect(r.body.details).toMatchObject({ motivo: 'CANAL_NO_AUTORIZADO', clase: 'AVISO' });
  });
});

describe('horario y frecuencia (para los dos)', () => {
  test.each([
    ['domingo', '2026-11-22 11:00', '2026-11-23 07:00'],
    ['festivo', '2026-11-16 11:00', '2026-11-17 07:00'],
    ['martes 7:00 p. m.', '2026-11-17 19:00', '2026-11-18 07:00'],
    ['sabado 3:00 p. m.', '2026-11-21 15:00', '2026-11-23 07:00'],
  ])('%s: 409 FUERA_DE_HORARIO con el siguiente horario', async (_, hora, siguiente) => {
    legal.establecerReloj(() => co(hora));
    const estado = prepararBD();
    const r = await enviar({ tipo: 'vencida' });
    expect(r.status).toBe(409);
    expect(r.body.details).toMatchObject({ motivo: 'FUERA_DE_HORARIO', siguiente: co(siguiente).toISOString() });
    expect(r.body.error).toMatch(/Ley 2300 de 2023/);
    expect(estado.envios).toHaveLength(0);
  });

  test('ya se le escribio hoy: 409 FRECUENCIA', async () => {
    prepararBD({ comercial: ACEPTA_WA, contactos: [{ canal: 'WHATSAPP', fecha: co('2026-11-17 08:00') }] });
    const r = await enviar({ tipo: 'vencida' });
    expect(r.body.details.motivo).toBe('FRECUENCIA');
    expect(r.body.error).toMatch(/una sola vez al día|un solo contacto al día/);
  });

  test('por correo esta semana y ahora por WhatsApp: 409 FRECUENCIA', async () => {
    prepararBD({ comercial: { otorgada: true, canales: ['WHATSAPP', 'EMAIL'] }, contactos: [{ canal: 'EMAIL', fecha: co('2026-11-16 09:00') }] });
    const r = await enviar({ tipo: 'riesgo' });
    expect(r.body.details.motivo).toBe('FRECUENCIA');
  });

  test('el envio se guarda con la hora del reloj de la ley, despues del bloqueo de contacto', async () => {
    const estado = prepararBD();
    await enviar({ tipo: 'vencida' });
    expect(estado.envios[0][8]).toEqual(MARTES);
    const sqls = mockQuery.mock.calls.map(([q]) => q);
    const i = (re) => sqls.findIndex((q) => re.test(q));
    expect(i(/hashtext\('contacto_miembro'\)/)).toBeLessThan(i(/FROM envio_mensaje e/));
    expect(i(/FROM envio_mensaje e/)).toBeLessThan(i(/INSERT INTO envio_mensaje/));
  });
});
