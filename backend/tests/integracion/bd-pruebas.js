/**
 * tests/integracion/bd-pruebas.js
 *
 * Conexion de los tests de integracion a la BD de pruebas desechable: el
 * servicio db-test de e2e/docker-compose.yml (127.0.0.1:5433, BD
 * fitloyalty_test), el mismo que usan los E2E.
 *
 * La URL llega por TEST_DATABASE_URL y no por DATABASE_URL, como en el
 * bootcamp: backend/.env trae la DATABASE_URL de desarrollo y cualquier
 * require('dotenv') (migrate.js, index.js) la carga, asi que un test que
 * leyera DATABASE_URL podria escribir en la BD de desarrollo.
 *
 *   - Sin TEST_DATABASE_URL, describeConBd se salta: el CI no tiene BD hasta
 *     la semana 8 y la cobertura se mide sin ella.
 *   - Con una URL que no es la BD de pruebas local, el archivo de test falla
 *     antes de conectarse (guardia-bd.js).
 *
 * Cada archivo de integracion requiere este modulo ANTES que cualquier cosa de
 * src/: aqui se fija DATABASE_URL para que el pool de la app (src/db/db.js)
 * apunte a la BD de pruebas. dotenv no pisa variables ya definidas, asi que
 * backend/.env ya no puede cambiarla.
 */
const { exigirBdDePruebas } = require('./guardia-bd');

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;

if (URL_PRUEBAS) {
  exigirBdDePruebas(URL_PRUEBAS);
  process.env.DATABASE_URL = URL_PRUEBAS;
  process.env.DB_SSL = 'false'; // el contenedor no tiene SSL
}

/** describe que se salta sin TEST_DATABASE_URL (Jest no trae describe.skipIf). */
const describeConBd = URL_PRUEBAS ? describe : describe.skip;

// Llave fija de pg_advisory_lock. Si Jest corre varios archivos a la vez (npm
// test con TEST_DATABASE_URL usa varios procesos), solo uno aplica las
// migraciones en una BD recien creada y los demas esperan su turno.
const CANDADO_MIGRACIONES = 20261028;

/**
 * Devuelve el pool de la app conectado a la BD de pruebas, con el esquema
 * creado por las mismas migraciones que aplica el backend al arrancar
 * (applyMigrations de src/db/migrate.js). Quien lo pide lo cierra con
 * pool.end() en su afterAll.
 */
async function prepararBdDePruebas() {
  const pool = require('../../src/db/db');

  // Segunda red: aunque algo hubiera cargado db.js antes con otra URL, nunca se
  // migra ni se escribe en una BD cuyo nombre no termina en _test.
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

module.exports = { describeConBd, prepararBdDePruebas };
