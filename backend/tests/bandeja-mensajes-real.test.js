/**
 * Bandeja de mensajes del miembro (issue #46, RQF-12) contra una base real.
 *
 * Levanta los routers reales de la app del miembro y de notificaciones sobre
 * TEST_DATABASE_URL y los llama por HTTP. Comprueba, con la columna
 * notificacion.destinatario de la migracion 016:
 *   - el miembro solo ve y marca sus filas MIEMBRO de su gimnasio: ni las del
 *     gimnasio sobre el (acceso bloqueado), ni las de otro miembro, ni las que
 *     lleven su id en otro gimnasio;
 *   - la campana del panel solo muestra y marca filas GIMNASIO;
 *   - el CHECK de destinatario y el DEFAULT GIMNASIO (lo que ya insertaba el
 *     codigo sin decir destinatario sigue siendo del gimnasio).
 *
 * Sirve con las dos formas de crear la base (ConsultasDB + migraciones, y
 * solo migraciones). Seguridad: igual que registro-envio-real.test.js. Sin
 * TEST_DATABASE_URL se salta entera (asi queda en CI) y se niega a correr si
 * la base no es local. Crea sus propios gimnasios y al final borra lo que creo.
 *
 *   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55443/fl_consultas \
 *   npx jest tests/bandeja-mensajes-real.test.js
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
  expect(() => exigirBaseLocal('postgres://u:c@127.0.0.1:55443/x')).not.toThrow();
});

const describeReal = URL_PRUEBA ? describe : describe.skip;

describeReal('bandeja del miembro contra la base real', () => {
  let pool, server, base, establecerBusquedaPersonal;
  const sufijo = crypto.randomBytes(3).toString('hex');
  const gimnasios = [];
  let gymA, gymB, adminA, adminB, ana, beto, eva;
  let tkAdminA, tkAdminB, tkAna, tkBeto, tkEva;
  const n = {}; // ids de notificacion por nombre

  const llamar = async (method, url, tk, body) => {
    const r = await fetch(base + url, {
      method,
      headers: { ...(tk ? { Authorization: `Bearer ${tk}` } : {}), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const uno = async (sql, params) => (await pool.query(sql, params)).rows[0];

  async function crearGimnasio(nombre) {
    const g = await uno("INSERT INTO gimnasio (nombre, telefono) VALUES ($1, '3000000000') RETURNING id_gimnasio", [nombre]);
    gimnasios.push(g.id_gimnasio);
    return g.id_gimnasio;
  }
  async function crearUsuario(gymId, nombre) {
    const { rows: c } = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'id_rol'"
    );
    const cols = ['id_gimnasio', 'nombre', 'email', 'password_hash', 'rol'];
    const vals = [gymId, `Admin ${nombre}`, `bandeja-${sufijo}-${nombre}@prueba.local`, 'x', 'ADMINISTRADOR'];
    if (c.length > 0) { cols.push('id_rol'); vals.push(1); }
    const u = await uno(
      `INSERT INTO usuario (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id_usuario`,
      vals
    );
    return u.id_usuario;
  }
  async function crearMiembro(gymId, nombre) {
    const m = await uno(
      `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, codigo_qr)
       VALUES ($1, $2, $3, '3001234567', $4) RETURNING id_miembro`,
      [gymId, nombre, `bandeja-${sufijo}-${nombre}`, `QRB-${sufijo}-${nombre}`]
    );
    return m.id_miembro;
  }
  /** Inserta una fila de notificacion; sin `destinatario` usa el DEFAULT. */
  async function notificar(nombre, { gym, miembro, tipo = 'RETO', titulo, mensaje, destinatario, minutos = 0 }) {
    const cols = ['id_gimnasio', 'id_miembro', 'tipo', 'titulo', 'mensaje', 'fecha_creacion'];
    const vals = [gym, miembro, tipo, titulo, mensaje || titulo];
    const ph = ['$1', '$2', '$3', '$4', '$5', `NOW() - INTERVAL '${Number(minutos)} minutes'`];
    if (destinatario) { cols.push('destinatario'); vals.push(destinatario); ph.push('$6'); }
    const r = await uno(`INSERT INTO notificacion (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING id_notificacion`, vals);
    n[nombre] = r.id_notificacion;
    return r.id_notificacion;
  }
  const leida = async (nombre) => (await uno('SELECT leida FROM notificacion WHERE id_notificacion = $1', [n[nombre]])).leida;

  beforeAll(async () => {
    pool = poolReal;
    ({ establecerBusquedaPersonal } = require('../src/middleware/auth'));
    establecerBusquedaPersonal(async (payload) => {
      const { rows } = await pool.query('SELECT activo, id_gimnasio, rol AS rol_nombre FROM usuario WHERE id_usuario = $1', [payload.id]);
      return rows[0] || null;
    });

    gymA = await crearGimnasio(`Prueba bandeja A ${sufijo}`);
    gymB = await crearGimnasio(`Prueba bandeja B ${sufijo}`);
    adminA = await crearUsuario(gymA, 'a');
    adminB = await crearUsuario(gymB, 'b');
    ana = await crearMiembro(gymA, 'Ana');
    beto = await crearMiembro(gymA, 'Beto');
    eva = await crearMiembro(gymB, 'Eva');

    // Para el gimnasio, sobre Ana: acceso bloqueado (como lo escribe lib/accesos.js)
    // y reto completado (lib/retos.js).
    const { registrarAccesoBloqueado } = require('../src/lib/accesos');
    await registrarAccesoBloqueado(pool, { gymId: gymA, idMiembro: ana, nombre: 'Ana', motivo: 'SIN_PLAN' });
    n.bloqueoGym = (await uno("SELECT id_notificacion FROM notificacion WHERE id_gimnasio = $1 AND id_miembro = $2 AND tipo = 'ALERTA'", [gymA, ana])).id_notificacion;
    await notificar('retoGym', { gym: gymA, miembro: ana, titulo: 'Reto completado', mensaje: 'Ana completó el reto «A».', destinatario: 'GIMNASIO' });
    // Para Ana. Dos llevan a proposito los titulos que busca la campana.
    await notificar('anaViejo', { gym: gymA, miembro: ana, titulo: '¡Completaste un reto!', mensaje: '¡Completaste el reto «A»!', destinatario: 'MIEMBRO', minutos: 60 });
    await notificar('anaNuevo', { gym: gymA, miembro: ana, titulo: 'Reto cancelado', mensaje: 'El gimnasio canceló el reto «B».', destinatario: 'MIEMBRO', minutos: 5 });
    await notificar('anaTituloGym', { gym: gymA, miembro: ana, titulo: 'Reto completado', destinatario: 'MIEMBRO', minutos: 30 });
    await notificar('anaBloqueo', { gym: gymA, miembro: ana, tipo: 'ALERTA', titulo: 'Acceso bloqueado', destinatario: 'MIEMBRO', minutos: 40 });
    // De Beto, de Eva y una con el id de Ana pero de otro gimnasio.
    await notificar('beto', { gym: gymA, miembro: beto, titulo: '¡Completaste un reto!', destinatario: 'MIEMBRO' });
    await notificar('eva', { gym: gymB, miembro: eva, titulo: '¡Completaste un reto!', destinatario: 'MIEMBRO' });
    await notificar('anaEnB', { gym: gymB, miembro: ana, titulo: '¡Completaste un reto!', destinatario: 'MIEMBRO' });

    const firmar = (id, gymId) => jwt.sign({ id, role: 'admin', gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const firmarMiembro = (idMiembro, gymId) => jwt.sign({ idMiembro, gymId, role: 'cliente' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tkAdminA = firmar(adminA, gymA);
    tkAdminB = firmar(adminB, gymB);
    tkAna = firmarMiembro(ana, gymA);
    tkBeto = firmarMiembro(beto, gymA);
    tkEva = firmarMiembro(eva, gymB);

    const { errorHandler } = require('../src/middleware/errorHandler');
    const app = express();
    app.use(express.json());
    app.use('/api', require('../src/routes/notificaciones'));
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
      // La de Ana en el gimnasio B apunta a un miembro de A: se borra por gimnasio primero.
      for (const tabla of ['notificacion', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = ANY($1::int[])`, g);
      }
    }
    await pool.end();
  });

  test('el DEFAULT es GIMNASIO (lib/accesos.js no dice destinatario) y el CHECK no admite otro valor', async () => {
    expect((await uno('SELECT destinatario FROM notificacion WHERE id_notificacion = $1', [n.bloqueoGym])).destinatario).toBe('GIMNASIO');
    await expect(pool.query(
      "INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje, destinatario) VALUES ($1, $2, 'RETO', 'x', 'x', 'OTRO')",
      [gymA, ana]
    )).rejects.toMatchObject({ code: '23514' });
  });

  test('Ana ve solo sus mensajes MIEMBRO de su gimnasio, el mas reciente primero', async () => {
    const r = await llamar('GET', '/api/cliente/mensajes', tkAna);
    expect(r.status).toBe(200);
    expect(r.body.mensajes.map((m) => m.id)).toEqual([n.anaNuevo, n.anaTituloGym, n.anaBloqueo, n.anaViejo]);
    expect(r.body.no_leidos).toBe(4);
    expect(r.body.mensajes[0]).toMatchObject({ tipo: 'RETO', titulo: 'Reto cancelado', leida: false });
    const ids = r.body.mensajes.map((m) => m.id);
    for (const ajeno of [n.bloqueoGym, n.retoGym, n.beto, n.eva, n.anaEnB]) expect(ids).not.toContain(ajeno);
  });

  test('limit acota la lista pero no el conteo', async () => {
    const r = await llamar('GET', '/api/cliente/mensajes?limit=1', tkAna);
    expect(r.body.mensajes).toHaveLength(1);
    expect(r.body.no_leidos).toBe(4);
  });

  test('marcar uno ajeno, de otro gimnasio o del gimnasio responde 404 y no cambia nada', async () => {
    for (const nombre of ['beto', 'eva', 'anaEnB', 'bloqueoGym', 'retoGym']) {
      const r = await llamar('PATCH', `/api/cliente/mensajes/${n[nombre]}/leido`, tkAna);
      expect(r.status).toBe(404);
      expect(await leida(nombre)).toBe(false);
    }
    expect((await llamar('PATCH', '/api/cliente/mensajes/2147483648/leido', tkAna)).status).toBe(400);
  });

  test('marcar uno propio', async () => {
    const r = await llamar('PATCH', `/api/cliente/mensajes/${n.anaViejo}/leido`, tkAna);
    expect(r.status).toBe(200);
    expect(r.body.no_leidos).toBe(3);
    expect(await leida('anaViejo')).toBe(true);
  });

  test('marcar todos solo toca los de Ana en su gimnasio', async () => {
    const r = await llamar('PATCH', '/api/cliente/mensajes/leidos', tkAna);
    expect(r.status).toBe(200);
    expect(r.body.marcados).toBe(3);
    for (const nombre of ['anaNuevo', 'anaTituloGym', 'anaBloqueo']) expect(await leida(nombre)).toBe(true);
    for (const nombre of ['beto', 'eva', 'anaEnB', 'bloqueoGym', 'retoGym']) expect(await leida(nombre)).toBe(false);
    expect((await llamar('GET', '/api/cliente/mensajes', tkAna)).body.no_leidos).toBe(0);
  });

  test('Beto y Eva ven solo lo suyo; Eva no puede marcar el de Beto', async () => {
    expect((await llamar('GET', '/api/cliente/mensajes', tkBeto)).body.mensajes.map((m) => m.id)).toEqual([n.beto]);
    expect((await llamar('GET', '/api/cliente/mensajes', tkEva)).body.mensajes.map((m) => m.id)).toEqual([n.eva]);
    expect((await llamar('PATCH', `/api/cliente/mensajes/${n.beto}/leido`, tkEva)).status).toBe(404);
    expect(await leida('beto')).toBe(false);
  });

  test('el personal no entra a la bandeja (403) y sin token tampoco (401)', async () => {
    expect((await llamar('GET', '/api/cliente/mensajes', tkAdminA)).status).toBe(403);
    expect((await llamar('GET', '/api/cliente/mensajes')).status).toBe(401);
  });

  test('la campana del panel muestra solo las filas GIMNASIO de su gimnasio', async () => {
    const r = await llamar('GET', '/api/admin/notificaciones', tkAdminA);
    expect(r.status).toBe(200);
    const ids = r.body.avisos.filter((a) => a.idNotificacion).map((a) => a.idNotificacion).sort((x, y) => x - y);
    expect(ids).toEqual([n.bloqueoGym, n.retoGym].sort((x, y) => x - y));
    const otro = await llamar('GET', '/api/admin/notificaciones', tkAdminB);
    expect(otro.body.avisos.filter((a) => a.idNotificacion)).toHaveLength(0);
  });

  test('el personal no puede marcar como visto un mensaje del miembro', async () => {
    await pool.query('UPDATE notificacion SET leida = FALSE WHERE id_notificacion = ANY($1::int[])', [[n.anaTituloGym, n.anaBloqueo]]);
    expect((await llamar('POST', `/api/admin/notificaciones/reto/${n.anaTituloGym}/leida`, tkAdminA)).status).toBe(404);
    expect((await llamar('POST', `/api/admin/notificaciones/acceso-bloqueado/${n.anaBloqueo}/leida`, tkAdminA)).status).toBe(404);
    expect(await leida('anaTituloGym')).toBe(false);
    expect(await leida('anaBloqueo')).toBe(false);
    // El aviso del gimnasio si, y solo desde su gimnasio.
    expect((await llamar('POST', `/api/admin/notificaciones/reto/${n.retoGym}/leida`, tkAdminB)).status).toBe(404);
    expect((await llamar('POST', `/api/admin/notificaciones/reto/${n.retoGym}/leida`, tkAdminA)).status).toBe(200);
    expect(await leida('retoGym')).toBe(true);
  });
});
