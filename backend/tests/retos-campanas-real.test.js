/**
 * RQF-10 (campanas), RQF-12 (retos) y el QR dinamico contra una base real.
 *
 * Levanta los routers reales (check-in, app del miembro, retos, campanas,
 * configuracion y notificaciones) sobre TEST_DATABASE_URL y los llama por HTTP.
 * Sirve con las dos formas de crear la base:
 *   - ConsultasDB/Query_Inicial_Crear_Tablas.sql + migraciones (produccion)
 *   - solo las migraciones de backend/migrations (Docker)
 *
 * Seguridad: igual que registro-envio-real.test.js. Sin TEST_DATABASE_URL se
 * salta entera (asi queda en CI) y se niega a correr si la base no es local.
 * Crea sus propios gimnasios y al final borra todo lo que creo.
 *
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55433/fl_consultas \
 *   npx jest tests/retos-campanas-real.test.js
 */
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const ConnectionParameters = require('pg/lib/connection-parameters');

const HOSTS_LOCALES = ['localhost', '127.0.0.1', '::1', '[::1]'];
function exigirBaseLocal(config) {
  const { host } = new ConnectionParameters(typeof config === 'string' ? { connectionString: config } : config);
  if (!HOSTS_LOCALES.includes(host)) {
    throw new Error(`Me niego: TEST_DATABASE_URL lleva a "${host}" y esta prueba solo corre contra una base local.`);
  }
}

const URL_PRUEBA = process.env.TEST_DATABASE_URL;
let poolReal;
if (URL_PRUEBA) {
  exigirBaseLocal(URL_PRUEBA);
  process.env.DATABASE_URL = URL_PRUEBA;
  process.env.DB_SSL = 'false';
  process.env.JWT_SECRET = 'prueba-real-local';
  poolReal = require('../src/db/db');
  exigirBaseLocal(poolReal.options);
}

jest.setTimeout(30000);

test('la guardia rechaza una base remota', () => {
  expect(() => exigirBaseLocal('postgres://u:c@ep-algo.neon.tech/neondb')).toThrow(/Me niego/);
  expect(() => exigirBaseLocal('postgres://u:c@127.0.0.1:55433/x')).not.toThrow();
});

const describeReal = URL_PRUEBA ? describe : describe.skip;

