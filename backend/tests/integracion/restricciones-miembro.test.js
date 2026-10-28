/**
 * Integracion, capa BD: las restricciones de las tablas del miembro (gimnasio,
 * usuario y miembro) tal como las dejan las migraciones. Cada test documenta
 * una restriccion: que rechaza la BD y con que codigo de PostgreSQL. Los pools
 * falsos de los tests unitarios aceptan todo esto sin quejarse.
 *
 * Codigos: 23502 NOT NULL · 22001 texto mas largo que la columna · 23505 UNIQUE
 * · 23503 llave foranea · 22003 numero fuera del rango de la columna.
 *
 * Sin TEST_DATABASE_URL se salta.
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const {
  MARCA, unico, documentoUnico, crearGimnasio, crearUsuario, crearMiembro, errorDe, usarTransaccionPorTest,
} = require('./datos');

const TABLAS = ['gimnasio', 'usuario', 'miembro'];

// Lo que dicen las migraciones de estas tres tablas. Los tests de abajo
// recorren estas listas, y el primero las compara con la BD migrada: si una
// migracion agrega o quita una columna obligatoria, un largo o una restriccion,
// falla hasta que se actualice aqui (y con eso, hasta que tenga su test).

// Columnas NOT NULL, menos los id SERIAL. Las que tienen valor por defecto
// tambien rechazan un NULL explicito.
const NO_NULOS = [
  ['gimnasio', 'nombre'], ['gimnasio', 'telefono'], ['gimnasio', 'activo'], ['gimnasio', 'fecha_registro'],
  ['gimnasio', 'plan_activo'], ['gimnasio', 'dias_aviso_vencimiento'],
  ['usuario', 'id_gimnasio'], ['usuario', 'nombre'], ['usuario', 'email'], ['usuario', 'password_hash'],
  ['usuario', 'rol'], ['usuario', 'activo'], ['usuario', 'debe_cambiar_clave'], ['usuario', 'fecha_creacion'],
  ['miembro', 'id_gimnasio'], ['miembro', 'nombre'], ['miembro', 'documento'], ['miembro', 'codigo_qr'],
  ['miembro', 'activo'], ['miembro', 'fecha_registro'], ['miembro', 'app_acceso'],
];

// Columnas VARCHAR(n). Hallazgos: con uno mas, POST /api/auth/signup respondia
// 500 en gimnasio.nombre, gimnasio.email, usuario.nombre y usuario.email
// (corregido en lib/validators.js, con su test unitario en
// signup-longitudes.test.js), y POST /api/admin/miembros responde 500
// DB_UNREACHABLE en miembro.nombre y miembro.documento (sin corregir).
const LARGOS = [
  ['gimnasio', 'nombre', 100], ['gimnasio', 'nit', 20], ['gimnasio', 'direccion', 200], ['gimnasio', 'telefono', 20],
  ['gimnasio', 'email', 150], ['gimnasio', 'plan_activo', 20],
  ['usuario', 'nombre', 100], ['usuario', 'email', 150], ['usuario', 'rol', 30],
  ['miembro', 'nombre', 100], ['miembro', 'documento', 20], ['miembro', 'telefono', 20], ['miembro', 'email', 150],
  ['miembro', 'codigo_qr', 100], ['miembro', 'tipo_documento', 10], ['miembro', 'genero', 20],
  ['miembro', 'codigo_pais_telefono', 5], ['miembro', 'ciudad', 100], ['miembro', 'contacto_emergencia', 100],
  ['miembro', 'telefono_emergencia', 20], ['miembro', 'objetivo', 50], ['miembro', 'nivel_experiencia', 30],
];

// UNIQUE, llaves foraneas y CHECK de las tres tablas, cada una con su test abajo.
const RESTRICCIONES = [
  'gimnasio_id_dueno_fkey', 'gimnasio_nit_key',
  'miembro_id_gimnasio_fkey',
  'usuario_email_key', 'usuario_id_gimnasio_fkey', 'usuario_id_rol_fkey',
];

/**
 * Texto de n caracteres. Desde 14 empieza con un valor unico de la corrida,
 * para las columnas UNIQUE (nit y email); los mas cortos solo repiten x.
 */
const deLargo = (n) => (n >= 14 ? documentoUnico().padEnd(n, 'x') : 'x'.repeat(n));

