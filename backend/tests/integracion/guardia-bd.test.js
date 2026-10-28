/**
 * Guardia de la BD de los tests de integracion (tests/integracion/guardia-bd.js).
 * No se conecta a nada: corre siempre, tambien en el CI sin BD.
 */
const { exigirBdDePruebas } = require('./guardia-bd');

describe('exigirBdDePruebas', () => {
  test.each([
    'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test',
    'postgresql://usuario:clave@localhost:5433/otra_test',
    'postgres://usuario:clave@127.0.0.1:5433/fitloyalty_test?sslmode=disable',
  ])('acepta la BD de pruebas local: %s', (url) => {
    expect(() => exigirBdDePruebas(url)).not.toThrow();
  });

  test.each([
    ['el Postgres local de desarrollo (5432)', 'postgres://u:c@127.0.0.1:5432/fitloyalty_test', 'el puerto no es 5433'],
    ['el contenedor fitloyalty_db (5434)', 'postgres://u:c@localhost:5434/fitloyalty', 'el puerto no es 5433'],
    ['una URL sin puerto', 'postgres://u:c@127.0.0.1/fitloyalty_test', 'el puerto no es 5433'],
    ['una BD remota', 'postgres://u:c@ep-algo.us-east-2.aws.neon.tech:5433/neondb_test', 'el host no es 127.0.0.1 ni localhost'],
    ['una BD que no termina en _test', 'postgres://u:c@127.0.0.1:5433/fitloyalty', 'no termina en _test'],
    ['?host=, que pg usa en lugar del host', 'postgres://u:c@127.0.0.1:5433/fitloyalty_test?host=ep-algo.neon.tech', '(host)'],
    ['?port=, que pg usa en lugar del puerto', 'postgres://u:c@127.0.0.1:5433/fitloyalty_test?port=5432', '(port)'],
    ['?hostaddr=', 'postgres://u:c@127.0.0.1:5433/fitloyalty_test?hostaddr=10.0.0.5', '(hostaddr)'],
    ['?Host= en mayusculas', 'postgres://u:c@127.0.0.1:5433/fitloyalty_test?Host=ep-algo.neon.tech', '(Host)'],
    ['otro motor', 'mysql://u:c@127.0.0.1:5433/fitloyalty_test', 'el protocolo no es postgres://'],
  ])('rechaza %s', (_caso, url, motivo) => {
    expect(() => exigirBdDePruebas(url)).toThrow(motivo);
  });

  test('rechaza una URL con espacios', () => {
    expect(() => exigirBdDePruebas(' postgres://u:c@127.0.0.1:5433/fitloyalty_test')).toThrow('no puede tener espacios');
  });

  test('rechaza lo que no es una URL', () => {
    expect(() => exigirBdDePruebas('fitloyalty_test')).toThrow('no es una URL valida');
  });

  test('el mensaje muestra el destino pero no el usuario ni la clave', () => {
    let mensaje = '';
    try {
      exigirBdDePruebas('postgres://usuario_dev:clave_dev@127.0.0.1:5432/fitloyalty');
    } catch (err) {
      mensaje = err.message;
    }
    expect(mensaje).toContain('127.0.0.1:5432/fitloyalty');
    expect(mensaje).not.toContain('usuario_dev');
    expect(mensaje).not.toContain('clave_dev');
  });
});
