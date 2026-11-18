/**
 * RQF-12 contra una base de datos real: retos de asistencia.
 *
 * Levanta los routers reales de retos, check-in, notificaciones y de la app
 * del miembro sobre la base de TEST_DATABASE_URL y los llama por HTTP:
 *   - CRUD de retos con sus validaciones y el aislamiento entre gimnasios;
 *   - inscripcion por segmento en el check-in (TODOS, NUEVOS, INACTIVOS con el
 *     umbral del gimnasio y PROXIMOS_A_VENCER);
 *   - el progreso, la ventana antirrebote y los check-in rechazados;
 *   - el completado una sola vez, tambien con ingresos a la vez, y sus dos avisos;
 *   - la campana (solo destinatario GIMNASIO) y la bandeja del miembro;
 *   - la edicion con inscritos y la cancelacion.
 *
 * Sirve con las dos formas de crear la base (ver docs/evidencias/rqf-12-retos.md):
 *   - ConsultasDB/Query_Inicial_Crear_Tablas.sql y despues node src/db/migrate.js
 *     (asi esta produccion: el servidor aplica las migraciones al arrancar)
 *   - solo las migraciones de backend/migrations (Docker)
 *
 * Seguridad: la misma guardia que registro-envio-real.test.js. Sin
 * TEST_DATABASE_URL se salta entera (asi queda en CI); se niega a correr si la
 * conexion no va a localhost o 127.0.0.1, mirando el destino tal como lo
 * calcula pg; crea sus propios gimnasios y al final borra todo lo que creo,
 * tabla por tabla (en el esquema de ConsultasDB las FK no tienen CASCADE).
 *
 * Uso (desde backend/):
 *
 *   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55437/fl_consultas \
 *   npx jest tests/retos-real.test.js
 */
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const ConnectionParameters = require('pg/lib/connection-parameters');

const HOSTS_LOCALES = ['localhost', '127.0.0.1', '::1', '[::1]'];

/** Lanza si la conexion no va a una base local (mismo parser que usa pg). */
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
  // db.js lee DATABASE_URL al cargarse: se fija antes para que las rutas usen
  // la base de prueba y no la de .env.
  process.env.DATABASE_URL = URL_PRUEBA;
  process.env.DB_SSL = 'false';
  process.env.JWT_SECRET = 'prueba-real-local';
  poolReal = require('../src/db/db');
  // Lo que db.js le paso a pg, por si al reescribir la URL cambio el destino.
  exigirBaseLocal(poolReal.options);
}

describe('guardia de la base de pruebas (retos)', () => {
  test.each([
    'postgres://u:c@127.0.0.1:55437/fl_consultas',
    'postgres://u:c@localhost/fl_migraciones',
  ])('acepta una base local: %s', (url) => {
    expect(() => exigirBaseLocal(url)).not.toThrow();
  });

  test.each([
    ['una base remota', 'postgres://u:c@ep-algo.us-east-2.aws.neon.tech/neondb'],
    ['?host= remoto con hostname local', 'postgres://u:c@127.0.0.1:55437/fl_consultas?host=ep-algo.neon.tech'],
    ['varios hosts', 'postgres://u:c@127.0.0.1,ep-x.neon.tech:5432/fl_consultas'],
  ])('rechaza %s', (_caso, url) => {
    expect(() => exigirBaseLocal(url)).toThrow(/Me niego/);
  });
});

const describeReal = URL_PRUEBA ? describe : describe.skip;

