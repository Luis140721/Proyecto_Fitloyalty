/**
 * Guardia de la BD de pruebas (e2e/guardia-bd.cjs, compartida con los E2E) y
 * las redes de tests/integracion/bd-pruebas.js. No se conecta a nada: corre
 * siempre, tambien en el CI sin BD.
 */
const fs = require('fs');
const path = require('path');
const ConnectionParameters = require('pg/lib/connection-parameters');
const { exigirBdDePruebas } = require('../../../e2e/guardia-bd.cjs');

const VALIDA = 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test';
const exigir = (url) => exigirBdDePruebas(url, 'TEST_DATABASE_URL');

const ACEPTADAS = [
  VALIDA,
  `${VALIDA}?sslmode=disable`,
  'postgresql://usuario:clave@127.0.0.1:5433/otra_test',
];

// Los dos que llevaban a otra BD en las revisiones de la semana 6. Los dos
// pasaban la guardia de antes y src/db/db.js, al quitar sslmode con una
// expresion sobre la cadena entera, los convertia en una URL hacia 5436.
const ATAQUE_ALMOHADILLA = 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/decoy_test?sslmode=disable#&port=5436';
const ATAQUE_CLAVE = 'postgres://fitloyalty_test:fitloyalty_test&sslmode=x@127.0.0.1:5433/a&@127.0.0.1:5436/decoy_test';

// Todos los ataques conocidos: que es, la URL y un trozo del mensaje.
const ATAQUES = [
  ['el Postgres local de desarrollo (5432)', 'postgres://u:c@127.0.0.1:5432/fitloyalty_test', 'el puerto no es 5433'],
  ['el contenedor fitloyalty_db (5434)', 'postgres://u:c@127.0.0.1:5434/fitloyalty', 'el puerto no es 5433'],
  ['una URL sin puerto', 'postgres://u:c@127.0.0.1/fitloyalty_test', 'el puerto no es 5433'],
  ['localhost, que en Windows puede resolver a ::1', 'postgres://u:c@localhost:5433/fitloyalty_test', 'el host no es 127.0.0.1'],
  ['una BD remota', 'postgres://u:c@ep-algo.us-east-2.aws.neon.tech:5433/neondb_test', 'el host no es 127.0.0.1'],
  ['IPv6 [::1]', 'postgres://u:c@[::1]:5433/fitloyalty_test', 'el host no es 127.0.0.1'],
  ['IPv6 [::ffff:127.0.0.1]', 'postgres://u:c@[::ffff:127.0.0.1]:5433/fitloyalty_test', 'debe tener la forma'],
  ['varios hosts', 'postgres://u:c@127.0.0.1:5433,ep-x.neon.tech:5432/fitloyalty_test', 'debe tener la forma'],
  ['varios hosts con un solo puerto', 'postgres://u:c@127.0.0.1,ep-x.neon.tech:5433/fitloyalty_test', 'debe tener la forma'],
  ['un socket como host codificado', 'postgres://u:c@%2Fvar%2Frun%2Fpostgresql:5433/fitloyalty_test', 'debe tener la forma'],
  ['sin host y con ?host= de socket', 'postgres:///fitloyalty_test?host=/tmp', 'debe tener la forma'],
  ['una BD que no termina en _test', 'postgres://u:c@127.0.0.1:5433/fitloyalty', 'no termina en _test'],
  ['?host=, que pg usa en lugar del host', `${VALIDA}?host=ep-algo.neon.tech`, 'parametros no permitidos (host)'],
  ['?port=, que pg usa en lugar del puerto', `${VALIDA}?port=5432`, 'parametros no permitidos (port)'],
  ['?hostaddr=', `${VALIDA}?hostaddr=10.0.0.5`, 'parametros no permitidos (hostaddr)'],
  ['?Host= en mayusculas', `${VALIDA}?Host=ep-algo.neon.tech`, 'parametros no permitidos (Host)'],
  ['?options=, porque pg copia todos los parametros a su configuracion', `${VALIDA}?options=-c%20search_path%3Dotro`, 'parametros no permitidos (options)'],
  ['&port= detras de sslmode', `${VALIDA}?sslmode=disable&port=5436`, 'parametros no permitidos (port)'],
  ['dos sslmode', `${VALIDA}?sslmode=disable&sslmode=require`, 'debe tener la forma'],
  ['SSLMODE en mayusculas', `${VALIDA}?SSLMODE=disable`, 'parametros no permitidos (SSLMODE)'],
  ['%23 en el valor de sslmode', `${VALIDA}?sslmode=disable%23`, 'debe tener la forma'],
  ['%23 en el nombre de la BD', 'postgres://u:c@127.0.0.1:5433/fitloyalty%23_test', 'debe tener la forma'],
  ['&sslmode= en la clave y @ en la ruta (llevaba la E2E a 5436)', ATAQUE_CLAVE, 'debe tener la forma'],
  ['un caracter de control al inicio y un % mal formado (pg leia base:5432)', '\x01postgres://u:c%zz@127.0.0.1:5433/fitloyalty_test', 'debe tener la forma'],
  ['una @ ancha en el usuario', 'postgres://u＠x:c@127.0.0.1:5433/fitloyalty_test', 'debe tener la forma'],
  ['una @ ancha en el host', 'postgres://u:c@127.0.0.1＠ep-x.neon.tech:5433/fitloyalty_test', 'debe tener la forma'],
  ['una barra invertida', 'postgres://u:c@127.0.0.1:5433\\fitloyalty_test', 'debe tener la forma'],
  ['otro motor', 'mysql://u:c@127.0.0.1:5433/fitloyalty_test', 'el protocolo no es postgres://'],
  ['lo que no es una URL', 'fitloyalty_test', 'no es una URL valida'],
  ['# (llevaba la integracion y la E2E a 5436)', ATAQUE_ALMOHADILLA, 'no puede tener #'],
  ['# con host y puerto', `${VALIDA}?sslmode=disable#&host=localhost&port=5434`, 'no puede tener #'],
  ['# vacio', `${VALIDA}#`, 'no puede tener #'],
  ['un espacio al inicio', ` ${VALIDA}`, 'no puede tener espacios'],
  ['un espacio al final', `${VALIDA} `, 'no puede tener espacios'],
  ['un tabulador', `${VALIDA}\t`, 'no puede tener espacios'],
];

