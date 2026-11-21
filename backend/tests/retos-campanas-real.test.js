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
 * Correcciones del verificador al PR #100: cada camino que completa un reto
 * (check-in, «Unirme», «Inscribir elegibles», bajar la meta) deja el aviso al
 * gimnasio y el mensaje al miembro una sola vez; cancelar avisa a quien iba en
 * curso; los completados siguen en la app; el QR dinamico no se puede exigir
 * en produccion sin QR_DINAMICO_SECRET.
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
  let tkAdminA, tkAdminB, tkRecepA, tkAna, tkBeto, tkCarla;
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
  // Filas de notificacion tipo RETO de un miembro, por destinatario y titulo.
  const avisos = async (idMiembro, destinatario, titulo) => (await pool.query(
    `SELECT titulo, mensaje FROM notificacion
      WHERE id_miembro = $1 AND tipo = 'RETO' AND destinatario = $2 AND ($3::text IS NULL OR titulo = $3)
      ORDER BY id_notificacion`,
    [idMiembro, destinatario, titulo || null]
  )).rows;
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

    const firmar = (id, gymId, role) => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const firmarMiembro = (idMiembro, gymId) => jwt.sign({ idMiembro, gymId, role: 'cliente' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tkAdminA = firmar(adminA, gymA, 'admin');
    tkAdminB = firmar(adminB, gymB, 'admin');
    tkRecepA = firmar(recepA, gymA, 'receptionist');
    tkAna = firmarMiembro(ana, gymA);
    tkCarla = firmarMiembro(carla, gymA);
    tkBeto = firmarMiembro(beto, gymA);

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
      for (const tabla of ['notificacion', 'canal_comunicacion', 'checkin', 'plan_cobro', 'alerta_abandono', 'miembro', 'usuario', 'gimnasio']) {
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

    test('en produccion sin QR_DINAMICO_SECRET no se puede exigir (409) y la pantalla lo sabe', async () => {
      const antes = { NODE_ENV: process.env.NODE_ENV, QR_DINAMICO_SECRET: process.env.QR_DINAMICO_SECRET };
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.QR_DINAMICO_SECRET;
        const r = await llamar('PUT', '/api/admin/config', tkAdminB, { qr_dinamico_obligatorio: true });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('QR_DINAMICO_SIN_SECRETO');
        expect(r.body.error).toContain('QR_DINAMICO_SECRET');
        expect((await uno('SELECT qr_dinamico_obligatorio FROM gimnasio WHERE id_gimnasio = $1', [gymB])).qr_dinamico_obligatorio).toBe(false);
        expect((await llamar('GET', '/api/admin/config', tkAdminB)).body.config.qr_dinamico_disponible).toBe(false);
        // El gimnasio A ya lo tenia activo: guardar su configuracion sigue funcionando.
        expect((await llamar('PUT', '/api/admin/config', tkAdminA, { qr_dinamico_obligatorio: true, dias_aviso_vencimiento: 3 })).status).toBe(200);

        process.env.QR_DINAMICO_SECRET = 'clave-propia-de-prueba-local';
        expect((await llamar('PUT', '/api/admin/config', tkAdminB, { qr_dinamico_obligatorio: true })).status).toBe(200);
        expect((await llamar('PUT', '/api/admin/config', tkAdminB, { qr_dinamico_obligatorio: false })).status).toBe(200);
      } finally {
        process.env.NODE_ENV = antes.NODE_ENV;
        if (antes.QR_DINAMICO_SECRET === undefined) delete process.env.QR_DINAMICO_SECRET;
        else process.env.QR_DINAMICO_SECRET = antes.QR_DINAMICO_SECRET;
      }
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

    test('camino 1 (check-in): a Ana le llega el mensaje en la app y la campana no lo muestra', async () => {
      const m = await llamar('GET', '/api/cliente/mensajes', tkAna);
      expect(m.status).toBe(200);
      expect(m.body.no_leidos).toBe(1);
      expect(m.body.mensajes).toEqual([expect.objectContaining({
        tipo: 'RETO', titulo: '¡Completaste un reto!', leida: false,
        mensaje: '¡Completaste el reto «Dos visitas»! Tu recompensa: Batido gratis. Reclámala en recepción.',
      })]);
      // El administrador ya marco su aviso; el de Ana sigue sin leer y es otra fila.
      expect(await avisos(ana, 'GIMNASIO')).toHaveLength(1);
      const campana = await llamar('GET', '/api/admin/notificaciones', tkAdminA);
      expect(campana.body.avisos.filter((a) => a.idMiembro === ana && a.tipo === 'reto-completado')).toHaveLength(0);
      // Y el personal no puede marcar como visto el mensaje de Ana.
      expect((await llamar('POST', `/api/admin/notificaciones/reto/${m.body.mensajes[0].id}/leida`, tkAdminA)).status).toBe(404);
    });

    test('un segundo check-in el mismo dia no suma otra asistencia ni repite el aviso', async () => {
      await pool.query("UPDATE checkin SET fecha_hora = fecha_hora - INTERVAL '5 minutes' WHERE id_miembro = $1", [ana]);
      const r = await llamar('POST', '/api/admin/checkin', tkRecepA, { documento: `rq1012-${sufijo}-ana`, metodo: 'MANUAL' });
      expect(r.status).toBe(201);
      expect(r.body.retos.find((x) => x.id_reto === retoTodos)).toBeUndefined(); // ya no esta EN_CURSO
      // Un aviso para el gimnasio y un mensaje para Ana, nada mas.
      expect(await avisos(ana, 'GIMNASIO')).toHaveLength(1);
      expect(await avisos(ana, 'MIEMBRO')).toHaveLength(1);
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

    test('camino 4 (bajar la meta): aviso al gimnasio y mensaje a Carla, una sola vez', async () => {
      expect(await avisos(carla, 'GIMNASIO')).toEqual([{ titulo: 'Reto completado', mensaje: 'Carla Prueba completó el reto «Primer mes».' }]);
      expect(await avisos(carla, 'MIEMBRO')).toEqual([{ titulo: '¡Completaste un reto!', mensaje: '¡Completaste el reto «Primer mes»!' }]);
      // Volver a guardar la meta (o bajarla mas) no repite nada.
      expect((await llamar('PUT', `/api/admin/retos/${retoNuevos}`, tkAdminA, { meta_asistencias: 1 })).status).toBe(200);
      expect(await avisos(carla, 'MIEMBRO')).toHaveLength(1);
      expect(await avisos(carla, 'GIMNASIO')).toHaveLength(1);
    });

    test('camino 2 («Unirme»): con el ingreso de hoy Carla completa de una vez un reto de meta 1', async () => {
      const c = await llamar('POST', '/api/admin/retos', tkAdminA, {
        nombre: 'Un ingreso', meta_asistencias: 1, recompensa: 'Toalla', segmento_elegible: 'NUEVOS', fecha_inicio: hoyMas(0), fecha_fin: hoyMas(7),
      });
      const r = await llamar('POST', `/api/cliente/retos/${c.body.reto.id_reto}/unirse`, tkCarla);
      expect(r.status).toBe(201);
      expect(r.body.completado).toBe(true);
      expect(r.body.message).toContain('ya lo completaste');
      expect(await avisos(carla, 'MIEMBRO', '¡Completaste un reto!')).toHaveLength(2);
      expect((await avisos(carla, 'GIMNASIO')).map((a) => a.mensaje)).toContain('Carla Prueba completó el reto «Un ingreso». Recompensa: Toalla.');
      expect((await llamar('POST', `/api/cliente/retos/${c.body.reto.id_reto}/unirse`, tkCarla)).status).toBe(409);
      expect(await avisos(carla, 'MIEMBRO', '¡Completaste un reto!')).toHaveLength(2);
    });

    test('camino 3 («Inscribir elegibles»): el ingreso de Beto de hace 20 dias completa un reto que empezo antes', async () => {
      const c = await llamar('POST', '/api/admin/retos', tkAdminA, {
        nombre: 'Regreso', meta_asistencias: 1, segmento_elegible: 'INACTIVOS', fecha_inicio: hoyMas(-25), fecha_fin: hoyMas(5),
      });
      const id = c.body.reto.id_reto;
      const r = await llamar('POST', `/api/admin/retos/${id}/inscribir`, tkAdminA, {});
      expect(r.body.inscritos).toBe(1);
      expect((await uno('SELECT estado FROM reto_miembro WHERE id_reto = $1 AND id_miembro = $2', [id, beto])).estado).toBe('COMPLETADO');
      expect(await avisos(beto, 'GIMNASIO')).toEqual([{ titulo: 'Reto completado', mensaje: 'Beto Prueba completó el reto «Regreso».' }]);
      const m = await llamar('GET', '/api/cliente/mensajes', tkBeto);
      expect(m.body.mensajes.map((x) => x.mensaje)).toEqual(['¡Completaste el reto «Regreso»!']);
      // Otra vez: ya esta inscrito, nada se repite.
      expect((await llamar('POST', `/api/admin/retos/${id}/inscribir`, tkAdminA, {})).body.inscritos).toBe(0);
      expect(await avisos(beto, 'MIEMBRO')).toHaveLength(1);
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

    test('al cancelar, a quien iba en curso le llega un mensaje (una vez); al que ya lo completo, no', async () => {
      const cancelados = await avisos(beto, 'MIEMBRO', 'Reto cancelado');
      expect(cancelados).toHaveLength(1);
      expect(cancelados[0].mensaje).toMatch(/^El gimnasio canceló el reto «Vuelve al gym»\./);
      // Cancelar otra vez no repite.
      expect((await llamar('POST', `/api/admin/retos/${retoInactivos}/cancelar`, tkAdminA)).status).toBe(200);
      expect(await avisos(beto, 'MIEMBRO', 'Reto cancelado')).toHaveLength(1);
      // Carla ya habia completado «Primer mes»: cancelarlo no le avisa ni le quita el completado.
      expect((await llamar('POST', `/api/admin/retos/${retoNuevos}/cancelar`, tkAdminA)).status).toBe(200);
      expect(await avisos(carla, 'MIEMBRO', 'Reto cancelado')).toHaveLength(0);
      expect((await uno('SELECT estado FROM reto_miembro WHERE id_reto = $1 AND id_miembro = $2', [retoNuevos, carla])).estado).toBe('COMPLETADO');
      // En la campana solo salen los avisos del gimnasio: los de Carla (2) y Beto (1).
      const campana = await llamar('GET', '/api/admin/notificaciones', tkAdminA);
      const ids = campana.body.avisos.filter((a) => a.tipo === 'reto-completado').map((a) => a.idNotificacion);
      expect(ids).toHaveLength(3);
      const ajenos = await pool.query("SELECT 1 FROM notificacion WHERE id_notificacion = ANY($1::int[]) AND destinatario <> 'GIMNASIO'", [ids]);
      expect(ajenos.rows).toHaveLength(0);
    });

    test('los retos completados siguen en la app aunque hayan terminado o los hayan cancelado', async () => {
      // «Dos visitas» termina ayer: Ana lo completo, asi que lo sigue viendo.
      await pool.query('UPDATE reto SET fecha_inicio = $2::date, fecha_fin = $3::date WHERE id_reto = $1', [retoTodos, hoyMas(-10), hoyMas(-1)]);
      const ana1 = await llamar('GET', '/api/cliente/retos', tkAna);
      expect(ana1.status).toBe(200);
      const dos = ana1.body.retos.find((x) => x.id_reto === retoTodos);
      expect(dos).toMatchObject({ completado: true, vigente: false, fecha_fin: hoyMas(-1), porcentaje_avance: 100 });
      // Carla: «Primer mes» (cancelado despues de completarlo) y «Un ingreso» completados;
      // «Dos visitas» (terminado, iba 1 de 2) ya no sale.
      const carla1 = await llamar('GET', '/api/cliente/retos', tkCarla);
      const porId = Object.fromEntries(carla1.body.retos.map((x) => [x.nombre, x]));
      expect(porId['Primer mes']).toMatchObject({ completado: true, vigente: false });
      expect(porId['Un ingreso']).toMatchObject({ completado: true, vigente: true });
      expect(porId['Dos visitas']).toBeUndefined();
      // Los no completados (vigentes) van primero; despues los completados.
      const completados = carla1.body.retos.map((x) => x.completado);
      expect(completados).toEqual([...completados].sort((a, b) => Number(a) - Number(b)));
      // Beto: el cancelado en curso no sale; el que completo, si.
      const beto1 = await llamar('GET', '/api/cliente/retos', tkBeto);
      expect(beto1.body.retos.map((x) => x.nombre)).toContain('Regreso');
      expect(beto1.body.retos.map((x) => x.nombre)).not.toContain('Vuelve al gym');
    });

    test('cuatro recalculos a la vez completan el reto y avisan una sola vez', async () => {
      const { recalcularYAvisar } = require('../src/lib/retos');
      const c = await llamar('POST', '/api/admin/retos', tkAdminA, {
        nombre: 'A la vez', meta_asistencias: 1, segmento_elegible: 'TODOS', fecha_inicio: hoyMas(-3), fecha_fin: hoyMas(3),
      });
      const idReto = c.body.reto.id_reto;
      const rm = await uno('INSERT INTO reto_miembro (id_reto, id_miembro) VALUES ($1, $2) RETURNING id_reto_miembro', [idReto, ana]);
      const args = { idRetoMiembro: rm.id_reto_miembro, idReto, idMiembro: ana, gymId: gymA };
      const r = await Promise.all([1, 2, 3, 4].map(() => recalcularYAvisar(pool, args)));
      expect(r.filter((x) => x.completado)).toHaveLength(1);
      const deEste = (filas) => filas.filter((a) => a.mensaje.includes('«A la vez»'));
      expect(deEste(await avisos(ana, 'GIMNASIO'))).toHaveLength(1);
      expect(deEste(await avisos(ana, 'MIEMBRO'))).toHaveLength(1);
    });

    test('un id no numerico responde 400, no 503', async () => {
      expect((await llamar('PUT', '/api/admin/retos/abc', tkAdminA, { nombre: 'X' })).status).toBe(400);
    });
  });

  // ================================================================ campanas
  describe('campanas y plantillas (RQF-10)', () => {
    let plantilla, campWa;

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
      const r = await llamar('POST', `/api/admin/campanas/${campWa}/destinatarios/${beto}/enviado`, tkAdminA, { mensaje: 'Hola Beto, te extrañamos.' });
      expect(r.status).toBe(201);
      expect(r.body.destinatario.estado_envio).toBe('ENVIADO');
      const e = await uno(
        `SELECT e.estado, e.mensaje_copiado, e.id_plantilla, e.enviado_por, c.tipo
           FROM envio_mensaje e JOIN canal_comunicacion c ON c.id_canal = e.id_canal
          WHERE e.id_campana = $1 AND e.id_miembro = $2`,
        [campWa, beto]
      );
      expect(e).toMatchObject({ estado: 'ENVIADO', mensaje_copiado: 'Hola Beto, te extrañamos.', id_plantilla: plantilla, enviado_por: adminA, tipo: 'WHATSAPP' });
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
      expect(correo.texto).toMatch(/^Hola Carla Prueba, tu plan vence el \d{2}\/\d{2}\/\d{4}\.$/);
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
        expect(whatsapps.map((w) => w.texto)).toEqual(expect.arrayContaining(['Hola Ana, ¡nuevo horario!']));
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
        nombre: 'Programada', segmento: 'NUEVOS', mensaje: 'Hola {nombre}', tipo_disparo: 'PROGRAMADO', fecha_programada: `${hoyMas(1)}T08:30`,
      });
      expect(c.status).toBe(201);
      expect(c.body.campana.fecha_programada).toBe(`${hoyMas(1)}T08:30`);
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
