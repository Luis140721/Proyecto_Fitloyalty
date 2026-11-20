/**
 * Integracion: el esquema de la BD de pruebas sale de backend/migrations, igual
 * que en produccion, con applyMigrations (src/db/migrate.js), la funcion que
 * corre el backend al arrancar. Una migracion rota falla aqui y no en el
 * despliegue. Sin TEST_DATABASE_URL se salta.
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const fs = require('fs');
const path = require('path');

const DIR_MIGRACIONES = path.join(__dirname, '..', '..', 'migrations');

describeConBd('migraciones contra la BD de pruebas', () => {
  let pool;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
  }, 60_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  async function aplicadas() {
    const { rows } = await pool.query('SELECT filename FROM schema_migrations');
    return rows.map((r) => r.filename);
  }

  test('queda aplicado cada archivo de backend/migrations', async () => {
    const archivos = fs.readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql'));

    expect(await aplicadas()).toEqual(expect.arrayContaining(archivos));
  });

  test('aplicarlas otra vez no repite ninguna', async () => {
    const { applyMigrations } = require('../../src/db/migrate');
    const antes = await aplicadas();
    const logOriginal = console.log;
    console.log = () => {};

    try {
      await applyMigrations();
    } finally {
      console.log = logOriginal;
    }

    expect((await aplicadas()).sort()).toEqual(antes.sort());
  });
});