describe('exigirBdDePruebas', () => {
  test.each(ACEPTADAS)('acepta la BD de pruebas local: %s', (url) => {
    expect(() => exigir(url)).not.toThrow();
  });

  test.each(ATAQUES)('rechaza %s', (_caso, url, motivo) => {
    expect(() => exigir(url)).toThrow(motivo);
  });

  test('el mensaje dice la forma esperada', () => {
    expect(() => exigir(ATAQUE_CLAVE)).toThrow(
      'TEST_DATABASE_URL debe tener la forma postgres://usuario:clave@127.0.0.1:5433/nombre_test (solo se admite ?sslmode=)',
    );
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

  // Los casos de arriba valen tambien para E2E_DATABASE_URL: la config de los
  // E2E no tiene una copia de la regla, usa este mismo modulo.
  test('la config de los E2E usa esta misma guardia con E2E_DATABASE_URL', () => {
    const config = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'e2e', 'playwright.config.js'), 'utf8');

    expect(config).toContain("import { exigirBdDePruebas } from './guardia-bd.cjs';");
    expect(config).toContain("exigirBdDePruebas(DATABASE_URL, 'E2E_DATABASE_URL');");
    expect(config).not.toMatch(/function\s+exigirBdDePruebas/);
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

  /** El pool de la app (src/db/db.js) con la DATABASE_URL y el DB_SSL de ahora. No se conecta. */
  const poolDeLaApp = () => {
    let pool;
    jest.isolateModules(() => {
      pool = require('../../src/db/db');
    });
    return pool;
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

  // Lo que la guardia deja pasar es lo que pg usa: ni la expresion de sslmode
  // de src/db/db.js ni el parser de pg cambian el destino.
  test.each(ACEPTADAS.flatMap((url) => [[url, 'false'], [url, 'true']]))(
    'lo que la guardia acepta llega a pg con el mismo destino: %s (DB_SSL=%s)',
    async (url, dbSsl) => {
      process.env.DATABASE_URL = url;
      process.env.DB_SSL = dbSsl;
      const pool = poolDeLaApp();

      const destino = new ConnectionParameters(pool.options);
      await pool.end();

      expect([destino.host, destino.port, destino.database]).toEqual(['127.0.0.1', 5433, new URL(url).pathname.slice(1)]);
    },
  );

  // Si algo se colara por la guardia, lo que cuenta es adonde se conecta pg:
  // con las URL de los dos ataques, src/db/db.js construye un pool hacia 5436.
  test.each([ATAQUE_ALMOHADILLA, ATAQUE_CLAVE])(
    'el destino efectivo del pool de la app se revisa despues de lo que haga src/db/db.js: %s',
    async (url) => {
      process.env.DATABASE_URL = url;
      process.env.DB_SSL = 'false';
      const { exigirDestinoDePruebas } = cargarBdPruebas();
      const pool = poolDeLaApp();

      expect(() => exigirDestinoDePruebas(pool.options)).toThrow('se conectaria a 127.0.0.1:5436/decoy_test');
      await pool.end();
    },
  );

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
      .toThrow('el host no es 127.0.0.1');
  });

  test('el destino efectivo rechaza localhost, aunque la guardia de la URL no lo viera', () => {
    const { exigirDestinoDePruebas } = cargarBdPruebas();

    expect(() => exigirDestinoDePruebas({ host: 'localhost', port: 5433, database: 'fitloyalty_test' }))
      .toThrow('el host no es 127.0.0.1');
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