describeReal('RQF-10, RQF-12 y QR dinamico contra la base real', () => {
  let pool, server, base, establecerBusquedaPersonal, campanasRouter;
  const q = require('../src/lib/qr-dinamico');
  const sufijo = crypto.randomBytes(3).toString('hex');
  const gimnasios = [];
  let gymA, gymB, adminA, adminB, recepA, ana, beto, carla, eva;
  let tkAdminA, tkAdminB, tkRecepA, tkAna, tkCarla;
  const correos = [];
  const whatsapps = [];
  let whatsappActivo = false;

  const llamar = async (method, url, tk, body) => {
    const r = await fetch(base + url, {
      method,
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const uno = async (sql, params) => (await pool.query(sql, params)).rows[0];
  // RQNF-16 (Ley 2300): las campanas solo salen en horario y una vez al dia
  // por miembro. Cada prueba de campanas corre con el reloj de la ley en un
  // martes distinto a las 10:00 a. m. (otra semana), para que la frecuencia
  // de una no se mezcle con la siguiente.
  const legal = require('../src/lib/contacto-legal');
  let semana = 0;
  const otraSemana = () => {
    semana += 1;
    const t = legal.siguienteHorarioPermitido(new Date(Date.parse('2026-11-17T10:00:00-05:00') + semana * 7 * 86400000));
    legal.establecerReloj(() => t);
    return t;
  };
  const hoyMas = (d) => {
    // Fecha de Colombia (UTC-5) dentro de d dias, en AAAA-MM-DD.
    const ms = Date.now() - 5 * 3600 * 1000 + d * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  };

  async function crearGimnasio(nombre) {
    const g = await uno("INSERT INTO gimnasio (nombre, telefono) VALUES ($1, '3000000000') RETURNING id_gimnasio", [nombre]);
    gimnasios.push(g.id_gimnasio);
    return g.id_gimnasio;
  }
  async function crearUsuario(gymId, n, rol) {
    const { rows: c } = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'id_rol'"
    );
    const cols = ['id_gimnasio', 'nombre', 'email', 'password_hash', 'rol'];
    const vals = [gymId, `Personal ${n}`, `rq1012-${sufijo}-${n}@prueba.local`, 'x', rol];
    if (c.length > 0) { cols.push('id_rol'); vals.push(rol === 'ADMINISTRADOR' ? 1 : 2); }
    const u = await uno(
      `INSERT INTO usuario (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id_usuario`,
      vals
    );
    return u.id_usuario;
  }
  async function crearMiembro(gymId, nombre, n, { diasRegistro = 60, venceEn = 60, email = null } = {}) {
    const m = await uno(
      `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, email, codigo_qr, fecha_registro)
       VALUES ($1, $2, $3, '3001234567', $4, $5, NOW() - ($6 || ' days')::interval) RETURNING id_miembro`,
      [gymId, nombre, `rq1012-${sufijo}-${n}`, email, `QR-${sufijo}-${n}`, String(diasRegistro)]
    );
    await pool.query(
      `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, activo)
       VALUES ($1, $2, 'MENSUAL', $3::date, $4::date, TRUE)`,
      [m.id_miembro, gymId, hoyMas(-30), hoyMas(venceEn)]
    );
    return m.id_miembro;
  }
  async function checkinHace(idMiembro, gymId, dias) {
    await pool.query(
      `INSERT INTO checkin (id_miembro, id_gimnasio, metodo, valido, fecha_hora)
       VALUES ($1, $2, 'MANUAL', TRUE, NOW() - ($3 || ' days')::interval)`,
      [idMiembro, gymId, String(dias)]
    );
  }

  beforeAll(async () => {
    pool = poolReal;
    ({ establecerBusquedaPersonal } = require('../src/middleware/auth'));
    establecerBusquedaPersonal(async (payload) => {
      const { rows } = await pool.query(
        'SELECT activo, id_gimnasio, rol AS rol_nombre FROM usuario WHERE id_usuario = $1',
        [payload.id]
      );
      return rows[0] || null;
    });
    campanasRouter = require('../src/routes/campanas');
    campanasRouter.setDeps({
      enviarCorreo: async (to, asunto, texto) => { correos.push({ to, asunto, texto }); return { delivered: true }; },
      enviarWhatsapp: async (tel, texto) => { whatsapps.push({ tel, texto }); },
      whatsappActivo: () => whatsappActivo,
    });

    gymA = await crearGimnasio(`Prueba RQ10-12 A ${sufijo}`);
    gymB = await crearGimnasio(`Prueba RQ10-12 B ${sufijo}`);
    adminA = await crearUsuario(gymA, 'admin-a', 'ADMINISTRADOR');
    recepA = await crearUsuario(gymA, 'recep-a', 'RECEPCIONISTA');
    adminB = await crearUsuario(gymB, 'admin-b', 'ADMINISTRADOR');
    // Ana: activa y viene seguido. Beto: lleva 20 dias sin venir (INACTIVO).
    // Carla: se registro hoy (NUEVA) y su plan vence en 3 dias (PROXIMA A VENCER).
    ana = await crearMiembro(gymA, 'Ana Prueba', 'ana');
    beto = await crearMiembro(gymA, 'Beto Prueba', 'beto');
    carla = await crearMiembro(gymA, 'Carla Prueba', 'carla', { diasRegistro: 0, venceEn: 3, email: `carla-${sufijo}@prueba.local` });
    eva = await crearMiembro(gymB, 'Eva Otro Gym', 'eva', { diasRegistro: 0 });
    await checkinHace(ana, gymA, 1);
    await checkinHace(beto, gymA, 20);
    // RQNF-16: Ana, Beto y Carla aceptaron mensajes comerciales por WhatsApp y correo.
    for (const id of [ana, beto, carla]) {
      await pool.query(
        `INSERT INTO autorizacion_miembro (id_miembro, id_gimnasio, tipo, otorgada, version_texto, canal, canales_autorizados)
         VALUES ($1, $2, 'MENSAJES_COMERCIALES', TRUE, 'v2', 'APP', ARRAY['WHATSAPP', 'EMAIL']::varchar(20)[])`,
        [id, gymA]
      );
    }

    const firmar = (id, gymId, role) => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const firmarMiembro = (idMiembro, gymId) => jwt.sign({ idMiembro, gymId, role: 'cliente' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tkAdminA = firmar(adminA, gymA, 'admin');
    tkAdminB = firmar(adminB, gymB, 'admin');
    tkRecepA = firmar(recepA, gymA, 'receptionist');
    tkAna = firmarMiembro(ana, gymA);
    tkCarla = firmarMiembro(carla, gymA);

    const { errorHandler } = require('../src/middleware/errorHandler');
    const app = express();
    app.use(express.json());
    app.use('/api', require('../src/routes/checkin'));
    app.use('/api', require('../src/routes/config'));
    app.use('/api', require('../src/routes/notificaciones'));
    app.use('/api', require('../src/routes/retos'));
    app.use('/api', campanasRouter);
    app.use('/api/cliente', require('../src/routes/cliente'));
    app.use(errorHandler);
    await new Promise((resolve) => {
      server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });

  afterAll(async () => {
    legal.establecerReloj(null);
    if (establecerBusquedaPersonal) establecerBusquedaPersonal(null);
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (!pool) return;
    if (gimnasios.length > 0) {
      const g = [gimnasios];
      await pool.query('DELETE FROM envio_mensaje WHERE id_gimnasio = ANY($1::int[])', g);
      await pool.query('DELETE FROM campana_destinatario WHERE id_campana IN (SELECT id_campana FROM campana WHERE id_gimnasio = ANY($1::int[]))', g);
      await pool.query('DELETE FROM campana WHERE id_gimnasio = ANY($1::int[])', g);
      await pool.query('DELETE FROM plantilla_mensaje WHERE id_gimnasio = ANY($1::int[])', g);
      await pool.query('DELETE FROM reto_miembro WHERE id_reto IN (SELECT id_reto FROM reto WHERE id_gimnasio = ANY($1::int[]))', g);
      await pool.query('DELETE FROM reto WHERE id_gimnasio = ANY($1::int[])', g);
      await pool.query('DELETE FROM hito_miembro WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = ANY($1::int[]))', g).catch(() => {});
      for (const tabla of ['notificacion', 'canal_comunicacion', 'checkin', 'plan_cobro', 'alerta_abandono', 'autorizacion_miembro', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = ANY($1::int[])`, g);
      }
    }
    await pool.end();
  });

  // ================================================================ segmentos
  describe('segmentos (vista previa de campanas)', () => {
    const ver = (seg, dias) => llamar('GET', `/api/admin/campanas/segmento?segmento=${seg}${dias !== undefined ? `&dias=${dias}` : ''}`, tkAdminA);

    test('TODOS: los tres de su gimnasio y nadie de otro', async () => {
      const r = await ver('TODOS');
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(3);
      expect(r.body.muestra.map((m) => m.id_miembro)).not.toContain(eva);
    });
    test('INACTIVOS (7 dias): solo Beto', async () => {
      const r = await ver('INACTIVOS');
      expect(r.body.dias).toBe(7);
      expect(r.body.muestra.map((m) => m.id_miembro)).toEqual([beto]);
    });
    test('INACTIVOS con 30 dias: nadie', async () => {
      expect((await ver('INACTIVOS', 30)).body.total).toBe(0);
    });
    test('NUEVOS: solo Carla', async () => {
      expect((await ver('NUEVOS')).body.muestra.map((m) => m.id_miembro)).toEqual([carla]);
    });
    test('PROXIMOS_A_VENCER: solo Carla, que tiene correo', async () => {
      const r = await ver('PROXIMOS_A_VENCER');
      expect(r.body.muestra.map((m) => m.id_miembro)).toEqual([carla]);
      expect(r.body.con_correo).toBe(1);
    });
    test('ETIQUETA no se ofrece: 400', async () => {
      expect((await ver('ETIQUETA')).status).toBe(400);
    });
  });

  // ======================================================= QR dinamico
  describe('QR dinamico', () => {
    test('GET /cliente/qr trae los datos para calcular el codigo y coincide con el servidor', async () => {
      const r = await llamar('GET', '/api/cliente/qr', tkAna);
      expect(r.status).toBe(200);
      expect(r.body.dinamico.id).toBe(ana);
      expect(r.body.solo_dinamico).toBe(false);
      const { codigo } = q.leerToken(r.body.dinamico.codigo_actual);
      expect(q.codigoValido({ idMiembro: ana, codigoQr: `QR-${sufijo}-ana`, codigo })).toBe(true);
    });

    test('el administrador exige el QR dinamico desde Configuracion', async () => {
      const r = await llamar('PUT', '/api/admin/config', tkAdminA, { qr_dinamico_obligatorio: true });
      expect(r.status).toBe(200);
      expect(r.body.config.qr_dinamico_obligatorio).toBe(true);
      expect((await llamar('GET', '/api/cliente/qr', tkAna)).body.solo_dinamico).toBe(true);
    });

    test('con eso, el QR fijo ya no entra', async () => {
      const r = await llamar('POST', '/api/admin/checkin', tkRecepA, { codigo: `QR-${sufijo}-beto`, metodo: 'QR' });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('QR_ESTATICO_NO_PERMITIDO');
    });

    test('un codigo dinamico de hace 5 minutos tampoco', async () => {
      const viejo = q.tokenEn(ana, `QR-${sufijo}-ana`, Date.now() - 5 * 60000);
      const r = await llamar('POST', '/api/admin/checkin', tkRecepA, { codigo: viejo });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('QR_DINAMICO_VENCIDO');
    });

    test('el codigo de Ana no sirve en otro gimnasio', async () => {
      const tkAdminBRecep = jwt.sign({ id: adminB, role: 'admin', gymId: gymB }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const r = await llamar('POST', '/api/admin/checkin', tkAdminBRecep, { codigo: q.tokenEn(ana, `QR-${sufijo}-ana`) });
      expect(r.status).toBe(404);
    });
  });

  // ================================================================== retos
  describe('retos (RQF-12)', () => {
    let retoTodos, retoInactivos, retoNuevos;

    test('valida los datos al crear', async () => {
      const base = { nombre: 'Reto malo', meta_asistencias: 5, segmento_elegible: 'TODOS', fecha_inicio: hoyMas(0), fecha_fin: hoyMas(10) };
      expect((await llamar('POST', '/api/admin/retos', tkAdminA, { ...base, meta_asistencias: 0 })).status).toBe(400);
      expect((await llamar('POST', '/api/admin/retos', tkAdminA, { ...base, fecha_fin: hoyMas(-1) })).status).toBe(400);
      expect((await llamar('POST', '/api/admin/retos', tkAdminA, { ...base, fecha_inicio: hoyMas(-20), fecha_fin: hoyMas(-5) })).status).toBe(400);
      expect((await llamar('POST', '/api/admin/retos', tkAdminA, { ...base, segmento_elegible: 'ETIQUETA' })).status).toBe(400);
      expect((await llamar('POST', '/api/admin/retos', tkRecepA, base)).status).toBe(403);
    });

    test('crea un reto para todos (2 asistencias en 10 dias) y queda ACTIVO', async () => {
      const r = await llamar('POST', '/api/admin/retos', tkAdminA, {
        nombre: 'Dos visitas', descripcion: 'Ven dos veces', meta_asistencias: 2, recompensa: 'Batido gratis',
        segmento_elegible: 'TODOS', fecha_inicio: hoyMas(-3), fecha_fin: hoyMas(10),
      });
      expect(r.status).toBe(201);
      expect(r.body.reto.estado).toBe('ACTIVO');
      retoTodos = r.body.reto.id_reto;
      const futuro = await llamar('POST', '/api/admin/retos', tkAdminA, {
        nombre: 'Reto futuro', meta_asistencias: 3, segmento_elegible: 'TODOS', fecha_inicio: hoyMas(5), fecha_fin: hoyMas(15),
      });
      expect(futuro.body.reto.estado).toBe('PROGRAMADO');
    });

    test('check-in con el QR dinamico: inscribe a Ana, cuenta el ingreso de ayer y completa el reto', async () => {
      const r = await llamar('POST', '/api/admin/checkin', tkRecepA, { codigo: q.tokenEn(ana, `QR-${sufijo}-ana`) });
      expect(r.status).toBe(201);
      expect(r.body.qr_dinamico).toBe(true);
      expect(r.body.checkin.metodo).toBe('QR');
      const reto = r.body.retos.find((x) => x.id_reto === retoTodos);
      expect(reto).toMatchObject({ acumulados: 2, meta: 2, porcentaje: 100, completado: true, recompensa: 'Batido gratis' });
      expect(r.body.mensaje_retos).toContain('Completaste el reto «Dos visitas»');
      const fila = await uno('SELECT estado, checkins_acumulados, fecha_completado FROM reto_miembro WHERE id_reto = $1 AND id_miembro = $2', [retoTodos, ana]);
      expect(fila.estado).toBe('COMPLETADO');
      expect(fila.fecha_completado).not.toBeNull();
    });

    test('el administrador ve el aviso del reto completado en la campana y lo marca como visto', async () => {
      const r = await llamar('GET', '/api/admin/notificaciones', tkAdminA);
      expect(r.status).toBe(200);
      const aviso = r.body.avisos.find((a) => a.tipo === 'reto-completado');
      expect(aviso).toBeTruthy();
      expect(aviso.idMiembro).toBe(ana);
      expect(aviso.mensaje).toContain('Completaste el reto «Dos visitas»');
      const v = await llamar('POST', `/api/admin/notificaciones/reto/${aviso.idNotificacion}/leida`, tkAdminA);
      expect(v.status).toBe(200);
      const despues = await llamar('GET', '/api/admin/notificaciones', tkAdminA);
      expect(despues.body.avisos.find((a) => a.tipo === 'reto-completado')).toBeFalsy();
    });

    test('un segundo check-in el mismo dia no suma otra asistencia ni repite el aviso', async () => {
      await pool.query("UPDATE checkin SET fecha_hora = fecha_hora - INTERVAL '5 minutes' WHERE id_miembro = $1", [ana]);
      const r = await llamar('POST', '/api/admin/checkin', tkRecepA, { documento: `rq1012-${sufijo}-ana`, metodo: 'MANUAL' });
      expect(r.status).toBe(201);
      expect(r.body.retos.find((x) => x.id_reto === retoTodos)).toBeUndefined(); // ya no esta EN_CURSO
      const n = await uno("SELECT count(*)::int AS n FROM notificacion WHERE id_gimnasio = $1 AND tipo = 'RETO'", [gymA]);
      expect(n.n).toBe(1);
    });

    test('la app muestra el reto como completado', async () => {
      const r = await llamar('GET', '/api/cliente/retos', tkAna);
      const reto = r.body.retos.find((x) => x.id_reto === retoTodos);
      expect(reto.completado).toBe(true);
    });

    test('reto para inactivos: el administrador inscribe a los elegibles (solo Beto)', async () => {
      const c = await llamar('POST', '/api/admin/retos', tkAdminA, {
        nombre: 'Vuelve al gym', meta_asistencias: 3, segmento_elegible: 'INACTIVOS', fecha_inicio: hoyMas(0), fecha_fin: hoyMas(14),
      });
      retoInactivos = c.body.reto.id_reto;
      const e = await llamar('GET', `/api/admin/retos/${retoInactivos}/elegibles`, tkAdminA);
      expect(e.body.total).toBe(1);
      const r = await llamar('POST', `/api/admin/retos/${retoInactivos}/inscribir`, tkAdminA, {});
      expect(r.status).toBe(201);
      expect(r.body.inscritos).toBe(1);
      const p = await llamar('GET', `/api/admin/retos/${retoInactivos}/participantes`, tkAdminA);
      expect(p.body.participantes.map((x) => x.id_miembro)).toEqual([beto]);
      expect(p.body.participantes[0].checkins_acumulados).toBe(0);
    });

    test('Carla no puede unirse al de inactivos desde la app (403), pero si a uno de nuevos', async () => {
      const no = await llamar('POST', `/api/cliente/retos/${retoInactivos}/unirse`, tkCarla);
      expect(no.status).toBe(403);
      expect(no.body.code).toBe('RETO_NO_ELEGIBLE');
      const c = await llamar('POST', '/api/admin/retos', tkAdminA, {
        nombre: 'Primer mes', meta_asistencias: 8, segmento_elegible: 'NUEVOS', fecha_inicio: hoyMas(0), fecha_fin: hoyMas(30),
      });
      retoNuevos = c.body.reto.id_reto;
      const si = await llamar('POST', `/api/cliente/retos/${retoNuevos}/unirse`, tkCarla);
      expect(si.status).toBe(201);
      const otraVez = await llamar('POST', `/api/cliente/retos/${retoNuevos}/unirse`, tkCarla);
      expect(otraVez.status).toBe(409);
    });

    test('el check-in de Carla suma en su reto (1 de 8)', async () => {
      const r = await llamar('POST', '/api/admin/checkin', tkRecepA, { documento: `rq1012-${sufijo}-carla`, metodo: 'MANUAL' });
      expect(r.status).toBe(201);
      const reto = r.body.retos.find((x) => x.id_reto === retoNuevos);
      expect(reto).toMatchObject({ acumulados: 1, meta: 8, porcentaje: 12.5, completado: false });
      expect(r.body.mensaje_retos).toContain('1 de 8');
    });

    test('bajar la meta recalcula el avance', async () => {
      const r = await llamar('PUT', `/api/admin/retos/${retoNuevos}`, tkAdminA, { meta_asistencias: 1 });
      expect(r.status).toBe(200);
      const fila = await uno('SELECT estado FROM reto_miembro WHERE id_reto = $1 AND id_miembro = $2', [retoNuevos, carla]);
      expect(fila.estado).toBe('COMPLETADO');
    });

    test('lista con inscritos y completados; otro gimnasio no lo ve', async () => {
      const r = await llamar('GET', '/api/admin/retos', tkAdminA);
      // Al de TODOS se inscriben solos los que hacen check-in: Ana y Carla (Beto no ha venido).
      const fila = r.body.retos.find((x) => x.id_reto === retoTodos);
      expect(fila).toMatchObject({ inscritos: 2, completados: 1 });
      const otro = await llamar('GET', `/api/admin/retos/${retoTodos}/participantes`, tkAdminB);
      expect(otro.status).toBe(404);
    });

    test('cancelar un reto cancela las participaciones en curso', async () => {
      const r = await llamar('POST', `/api/admin/retos/${retoInactivos}/cancelar`, tkAdminA);
      expect(r.status).toBe(200);
      expect(r.body.reto.estado).toBe('CANCELADO');
      const fila = await uno('SELECT estado FROM reto_miembro WHERE id_reto = $1 AND id_miembro = $2', [retoInactivos, beto]);
      expect(fila.estado).toBe('CANCELADO');
      expect((await llamar('PUT', `/api/admin/retos/${retoInactivos}`, tkAdminA, { nombre: 'Otro' })).status).toBe(409);
    });

    test('un id no numerico responde 400, no 503', async () => {
      expect((await llamar('PUT', '/api/admin/retos/abc', tkAdminA, { nombre: 'X' })).status).toBe(400);
    });
  });

  // ================================================================ campanas
  describe('campanas y plantillas (RQF-10)', () => {
    let plantilla, campWa;
    beforeEach(() => { otraSemana(); });

    /** Primer dia habil (lunes a viernes, sin festivo) desde manana, a las 8:30 a. m. */
    const proximoHabil = () => {
      for (let d = 1; d < 15; d += 1) {
        const f = hoyMas(d);
        const dow = new Date(`${f}T12:00:00Z`).getUTCDay();
        if (dow >= 1 && dow <= 5 && !legal.festivo(f)) return `${f}T08:30`;
      }
      throw new Error('sin dia habil');
    };

    test('plantillas: crear, no repetir el nombre y listar', async () => {
      const r = await llamar('POST', '/api/admin/plantillas', tkAdminA, {
        nombre: 'Te extrañamos', contenido: 'Hola {primer_nombre}, en {gimnasio} te extrañamos: llevas {dias_sin_venir} días sin venir.',
      });
      expect(r.status).toBe(201);
      plantilla = r.body.plantilla.id_plantilla;
      expect((await llamar('POST', '/api/admin/plantillas', tkAdminA, { nombre: 'Te extrañamos', contenido: 'Otro texto aqui' })).status).toBe(409);
      const l = await llamar('GET', '/api/admin/plantillas', tkAdminA);
      expect(l.body.plantillas.map((p) => p.id_plantilla)).toContain(plantilla);
      expect(l.body.variables).toContain('primer_nombre');
      // Otro gimnasio no la ve ni la puede usar.
      expect((await llamar('GET', '/api/admin/plantillas', tkAdminB)).body.plantillas).toHaveLength(0);
      const ajena = await llamar('POST', '/api/admin/campanas', tkAdminB, { nombre: 'Robo', segmento: 'TODOS', id_plantilla: plantilla });
      expect(ajena.status).toBe(404);
    });

    test('campana MANUAL por WhatsApp a inactivos con la plantilla: sin WhatsApp en el servidor queda pendiente', async () => {
      const c = await llamar('POST', '/api/admin/campanas', tkAdminA, {
        nombre: 'Recuperar inactivos', segmento: 'INACTIVOS', canal: 'WHATSAPP', id_plantilla: plantilla, tipo_disparo: 'MANUAL',
      });
      expect(c.status).toBe(201);
      expect(c.body.campana.estado).toBe('PROGRAMADA');
      campWa = c.body.campana.id_campana;
      const r = await llamar('POST', `/api/admin/campanas/${campWa}/ejecutar`, tkAdminA);
      expect(r.status).toBe(200);
      expect(r.body.resumen).toMatchObject({ destinatarios: 1, enviados: 0, pendientes: 1, fallidos: 0 });
      expect(r.body.campana.estado).toBe('ENVIADA');
      expect(r.body.campana.fecha_ejecucion).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect((await llamar('POST', `/api/admin/campanas/${campWa}/ejecutar`, tkAdminA)).status).toBe(409);
    });

    test('destinatarios con el mensaje personalizado y el telefono para wa.me', async () => {
      const r = await llamar('GET', `/api/admin/campanas/${campWa}/destinatarios`, tkAdminA);
      expect(r.status).toBe(200);
      expect(r.body.destinatarios).toHaveLength(1);
      const d = r.body.destinatarios[0];
      expect(d).toMatchObject({ id_miembro: beto, estado_envio: 'PENDIENTE', telefono: '573001234567' });
      expect(d.mensaje).toContain('Hola Beto, en Prueba RQ10-12 A');
    });

    test('el envio a mano queda en envio_mensaje ligado a la campana', async () => {
      // RQNF-16: el texto lo arma el servidor (con el enlace de baja) y es el
      // que se abre en WhatsApp y queda registrado.
      const r = await llamar('POST', `/api/admin/campanas/${campWa}/destinatarios/${beto}/enviado`, tkAdminA, { mensaje: 'Hola Beto, te extrañamos.' });
      expect(r.status).toBe(201);
      expect(r.body.destinatario.estado_envio).toBe('ENVIADO');
      expect(r.body.mensaje).toMatch(/^Hola Beto, en Prueba RQ10-12 A .*\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: .*\/baja\//);
      const e = await uno(
        `SELECT e.estado, e.mensaje_copiado, e.id_plantilla, e.enviado_por, c.tipo
           FROM envio_mensaje e JOIN canal_comunicacion c ON c.id_canal = e.id_canal
          WHERE e.id_campana = $1 AND e.id_miembro = $2`,
        [campWa, beto]
      );
      expect(e).toMatchObject({ estado: 'ENVIADO', mensaje_copiado: r.body.mensaje, id_plantilla: plantilla, enviado_por: adminA, tipo: 'WHATSAPP' });
      expect((await llamar('POST', `/api/admin/campanas/${campWa}/destinatarios/${ana}/enviado`, tkAdminA, { mensaje: 'x' })).status).toBe(404);
    });

    test('campana por correo a proximos a vencer: sale por Brevo y queda ENVIADO', async () => {
      const c = await llamar('POST', '/api/admin/campanas', tkAdminA, {
        nombre: 'Renueva ya', segmento: 'PROXIMOS_A_VENCER', canal: 'EMAIL',
        mensaje: 'Hola {nombre}, tu plan vence el {fecha_vencimiento}.',
      });
      const r = await llamar('POST', `/api/admin/campanas/${c.body.campana.id_campana}/ejecutar`, tkAdminA);
      expect(r.body.resumen).toMatchObject({ destinatarios: 1, enviados: 1, canal: 'EMAIL' });
      const correo = correos.find((x) => x.to === `carla-${sufijo}@prueba.local`);
      expect(correo.texto).toMatch(/^Hola Carla Prueba, tu plan vence el \d{2}\/\d{2}\/\d{4}\.\n\nSi ya no quieres recibir mensajes comerciales/);
      const e = await uno(
        `SELECT c.tipo FROM envio_mensaje e JOIN canal_comunicacion c ON c.id_canal = e.id_canal WHERE e.id_campana = $1`,
        [c.body.campana.id_campana]
      );
      expect(e.tipo).toBe('EMAIL');
    });

    test('con WhatsApp activo en el servidor, la campana sale sola', async () => {
      whatsappActivo = true;
      try {
        const c = await llamar('POST', '/api/admin/campanas', tkAdminA, { nombre: 'A todos', segmento: 'TODOS', mensaje: 'Hola {primer_nombre}, ¡nuevo horario!' });
        const r = await llamar('POST', `/api/admin/campanas/${c.body.campana.id_campana}/ejecutar`, tkAdminA);
        expect(r.body.resumen).toMatchObject({ destinatarios: 3, enviados: 3, pendientes: 0 });
        expect(whatsapps.map((w) => w.texto)).toEqual(expect.arrayContaining([expect.stringMatching(/^Hola Ana, ¡nuevo horario!\n\n/)]));
      } finally {
        whatsappActivo = false;
      }
    });

    test('programada: valida la fecha, la ejecuta el scheduler a la hora y una sola vez', async () => {
      const malo = await llamar('POST', '/api/admin/campanas', tkAdminA, { nombre: 'Prog', segmento: 'TODOS', mensaje: 'Hola {nombre}', tipo_disparo: 'PROGRAMADO' });
      expect(malo.status).toBe(400);
      const pasada = await llamar('POST', '/api/admin/campanas', tkAdminA, {
        nombre: 'Prog', segmento: 'TODOS', mensaje: 'Hola {nombre}', tipo_disparo: 'PROGRAMADO', fecha_programada: '2020-01-01T08:00',
      });
      expect(pasada.status).toBe(400);
      const c = await llamar('POST', '/api/admin/campanas', tkAdminA, {
        nombre: 'Programada', segmento: 'NUEVOS', mensaje: 'Hola {nombre}', tipo_disparo: 'PROGRAMADO', fecha_programada: proximoHabil(),
      });
      expect(c.status).toBe(201);
      expect(c.body.campana.fecha_programada).toBe(proximoHabil());
      const id = c.body.campana.id_campana;

      // Todavia no es la hora: el job no la toca.
      expect((await campanasRouter.ejecutarVencidas(gymA)).find((x) => x.id_campana === id)).toBeUndefined();

      // Llega la hora (se adelanta en la base) y dos ejecuciones a la vez la mandan una sola vez.
      await pool.query("UPDATE campana SET fecha_programada = NOW() - INTERVAL '1 minute' WHERE id_campana = $1", [id]);
      const [a, b] = await Promise.all([campanasRouter.ejecutarVencidas(gymA), campanasRouter.ejecutarVencidas(gymA)]);
      const ejecuciones = [...a, ...b].filter((x) => x.id_campana === id);
      expect(ejecuciones).toHaveLength(1);
      const n = await uno('SELECT count(*)::int AS n FROM campana_destinatario WHERE id_campana = $1', [id]);
      expect(n.n).toBe(1);
      expect((await uno('SELECT estado FROM campana WHERE id_campana = $1', [id])).estado).toBe('ENVIADA');
    });

    test('cancelar una que no se ha enviado; una enviada no se edita ni se cancela', async () => {
      const c = await llamar('POST', '/api/admin/campanas', tkAdminA, { nombre: 'Para cancelar', segmento: 'TODOS', mensaje: 'Hola {nombre}' });
      const id = c.body.campana.id_campana;
      const ed = await llamar('PUT', `/api/admin/campanas/${id}`, tkAdminA, { nombre: 'Editada antes de enviar' });
      expect(ed.status).toBe(200);
      expect(ed.body.campana.nombre).toBe('Editada antes de enviar');
      expect((await llamar('POST', `/api/admin/campanas/${id}/cancelar`, tkAdminA)).body.campana.estado).toBe('CANCELADA');
      expect((await llamar('POST', `/api/admin/campanas/${id}/ejecutar`, tkAdminA)).status).toBe(409);
      expect((await llamar('PUT', `/api/admin/campanas/${campWa}`, tkAdminA, { nombre: 'X' })).status).toBe(409);
      expect((await llamar('POST', `/api/admin/campanas/${campWa}/cancelar`, tkAdminA)).status).toBe(409);
    });

    test('otro gimnasio no ve ni ejecuta las campanas de este', async () => {
      expect((await llamar('GET', `/api/admin/campanas/${campWa}/destinatarios`, tkAdminB)).status).toBe(404);
      const l = await llamar('GET', '/api/admin/campanas', tkAdminB);
      expect(l.body.campanas).toHaveLength(0);
      expect(l.body.segmentos.map((s) => s.valor)).toEqual(['TODOS', 'INACTIVOS', 'NUEVOS', 'PROXIMOS_A_VENCER']);
    });
  });
});
