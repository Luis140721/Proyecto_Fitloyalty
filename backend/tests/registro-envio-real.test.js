/**
 * RQF-09 contra una base de datos real (issue #24).
 *
 * Levanta el router real de notificaciones sobre la base de TEST_DATABASE_URL
 * y llama POST /api/admin/notificaciones/enviado por HTTP. Comprueba las filas
 * que quedan en envio_mensaje y canal_comunicacion, incluido que cinco envios
 * a la vez en un gimnasio sin canal crean un solo canal.
 *
 * Sirve con las dos formas de crear la base:
 *   - ConsultasDB/Query_Inicial_Crear_Tablas.sql (el esquema de produccion)
 *   - las migraciones de backend/migrations (Docker, node src/db/migrate.js)
 *
 * Seguridad:
 *   - Sin TEST_DATABASE_URL se salta entera (asi queda en CI).
 *   - Se niega a correr si la URL no apunta a localhost o 127.0.0.1.
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

const URL_PRUEBA = process.env.TEST_DATABASE_URL;
if (URL_PRUEBA) {
  const host = new URL(URL_PRUEBA).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Me niego: TEST_DATABASE_URL apunta a "${host}" y esta prueba solo corre contra una base local.`);
  }
  // db.js lee DATABASE_URL al cargarse: se fija antes para que la ruta use la
  // base de prueba y no la de .env.
  process.env.DATABASE_URL = URL_PRUEBA;
  process.env.DB_SSL = 'false';
  process.env.JWT_SECRET = 'prueba-real-local';
}

const describeReal = URL_PRUEBA ? describe : describe.skip;

describeReal('RQF-09 contra la base real: POST /api/admin/notificaciones/enviado', () => {
  let pool, server, base, establecerBusquedaPersonal;
  const gimnasios = [];
  // gymA: Ana, su alerta y la recepcionista; gymB: Beto, sin canal, para la prueba de concurrencia.
  let gymA, gymB, recepA, ana, beto, alertaAna, tokenA, tokenB;
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

  async function crearRecepcionista(gymId, n) {
    // ConsultasDB tiene la columna rol (texto) y no id_rol; Docker tiene las dos.
    const { rows: c } = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'id_rol'"
    );
    const cols = ['id_gimnasio', 'nombre', 'email', 'password_hash', 'rol'];
    const vals = [gymId, 'Recepcion prueba', `rqf09-${sufijo}-${n}@prueba.local`, 'x', 'RECEPCIONISTA'];
    if (c.length > 0) { cols.push('id_rol'); vals.push(2); }
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
    pool = require('../src/db/db');
    ({ establecerBusquedaPersonal } = require('../src/middleware/auth'));
    const notifRouter = require('../src/routes/notificaciones');
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
    recepA = await crearRecepcionista(gymA, 'a');
    const recepB = await crearRecepcionista(gymB, 'b');
    ana = await crearMiembro(gymA, 'Ana Prueba', 'ana');
    beto = await crearMiembro(gymB, 'Beto Prueba', 'beto');
    ({ rows: [{ id_alerta: alertaAna }] } = await pool.query(
      `INSERT INTO alerta_abandono (id_miembro, id_gimnasio, dias_inactivo, nivel)
       VALUES ($1, $2, 20, 'ROJA') RETURNING id_alerta`,
      [ana, gymA]
    ));

    const firmar = (id, gymId) => jwt.sign({ id, role: 'receptionist', gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokenA = firmar(recepA, gymA);
    tokenB = firmar(recepB, gymB);

    const app = express();
    app.use(express.json());
    app.use('/api', notifRouter);
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
});
