/**
 * Guardia de la BD de pruebas (e2e/guardia-bd.cjs, compartida con los E2E) y
 * las redes de tests/integracion/bd-pruebas.js. No se conecta a nada: corre
 * siempre, tambien en el CI sin BD.
 */
const { exigirBdDePruebas } = require('../../../e2e/guardia-bd.cjs');

const VALIDA = 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test';
const exigir = (url) => exigirBdDePruebas(url, 'TEST_DATABASE_URL');

describe('exigirBdDePruebas', () => {
  test.each([
    VALIDA,
    'postgresql://usuario:clave@localhost:5433/otra_test',
    `${VALIDA}?sslmode=disable`,
  ])('acepta la BD de pruebas local: %s', (url) => {
    expect(() => exigir(url)).not.toThrow();
  });

  test.each([
    ['el Postgres local de desarrollo (5432)', 'postgres://u:c@127.0.0.1:5432/fitloyalty_test', 'el puerto no es 5433'],
    ['el contenedor fitloyalty_db (5434)', 'postgres://u:c@localhost:5434/fitloyalty', 'el puerto no es 5433'],
    ['una URL sin puerto', 'postgres://u:c@127.0.0.1/fitloyalty_test', 'el puerto no es 5433'],
    ['una BD remota', 'postgres://u:c@ep-algo.us-east-2.aws.neon.tech:5433/neondb_test', 'el host no es 127.0.0.1 ni localhost'],
    ['una BD que no termina en _test', 'postgres://u:c@127.0.0.1:5433/fitloyalty', 'no termina en _test'],
    ['?host=, que pg usa en lugar del host', `${VALIDA}?host=ep-algo.neon.tech`, 'parametros no permitidos (host)'],
    ['?port=, que pg usa en lugar del puerto', `${VALIDA}?port=5432`, 'parametros no permitidos (port)'],
    ['?hostaddr=', `${VALIDA}?hostaddr=10.0.0.5`, 'parametros no permitidos (hostaddr)'],
    ['?Host= en mayusculas', `${VALIDA}?Host=ep-algo.neon.tech`, 'parametros no permitidos (Host)'],
    ['cualquier otro parametro, porque pg los copia a su configuracion', `${VALIDA}?options=-c%20search_path%3Dotro`, 'parametros no permitidos (options)'],
    ['un parametro escondido detras de sslmode', `${VALIDA}?sslmode=disable&port=5436`, 'parametros no permitidos (port)'],
    ['otro motor', 'mysql://u:c@127.0.0.1:5433/fitloyalty_test', 'el protocolo no es postgres://'],
  ])('rechaza %s', (_caso, url, motivo) => {
    expect(() => exigir(url)).toThrow(motivo);
  });

  // Hallazgo de la revision: new URL deja "#&port=5436" en el fragmento, que no
  // revisa, y src/db/db.js, al quitar sslmode con DB_SSL=false, lo deja como
  // "?&port=5436". pg terminaba en 127.0.0.1:5436.
  test.each([
    `${VALIDA}?sslmode=disable#&port=5436`,
    `${VALIDA}?sslmode=disable#&host=localhost&port=5434`,
    `${VALIDA}#`,
  ])('rechaza una URL con #: %s', (url) => {
    expect(() => exigir(url)).toThrow('no puede tener #');
  });

  test('rechaza una URL con espacios', () => {
    expect(() => exigir(` ${VALIDA}`)).toThrow('no puede tener espacios');
  });

  test('rechaza lo que no es una URL', () => {
    expect(() => exigir('fitloyalty_test')).toThrow('no es una URL valida');
  });

  test('el mensaje nombra la variable y el destino, pero no el usuario ni la clave', () => {
    let mensaje = '';
    try {
      exigir('postgres://usuario_dev:clave_dev@127.0.0.1:5432/fitloyalty');
    } catch (err) {
      mensaje = err.message;
    }
    expect(mensaje).toContain('TEST_DATABASE_URL');
    expect(mensaje).toContain('127.0.0.1:5432/fitloyalty');
    expect(mensaje).not.toContain('usuario_dev');
    expect(mensaje).not.toContain('clave_dev');
  });
});

