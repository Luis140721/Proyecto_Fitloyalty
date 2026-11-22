/**
 * tests/integracion/datos.js
 *
 * Datos semilla y limpieza de los tests de integracion de la capa BD.
 *
 * Limpieza: cada test corre en una transaccion de un cliente propio y termina
 * con ROLLBACK, asi que nada de lo que inserta queda en la BD (que comparte con
 * los E2E). Las funciones de src/lib que se prueban (accesos, gamificacion)
 * reciben la conexion como parametro, por eso trabajan dentro de la misma
 * transaccion que el test.
 *
 * Datos: cada test crea su gimnasio y lo que necesita, sin ids fijos. Los
 * valores que deben ser unicos llevan MARCA, distinta en cada archivo y cada
 * corrida.
 */
const crypto = require('crypto');

const MARCA = `bd${crypto.randomBytes(4).toString('hex')}`;
let contador = 0;

/** Texto unico de esta corrida, por ejemplo "Gimnasio-bd1a2b3c4d-7". */
function unico(prefijo) {
  contador += 1;
  return `${prefijo}-${MARCA}-${contador}`;
}

/** Documento unico que cabe en miembro.documento y gimnasio.nit (VARCHAR(20)). */
function documentoUnico() {
  contador += 1;
  return `${MARCA}${contador}`;
}

async function crearGimnasio(db, campos = {}) {
  const { rows } = await db.query(
    'INSERT INTO gimnasio (nombre, telefono, nit) VALUES ($1, $2, $3) RETURNING *',
    [campos.nombre ?? unico('Gimnasio'), campos.telefono ?? '3001234567', campos.nit ?? null],
  );
  return rows[0];
}

async function crearUsuario(db, idGimnasio, campos = {}) {
  const { rows } = await db.query(
    `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol, rol)
     VALUES ($1, $2, $3, 'no-es-un-hash', 1, 'ADMINISTRADOR')
     RETURNING *`,
    [idGimnasio, campos.nombre ?? 'Dueña de prueba', campos.email ?? `${unico('usuario')}@fitloyalty.test`],
  );
  return rows[0];
}

async function crearMiembro(db, idGimnasio, campos = {}) {
  const { rows } = await db.query(
    `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, codigo_qr, activo)
     VALUES ($1, $2, $3, '3001112233', $4, $5)
     RETURNING *`,
    [idGimnasio, campos.nombre ?? 'Miembro de prueba', campos.documento ?? documentoUnico(),
      campos.codigo_qr ?? unico('QR'), campos.activo ?? true],
  );
  return rows[0];
}

/**
 * Corre una sentencia que debe fallar y devuelve el error de PostgreSQL. El
 * SAVEPOINT evita que el error aborte la transaccion del test.
 */
async function errorDe(db, sql, params = []) {
  await db.query('SAVEPOINT se_espera_error');
  try {
    await db.query(sql, params);
  } catch (err) {
    await db.query('ROLLBACK TO SAVEPOINT se_espera_error');
    return err;
  }
  await db.query('RELEASE SAVEPOINT se_espera_error');
  throw new Error(`Se esperaba que fallara: ${sql}`);
}

/**
 * Abre una transaccion antes de cada test y la deshace al terminar. Devuelve
 * un objeto cuyo .cliente es la conexion del test en curso.
 */
function usarTransaccionPorTest(obtenerPool) {
  const tx = { cliente: null };

  beforeEach(async () => {
    tx.cliente = await obtenerPool().connect();
    await tx.cliente.query('BEGIN');
  });

  afterEach(async () => {
    await tx.cliente.query('ROLLBACK');
    tx.cliente.release();
    // Red de la limpieza: desde otra conexion no debe verse ningun gimnasio de
    // esta corrida. Si alguien cambia el ROLLBACK por un COMMIT, falla aqui.
    const { rows } = await obtenerPool().query(
      'SELECT COUNT(*)::int AS n FROM gimnasio WHERE nombre LIKE $1',
      [`%${MARCA}%`],
    );
    expect(rows[0].n).toBe(0);
  });

  return tx;
}

module.exports = {
  MARCA,
  unico,
  documentoUnico,
  crearGimnasio,
  crearUsuario,
  crearMiembro,
  errorDe,
  usarTransaccionPorTest,
};
