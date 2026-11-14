/**
 * RQF-09 contra una base de datos real (issue #24).
 *
 * Levanta los routers reales de notificaciones y de miembros sobre la base de
 * TEST_DATABASE_URL y los llama por HTTP. Comprueba las filas que quedan en
 * envio_mensaje y canal_comunicacion (incluido que cinco envios a la vez en un
 * gimnasio sin canal crean uno solo y que un canal inactivo no se usa) y que
 * el borrado permanente de un miembro al que se le escribio funciona.
 *
 * Sirve con las dos formas de crear la base:
 *   - ConsultasDB/Query_Inicial_Crear_Tablas.sql (el esquema de produccion)
 *   - las migraciones de backend/migrations (Docker, node src/db/migrate.js)
 *
 * Seguridad:
 *   - Sin TEST_DATABASE_URL se salta entera (asi queda en CI); solo corren las
 *     pruebas de la guardia, que no se conectan a nada.
 *   - Se niega a correr si la conexion no va a localhost o 127.0.0.1. Mira el
 *     destino tal como lo calcula pg, no el hostname de la URL: pg obedece
 *     ?host= en la query, y db.js reescribe la URL al quitar sslmode.
 *   - Crea sus propios gimnasios y al final borra todo lo que creo. En el
 *     esquema de ConsultasDB las FK no tienen ON DELETE CASCADE, asi que se
 *     borra tabla por tabla, de las hijas a gimnasio.
 *
 * Uso (desde backend/):
 *
 *   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55433/fl_consultas \
 *   npx jest tests/registro-envio-real.test.js
 */
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const ConnectionParameters = require('pg/lib/connection-parameters');

const HOSTS_LOCALES = ['localhost', '127.0.0.1', '::1', '[::1]'];

/**
 * Lanza si la conexion no va a una base local. `config` es una URL o la
 * configuracion que recibe pg; el host sale del mismo parser que usa pg (con
 * ?host= en la query y las variables PG*), no de new URL.
 */
function exigirBaseLocal(config) {
  const { host } = new ConnectionParameters(typeof config === 'string' ? { connectionString: config } : config);
  if (!HOSTS_LOCALES.includes(host)) {
    throw new Error(`Me niego: TEST_DATABASE_URL lleva a "${host}" y esta prueba solo corre contra una base local (localhost o 127.0.0.1).`);
  }
}

const URL_PRUEBA = process.env.TEST_DATABASE_URL;
let poolReal;
if (URL_PRUEBA) {
  exigirBaseLocal(URL_PRUEBA);
  // db.js lee DATABASE_URL al cargarse: se fija antes para que la ruta use la
  // base de prueba y no la de .env.
  process.env.DATABASE_URL = URL_PRUEBA;
  process.env.DB_SSL = 'false';
  process.env.JWT_SECRET = 'prueba-real-local';
  poolReal = require('../src/db/db');
  // Lo que db.js le paso a pg, por si al reescribir la URL cambio el destino.
  exigirBaseLocal(poolReal.options);
}

