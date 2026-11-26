/**
 * Integracion: el esquema de la BD de pruebas sale de backend/migrations, igual
 * que en produccion, con applyMigrations (src/db/migrate.js), la funcion que
 * corre el backend al arrancar. Una migracion rota falla aqui y no en el
 * despliegue. Sin DATABASE_URL en el entorno del proceso se salta.
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

  // RQNF-05: los indices de ConsultasDB (el esquema de produccion) tambien en
  // una base creada solo con las migraciones (021).
  test('quedan los indices de produccion, con sus columnas', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ConsultasDB', 'Query_Inicial_Crear_Tablas.sql'), 'utf8');
    const deProduccion = [...sql.matchAll(/^CREATE INDEX (\w+) ON (\w+)\s*\(([^)]+)\)/gm)]
      .map(([, nombre, tabla, columnas]) => ({ nombre, tabla, columnas: columnas.replace(/\s+/g, ' ').trim() }));
    const { rows } = await pool.query(
      "SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)",
      [deProduccion.map((i) => i.nombre)],
    );
    const enLaBase = Object.fromEntries(rows.map((r) => [r.indexname, r]));

    expect(deProduccion.length).toBeGreaterThanOrEqual(15);
    for (const { nombre, tabla, columnas } of deProduccion) {
      expect(enLaBase[nombre]).toMatchObject({ tablename: tabla });
      expect(enLaBase[nombre].indexdef.replace(/\s+/g, ' ')).toContain(`(${columnas})`);
    }
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
