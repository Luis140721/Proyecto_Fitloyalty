/**
 * RQF-09 contra una base de datos real (issue #24).
 *
 * Levanta los routers reales de notificaciones y de miembros sobre la BD de
 * pruebas y los llama por HTTP. Comprueba las filas que quedan en
 * envio_mensaje y canal_comunicacion (incluido que cinco envios a la vez en un
 * gimnasio sin canal crean uno solo y que un canal inactivo no se usa) y que
 * el borrado permanente de un miembro al que se le escribio funciona.
 *
 * La conexion es la de los tests de integracion (tests/integracion/bd-pruebas.js):
 *   - Sin DATABASE_URL en el entorno del proceso se salta entera (asi queda en
 *     el job backend del CI); la DATABASE_URL de backend/.env no la activa.
 *   - Solo acepta la BD de pruebas local (127.0.0.1:5433, BD terminada en
 *     _test), revisa antes de conectarse el destino que pg va a usar de verdad
 *     y aplica las migraciones de backend/migrations.
 *   - Crea sus propios gimnasios y al final borra todo lo que creo, tabla por
 *     tabla, de las hijas a gimnasio.
 *
 * Uso (desde la raiz, con db-test levantada):
 *
 *   DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test \
 *   pnpm --dir backend run test:integracion
 */
jest.setTimeout(30000); // base real: con la maquina cargada los hooks pasan de 5 s
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
// La guardia de la BD de pruebas y la DATABASE_URL del entorno del proceso:
// ver tests/integracion/bd-pruebas.js.
const { describeConBd, prepararBdDePruebas } = require('./integracion/bd-pruebas');

// El secreto con el que esta prueba firma sus tokens. Solo vale en este archivo.
process.env.JWT_SECRET = 'prueba-real-local';

describeConBd('RQF-09 contra la base real: POST /api/admin/notificaciones/enviado', () => {
  let pool, server, base, establecerBusquedaPersonal;
  const gimnasios = [];
  // gymA: Ana (con alerta), Carla, la recepcionista y una administradora;
  // gymB: Beto, sin canal, para la prueba de concurrencia;
  // gymC: Dora, con un canal WhatsApp inactivo.
  let gymA, gymB, gymC, recepA, ana, beto, carla, dora, alertaAna, tokenA, tokenB, tokenC, tokenAdminA;
  const sufijo = crypto.randomBytes(3).toString('hex');
  const TEXTO = 'Hola Ana, te saludamos de Prueba RQF-09. Notamos que llevas 20 dias sin venir.';
  // RQNF-16: el envio se revisa con la Ley 2300. El reloj de la ley se fija a
  // un martes a las 10:00 a. m. de Colombia (y al miercoles en la prueba que
  // repite el envio a Ana, por la regla de una vez al dia).
  const legal = require('../src/lib/contacto-legal');
  const MARTES = new Date('2026-11-17T10:00:00-05:00');
  const MIERCOLES = new Date('2026-11-18T10:00:00-05:00');

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
    pool = await prepararBdDePruebas();
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
    // RQNF-16: Beto, Carla y Dora reciben avisos 'vencida'; el servidor solo
    // los acepta como aviso si el plan de verdad vencio (hace 2 dias).
    for (const [idM, idG] of [[beto, gymB], [carla, gymA], [dora, gymC]]) {
      await pool.query(
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, activo)
         VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 32, CURRENT_DATE - 2, TRUE)`,
        [idM, idG]
      );
    }
    // RQNF-16: Ana acepto mensajes comerciales por WhatsApp (el de "en riesgo" lo es).
    await pool.query(
      `INSERT INTO autorizacion_miembro (id_miembro, id_gimnasio, tipo, otorgada, version_texto, canal, canales_autorizados)
       VALUES ($1, $2, 'MENSAJES_COMERCIALES', TRUE, 'v2', 'APP', ARRAY['WHATSAPP']::varchar(20)[])`,
      [ana, gymA]
    );
    legal.establecerReloj(() => MARTES);

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
  }, 60_000);

  afterAll(async () => {
    legal.establecerReloj(null);
    if (establecerBusquedaPersonal) establecerBusquedaPersonal(null);
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (!pool) return;
    if (gimnasios.length > 0) {
      for (const tabla of ['notificacion', 'envio_mensaje', 'canal_comunicacion', 'alerta_abandono', 'autorizacion_miembro', 'plan_cobro', 'miembro', 'usuario', 'gimnasio']) {
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
              -- la fecha es la del reloj de la Ley 2300 (RQNF-16)
              fecha_envio = ($2::timestamptz AT TIME ZONE current_setting('TimeZone')) AS fecha_de_ahora
         FROM envio_mensaje WHERE id_envio = $1`,
      [r.body.envio.id_envio, MARTES]
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
    // El mismo dia la Ley 2300 no lo deja (una vez al dia); al dia siguiente si.
    const mismoDia = await enviar({ idMiembro: ana, tipo: 'riesgo', mensaje: TEXTO });
    expect(mismoDia.status).toBe(409);
    expect(mismoDia.body.details.motivo).toBe('FRECUENCIA');
    legal.establecerReloj(() => MIERCOLES);
    const r = await enviar({ idMiembro: ana, tipo: 'riesgo', mensaje: TEXTO });
    legal.establecerReloj(() => MARTES);
    expect(r.status).toBe(201);
    expect(await contar('canal_comunicacion', 'id_gimnasio = $1', [gymA])).toBe(1);
    expect(await contar('envio_mensaje', 'id_gimnasio = $1', [gymA])).toBe(2);
    expect(await contar('envio_mensaje', 'id_gimnasio = $1 AND id_alerta IS NULL', [gymA])).toBe(1);
  });

  test('cinco envios a la vez al mismo miembro: un solo canal y, por la Ley 2300, un solo envio', async () => {
    expect(await contar('canal_comunicacion', 'id_gimnasio = $1', [gymB])).toBe(0);
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, (_, i) => enviar({ idMiembro: beto, tipo: 'vencida', mensaje: `Hola Beto (${i})` }, tokenB))
    );
    // El bloqueo de contacto pone los cinco en fila: el primero pasa y los
    // otros ya lo ven en el historial (una vez al dia).
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(respuestas.filter((r) => r.status === 409).every((r) => r.body.details.motivo === 'FRECUENCIA')).toBe(true);
    expect(await contar('canal_comunicacion', 'id_gimnasio = $1', [gymB])).toBe(1);
    expect(await contar('envio_mensaje', 'id_gimnasio = $1', [gymB])).toBe(1);
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
    const r = await enviar({ idMiembro: dora, tipo: 'vencida', mensaje: 'Hola Dora' }, tokenC);
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
    expect((await enviar({ idMiembro: carla, tipo: 'vencida', mensaje: 'Hola Carla' })).status).toBe(201);
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