describeReal('RQF-12 contra la base real: retos de asistencia', () => {
  let pool, server, base, establecerBusquedaPersonal;
  const gimnasios = [];
  const sufijo = crypto.randomBytes(3).toString('hex');
  let gymA, gymB, adminA, recepA, adminB;
  let tkAdminA, tkRecepA, tkAdminB;
  const m = {};       // miembros por nombre corto
  const tkM = {};     // tokens de la app por nombre corto
  const r = {};       // retos por nombre corto

  const firmar = (id, gymId, role) => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const firmarMiembro = (idMiembro, gymId) => jwt.sign({ role: 'cliente', idMiembro, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const llamar = async (method, url, tk, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const contar = async (tabla, where, params) =>
    (await pool.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${where}`, params)).rows[0].n;

  // Dia de Colombia, como lo usan las rutas.
  const dia = async (desplazamiento) => (await pool.query(
    `SELECT to_char((NOW() AT TIME ZONE 'America/Bogota')::date + $1::int, 'YYYY-MM-DD') AS d`,
    [desplazamiento]
  )).rows[0].d;

  /** Check-in por documento con la recepcionista del gimnasio A. */
  async function ingresar(corto, { correrVentana = true } = {}) {
    const res = await llamar('POST', '/api/admin/checkin', tkRecepA, { documento: `rqf12-${sufijo}-${corto}` });
    // El siguiente ingreso del mismo miembro no debe caer en la ventana
    // antirrebote (90 s): el ingreso se corre 5 minutos hacia atras.
    if (correrVentana && res.body.checkin && !res.body.duplicado) {
      await pool.query("UPDATE checkin SET fecha_hora = fecha_hora - INTERVAL '5 minutes' WHERE id_checkin = $1",
        [res.body.checkin.id_checkin]);
    }
    return res;
  }

  const inscripcion = async (reto, corto) => (await pool.query(
    `SELECT estado, checkins_acumulados, porcentaje_avance::float AS porcentaje, fecha_completado
       FROM reto_miembro WHERE id_reto = $1 AND id_miembro = $2`,
    [r[reto].id_reto, m[corto]]
  )).rows[0] || null;

  async function crearGimnasio(nombre) {
    const { rows: [g] } = await pool.query(
      "INSERT INTO gimnasio (nombre, telefono) VALUES ($1, '3000000000') RETURNING id_gimnasio",
      [nombre]
    );
    gimnasios.push(g.id_gimnasio);
    return g.id_gimnasio;
  }

  async function crearUsuario(gymId, n, rol) {
    // ConsultasDB tiene la columna rol (texto) y no id_rol; Docker tiene las dos.
    const { rows: c } = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'id_rol'"
    );
    const cols = ['id_gimnasio', 'nombre', 'email', 'password_hash', 'rol'];
    const vals = [gymId, 'Personal prueba', `rqf12-${sufijo}-${n}@prueba.local`, 'x', rol];
    if (c.length > 0) { cols.push('id_rol'); vals.push(rol === 'ADMINISTRADOR' ? 1 : 2); }
    const { rows: [u] } = await pool.query(
      `INSERT INTO usuario (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id_usuario`,
      vals
    );
    return u.id_usuario;
  }

  /**
   * Miembro con plan. registrado: dias desde el registro; vence: dias hasta el
   * fin del plan (negativo = vencido); ultimoIngreso: dias desde un check-in
   * valido anterior (null = nunca vino).
   */
  async function crearMiembro(gymId, corto, { registrado = 60, vence = 60, congelado = false, ultimoIngreso = null } = {}) {
    const { rows: [mb] } = await pool.query(
      `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, codigo_qr, fecha_registro)
       VALUES ($1, $2, $3, '3001234567', $4, NOW() - make_interval(days => $5::int))
       RETURNING id_miembro`,
      [gymId, `${corto[0].toUpperCase()}${corto.slice(1)} Prueba`, `rqf12-${sufijo}-${corto}`, `QR-RQF12-${sufijo}-${corto}`, registrado]
    );
    await pool.query(
      `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, valor_total,
                               valor_pagado, estado_pago, activo, congelado_desde)
       VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 30, CURRENT_DATE + $3::int, 100000, 100000, 'PAGADO', TRUE,
               CASE WHEN $4::boolean THEN CURRENT_DATE - 1 END)`,
      [mb.id_miembro, gymId, vence, congelado]
    );
    if (ultimoIngreso !== null) {
      await pool.query(
        `INSERT INTO checkin (id_miembro, id_gimnasio, metodo, valido, fecha_hora)
         VALUES ($1, $2, 'MANUAL', TRUE, NOW() - make_interval(days => $3::int))`,
        [mb.id_miembro, gymId, ultimoIngreso]
      );
    }
    m[corto] = mb.id_miembro;
    tkM[corto] = firmarMiembro(mb.id_miembro, gymId);
    return mb.id_miembro;
  }

  async function crearReto(corto, datos, tk = tkAdminA) {
    const res = await llamar('POST', '/api/admin/retos', tk, {
      nombre: `${corto} ${sufijo}`,
      descripcion: `Reto de prueba ${corto}`,
      recompensa: `Premio ${corto}`,
      fecha_inicio: await dia(0),
      fecha_fin: await dia(10),
      ...datos,
    });
    expect(res.status).toBe(201);
    r[corto] = res.body.reto;
    return res.body.reto;
  }

  beforeAll(async () => {
    pool = poolReal;
    ({ establecerBusquedaPersonal } = require('../src/middleware/auth'));
    const retosRouter = require('../src/routes/retos');
    const checkinRouter = require('../src/routes/checkin');
    const notifRouter = require('../src/routes/notificaciones');
    const clienteRouter = require('../src/routes/cliente');
    const { errorHandler } = require('../src/middleware/errorHandler');

    // El middleware real lee usuario.id_rol, que el usuario de ConsultasDB no
    // tiene. Se lee el mismo usuario con las columnas de los dos esquemas.
    establecerBusquedaPersonal(async (payload) => {
      const { rows } = await pool.query(
        'SELECT activo, id_gimnasio, rol AS rol_nombre FROM usuario WHERE id_usuario = $1',
        [payload.id]
      );
      return rows[0] || null;
    });

    gymA = await crearGimnasio(`Prueba RQF-12 A ${sufijo}`);
    gymB = await crearGimnasio(`Prueba RQF-12 B ${sufijo}`);
    // Umbral de abandono propio del gimnasio A: 10 dias (no los 7 por defecto).
    await pool.query(
      'INSERT INTO configuracion_gimnasio (id_gimnasio, umbral_alerta_amarilla, umbral_alerta_roja) VALUES ($1, 10, 20)',
      [gymA]
    );
    adminA = await crearUsuario(gymA, 'a-admin', 'ADMINISTRADOR');
    recepA = await crearUsuario(gymA, 'a-recep', 'RECEPCIONISTA');
    adminB = await crearUsuario(gymB, 'b-admin', 'ADMINISTRADOR');
    tkAdminA = firmar(adminA, gymA, 'admin');
    tkRecepA = firmar(recepA, gymA, 'receptionist');
    tkAdminB = firmar(adminB, gymB, 'admin');

    // Quien nunca vino cuenta como inactivo desde su registro (como en
    // jobs/abandono.js): Ana y Vera vinieron hace 2 dias para no serlo.
    await crearMiembro(gymA, 'ana', { ultimoIngreso: 2 });              // TODOS
    await crearMiembro(gymA, 'nico', { registrado: 5 });                // NUEVOS
    await crearMiembro(gymA, 'ines', { registrado: 90, ultimoIngreso: 15 }); // INACTIVA (15 >= 10)
    await crearMiembro(gymA, 'ivan', { registrado: 90, ultimoIngreso: 8 });  // no inactivo con el umbral 10
    await crearMiembro(gymA, 'olga', { registrado: 60 });               // nunca vino: inactiva desde el registro
    await crearMiembro(gymA, 'vera', { vence: 3, ultimoIngreso: 2 });   // PROXIMOS_A_VENCER
    await crearMiembro(gymA, 'cami', { congelado: true });              // congelada: no entra
    await crearMiembro(gymA, 'vico', { vence: -2 });                    // vencido: no entra
    await crearMiembro(gymA, 'vale', { vence: -5 });                    // vencida, nunca intento entrar
    await crearMiembro(gymA, 'carla', { ultimoIngreso: 1 });            // ingresos a la vez
    await crearMiembro(gymB, 'beto');

    const app = express();
    app.use(express.json());
    app.use('/api', retosRouter);
    app.use('/api', checkinRouter);
    app.use('/api', notifRouter);
    app.use('/api/cliente', clienteRouter);
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
      await pool.query('DELETE FROM reto_miembro WHERE id_reto IN (SELECT id_reto FROM reto WHERE id_gimnasio = ANY($1::int[]))', [gimnasios]);
      await pool.query('DELETE FROM hito_miembro WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = ANY($1::int[]))', [gimnasios]);
      for (const tabla of ['notificacion', 'reto', 'checkin', 'plan_cobro', 'configuracion_gimnasio', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = ANY($1::int[])`, [gimnasios]);
      }
    }
    await pool.end();
  });

  // ------------------------------------------------------------------ CRUD
  describe('CRUD del administrador', () => {
    test('crea los retos con su segmento, meta, fechas y recompensa', async () => {
      await crearReto('todos', { meta_asistencias: 2, segmento_elegible: 'TODOS' });
      await crearReto('nuevos', { meta_asistencias: 1, segmento_elegible: 'NUEVOS' });
      await crearReto('inactivos', { meta_asistencias: 1, segmento_elegible: 'INACTIVOS' });
      await crearReto('porvencer', { meta_asistencias: 1, segmento_elegible: 'PROXIMOS_A_VENCER' });
      await crearReto('futuro', { meta_asistencias: 1, segmento_elegible: 'TODOS', fecha_inicio: await dia(1) });
      await crearReto('deB', { meta_asistencias: 1, segmento_elegible: 'TODOS' }, tkAdminB);

      expect(r.todos).toMatchObject({
        meta_asistencias: 2, segmento_elegible: 'TODOS', recompensa: 'Premio todos',
        fecha_inicio: await dia(0), fecha_fin: await dia(10), estado: 'ACTIVO', activo: true,
      });
      expect(r.futuro.estado).toBe('PROGRAMADO');
      const { rows: [fila] } = await pool.query(
        'SELECT id_gimnasio, creado_por, estado FROM reto WHERE id_reto = $1', [r.todos.id_reto]
      );
      expect(fila).toEqual({ id_gimnasio: gymA, creado_por: adminA, estado: 'ACTIVO' });
    });

    test('valida: fin antes del inicio, segmento desconocido, meta 0 y sin recompensa', async () => {
      const ok = { nombre: 'X', recompensa: 'Y', meta_asistencias: 3, segmento_elegible: 'TODOS',
        fecha_inicio: await dia(5), fecha_fin: await dia(10) };
      const casos = [
        { ...ok, fecha_fin: await dia(4) },
        { ...ok, segmento_elegible: 'POR_ETIQUETA' },
        { ...ok, meta_asistencias: 0 },
        { ...ok, recompensa: '  ' },
        { ...ok, fecha_inicio: await dia(-20), fecha_fin: await dia(-1) },
      ];
      const antes = await contar('reto', 'id_gimnasio = $1', [gymA]);
      for (const body of casos) {
        const res = await llamar('POST', '/api/admin/retos', tkAdminA, body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      expect(await contar('reto', 'id_gimnasio = $1', [gymA])).toBe(antes);
    });

    test('la recepcionista no puede crear ni listar retos', async () => {
      expect((await llamar('GET', '/api/admin/retos', tkRecepA)).status).toBe(403);
      expect((await llamar('POST', '/api/admin/retos', tkRecepA, {})).status).toBe(403);
    });

    test('aislamiento: cada gimnasio solo ve, edita, cancela y consulta sus retos', async () => {
      const listaB = await llamar('GET', '/api/admin/retos', tkAdminB);
      expect(listaB.status).toBe(200);
      expect(listaB.body.retos.map((x) => x.id_reto)).toEqual([r.deB.id_reto]);

      const listaA = await llamar('GET', '/api/admin/retos', tkAdminA);
      expect(listaA.body.retos.map((x) => x.id_reto)).not.toContain(r.deB.id_reto);

      expect((await llamar('PUT', `/api/admin/retos/${r.todos.id_reto}`, tkAdminB, { nombre: 'Hackeado' })).status).toBe(404);
      expect((await llamar('DELETE', `/api/admin/retos/${r.todos.id_reto}`, tkAdminB)).status).toBe(404);
      expect((await llamar('GET', `/api/admin/retos/${r.todos.id_reto}/progreso`, tkAdminB)).status).toBe(404);
      const { rows: [fila] } = await pool.query('SELECT nombre, activo FROM reto WHERE id_reto = $1', [r.todos.id_reto]);
      expect(fila).toEqual({ nombre: `todos ${sufijo}`, activo: true });
    });
  });

  // ------------------------------------------------------------------ check-in
  describe('inscripcion y progreso en el check-in', () => {
    test('primer ingreso de Ana: la inscribe solo en el reto de TODOS vigente y suma 1', async () => {
      const res = await ingresar('ana');
      expect(res.status).toBe(201);
      expect(res.body.retos.progreso).toEqual([
        expect.objectContaining({ id: r.todos.id_reto, acumulados: 1, meta: 2, porcentaje: 50, completado: false }),
      ]);
      expect(res.body.retos.completados).toEqual([]);
      expect(await inscripcion('todos', 'ana')).toMatchObject({ estado: 'EN_CURSO', checkins_acumulados: 1, porcentaje: 50 });
      // No es nueva, ni inactiva, ni por vencer, y el reto futuro no ha empezado.
      for (const reto of ['nuevos', 'inactivos', 'porvencer', 'futuro']) {
        expect(await inscripcion(reto, 'ana')).toBeNull();
      }
    });

    test('un ingreso repetido dentro de la ventana antirrebote no suma', async () => {
      const primero = await ingresar('ivan', { correrVentana: false });
      expect(primero.status).toBe(201);
      const repetido = await ingresar('ivan', { correrVentana: false });
      expect(repetido.status).toBe(200);
      expect(repetido.body.duplicado).toBe(true);
      expect(await inscripcion('todos', 'ivan')).toMatchObject({ checkins_acumulados: 1 });
    });

    test('INACTIVOS usa el umbral del gimnasio (10 dias): Ines (15) entra, Ivan (8) no', async () => {
      const res = await ingresar('ines');
      expect(res.status).toBe(201);
      expect(await inscripcion('inactivos', 'ines')).toMatchObject({ estado: 'COMPLETADO', checkins_acumulados: 1 });
      expect(await inscripcion('inactivos', 'ivan')).toBeNull();
    });

    test('INACTIVOS: quien nunca vino cuenta desde su registro (Olga, 60 dias)', async () => {
      await ingresar('olga');
      expect(await inscripcion('inactivos', 'olga')).toMatchObject({ estado: 'COMPLETADO' });
    });

    test('NUEVOS: Nico (5 dias de inscrito) entra; PROXIMOS_A_VENCER: Vera (vence en 3) entra', async () => {
      await ingresar('nico');
      expect(await inscripcion('nuevos', 'nico')).toMatchObject({ estado: 'COMPLETADO' });
      expect(await inscripcion('porvencer', 'nico')).toBeNull();
      await ingresar('vera');
      expect(await inscripcion('porvencer', 'vera')).toMatchObject({ estado: 'COMPLETADO' });
      expect(await inscripcion('nuevos', 'vera')).toBeNull();
    });

    test('los check-in rechazados (congelada, vencido) no inscriben ni suman', async () => {
      const congelada = await ingresar('cami');
      expect(congelada.body.miembro.estado).toBe('CONGELADO');
      const vencido = await ingresar('vico');
      expect(vencido.body.miembro.estado).toBe('VENCIDO');
      expect(await contar('reto_miembro', 'id_miembro = ANY($1::int[])', [[m.cami, m.vico]])).toBe(0);
    });

    test('al llegar a la meta: COMPLETADO, fecha y 100 %, con el mensaje para la pantalla', async () => {
      const res = await ingresar('ana');
      expect(res.status).toBe(201);
      expect(res.body.retos.completados).toEqual([
        expect.objectContaining({ id: r.todos.id_reto, acumulados: 2, porcentaje: 100, completado: true, recompensa: 'Premio todos' }),
      ]);
      expect(res.body.retos.mensaje).toBe(`¡Completaste el reto «todos ${sufijo}»!`);
      const fila = await inscripcion('todos', 'ana');
      expect(fila).toMatchObject({ estado: 'COMPLETADO', checkins_acumulados: 2, porcentaje: 100 });
      expect(fila.fecha_completado).not.toBeNull();
    });

    test('avisa una vez al gimnasio y una al miembro', async () => {
      const { rows } = await pool.query(
        `SELECT destinatario, tipo, titulo, mensaje, leida FROM notificacion
          WHERE id_gimnasio = $1 AND id_miembro = $2 AND tipo = 'RETO' ORDER BY destinatario`,
        [gymA, m.ana]
      );
      expect(rows).toEqual([
        { destinatario: 'GIMNASIO', tipo: 'RETO', titulo: 'Reto completado', leida: false,
          mensaje: `Ana Prueba completó el reto «todos ${sufijo}». Recompensa: Premio todos.` },
        { destinatario: 'MIEMBRO', tipo: 'RETO', titulo: '¡Completaste un reto!', leida: false,
          mensaje: `¡Completaste el reto «todos ${sufijo}»! Tu recompensa: Premio todos. Reclámala en recepción.` },
      ]);
    });

    test('despues de completar, otro ingreso no lo vuelve a completar ni a avisar', async () => {
      const res = await ingresar('ana');
      expect(res.status).toBe(201);
      expect(res.body.retos.completados).toEqual([]);
      const fila = await inscripcion('todos', 'ana');
      expect(fila).toMatchObject({ estado: 'COMPLETADO', checkins_acumulados: 2 });
      expect(await contar('notificacion', "id_miembro = $1 AND tipo = 'RETO'", [m.ana])).toBe(2);
    });
  });

  // ------------------------------------------------------------------ progreso
  describe('progreso de los inscritos (HU-29)', () => {
    test('lista a los inscritos con su avance, primero los que completaron', async () => {
      const res = await llamar('GET', `/api/admin/retos/${r.todos.id_reto}/progreso`, tkAdminA);
      expect(res.status).toBe(200);
      expect(res.body.miembros[0]).toMatchObject({ id_miembro: m.ana, estado: 'COMPLETADO', checkins_acumulados: 2, porcentaje_avance: 100 });
      const enCurso = res.body.miembros.filter((x) => x.estado === 'EN_CURSO').map((x) => x.id_miembro);
      expect(enCurso).toEqual(expect.arrayContaining([m.ivan, m.ines, m.nico, m.vera]));
      expect(res.body.resumen).toMatchObject({ completados: 1, cancelados: 0 });
      expect(res.body.resumen.inscritos).toBe(res.body.miembros.length);

      const soloCompletados = await llamar('GET', `/api/admin/retos/${r.todos.id_reto}/progreso?estado=COMPLETADO`, tkAdminA);
      expect(soloCompletados.body.miembros.map((x) => x.id_miembro)).toEqual([m.ana]);
      expect((await llamar('GET', `/api/admin/retos/${r.todos.id_reto}/progreso?estado=PERDIDO`, tkAdminA)).status).toBe(400);
    });
  });

  // ------------------------------------------------------------------ campana
  describe('campana del administrador', () => {
    test('los retos completados salen en la campana, con nombre y recompensa', async () => {
      const res = await llamar('GET', '/api/admin/retos/avisos', tkRecepA);
      expect(res.status).toBe(200);
      const deAna = res.body.avisos.find((a) => a.idMiembro === m.ana);
      expect(deAna).toMatchObject({ tipo: 'reto-completado', nombreMiembro: 'Ana Prueba' });
      expect(deAna.titulo).toContain(`«todos ${sufijo}»`);
      expect(deAna.titulo).toContain('Premio todos');
      // Del gimnasio B no sale nada.
      expect((await llamar('GET', '/api/admin/retos/avisos', tkAdminB)).body.avisos).toEqual([]);
    });

    test('marcar como visto: el otro gimnasio no puede; el propio si, y desaparece', async () => {
      const { body } = await llamar('GET', '/api/admin/retos/avisos', tkAdminA);
      const aviso = body.avisos.find((a) => a.idMiembro === m.ana);
      expect((await llamar('POST', `/api/admin/retos/avisos/${aviso.idNotificacion}/leida`, tkAdminB)).status).toBe(404);
      expect((await llamar('POST', `/api/admin/retos/avisos/${aviso.idNotificacion}/leida`, tkAdminA)).status).toBe(200);
      const despues = await llamar('GET', '/api/admin/retos/avisos', tkAdminA);
      expect(despues.body.avisos.map((a) => a.idNotificacion)).not.toContain(aviso.idNotificacion);
    });

    test('un mensaje para la app del miembro no sale en la campana, aunque parezca un acceso bloqueado', async () => {
      // Vale tiene el plan vencido y nunca intento entrar: su unica fila es un
      // mensaje para la app con el mismo tipo y titulo que el acceso bloqueado
      // que lee la campana. Sin el filtro por destinatario, saldria.
      await pool.query(
        `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje, destinatario)
         VALUES ($1, $2, 'ALERTA', 'Acceso bloqueado', 'Tu membresia esta vencida. Acercate a recepcion.', 'MIEMBRO')`,
        [gymA, m.vale]
      );
      const res = await llamar('GET', '/api/admin/notificaciones', tkRecepA);
      expect(res.status).toBe(200);
      const bloqueados = res.body.avisos.filter((a) => a.tipo === 'acceso-bloqueado').map((a) => a.idMiembro);
      // Los accesos bloqueados reales del check-in (destinatario GIMNASIO por defecto) si salen.
      expect(bloqueados).toEqual(expect.arrayContaining([m.cami, m.vico]));
      expect(bloqueados).not.toContain(m.vale);
    });
  });

  // ------------------------------------------------------------------ app del miembro
  describe('bandeja de la app del miembro', () => {
    test('el miembro solo ve sus mensajes (no los del gimnasio ni los de otros)', async () => {
      const res = await llamar('GET', '/api/cliente/mensajes', tkM.ana);
      expect(res.status).toBe(200);
      expect(res.body.mensajes).toEqual([
        expect.objectContaining({ tipo: 'RETO', titulo: '¡Completaste un reto!', leida: false }),
      ]);
      expect(res.body.no_leidos).toBe(1);
      // Cami solo tiene el acceso bloqueado, que es del gimnasio: su bandeja esta vacia.
      const cami = await llamar('GET', '/api/cliente/mensajes', tkM.cami);
      expect(cami.body.mensajes).toEqual([]);
      expect(await contar('notificacion', "id_miembro = $1 AND destinatario = 'GIMNASIO'", [m.cami])).toBeGreaterThan(0);
    });

    test('no puede marcar un mensaje ajeno ni de otro gimnasio: 404 y queda sin leer', async () => {
      const { body } = await llamar('GET', '/api/cliente/mensajes', tkM.nico);
      const deNico = body.mensajes[0].id;
      expect((await llamar('PATCH', `/api/cliente/mensajes/${deNico}/leido`, tkM.ana)).status).toBe(404);
      expect((await llamar('PATCH', `/api/cliente/mensajes/${deNico}/leido`, tkM.beto)).status).toBe(404);
      expect(await contar('notificacion', 'id_notificacion = $1 AND leida = FALSE', [deNico])).toBe(1);
      // Tampoco un aviso del gimnasio sobre el mismo miembro.
      const { rows: [delGym] } = await pool.query(
        "SELECT id_notificacion FROM notificacion WHERE id_miembro = $1 AND destinatario = 'GIMNASIO' LIMIT 1", [m.nico]
      );
      expect((await llamar('PATCH', `/api/cliente/mensajes/${delGym.id_notificacion}/leido`, tkM.nico)).status).toBe(404);
    });

    test('marca uno propio y despues todos', async () => {
      const { body } = await llamar('GET', '/api/cliente/mensajes', tkM.ana);
      const uno = await llamar('PATCH', `/api/cliente/mensajes/${body.mensajes[0].id}/leido`, tkM.ana);
      expect(uno.status).toBe(200);
      expect(uno.body.no_leidos).toBe(0);

      const todos = await llamar('PATCH', '/api/cliente/mensajes/leidos', tkM.vale);
      expect(todos.body.marcados).toBe(1);
      expect((await llamar('GET', '/api/cliente/mensajes', tkM.vale)).body.no_leidos).toBe(0);
    });

    test('la app lista los retos de su segmento y los completados, con progreso y recompensa', async () => {
      const ana = await llamar('GET', '/api/cliente/retos', tkM.ana);
      expect(ana.status).toBe(200);
      const ids = ana.body.retos.map((x) => x.id_reto);
      expect(ids).toEqual(expect.arrayContaining([r.todos.id_reto, r.futuro.id_reto]));
      for (const ajeno of ['nuevos', 'inactivos', 'porvencer', 'deB']) expect(ids).not.toContain(r[ajeno].id_reto);
      expect(ana.body.retos.find((x) => x.id_reto === r.todos.id_reto)).toMatchObject({
        participa: true, completado: true, checkins_acumulados: 2, porcentaje_avance: 100,
        meta_asistencias: 2, recompensa: 'Premio todos', fecha_fin: await dia(10),
      });
      expect(ana.body.retos.find((x) => x.id_reto === r.futuro.id_reto)).toMatchObject({ participa: false, elegible: true });

      const ivan = await llamar('GET', '/api/cliente/retos', tkM.ivan);
      expect(ivan.body.retos.map((x) => x.id_reto)).not.toContain(r.inactivos.id_reto);
    });
  });

  // ------------------------------------------------------------------ editar y cancelar
  describe('editar y cancelar', () => {
    test('con inscritos no se cambian las reglas, pero si el nombre y la recompensa', async () => {
      const meta = await llamar('PUT', `/api/admin/retos/${r.todos.id_reto}`, tkAdminA, { meta_asistencias: 5 });
      expect(meta.status).toBe(409);
      expect(meta.body.code).toBe('RETO_CON_INSCRITOS');
      const nombre = await llamar('PUT', `/api/admin/retos/${r.todos.id_reto}`, tkAdminA,
        { nombre: `todos ${sufijo} (editado)`, recompensa: 'Premio todos' });
      expect(nombre.status).toBe(200);
      expect(nombre.body.reto.nombre).toBe(`todos ${sufijo} (editado)`);
      // Sin inscritos si se cambian las fechas, revalidadas.
      const malas = await llamar('PUT', `/api/admin/retos/${r.futuro.id_reto}`, tkAdminA, { fecha_fin: await dia(0) });
      expect(malas.status).toBe(400);
      const fechas = await llamar('PUT', `/api/admin/retos/${r.futuro.id_reto}`, tkAdminA, { fecha_inicio: await dia(0) });
      expect(fechas.status).toBe(200);
      expect(fechas.body.reto.estado).toBe('ACTIVO');
    });

    test('cancelar: deja de sumar, conserva el progreso y avisa a los inscritos en curso', async () => {
      const antesNico = await inscripcion('todos', 'nico');
      const res = await llamar('DELETE', `/api/admin/retos/${r.todos.id_reto}`, tkAdminA);
      expect(res.status).toBe(200);
      expect(res.body.reto.estado).toBe('CANCELADO');
      expect(res.body.inscripcionesCanceladas).toBeGreaterThanOrEqual(4);
      // Ana ya lo habia completado: sigue completado.
      expect(await inscripcion('todos', 'ana')).toMatchObject({ estado: 'COMPLETADO' });
      expect(await inscripcion('todos', 'nico')).toMatchObject({ estado: 'CANCELADO', checkins_acumulados: antesNico.checkins_acumulados });
      expect(await contar('notificacion', "id_miembro = $1 AND destinatario = 'MIEMBRO' AND titulo = 'Reto cancelado'", [m.nico])).toBe(1);
      expect(await contar('notificacion', "id_miembro = $1 AND titulo = 'Reto cancelado'", [m.ana])).toBe(0);

      await ingresar('nico');
      expect(await inscripcion('todos', 'nico')).toMatchObject({ estado: 'CANCELADO', checkins_acumulados: antesNico.checkins_acumulados });

      expect((await llamar('DELETE', `/api/admin/retos/${r.todos.id_reto}`, tkAdminA)).status).toBe(409);
      expect((await llamar('PUT', `/api/admin/retos/${r.todos.id_reto}`, tkAdminA, { nombre: 'Otra vez' })).status).toBe(409);
    });
  });

  // ------------------------------------------------------------------ concurrencia
  // Al final, cuando el reto de TODOS ya esta cancelado: asi Carla solo suma en
  // el reto nuevo y en el que se movio a hoy, y no cambia los conteos de arriba.
  describe('ingresos a la vez', () => {
    test('tres ingresos a la vez: el reto se completa y se avisa una sola vez', async () => {
      await crearReto('simultaneo', { meta_asistencias: 1, segmento_elegible: 'TODOS' });
      const respuestas = await Promise.all([1, 2, 3].map(() => ingresar('carla', { correrVentana: false })));
      expect(respuestas.every((x) => [200, 201].includes(x.status))).toBe(true);
      expect(await inscripcion('simultaneo', 'carla')).toMatchObject({ estado: 'COMPLETADO', checkins_acumulados: 1 });
      expect(await contar('notificacion',
        "id_miembro = $1 AND tipo = 'RETO' AND destinatario = 'GIMNASIO' AND mensaje LIKE $2",
        [m.carla, `%«simultaneo ${sufijo}»%`])).toBe(1);
      expect(await contar('notificacion',
        "id_miembro = $1 AND tipo = 'RETO' AND destinatario = 'MIEMBRO' AND mensaje LIKE $2",
        [m.carla, `%«simultaneo ${sufijo}»%`])).toBe(1);
    });
  });
});
