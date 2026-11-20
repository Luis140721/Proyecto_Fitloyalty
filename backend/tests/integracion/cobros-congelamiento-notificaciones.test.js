/**
 * Integracion, capa BD (semana 6): las tablas que el #69 no probo.
 *
 *  - plan_cobro (migracion 004): el plan y los cobros del miembro.
 *  - congelacion_plan (010): el historial de congelamientos.
 *  - notificacion y envio_mensaje (014): los avisos y los envios por WhatsApp.
 *
 * Por cada tabla, sus restricciones (NOT NULL, largo, CHECK, NUMERIC, UNIQUE y
 * llaves foraneas, con el codigo de PostgreSQL) y sus consultas: las rutas de
 * routes/miembros.js corren contra la BD real y los tests miran lo que quedo
 * guardado, no solo la respuesta. Lo que el #69 ya cubre de notificacion (el
 * aviso de acceso bloqueado y su llave sin CASCADE), lo que cubre el #73 de
 * envio_mensaje (el registro del envio) y lo que plan-cobro.test.js (#83) ya
 * prueba de plan_cobro y de ULTIMO_PLAN no se repite.
 *
 * Codigos: 23502 NOT NULL · 22001 texto mas largo que la columna · 22003
 * numero fuera de NUMERIC(10,2) · 23514 CHECK · 23505 UNIQUE · 23503 llave foranea.
 *
 * Limpieza: cada test corre en una transaccion de un cliente propio y termina
 * con ROLLBACK, como el #69. Las rutas usan el pool y abren sus propias
 * transacciones, asi que en el bloque de las consultas el pool del test manda
 * todo a esa misma conexion y convierte el BEGIN, COMMIT y ROLLBACK de la ruta
 * en SAVEPOINT, RELEASE y ROLLBACK TO: el SQL de la ruta corre tal cual y nada
 * queda en la BD. Sin la BD de pruebas configurada (ver bd-pruebas.js) se
 * salta. Sin credenciales.
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { MARCA, documentoUnico, crearGimnasio, crearUsuario, crearMiembro, errorDe } = require('./datos');

jest.mock('../../src/lib/email', () => ({ sendMemberQR: async () => ({ delivered: true }) }));
jest.mock('../../src/lib/whatsapp', () => ({ sendWhatsAppQR: async () => {} }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const SECRETO = 'secreto-de-pruebas';
process.env.JWT_SECRET = SECRETO;

const TABLAS = ['plan_cobro', 'congelacion_plan', 'notificacion', 'envio_mensaje'];

// Lo que dicen las migraciones de estas cuatro tablas. El primer test las
// compara con la BD migrada: si una migracion cambia una columna obligatoria,
// un largo o una restriccion, falla hasta que se actualice aqui.

// Columnas NOT NULL, menos los id. Las que tienen valor por defecto tambien
// rechazan un NULL explicito.
const NO_NULOS = [
  ['plan_cobro', 'id_miembro'], ['plan_cobro', 'id_gimnasio'], ['plan_cobro', 'valor_pagado'], ['plan_cobro', 'fecha_creacion'],
  ['congelacion_plan', 'id_plan_cobro'], ['congelacion_plan', 'id_miembro'], ['congelacion_plan', 'id_gimnasio'],
  ['congelacion_plan', 'fecha_inicio'], ['congelacion_plan', 'creada_en'],
  ['notificacion', 'id_gimnasio'], ['notificacion', 'tipo'], ['notificacion', 'titulo'], ['notificacion', 'mensaje'],
  ['notificacion', 'leida'], ['notificacion', 'fecha_creacion'],
  ['envio_mensaje', 'id_gimnasio'], ['envio_mensaje', 'id_miembro'], ['envio_mensaje', 'id_canal'],
  ['envio_mensaje', 'mensaje_copiado'], ['envio_mensaje', 'estado'], ['envio_mensaje', 'fecha_envio'],
];
// Estas las prueba plan-cobro.test.js (#83): aqui solo entran en la comparacion con la BD.
const NO_NULOS_EN_PLAN_COBRO_TEST = [
  ['plan_cobro', 'tipo_plan'], ['plan_cobro', 'fecha_inicio'], ['plan_cobro', 'fecha_fin'], ['plan_cobro', 'valor_total'],
  ['plan_cobro', 'estado_pago'], ['plan_cobro', 'activo'],
];

// Columnas VARCHAR(n) de texto libre: n cabe y n+1 no.
const LARGOS = [
  ['plan_cobro', 'referencia_pago', 100], ['congelacion_plan', 'motivo', 200], ['notificacion', 'titulo', 150],
];
// Columnas VARCHAR(n) con CHECK: solo admiten su lista, que se prueba abajo.
const LARGOS_CON_CHECK = [
  ['plan_cobro', 'tipo_plan', 50], ['plan_cobro', 'metodo_pago', 30], ['plan_cobro', 'estado_pago', 20],
  ['notificacion', 'tipo', 30], ['envio_mensaje', 'estado', 20],
];

// [tabla, columna, valores que admite el CHECK, nombre del CHECK]. El de
// plan_cobro.tipo_plan lo prueba plan-cobro.test.js (#83), que acepta cada valor y
// rechaza otro; de metodo_pago y estado_pago el #83 solo prueba el rechazo.
const CHECKS = [
  ['plan_cobro', 'metodo_pago', ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'PSE', 'NEQUI', 'DAVIPLATA', 'OTRO'], 'chk_metodo_pago'],
  ['plan_cobro', 'estado_pago', ['PENDIENTE', 'PAGADO', 'PARCIAL'], 'chk_estado_pago'],
  ['notificacion', 'tipo', ['ALERTA', 'RETO', 'CAMPANA', 'SISTEMA'], 'notificacion_tipo_check'],
  ['envio_mensaje', 'estado', ['PENDIENTE', 'ENVIADO', 'FALLIDO'], 'envio_mensaje_estado_check'],
];

// UNIQUE, llaves foraneas y CHECK de las cuatro tablas (pg_constraint).
const RESTRICCIONES = [
  'chk_tipo_plan', 'chk_metodo_pago', 'chk_estado_pago',
  'plan_cobro_id_miembro_fkey', 'plan_cobro_id_gimnasio_fkey', 'plan_cobro_actualizado_por_fkey',
  'ck_congelacion_fechas', 'ck_congelacion_dias',
  'congelacion_plan_id_plan_cobro_fkey', 'congelacion_plan_id_miembro_fkey', 'congelacion_plan_id_gimnasio_fkey',
  'congelacion_plan_congelada_por_fkey', 'congelacion_plan_descongelada_por_fkey',
  'notificacion_tipo_check', 'notificacion_id_gimnasio_fkey', 'notificacion_id_usuario_fkey', 'notificacion_id_miembro_fkey',
  'envio_mensaje_estado_check', 'envio_mensaje_id_gimnasio_fkey', 'envio_mensaje_id_miembro_fkey', 'envio_mensaje_id_canal_fkey',
  'envio_mensaje_id_alerta_fkey', 'envio_mensaje_id_campana_fkey', 'envio_mensaje_id_plantilla_fkey', 'envio_mensaje_enviado_por_fkey',
];

async function crearPlan(db, miembro, campos = {}) {
  const { rows } = await db.query(
    `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, valor_total, valor_pagado, estado_pago, activo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [miembro.id_miembro, miembro.id_gimnasio, campos.tipo_plan ?? 'MENSUAL', campos.fecha_inicio ?? '2026-01-01',
      campos.fecha_fin ?? '2026-01-31', campos.valor_total ?? 100000, campos.valor_pagado ?? 0,
      campos.estado_pago ?? 'PENDIENTE', campos.activo ?? true],
  );
  return rows[0];
}

async function crearCanal(db, idGimnasio) {
  const { rows } = await db.query(
    "INSERT INTO canal_comunicacion (id_gimnasio, tipo) VALUES ($1, 'WHATSAPP') RETURNING *",
    [idGimnasio],
  );
  return rows[0];
}

function insertar(tabla, fila) {
  const columnas = Object.keys(fila);
  return [
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(fila),
  ];
}

describeConBd('plan_cobro, congelacion_plan, notificacion y envio_mensaje contra la BD real', () => {
  let pool;
  let conectar;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    // El connect real, antes de que el bloque de las rutas lo reemplace.
    conectar = pool.connect.bind(pool);
  }, 60_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  // Un cliente propio por test, con BEGIN al empezar y ROLLBACK al terminar.
  const tx = { cliente: null };
  async function abrir() {
    tx.cliente = await conectar();
    await tx.cliente.query('BEGIN');
  }
  async function deshacer() {
    await tx.cliente.query('ROLLBACK');
    tx.cliente.release();
    // Red de la limpieza: desde otra conexion no debe verse ningun gimnasio de
    // esta corrida. Si alguien cambia el ROLLBACK por un COMMIT, falla aqui.
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM gimnasio WHERE nombre LIKE $1', [`%${MARCA}%`]);
    expect(rows[0].n).toBe(0);
  }

  /** Una fila con lo minimo que la tabla exige, lista para insertar. */
  async function filaValida(tabla) {
    const gym = await crearGimnasio(tx.cliente);
    if (tabla === 'notificacion') return { id_gimnasio: gym.id_gimnasio, tipo: 'SISTEMA', titulo: 'Aviso', mensaje: 'Hola' };
    const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
    if (tabla === 'plan_cobro') {
      return { id_miembro: miembro.id_miembro, id_gimnasio: gym.id_gimnasio, tipo_plan: 'MENSUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31' };
    }
    if (tabla === 'congelacion_plan') {
      const plan = await crearPlan(tx.cliente, miembro);
      return { id_plan_cobro: plan.id_plan_cobro, id_miembro: miembro.id_miembro, id_gimnasio: gym.id_gimnasio, fecha_inicio: '2026-01-10' };
    }
    const canal = await crearCanal(tx.cliente, gym.id_gimnasio);
    return { id_gimnasio: gym.id_gimnasio, id_miembro: miembro.id_miembro, id_canal: canal.id_canal, mensaje_copiado: 'Hola' };
  }

  // -------------------------------------------------------------------------
  describe('restricciones', () => {
    beforeEach(abrir);
    afterEach(deshacer);

    test('las listas de este archivo son las de la BD migrada', async () => {
      // Arrange: la BD recien migrada
      // Act
      const { rows: columnas } = await tx.cliente.query(
        `SELECT table_name AS tabla, column_name AS columna, is_nullable, data_type, character_maximum_length AS largo
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [TABLAS],
      );
      const { rows: restricciones } = await tx.cliente.query(
        "SELECT conname FROM pg_constraint WHERE conrelid::regclass::text = ANY($1) AND contype IN ('u', 'f', 'c')",
        [TABLAS],
      );

      // Assert
      const id = (t, c) => `${t}.${c}`;
      const LLAVES = ['plan_cobro.id_plan_cobro', 'congelacion_plan.id_congelacion', 'notificacion.id_notificacion', 'envio_mensaje.id_envio'];
      const noNulas = columnas.filter((c) => c.is_nullable === 'NO' && !LLAVES.includes(id(c.tabla, c.columna)));
      expect(noNulas.map((c) => id(c.tabla, c.columna)).sort()).toEqual([...NO_NULOS, ...NO_NULOS_EN_PLAN_COBRO_TEST].map(([t, c]) => id(t, c)).sort());
      const varchar = columnas.filter((c) => c.data_type === 'character varying');
      expect(varchar.map((c) => `${id(c.tabla, c.columna)}(${c.largo})`).sort())
        .toEqual([...LARGOS, ...LARGOS_CON_CHECK].map(([t, c, n]) => `${id(t, c)}(${n})`).sort());
      expect(restricciones.map((r) => r.conname).sort()).toEqual([...RESTRICCIONES].sort());
    });

    test.each(NO_NULOS)('%s.%s rechaza NULL (23502)', async (tabla, columna) => {
      // Arrange
      const fila = { ...(await filaValida(tabla)), [columna]: null };

      // Act
      const err = await errorDe(tx.cliente, ...insertar(tabla, fila));

      // Assert
      expect(err).toMatchObject({ code: '23502', column: columna });
    });

    test.each(LARGOS)('%s.%s admite %i caracteres y rechaza uno mas (22001)', async (tabla, columna, n) => {
      // Arrange
      const fila = await filaValida(tabla);

      // Act
      const { rows } = await tx.cliente.query(...insertar(tabla, { ...fila, [columna]: 'x'.repeat(n) }));
      const err = await errorDe(tx.cliente, ...insertar(tabla, { ...fila, [columna]: 'x'.repeat(n + 1) }));

      // Assert
      expect(rows[0][columna]).toHaveLength(n);
      expect(err.code).toBe('22001');
    });

    test.each(CHECKS)('%s.%s admite cada valor de su lista y rechaza otro (23514)', async (tabla, columna, valores, restriccion) => {
      // Arrange
      const fila = await filaValida(tabla);

      // Act
      const guardados = [];
      for (const valor of valores) {
        const { rows } = await tx.cliente.query(...insertar(tabla, { ...fila, [columna]: valor }));
        guardados.push(rows[0][columna]);
      }
      const err = await errorDe(tx.cliente, ...insertar(tabla, { ...fila, [columna]: 'OTRA_COSA' }));

      // Assert
      expect(guardados).toEqual(valores);
      expect(err).toMatchObject({ code: '23514', constraint: restriccion });
    });

    // valor_total en NUMERIC(10,2) lo prueba plan-cobro.test.js (#83).
    test('plan_cobro.valor_pagado admite hasta 99999999.99 y rechaza 100000000 (22003)', async () => {
      // Arrange: NUMERIC(10,2). En MySQL con el modo estricto apagado el valor se
      // recortaria a 99999999.99 con un warning; PostgreSQL siempre lo rechaza.
      const fila = await filaValida('plan_cobro');

      // Act
      const { rows } = await tx.cliente.query(...insertar('plan_cobro', { ...fila, valor_total: '99999999.99', valor_pagado: '99999999.99' }));
      const pagado = await errorDe(tx.cliente, ...insertar('plan_cobro', { ...fila, valor_pagado: '100000000' }));

      // Assert
      expect(rows[0].valor_pagado).toBe('99999999.99');
      expect(pagado.code).toBe('22003');
    });

    // El redondeo de los centavos lo prueba plan-cobro.test.js (#83).
    test('plan_cobro: los valores por defecto quedan como dice la migracion', async () => {
      // Arrange: solo lo que la tabla exige
      const fila = await filaValida('plan_cobro');

      // Act
      const { rows } = await tx.cliente.query(...insertar('plan_cobro', fila));

      // Assert
      expect(rows[0]).toMatchObject({
        valor_total: '0.00', valor_pagado: '0.00', metodo_pago: 'EFECTIVO', estado_pago: 'PENDIENTE',
        activo: true, activar_recordatorio: false, dias_recordatorio: 7, congelado_desde: null,
      });
    });

    test('congelacion_plan: solo una congelacion abierta por plan (indice unico parcial, 23505)', async () => {
      // Arrange
      const fila = await filaValida('congelacion_plan');
      await tx.cliente.query(...insertar('congelacion_plan', fila));

      // Act
      const otraAbierta = await errorDe(tx.cliente, ...insertar('congelacion_plan', { ...fila, fecha_inicio: '2026-01-15' }));
      await tx.cliente.query('UPDATE congelacion_plan SET fecha_fin = $1, dias = 5 WHERE id_plan_cobro = $2', ['2026-01-15', fila.id_plan_cobro]);
      const { rows } = await tx.cliente.query(...insertar('congelacion_plan', { ...fila, fecha_inicio: '2026-01-20' }));

      // Assert
      expect(otraAbierta).toMatchObject({ code: '23505', constraint: 'ux_congelacion_plan_abierta' });
      expect(rows[0].fecha_fin).toBeNull();
    });

    test.each([
      ['termina antes de empezar', { fecha_fin: '2026-01-05' }, 'ck_congelacion_fechas'],
      ['tiene dias negativos', { fecha_fin: '2026-01-12', dias: -1 }, 'ck_congelacion_dias'],
    ])('congelacion_plan rechaza una congelacion que %s (23514)', async (_caso, cambios, restriccion) => {
      // Arrange: empieza el 10 de enero
      const fila = await filaValida('congelacion_plan');

      // Act
      const err = await errorDe(tx.cliente, ...insertar('congelacion_plan', { ...fila, ...cambios }));

      // Assert
      expect(err).toMatchObject({ code: '23514', constraint: restriccion });
    });

    // Que el miembro se lleva sus planes lo prueba plan-cobro.test.js (#83); aqui, sus congelaciones.
    test('borrar al miembro borra las congelaciones de su plan (ON DELETE CASCADE)', async () => {
      // Arrange
      const fila = await filaValida('congelacion_plan');
      await tx.cliente.query(...insertar('congelacion_plan', fila));

      // Act
      await tx.cliente.query('DELETE FROM miembro WHERE id_miembro = $1', [fila.id_miembro]);

      // Assert
      const { rows } = await tx.cliente.query(
        'SELECT COUNT(*)::int AS congelaciones FROM congelacion_plan WHERE id_plan_cobro = $1',
        [fila.id_plan_cobro],
      );
      expect(rows[0]).toEqual({ congelaciones: 0 });
    });

    test('borrar al usuario que congelo deja la congelacion sin responsable (ON DELETE SET NULL)', async () => {
      // Arrange
      const fila = await filaValida('congelacion_plan');
      const admin = await crearUsuario(tx.cliente, fila.id_gimnasio);
      const { rows: [cong] } = await tx.cliente.query(...insertar('congelacion_plan', { ...fila, congelada_por: admin.id_usuario }));

      // Act
      await tx.cliente.query('DELETE FROM usuario WHERE id_usuario = $1', [admin.id_usuario]);

      // Assert
      const { rows } = await tx.cliente.query('SELECT congelada_por FROM congelacion_plan WHERE id_congelacion = $1', [cong.id_congelacion]);
      expect(rows[0].congelada_por).toBeNull();
    });

    test.each([
      ['plan_cobro', 'actualizado_por', 'plan_cobro_actualizado_por_fkey'],
      ['notificacion', 'id_usuario', 'notificacion_id_usuario_fkey'],
      ['envio_mensaje', 'enviado_por', 'envio_mensaje_enviado_por_fkey'],
    ])('%s.%s impide borrar al usuario que la escribio (llave sin CASCADE, 23503)', async (tabla, columna, restriccion) => {
      // Arrange
      const fila = await filaValida(tabla);
      const admin = await crearUsuario(tx.cliente, fila.id_gimnasio);
      await tx.cliente.query(...insertar(tabla, { ...fila, [columna]: admin.id_usuario }));

      // Act
      const err = await errorDe(tx.cliente, 'DELETE FROM usuario WHERE id_usuario = $1', [admin.id_usuario]);

      // Assert
      expect(err).toMatchObject({ code: '23503', constraint: restriccion });
    });

    test('envio_mensaje impide borrar al miembro al que se le escribio (por eso el borrado permanente borra antes sus envios)', async () => {
      // Arrange
      const fila = await filaValida('envio_mensaje');
      await tx.cliente.query(...insertar('envio_mensaje', fila));

      // Act
      const err = await errorDe(tx.cliente, 'DELETE FROM miembro WHERE id_miembro = $1', [fila.id_miembro]);

      // Assert
      expect(err).toMatchObject({ code: '23503', constraint: 'envio_mensaje_id_miembro_fkey' });
    });

    test.each([
      ['plan_cobro', 'id_gimnasio', 'plan_cobro_id_gimnasio_fkey'],
      ['congelacion_plan', 'id_plan_cobro', 'congelacion_plan_id_plan_cobro_fkey'],
      ['notificacion', 'id_gimnasio', 'notificacion_id_gimnasio_fkey'],
      ['envio_mensaje', 'id_canal', 'envio_mensaje_id_canal_fkey'],
    ])('%s.%s rechaza un id que no existe (23503)', async (tabla, columna, restriccion) => {
      // Arrange: un id que existio en esta transaccion y ya no (sin adivinar ids)
      const fila = await filaValida(tabla);
      const { rows } = await tx.cliente.query("SELECT nextval(pg_get_serial_sequence($1, $2))::int AS id",
        [tabla === 'congelacion_plan' ? 'plan_cobro' : tabla === 'envio_mensaje' ? 'canal_comunicacion' : 'gimnasio',
          tabla === 'congelacion_plan' ? 'id_plan_cobro' : tabla === 'envio_mensaje' ? 'id_canal' : 'id_gimnasio']);

      // Act
      const err = await errorDe(tx.cliente, ...insertar(tabla, { ...fila, [columna]: rows[0].id }));

      // Assert
      expect(err).toMatchObject({ code: '23503', constraint: restriccion });
    });

    test('notificacion y envio_mensaje: los valores por defecto (no leida, pendiente, con fecha)', async () => {
      // Arrange
      const aviso = await filaValida('notificacion');
      const envio = await filaValida('envio_mensaje');

      // Act
      const { rows: [n] } = await tx.cliente.query(...insertar('notificacion', aviso));
      const { rows: [e] } = await tx.cliente.query(...insertar('envio_mensaje', envio));

      // Assert
      expect(n).toMatchObject({ leida: false, fecha_creacion: expect.any(Date), id_usuario: null, id_miembro: null });
      expect(e).toMatchObject({ estado: 'PENDIENTE', fecha_envio: expect.any(Date), id_alerta: null, enviado_por: null });
    });
  });

  // -------------------------------------------------------------------------
  describe('las consultas de las rutas de miembros', () => {
    const miembrosRouter = require('../../src/routes/miembros');
    const { errorHandler } = require('../../src/middleware/errorHandler');
    const { establecerBusquedaPersonal } = require('../../src/middleware/auth');

    const app = express();
    app.use(express.json());
    app.use('/api', miembrosRouter);
    app.use(errorHandler);

    // El BEGIN, COMMIT y ROLLBACK de la ruta pasan a SAVEPOINT dentro de la
    // transaccion del test; un segundo ROLLBACK (las rutas lo repiten en el
    // catch) no tiene savepoint y no hace nada.
    const pila = [];
    function traducir(sql) {
      if (/^\s*BEGIN\s*$/i.test(sql)) { pila.push(`ruta_${pila.length + 1}`); return `SAVEPOINT ${pila[pila.length - 1]}`; }
      if (/^\s*COMMIT\s*$/i.test(sql)) return `RELEASE SAVEPOINT ${pila.pop()}`;
      if (/^\s*ROLLBACK\s*$/i.test(sql)) { const s = pila.pop(); return s ? `ROLLBACK TO SAVEPOINT ${s}` : 'SELECT 1'; }
      return sql;
    }

    let espias = [];
    let gym;
    let admin;
    let token;
    const pedir = (metodo, ruta) => request(app)[metodo](`/api${ruta}`).set('Authorization', `Bearer ${token}`);
    const unaFila = async (sql, params) => (await tx.cliente.query(sql, params)).rows[0];

    beforeAll(() => {
      establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
    });
    afterAll(() => establecerBusquedaPersonal(null));

    beforeEach(async () => {
      await abrir();
      const enLaTransaccion = (sql, params) => tx.cliente.query(traducir(sql), params);
      espias = [
        jest.spyOn(pool, 'query').mockImplementation(enLaTransaccion),
        jest.spyOn(pool, 'connect').mockImplementation(async () => ({ query: enLaTransaccion, release() {} })),
      ];
      gym = await crearGimnasio(tx.cliente);
      admin = await crearUsuario(tx.cliente, gym.id_gimnasio);
      token = jwt.sign({ id: admin.id_usuario, role: 'admin', gymId: gym.id_gimnasio }, SECRETO, { expiresIn: '1h' });
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
      espias.forEach((e) => e.mockRestore());
      pila.length = 0;
      await deshacer();
      jest.restoreAllMocks();
    });

    test('GET /:id/plan devuelve el plan vigente mas reciente, no uno inactivo, y las 5 ultimas congelaciones con su responsable', async () => {
      // Arrange
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      await crearPlan(tx.cliente, miembro, { fecha_fin: '2026-03-01' });
      const vigente = await crearPlan(tx.cliente, miembro, { fecha_inicio: '2026-05-01', fecha_fin: '2026-06-01', tipo_plan: 'TRIMESTRAL' });
      await crearPlan(tx.cliente, miembro, { fecha_fin: '2026-12-31', activo: false });
      for (let dias = 1; dias <= 6; dias += 1) {
        await tx.cliente.query(
          `INSERT INTO congelacion_plan (id_plan_cobro, id_miembro, id_gimnasio, fecha_inicio, fecha_fin, dias, congelada_por, creada_en)
           VALUES ($1, $2, $3, '2026-05-02', '2026-05-03', 1, $4, NOW() - make_interval(days => $5))`,
          [vigente.id_plan_cobro, miembro.id_miembro, gym.id_gimnasio, admin.id_usuario, dias],
        );
      }

      // Act
      const r = await pedir('get', `/admin/miembros/${miembro.id_miembro}/plan`);

      // Assert
      expect(r.status).toBe(200);
      expect(r.body.plan).toMatchObject({ id_plan_cobro: vigente.id_plan_cobro, tipo_plan: 'TRIMESTRAL', dias_congelado: null });
      expect(r.body.congelaciones).toHaveLength(5);
      expect(r.body.congelaciones.every((c) => c.congelada_por === admin.nombre)).toBe(true);
      const creadas = await tx.cliente.query('SELECT id_congelacion FROM congelacion_plan WHERE id_miembro = $1 ORDER BY creada_en DESC LIMIT 5', [miembro.id_miembro]);
      expect(r.body.congelaciones.map((c) => c.id_congelacion)).toEqual(creadas.rows.map((c) => c.id_congelacion));
    });

    test('POST /:id/congelar marca el plan desde hoy y abre la congelacion; la segunda vez responde 409', async () => {
      // Arrange: un plan que empezo hace 10 dias y vence en 20
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      const plan = await unaFila(
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin)
         VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 10, CURRENT_DATE + 20) RETURNING *`,
        [miembro.id_miembro, gym.id_gimnasio],
      );

      // Act
      const primera = await pedir('post', `/admin/miembros/${miembro.id_miembro}/congelar`).send({ motivo: ' Viaje ' });
      const segunda = await pedir('post', `/admin/miembros/${miembro.id_miembro}/congelar`).send({});

      // Assert
      expect(primera.status).toBe(200);
      expect(await unaFila('SELECT congelado_desde = CURRENT_DATE AS hoy, actualizado_por FROM plan_cobro WHERE id_plan_cobro = $1', [plan.id_plan_cobro]))
        .toEqual({ hoy: true, actualizado_por: admin.id_usuario });
      expect(await unaFila('SELECT COUNT(*)::int AS abiertas, MAX(motivo) AS motivo FROM congelacion_plan WHERE id_plan_cobro = $1 AND fecha_fin IS NULL', [plan.id_plan_cobro]))
        .toEqual({ abiertas: 1, motivo: 'Viaje' });
      expect(segunda.status).toBe(409);
      expect(segunda.body.code).toBe('ALREADY_FROZEN');
    });

    test.each([
      ['la fecha es de manana', 'CURRENT_DATE + 1', 400, 'VALIDATION_ERROR'],
      ['la fecha es anterior al inicio del plan', 'CURRENT_DATE - 11', 400, 'VALIDATION_ERROR'],
      ['el plan ya habia vencido en esa fecha', 'CURRENT_DATE - 1', 409, 'PLAN_EXPIRED'],
    ])('POST /:id/congelar no congela nada cuando %s (las fechas las compara el SQL)', async (caso, fecha, status, code) => {
      // Arrange: un plan que empezo hace 10 dias; en el ultimo caso vencio hace 2
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      const fin = caso.includes('vencido') ? 'CURRENT_DATE - 2' : 'CURRENT_DATE + 20';
      await tx.cliente.query(
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin)
         VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 10, ${fin})`,
        [miembro.id_miembro, gym.id_gimnasio],
      );
      const { fecha_inicio: pedida } = await unaFila(`SELECT to_char(${fecha}, 'YYYY-MM-DD') AS fecha_inicio`);

      // Act
      const r = await pedir('post', `/admin/miembros/${miembro.id_miembro}/congelar`).send({ fecha_inicio: pedida });

      // Assert
      expect(r.status).toBe(status);
      expect(r.body.code).toBe(code);
      expect(await unaFila('SELECT COUNT(*)::int AS n FROM congelacion_plan WHERE id_miembro = $1', [miembro.id_miembro])).toEqual({ n: 0 });
    });

    test('POST /:id/descongelar corre el vencimiento y el proximo cobro los dias que estuvo congelado y cierra la congelacion', async () => {
      // Arrange: congelado hace 5 dias
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      const plan = await unaFila(
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, proxima_fecha_cobro, congelado_desde)
         VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 10, CURRENT_DATE + 20, CURRENT_DATE + 21, CURRENT_DATE - 5) RETURNING *`,
        [miembro.id_miembro, gym.id_gimnasio],
      );
      await tx.cliente.query(
        'INSERT INTO congelacion_plan (id_plan_cobro, id_miembro, id_gimnasio, fecha_inicio) VALUES ($1, $2, $3, CURRENT_DATE - 5)',
        [plan.id_plan_cobro, miembro.id_miembro, gym.id_gimnasio],
      );

      // Act
      const r = await pedir('post', `/admin/miembros/${miembro.id_miembro}/descongelar`).send({});

      // Assert
      expect(r.status).toBe(200);
      expect(r.body.dias).toBe(5);
      expect(await unaFila(
        `SELECT fecha_fin = CURRENT_DATE + 25 AS fin, proxima_fecha_cobro = CURRENT_DATE + 26 AS cobro, congelado_desde
           FROM plan_cobro WHERE id_plan_cobro = $1`, [plan.id_plan_cobro],
      )).toEqual({ fin: true, cobro: true, congelado_desde: null });
      expect(await unaFila(
        'SELECT fecha_fin = CURRENT_DATE AS hoy, dias, descongelada_por FROM congelacion_plan WHERE id_plan_cobro = $1', [plan.id_plan_cobro],
      )).toEqual({ hoy: true, dias: 5, descongelada_por: admin.id_usuario });
    });

    test('PUT /:id/plan guarda el plan con el estado del pago calculado y el responsable', async () => {
      // Arrange
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      const plan = await crearPlan(tx.cliente, miembro);

      // Act
      const r = await pedir('put', `/admin/miembros/${miembro.id_miembro}/plan`).send({
        tipo_plan: 'TRIMESTRAL', fecha_inicio: '2026-02-01', fecha_fin: '2026-05-01', valor_total: 300000, valor_pagado: 100000, metodo_pago: 'NEQUI',
      });

      // Assert
      expect(r.status).toBe(200);
      expect(await unaFila('SELECT tipo_plan, valor_total, valor_pagado, estado_pago, metodo_pago, actualizado_por FROM plan_cobro WHERE id_plan_cobro = $1', [plan.id_plan_cobro]))
        .toEqual({ tipo_plan: 'TRIMESTRAL', valor_total: '300000.00', valor_pagado: '100000.00', estado_pago: 'PARCIAL', metodo_pago: 'NEQUI', actualizado_por: admin.id_usuario });
    });

    // Red del hallazgo de los largos y los valores del alta: con las reglas del
    // servicio (createSchema) estos casos ya no llegan a la BD. Nombre y
    // documento los corrigio el #83; el resto, esta rama. Sin las reglas, los
    // de miembro respondian 500 y los de plan_cobro 503, con el miembro ya
    // guardado y sin plan: por eso se cuenta que no quedo ningun miembro.
    const ANA_ALTA = { nombre: 'Ana', documento: 'CC12345', telefono: '3001234567' };
    test.each([
      ['POST /admin/miembros con un nombre de 101 caracteres', 'post', () => '/admin/miembros', { nombre: 'x'.repeat(101), documento: 'CC12345', telefono: '3001234567' }],
      ['POST /admin/miembros con un documento de 21 caracteres', 'post', () => '/admin/miembros', { nombre: 'Ana', documento: 'C'.repeat(21), telefono: '3001234567' }],
      ['POST /admin/miembros con un contacto de emergencia de 101 caracteres', 'post', () => '/admin/miembros', { ...ANA_ALTA, contacto_emergencia: 'x'.repeat(101) }],
      ['POST /admin/miembros con un telefono de emergencia de 21 caracteres', 'post', () => '/admin/miembros', { ...ANA_ALTA, telefono_emergencia: '3'.repeat(21) }],
      ['POST /admin/miembros con un objetivo de 51 caracteres', 'post', () => '/admin/miembros', { ...ANA_ALTA, objetivo: 'x'.repeat(51) }],
      ['POST /admin/miembros con un nivel de experiencia de 31 caracteres', 'post', () => '/admin/miembros', { ...ANA_ALTA, nivel_experiencia: 'x'.repeat(31) }],
      ['POST /admin/miembros con una referencia de pago de 101 caracteres', 'post', () => '/admin/miembros', { ...ANA_ALTA, referencia_pago: 'x'.repeat(101) }],
      ['POST /admin/miembros con valor_total 100000000', 'post', () => '/admin/miembros', { ...ANA_ALTA, valor_total: '100000000' }],
      ['POST /admin/miembros con valor_pagado 100000000', 'post', () => '/admin/miembros', { ...ANA_ALTA, valor_total: '99999999.99', valor_pagado: '100000000' }],
    ])('%s responde 400 y no guarda nada', async (_caso, metodo, ruta, cuerpo) => {
      // Arrange: el gimnasio no tiene miembros

      // Act
      const r = await pedir(metodo, ruta()).send(cuerpo);

      // Assert
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('VALIDATION_ERROR');
      expect(await unaFila('SELECT COUNT(*)::int AS n FROM miembro WHERE id_gimnasio = $1', [gym.id_gimnasio])).toEqual({ n: 0 });
    });

    // Red del hallazgo del valor del plan: 100000000 no cabe en NUMERIC(10,2);
    // antes llegaba a la BD (22003) y la ruta respondia 503. El valor limite
    // esta en miembros-plan-valores.test.js.
    test('PUT /:id/plan con 100000000 responde 400 y deja el plan como estaba', async () => {
      // Arrange
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      const plan = await crearPlan(tx.cliente, miembro);

      // Act
      const r = await pedir('put', `/admin/miembros/${miembro.id_miembro}/plan`).send({
        tipo_plan: 'MENSUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31', valor_total: 100000000, valor_pagado: 0, metodo_pago: 'EFECTIVO',
      });

      // Assert
      expect(r.status).toBe(400);
      expect(await unaFila('SELECT valor_total FROM plan_cobro WHERE id_plan_cobro = $1', [plan.id_plan_cobro])).toEqual({ valor_total: '100000.00' });
    });

    test('POST /admin/miembros con 100 caracteres en el nombre y 20 en el documento guarda el miembro y su plan', async () => {
      // Arrange: el valor limite de las dos columnas
      const cuerpo = { nombre: 'x'.repeat(100), documento: documentoUnico().padEnd(20, '0'), telefono: '3001234567', valor_total: '50000' };

      // Act
      const r = await pedir('post', '/admin/miembros').send(cuerpo);

      // Assert
      expect(r.status).toBe(201);
      expect(await unaFila(
        `SELECT length(m.nombre) AS largo, m.documento, pc.valor_total, pc.estado_pago
           FROM miembro m JOIN plan_cobro pc ON pc.id_miembro = m.id_miembro WHERE m.id_gimnasio = $1`, [gym.id_gimnasio],
      )).toEqual({ largo: 100, documento: cuerpo.documento, valor_total: '50000.00', estado_pago: 'PENDIENTE' });
    });
  });
});