describe('guardia de la base de pruebas', () => {
  test.each([
    'postgres://u:c@127.0.0.1:55433/fl_consultas',
    'postgres://u:c@localhost/fl_consultas',
    'postgres://u:c@[::1]:55433/fl_consultas',
  ])('acepta una base local: %s', (url) => {
    expect(() => exigirBaseLocal(url)).not.toThrow();
  });

  test.each([
    ['una base remota', 'postgres://u:c@ep-algo.us-east-2.aws.neon.tech/neondb'],
    ['?host= remoto con hostname local', 'postgres://u:c@127.0.0.1:55433/fl_consultas?host=ep-algo.neon.tech'],
    ['?host= de socket', 'postgres:///fl_consultas?host=/tmp'],
    ['varios hosts', 'postgres://u:c@127.0.0.1,ep-x.neon.tech:5432/fl_consultas'],
    ['un socket codificado como host', 'postgres://u:c@%2Fvar%2Frun%2Fpostgresql:5432/fl_consultas'],
  ])('rechaza %s', (_caso, url) => {
    expect(() => exigirBaseLocal(url)).toThrow(/Me niego/);
  });

  test('rechaza una URL que db.js reescribe hacia otro host al quitar sslmode', () => {
    // Para new URL y para pg lo de despues de # no cuenta, pero db.js quita
    // "sslmode=disable#" y deja "?&host=...", que pg si obedece.
    const url = 'postgres://u:c@127.0.0.1:55433/fl_consultas?sslmode=disable#&host=ep-algo.neon.tech';
    expect(() => exigirBaseLocal(url)).not.toThrow();
    const antes = { url: process.env.DATABASE_URL, ssl: process.env.DB_SSL };
    let pool;
    try {
      process.env.DATABASE_URL = url;
      process.env.DB_SSL = 'false';
      jest.isolateModules(() => { pool = require('../src/db/db'); });
      expect(() => exigirBaseLocal(pool.options)).toThrow(/Me niego: .*ep-algo\.neon\.tech/);
    } finally {
      if (antes.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = antes.url;
      if (antes.ssl === undefined) delete process.env.DB_SSL; else process.env.DB_SSL = antes.ssl;
      if (pool) pool.end();
    }
  });
});

const describeReal = URL_PRUEBA ? describe : describe.skip;

describeReal('RQF-09 contra la base real: POST /api/admin/notificaciones/enviado', () => {
  let pool, server, base, establecerBusquedaPersonal;
  const gimnasios = [];
  // gymA: Ana (con alerta), Carla, la recepcionista y una administradora;
  // gymB: Beto, sin canal, para la prueba de concurrencia;
  // gymC: Dora, con un canal WhatsApp inactivo.
  let gymA, gymB, gymC, recepA, ana, beto, carla, dora, alertaAna, tokenA, tokenB, tokenC, tokenAdminA;
  const sufijo = crypto.randomBytes(3).toString('hex');
  const TEXTO = 'Hola Ana, te saludamos de Prueba RQF-09. Notamos que llevas 20 dias sin venir.';

  const enviar = async (body, tk = tokenA) => {
    const r = await fetch(base + '/api/admin/notificaciones/enviado', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const contar = async (tabla, where, params) =>
    (await pool.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${where}`, params)).rows[0].n;

  async function crearGimnasio(nombre) {
    const { rows: [g] } = await pool.query(
      "INSERT INTO gimnasio (nombre, telefono) VALUES ($1, '3000000000') RETURNING id_gimnasio",
      [nombre]
    );
    gimnasios.push(g.id_gimnasio);
    return g.id_gimnasio;
  }

  async function crearUsuario(gymId, n, rol = 'RECEPCIONISTA') {
    // ConsultasDB tiene la columna rol (texto) y no id_rol; Docker tiene las dos.
    const { rows: c } = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'id_rol'"
    );
    const cols = ['id_gimnasio', 'nombre', 'email', 'password_hash', 'rol'];
    const vals = [gymId, 'Personal prueba', `rqf09-${sufijo}-${n}@prueba.local`, 'x', rol];
    if (c.length > 0) { cols.push('id_rol'); vals.push(rol === 'ADMINISTRADOR' ? 1 : 2); }
    const { rows: [u] } = await pool.query(
      `INSERT INTO usuario (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id_usuario`,
      vals
    );
    return u.id_usuario;
  }

  async function crearMiembro(gymId, nombre, n) {
    const { rows: [m] } = await pool.query(
      `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, codigo_qr)
       VALUES ($1, $2, $3, '3001234567', $4) RETURNING id_miembro`,
      [gymId, nombre, `rqf09-${sufijo}-${n}`, `QR-RQF09-${sufijo}-${n}`]
    );
    return m.id_miembro;
  }

  beforeAll(async () => {
    pool = poolReal;
    ({ establecerBusquedaPersonal } = require('../src/middleware/auth'));
    const notifRouter = require('../src/routes/notificaciones');
    const miembrosRouter = require('../src/routes/miembros');
    const { errorHandler } = require('../src/middleware/errorHandler');

    // El middleware real lee usuario.id_rol, que el usuario de ConsultasDB no
    // tiene (esa diferencia no es de RQF-09). Se lee el mismo usuario de la
    // base con las columnas que si existen en los dos esquemas.
    establecerBusquedaPersonal(async (payload) => {
      const { rows } = await pool.query(
        'SELECT activo, id_gimnasio, rol AS rol_nombre FROM usuario WHERE id_usuario = $1',
        [payload.id]
      );
      return rows[0] || null;
    });

    gymA = await crearGimnasio(`Prueba RQF-09 A ${sufijo}`);
    gymB = await crearGimnasio(`Prueba RQF-09 B ${sufijo}`);
    gymC = await crearGimnasio(`Prueba RQF-09 C ${sufijo}`);
    recepA = await crearUsuario(gymA, 'a');
    const adminA = await crearUsuario(gymA, 'a-admin', 'ADMINISTRADOR');
    const recepB = await crearUsuario(gymB, 'b');
    const recepC = await crearUsuario(gymC, 'c');
    ana = await crearMiembro(gymA, 'Ana Prueba', 'ana');
    carla = await crearMiembro(gymA, 'Carla Prueba', 'carla');
    beto = await crearMiembro(gymB, 'Beto Prueba', 'beto');
    dora = await crearMiembro(gymC, 'Dora Prueba', 'dora');
    ({ rows: [{ id_alerta: alertaAna }] } = await pool.query(
      `INSERT INTO alerta_abandono (id_miembro, id_gimnasio, dias_inactivo, nivel)
       VALUES ($1, $2, 20, 'ROJA') RETURNING id_alerta`,
      [ana, gymA]
    ));
    await pool.query("INSERT INTO canal_comunicacion (id_gimnasio, tipo, activo) VALUES ($1, 'WHATSAPP', FALSE)", [gymC]);

    const firmar = (id, gymId, role = 'receptionist') => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokenA = firmar(recepA, gymA);
    tokenB = firmar(recepB, gymB);
    tokenC = firmar(recepC, gymC);
    tokenAdminA = firmar(adminA, gymA, 'admin');

    const app = express();
    app.use(express.json());
    app.use('/api', notifRouter);
    app.use('/api', miembrosRouter);
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
      for (const tabla of ['notificacion', 'envio_mensaje', 'canal_comunicacion', 'alerta_abandono', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = ANY($1::int[])`, [gimnasios]);
      }
    }
    await pool.end();
  });

  test('el gimnasio nuevo no tiene canales', async () => {
    expect(await contar('canal_comunicacion', 'id_gimnasio = $1', [gymA])).toBe(0);
  });

  test('primer envio: crea el canal WHATSAPP y guarda el envio con fecha, estado y quien lo envio', async () => {
    const r = await enviar({ idMiembro: ana, canal: 'WHATSAPP', tipo: 'riesgo', mensaje: TEXTO, idAlerta: alertaAna });
    expect(r.status).toBe(201);
    expect(r.body.envio.estado).toBe('ENVIADO');

    const { rows: canales } = await pool.query(
      'SELECT id_canal, tipo, activo FROM canal_comunicacion WHERE id_gimnasio = $1',
      [gymA]
    );
    expect(canales).toEqual([{ id_canal: expect.any(Number), tipo: 'WHATSAPP', activo: true }]);

    const { rows: [envio] } = await pool.query(
      `SELECT id_gimnasio, id_miembro, id_canal, id_alerta, id_campana, id_plantilla,
              mensaje_copiado, estado, enviado_por,
              ABS(EXTRACT(EPOCH FROM (NOW()::timestamp - fecha_envio))) < 60 AS fecha_de_ahora
         FROM envio_mensaje WHERE id_envio = $1`,
      [r.body.envio.id_envio]
    );
    expect(envio).toEqual({
      id_gimnasio: gymA,
      id_miembro: ana,
      id_canal: canales[0].id_canal,
      id_alerta: alertaAna,
      id_campana: null,
      id_plantilla: null,
      mensaje_copiado: TEXTO,
      estado: 'ENVIADO',
      enviado_por: recepA,
      fecha_de_ahora: true,
    });

    // El aviso en notificacion sigue quedando.
    const { rows: avisos } = await pool.query(
      'SELECT tipo, titulo, leida, mensaje FROM notificacion WHERE id_gimnasio = $1',
      [gymA]
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: 'SISTEMA', titulo: 'Recordatorio enviado', leida: true });
    expect(avisos[0].mensaje).toMatch(/Ana Prueba.*WHATSAPP.*riesgo/);
  });

  test('segundo envio: reutiliza el canal del gimnasio', async () => {
    const r = await enviar({ idMiembro: ana, tipo: 'riesgo', mensaje: TEXTO });
    expect(r.status).toBe(201);
    expect(await contar('canal_comunicacion', 'id_gimnasio = $1', [gymA])).toBe(1);
    expect(await contar('envio_mensaje', 'id_gimnasio = $1', [gymA])).toBe(2);
    expect(await contar('envio_mensaje', 'id_gimnasio = $1 AND id_alerta IS NULL', [gymA])).toBe(1);
  });

  test('cinco envios a la vez en un gimnasio sin canal: crean un solo canal', async () => {
    expect(await contar('canal_comunicacion', 'id_gimnasio = $1', [gymB])).toBe(0);
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, (_, i) => enviar({ idMiembro: beto, mensaje: `Hola Beto (${i})` }, tokenB))
    );
    expect(respuestas.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await contar('canal_comunicacion', 'id_gimnasio = $1', [gymB])).toBe(1);
    const { rows } = await pool.query(
      'SELECT DISTINCT id_canal FROM envio_mensaje WHERE id_gimnasio = $1',
      [gymB]
    );
    expect(rows).toHaveLength(1);
    expect(await contar('envio_mensaje', 'id_gimnasio = $1', [gymB])).toBe(5);
  });

  test('miembro de otro gimnasio: 404 y no escribe nada', async () => {
    const antes = await contar('envio_mensaje', 'id_miembro = $1', [beto]);
    const r = await enviar({ idMiembro: beto, mensaje: TEXTO }); // token del gimnasio A
    expect(r.status).toBe(404);
    expect(await contar('envio_mensaje', 'id_miembro = $1', [beto])).toBe(antes);
  });

  test('alerta de otro miembro: 404 y no escribe nada', async () => {
    const antes = await contar('envio_mensaje', 'id_gimnasio = $1', [gymB]);
    const r = await enviar({ idMiembro: beto, mensaje: TEXTO, idAlerta: alertaAna }, tokenB);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('ALERT_NOT_FOUND');
    expect(await contar('envio_mensaje', 'id_gimnasio = $1', [gymB])).toBe(antes);
  });

  test('sin mensaje: 400 y no escribe nada', async () => {
    const antes = await contar('envio_mensaje', 'id_gimnasio = $1', [gymA]);
    const r = await enviar({ idMiembro: ana });
    expect(r.status).toBe(400);
    expect(await contar('envio_mensaje', 'id_gimnasio = $1', [gymA])).toBe(antes);
  });

  test('si el unico canal WhatsApp esta inactivo: crea uno activo y no usa el inactivo', async () => {
    const r = await enviar({ idMiembro: dora, mensaje: 'Hola Dora' }, tokenC);
    expect(r.status).toBe(201);
    const { rows: canales } = await pool.query(
      "SELECT id_canal, activo FROM canal_comunicacion WHERE id_gimnasio = $1 AND tipo = 'WHATSAPP' ORDER BY id_canal",
      [gymC]
    );
    expect(canales.map((c) => c.activo)).toEqual([false, true]);
    const { rows: [envio] } = await pool.query('SELECT id_canal FROM envio_mensaje WHERE id_envio = $1', [r.body.envio.id_envio]);
    expect(envio.id_canal).toBe(canales[1].id_canal);
  });

  test('borrado permanente de un miembro al que se le escribio: borra sus envios y al miembro', async () => {
    expect((await enviar({ idMiembro: carla, mensaje: 'Hola Carla' })).status).toBe(201);
    expect(await contar('envio_mensaje', 'id_miembro = $1', [carla])).toBe(1);
    const r = await fetch(`${base}/api/admin/miembros/${carla}/permanent`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenAdminA}` },
    });
    expect(r.status).toBe(200);
    expect(await contar('envio_mensaje', 'id_miembro = $1', [carla])).toBe(0);
    expect(await contar('miembro', 'id_miembro = $1', [carla])).toBe(0);
    // Los envios de los demas miembros del gimnasio siguen ahi.
    expect(await contar('envio_mensaje', 'id_miembro = $1', [ana])).toBe(2);
  });
});
