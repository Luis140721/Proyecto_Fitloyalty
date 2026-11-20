/**
 * tests/integracion/bd-pruebas.js
 *
 * Conexion de los tests de integracion a la BD de pruebas desechable: el
 * servicio db-test de e2e/docker-compose.yml (127.0.0.1:5433, BD
 * fitloyalty_test), el mismo que usan los E2E.
 *
 * La URL llega por DATABASE_URL, como en el bootcamp, pero solo cuenta la del
 * entorno del proceso: la que exporta quien corre los tests o el job del CI.
 * backend/.env trae la DATABASE_URL de desarrollo y cualquier require('dotenv')
 * (migrate.js, index.js) la carga; por eso aqui no se lee process.env sino el
 * valor que guardo tests/integracion/entorno-del-proceso.js (setupFiles de
 * jest.config.js) antes de que el archivo de test cargue nada.
 *
 *   - Sin DATABASE_URL en el entorno del proceso, describeConBd se salta,
 *     aunque backend/.env la tenga. Asi corre `pnpm test` en el job backend.
 *   - Con una URL que no es la BD de pruebas local, el archivo de test falla
 *     al cargar este modulo, antes de conectarse (e2e/guardia-bd.cjs, la misma
 *     guardia de los E2E).
 *   - Antes de la primera consulta se revisa ademas el destino que pg va a
 *     usar de verdad con las opciones del pool ya construido.
 *
 * Aqui tambien se vuelve a fijar DATABASE_URL, por si el archivo de test ya
 * hubiera cargado dotenv: el pool de la app (src/db/db.js) apunta siempre a la
 * BD de pruebas.
 */
const ConnectionParameters = require('pg/lib/connection-parameters');
const { exigirBdDePruebas, motivosDelDestino } = require('../../../e2e/guardia-bd.cjs');

const URL_PRUEBAS = globalThis.DATABASE_URL_DEL_PROCESO;

if (URL_PRUEBAS) {
  exigirBdDePruebas(URL_PRUEBAS, 'DATABASE_URL');
  process.env.DATABASE_URL = URL_PRUEBAS;
  process.env.DB_SSL = 'false'; // el contenedor no tiene SSL
}

/** describe que se salta sin DATABASE_URL en el entorno del proceso (Jest no trae describe.skipIf). */
const describeConBd = URL_PRUEBAS ? describe : describe.skip;

// Llave fija de pg_advisory_lock. Si Jest corre varios archivos a la vez (npm
// test con DATABASE_URL usa varios procesos), solo uno aplica las
// migraciones en una BD recien creada y los demas esperan su turno.
const CANDADO_MIGRACIONES = 20261028;

/**
 * Falla si las opciones de un pool de pg no llevan a la BD de pruebas.
 * ConnectionParameters es lo que usa pg.Client para leer connectionString, sus
 * parametros y las variables PG*, asi que esto es el destino real despues de
 * lo que haga src/db/db.js con la URL. No abre ninguna conexion.
 */
function exigirDestinoDePruebas(opciones) {
  const destino = new ConnectionParameters(opciones);
  const motivos = motivosDelDestino(destino);
  if (motivos.length > 0) {
    throw new Error(
      `El pool de la app se conectaria a ${destino.host}:${destino.port}/${destino.database}, que no es la BD de pruebas. ` +
        `Motivo: ${motivos.join('; ')}. No se abrio ninguna conexion.`,
    );
  }
}

/**
 * Devuelve el pool de la app conectado a la BD de pruebas, con el esquema
 * creado por las mismas migraciones que aplica el backend al arrancar
 * (applyMigrations de src/db/migrate.js). Quien lo pide lo cierra con
 * pool.end() en su afterAll.
 */
async function prepararBdDePruebas() {
  const pool = require('../../src/db/db');

  // La red que importa: lo que pg va a usar de verdad, no lo que dice la URL.
  try {
    exigirDestinoDePruebas(pool.options);
  } catch (err) {
    await pool.end();
    throw err;
  }

  // Otra red mas: nunca se migra ni se escribe en una BD cuyo nombre no termina en _test.
  const { rows } = await pool.query('SELECT current_database() AS bd');
  if (!rows[0].bd.endsWith('_test')) {
    await pool.end();
    throw new Error(
      `El pool de la app apunta a la BD "${rows[0].bd}", que no es de pruebas. ` +
        'Requiere tests/integracion/bd-pruebas.js antes que cualquier modulo de src/.',
    );
  }

  const { applyMigrations } = require('../../src/db/migrate');
  const cliente = await pool.connect();
  // applyMigrations escribe una linea por archivo; en los tests solo estorba.
  const logOriginal = console.log;
  console.log = () => {};
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [CANDADO_MIGRACIONES]);
    await applyMigrations();
  } finally {
    console.log = logOriginal;
    await cliente.query('SELECT pg_advisory_unlock($1)', [CANDADO_MIGRACIONES]);
    cliente.release();
  }
  return pool;
}

module.exports = { describeConBd, prepararBdDePruebas, exigirDestinoDePruebas };