describe('redes de tests/integracion/bd-pruebas.js', () => {
  const ENV_ORIGINAL = process.env;

  beforeEach(() => {
    process.env = { ...ENV_ORIGINAL };
    // Cada test fija la que necesita, tambien cuando la suite corre con BD.
    delete process.env.TEST_DATABASE_URL;
  });

  afterEach(() => {
    process.env = ENV_ORIGINAL;
  });

  const cargarBdPruebas = () => {
    let modulo;
    jest.isolateModules(() => {
      modulo = require('./bd-pruebas');
    });
    return modulo;
  };

  test('al cargarse con TEST_DATABASE_URL pasa la URL por la guardia', () => {
    process.env.TEST_DATABASE_URL = 'postgres://u:c@127.0.0.1:5432/fitloyalty';

    expect(cargarBdPruebas).toThrow('el puerto no es 5433');
  });

  test('con una URL valida, el pool de la app la usa en lugar de la DATABASE_URL de desarrollo', () => {
    process.env.TEST_DATABASE_URL = VALIDA;
    process.env.DATABASE_URL = 'postgres://dev:dev@127.0.0.1:5432/fitloyalty';
    process.env.DB_SSL = 'true';

    cargarBdPruebas();

    expect(process.env.DATABASE_URL).toBe(VALIDA);
    expect(process.env.DB_SSL).toBe('false');
  });

  // Si algo se colara por la guardia, lo que cuenta es adonde se conecta pg:
  // con la URL del hallazgo, src/db/db.js construye un pool hacia 5436.
  test('el destino efectivo del pool de la app se revisa despues de lo que haga src/db/db.js', async () => {
    process.env.DATABASE_URL = 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/decoy_test?sslmode=disable#&port=5436';
    process.env.DB_SSL = 'false';
    const { exigirDestinoDePruebas } = cargarBdPruebas();
    let pool;
    jest.isolateModules(() => {
      pool = require('../../src/db/db');
    });

    expect(() => exigirDestinoDePruebas(pool.options)).toThrow('se conectaria a 127.0.0.1:5436/decoy_test');
    await pool.end();
  });

  // La BD del ejemplo no termina en _test: si prepararBdDePruebas dejara de
  // revisar el destino, se conectaria, pero la red de current_database() le
  // impediria escribir. El test fallaria igual, por el mensaje.
  test('prepararBdDePruebas no abre ninguna conexion si el pool va a otro destino', async () => {
    process.env.DATABASE_URL = 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/decoy?sslmode=disable#&port=5436';
    process.env.DB_SSL = 'false';
    const { prepararBdDePruebas } = cargarBdPruebas();

    await expect(prepararBdDePruebas()).rejects.toThrow('se conectaria a 127.0.0.1:5436/decoy');
  });

  test('el destino efectivo rechaza un socket local en lugar de 127.0.0.1', () => {
    const { exigirDestinoDePruebas } = cargarBdPruebas();

    expect(() => exigirDestinoDePruebas({ host: '/var/run/postgresql', port: 5433, database: 'fitloyalty_test' }))
      .toThrow('el host no es 127.0.0.1 ni localhost');
  });

  test('el destino efectivo tiene en cuenta las variables PG* que lee pg', () => {
    process.env.PGPORT = '5432';
    const { exigirDestinoDePruebas } = cargarBdPruebas();

    expect(() => exigirDestinoDePruebas({ host: '127.0.0.1', database: 'fitloyalty_test' })).toThrow('el puerto no es 5433');
  });

  test('el destino efectivo acepta la BD de pruebas', () => {
    const { exigirDestinoDePruebas } = cargarBdPruebas();

    expect(() => exigirDestinoDePruebas({ connectionString: VALIDA })).not.toThrow();
  });
});