describeConBd('restricciones de gimnasio, usuario y miembro', () => {
  let pool;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
  }, 60_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  const tx = usarTransaccionPorTest(() => pool);

  /** Un id que existio en esta transaccion y ya no: sin adivinar ids. */
  async function idBorrado(tabla, columna, fila) {
    await tx.cliente.query(`DELETE FROM ${tabla} WHERE ${columna} = $1`, [fila[columna]]);
    return fila[columna];
  }

  /** Una fila con lo minimo que la tabla exige, lista para insertar. */
  async function filaValida(tabla) {
    if (tabla === 'gimnasio') return { nombre: unico('Gimnasio'), telefono: '3001234567' };
    const gym = await crearGimnasio(tx.cliente);
    if (tabla === 'usuario') {
      return { id_gimnasio: gym.id_gimnasio, nombre: 'Dueña', email: `${unico('u')}@fitloyalty.test`, password_hash: 'no-es-un-hash' };
    }
    return { id_gimnasio: gym.id_gimnasio, nombre: 'Miembro', documento: documentoUnico(), codigo_qr: unico('QR') };
  }

  function insertar(tabla, fila) {
    const columnas = Object.keys(fila);
    return [
      `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      Object.values(fila),
    ];
  }

  test('las listas de este archivo son las de la BD migrada', async () => {
    const { rows: columnas } = await tx.cliente.query(
      `SELECT table_name AS tabla, column_name AS columna, is_nullable, column_default, character_maximum_length AS largo
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [TABLAS],
    );
    const { rows: restricciones } = await tx.cliente.query(
      `SELECT conname FROM pg_constraint
        WHERE conrelid::regclass::text = ANY($1) AND contype IN ('u', 'f', 'c')`,
      [TABLAS],
    );
    const ordenar = (lista) => [...lista].sort();

    const noNulos = columnas
      .filter((c) => c.is_nullable === 'NO' && !String(c.column_default).startsWith('nextval('))
      .map((c) => `${c.tabla}.${c.columna}`);
    const largos = columnas.filter((c) => c.largo !== null).map((c) => `${c.tabla}.${c.columna}:${c.largo}`);

    expect(ordenar(noNulos)).toEqual(ordenar(NO_NULOS.map(([t, c]) => `${t}.${c}`)));
    expect(ordenar(largos)).toEqual(ordenar(LARGOS.map(([t, c, n]) => `${t}.${c}:${n}`)));
    expect(ordenar(restricciones.map((r) => r.conname))).toEqual(ordenar(RESTRICCIONES));
  });

  test.each(NO_NULOS)('%s.%s es obligatorio (NOT NULL)', async (tabla, columna) => {
    const fila = { ...(await filaValida(tabla)), [columna]: null };

    const err = await errorDe(tx.cliente, ...insertar(tabla, fila));

    expect(err).toMatchObject({ code: '23502', column: columna });
  });

  test.each(LARGOS)('%s.%s admite %i caracteres y rechaza uno mas (VARCHAR)', async (tabla, columna, maximo) => {
    const { rows } = await tx.cliente.query(...insertar(tabla, { ...(await filaValida(tabla)), [columna]: deLargo(maximo) }));

    const err = await errorDe(tx.cliente, ...insertar(tabla, { ...(await filaValida(tabla)), [columna]: deLargo(maximo + 1) }));

    expect(rows[0][columna]).toHaveLength(maximo);
    expect(err).toMatchObject({ code: '22001' });
  });

  // PostgreSQL cuenta caracteres, no unidades UTF-16: un emoji ocupa uno. Por
  // eso lib/validators.js mide con [...texto].length y no con .length.
  test('un nombre de 99 letras y un emoji cabe en VARCHAR(100)', async () => {
    const nombre = `${MARCA} `.padEnd(99, 'x') + '💪';

    const gym = await crearGimnasio(tx.cliente, { nombre });

    expect(nombre.length).toBe(101);
    expect(gym.nombre).toBe(nombre);
  });

  describe('gimnasio', () => {
    test('el NIT no se repite, pero varios gimnasios pueden no tenerlo (UNIQUE admite NULL)', async () => {
      const nit = documentoUnico();
      await crearGimnasio(tx.cliente, { nit });

      const err = await errorDe(tx.cliente, 'INSERT INTO gimnasio (nombre, telefono, nit) VALUES ($1, $2, $3)', [unico('Gimnasio'), '3001234567', nit]);
      const sinNit = [await crearGimnasio(tx.cliente), await crearGimnasio(tx.cliente)];

      expect(err).toMatchObject({ code: '23505', constraint: 'gimnasio_nit_key' });
      expect(sinNit.map((g) => g.nit)).toEqual([null, null]);
    });

    test('id_dueno solo acepta un usuario que existe y queda en NULL si se borra (FK ON DELETE SET NULL)', async () => {
      const gym = await crearGimnasio(tx.cliente);
      const dueno = await crearUsuario(tx.cliente, gym.id_gimnasio);
      const otro = await crearUsuario(tx.cliente, gym.id_gimnasio);
      const inexistente = await idBorrado('usuario', 'id_usuario', otro);
      await tx.cliente.query('UPDATE gimnasio SET id_dueno = $1 WHERE id_gimnasio = $2', [dueno.id_usuario, gym.id_gimnasio]);

      const err = await errorDe(tx.cliente, 'UPDATE gimnasio SET id_dueno = $1 WHERE id_gimnasio = $2', [inexistente, gym.id_gimnasio]);
      await tx.cliente.query('DELETE FROM usuario WHERE id_usuario = $1', [dueno.id_usuario]);
      const { rows } = await tx.cliente.query('SELECT id_dueno FROM gimnasio WHERE id_gimnasio = $1', [gym.id_gimnasio]);

      expect(err).toMatchObject({ code: '23503', constraint: 'gimnasio_id_dueno_fkey' });
      expect(rows[0].id_dueno).toBeNull();
    });
  });

  describe('usuario', () => {
    test('el email no se repite entre gimnasios (UNIQUE)', async () => {
      const email = `${unico('u')}@fitloyalty.test`;
      const gymA = await crearGimnasio(tx.cliente);
      const gymB = await crearGimnasio(tx.cliente);
      await crearUsuario(tx.cliente, gymA.id_gimnasio, { email });

      const err = await errorDe(
        tx.cliente,
        `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash) VALUES ($1, 'Otra', $2, 'no-es-un-hash')`,
        [gymB.id_gimnasio, email],
      );

      expect(err).toMatchObject({ code: '23505', constraint: 'usuario_email_key' });
    });

    // PostgreSQL frente a MySQL: en MySQL la intercalacion por defecto
    // (utf8mb4_0900_ai_ci) no distingue mayusculas y el segundo INSERT daria
    // clave duplicada. En PostgreSQL entra, por eso el registro pasa el correo a
    // minusculas y busca duplicados con LOWER(email) antes de insertar.
    test('UNIQUE distingue mayusculas: Ana@ y ana@ son correos distintos para PostgreSQL', async () => {
      const local = unico('ana');
      const gym = await crearGimnasio(tx.cliente);
      await crearUsuario(tx.cliente, gym.id_gimnasio, { email: `${local}@fitloyalty.test` });

      const otra = await crearUsuario(tx.cliente, gym.id_gimnasio, { email: `${local.toUpperCase()}@FITLOYALTY.TEST` });
      const { rows } = await tx.cliente.query('SELECT COUNT(*)::int AS n FROM usuario WHERE LOWER(email) = $1', [`${local}@fitloyalty.test`]);

      expect(otra.id_usuario).toEqual(expect.any(Number));
      expect(rows[0].n).toBe(2);
    });

    test('pertenece a un gimnasio que existe y se borra con el (FK ON DELETE CASCADE)', async () => {
      const gym = await crearGimnasio(tx.cliente);
      const usuario = await crearUsuario(tx.cliente, gym.id_gimnasio);
      const gymBorrado = await idBorrado('gimnasio', 'id_gimnasio', await crearGimnasio(tx.cliente));

      const err = await errorDe(
        tx.cliente,
        `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash) VALUES ($1, 'Sin gimnasio', $2, 'no-es-un-hash')`,
        [gymBorrado, `${unico('u')}@fitloyalty.test`],
      );
      await tx.cliente.query('DELETE FROM gimnasio WHERE id_gimnasio = $1', [gym.id_gimnasio]);
      const { rows } = await tx.cliente.query('SELECT 1 FROM usuario WHERE id_usuario = $1', [usuario.id_usuario]);

      expect(err).toMatchObject({ code: '23503', constraint: 'usuario_id_gimnasio_fkey' });
      expect(rows).toHaveLength(0);
    });

    test('id_rol solo acepta un rol que existe, y un rol con usuarios no se puede borrar (FK sin CASCADE)', async () => {
      const gym = await crearGimnasio(tx.cliente);
      const crearRol = async () => (await tx.cliente.query('INSERT INTO rol (nombre) VALUES ($1) RETURNING id_rol', [unico('ROL')])).rows[0];
      const rolBorrado = await idBorrado('rol', 'id_rol', await crearRol());
      const rolEnUso = await crearRol();
      const usuario = await crearUsuario(tx.cliente, gym.id_gimnasio);
      await tx.cliente.query('UPDATE usuario SET id_rol = $1 WHERE id_usuario = $2', [rolEnUso.id_rol, usuario.id_usuario]);

      const errInsertar = await errorDe(tx.cliente, 'UPDATE usuario SET id_rol = $1 WHERE id_usuario = $2', [rolBorrado, usuario.id_usuario]);
      const errBorrar = await errorDe(tx.cliente, 'DELETE FROM rol WHERE id_rol = $1', [rolEnUso.id_rol]);

      expect(errInsertar).toMatchObject({ code: '23503', constraint: 'usuario_id_rol_fkey' });
      expect(errBorrar).toMatchObject({ code: '23503', constraint: 'usuario_id_rol_fkey' });
    });
  });

  describe('miembro', () => {
    const INSERTAR = 'INSERT INTO miembro (id_gimnasio, nombre, documento, codigo_qr) VALUES ($1, $2, $3, $4)';

    // Lo que la BD NO impide: no hay UNIQUE (id_gimnasio, documento). El unico
    // freno es el SELECT previo de POST /admin/miembros, y dos altas a la vez con
    // el mismo documento pasan las dos.
    test('la BD acepta dos miembros activos con el mismo documento en el mismo gimnasio', async () => {
      const gym = await crearGimnasio(tx.cliente);
      const documento = documentoUnico();
      await crearMiembro(tx.cliente, gym.id_gimnasio, { documento });

      await crearMiembro(tx.cliente, gym.id_gimnasio, { documento });
      const { rows } = await tx.cliente.query(
        'SELECT COUNT(*)::int AS n FROM miembro WHERE id_gimnasio = $1 AND documento = $2 AND activo',
        [gym.id_gimnasio, documento],
      );

      expect(rows[0].n).toBe(2);
    });

    test('pertenece a un gimnasio que existe y se borra con el, con sus ingresos (FK ON DELETE CASCADE)', async () => {
      const gym = await crearGimnasio(tx.cliente);
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      await tx.cliente.query('INSERT INTO checkin (id_miembro, id_gimnasio) VALUES ($1, $2)', [miembro.id_miembro, gym.id_gimnasio]);
      const gymBorrado = await idBorrado('gimnasio', 'id_gimnasio', await crearGimnasio(tx.cliente));

      const err = await errorDe(tx.cliente, INSERTAR, [gymBorrado, 'Miembro', documentoUnico(), unico('QR')]);
      await tx.cliente.query('DELETE FROM gimnasio WHERE id_gimnasio = $1', [gym.id_gimnasio]);
      const quedan = await tx.cliente.query(
        `SELECT (SELECT COUNT(*) FROM miembro WHERE id_miembro = $1)::int AS miembros,
                (SELECT COUNT(*) FROM checkin WHERE id_miembro = $1)::int AS ingresos`,
        [miembro.id_miembro],
      );

      expect(err).toMatchObject({ code: '23503', constraint: 'miembro_id_gimnasio_fkey' });
      expect(quedan.rows[0]).toEqual({ miembros: 0, ingresos: 0 });
    });

    // Hallazgo sin corregir: notificacion.id_miembro no tiene ON DELETE CASCADE
    // (migracion 014, igual que produccion). Un miembro con un acceso bloqueado
    // registrado no se puede borrar y DELETE /admin/miembros/:id/permanent
    // responde 503 DB_UNREACHABLE ("intenta de nuevo"), aunque reintentar no sirve.
    test('un aviso en notificacion impide borrar al miembro (FK sin CASCADE)', async () => {
      const gym = await crearGimnasio(tx.cliente);
      const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
      await tx.cliente.query(
        `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje)
         VALUES ($1, $2, 'ALERTA', 'Acceso bloqueado', 'Intento de ingreso')`,
        [gym.id_gimnasio, miembro.id_miembro],
      );

      const err = await errorDe(tx.cliente, 'DELETE FROM miembro WHERE id_miembro = $1', [miembro.id_miembro]);

      expect(err).toMatchObject({ code: '23503', constraint: 'notificacion_id_miembro_fkey' });
    });

    // PostgreSQL frente a MySQL: id_miembro es INTEGER (hasta 2147483647). MySQL
    // compara 2147483648 y no encuentra la fila; PostgreSQL rechaza el valor.
    // Hallazgo sin corregir: GET y DELETE /admin/miembros/2147483648 responden 503
    // DB_UNREACHABLE en vez de 404, porque parseInt + Number.isFinite lo dejan pasar.
    test('buscar un id que no cabe en INTEGER es un error en PostgreSQL, no una fila vacia', async () => {
      const gym = await crearGimnasio(tx.cliente);
      const BUSCAR = 'SELECT id_miembro FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2';

      const { rows } = await tx.cliente.query(BUSCAR, ['2147483647', gym.id_gimnasio]);
      const err = await errorDe(tx.cliente, BUSCAR, ['2147483648', gym.id_gimnasio]);

      expect(rows).toEqual([]);
      expect(err.code).toBe('22003');
    });
  });
});
