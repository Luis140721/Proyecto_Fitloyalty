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

/** Texto de exactamente n caracteres que empieza con la marca de la corrida. */
const deLargo = (n, inicio = `${MARCA} `) => inicio.padEnd(n, 'x');

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

  describe('gimnasio', () => {
    test.each(['nombre', 'telefono'])('%s es obligatorio (NOT NULL)', async (columna) => {
      const fila = { nombre: unico('Gimnasio'), telefono: '3001234567', [columna]: null };

      const err = await errorDe(tx.cliente, 'INSERT INTO gimnasio (nombre, telefono) VALUES ($1, $2)', [fila.nombre, fila.telefono]);

      expect(err).toMatchObject({ code: '23502', column: columna });
    });

    // POST /api/auth/signup no lo validaba y respondia 500 (hallazgo corregido en
    // lib/validators.js; el test unitario del limite esta en signup-longitudes.test.js).
    test('nombre admite 100 caracteres y rechaza 101 (VARCHAR(100))', async () => {
      const gym = await crearGimnasio(tx.cliente, { nombre: deLargo(100) });

      const err = await errorDe(tx.cliente, 'INSERT INTO gimnasio (nombre, telefono) VALUES ($1, $2)', [deLargo(101), '3001234567']);

      expect(gym.nombre).toHaveLength(100);
      expect(err.code).toBe('22001');
    });

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
    test.each(['nombre', 'email', 'password_hash'])('%s es obligatorio (NOT NULL)', async (columna) => {
      const gym = await crearGimnasio(tx.cliente);
      const fila = { nombre: 'Dueña', email: `${unico('u')}@fitloyalty.test`, password_hash: 'no-es-un-hash', [columna]: null };

      const err = await errorDe(
        tx.cliente,
        'INSERT INTO usuario (id_gimnasio, nombre, email, password_hash) VALUES ($1, $2, $3, $4)',
        [gym.id_gimnasio, fila.nombre, fila.email, fila.password_hash],
      );

      expect(err).toMatchObject({ code: '23502', column: columna });
    });

    // Mismo hallazgo que gimnasio.nombre: el registro respondia 500 con 101
    // caracteres en el nombre del dueño o 151 en el correo.
    test.each([
      ['nombre', 100, (n) => deLargo(n)],
      ['email', 150, (n) => deLargo(n - '@fitloyalty.test'.length, unico('u')) + '@fitloyalty.test'],
    ])('%s admite %i caracteres y rechaza uno mas', async (columna, maximo, valorDe) => {
      const gym = await crearGimnasio(tx.cliente);
      const justo = await crearUsuario(tx.cliente, gym.id_gimnasio, { [columna]: valorDe(maximo) });

      const err = await errorDe(
        tx.cliente,
        `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash) VALUES ($1, $2, $3, 'no-es-un-hash')`,
        [gym.id_gimnasio, ...(columna === 'nombre' ? [valorDe(maximo + 1), `${unico('u')}@fitloyalty.test`] : ['Dueña', valorDe(maximo + 1)])],
      );

      expect(justo[columna]).toHaveLength(maximo);
      expect(err.code).toBe('22001');
    });

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
  });

  describe('miembro', () => {
    const INSERTAR = 'INSERT INTO miembro (id_gimnasio, nombre, documento, codigo_qr) VALUES ($1, $2, $3, $4)';

    test.each(['nombre', 'documento', 'codigo_qr'])('%s es obligatorio (NOT NULL)', async (columna) => {
      const gym = await crearGimnasio(tx.cliente);
      const fila = { nombre: 'Miembro', documento: documentoUnico(), codigo_qr: unico('QR'), [columna]: null };

      const err = await errorDe(tx.cliente, INSERTAR, [gym.id_gimnasio, fila.nombre, fila.documento, fila.codigo_qr]);

      expect(err).toMatchObject({ code: '23502', column: columna });
    });

    // Hallazgo sin corregir: POST /api/admin/miembros no limita nombre ni
    // documento y con uno mas responde 500 DB_UNREACHABLE.
    test.each([
      ['nombre', 100],
      ['documento', 20],
    ])('%s admite %i caracteres y rechaza uno mas', async (columna, maximo) => {
      const gym = await crearGimnasio(tx.cliente);
      const justo = await crearMiembro(tx.cliente, gym.id_gimnasio, { [columna]: deLargo(maximo, documentoUnico()) });
      const fila = { nombre: 'Miembro', documento: documentoUnico(), [columna]: deLargo(maximo + 1, documentoUnico()) };

      const err = await errorDe(tx.cliente, INSERTAR, [gym.id_gimnasio, fila.nombre, fila.documento, unico('QR')]);

      expect(justo[columna]).toHaveLength(maximo);
      expect(err.code).toBe('22001');
    });

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
