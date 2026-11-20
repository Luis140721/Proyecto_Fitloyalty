/**
 * e2e/guardia-bd.cjs
 *
 * Lista permitida de la BD de pruebas, la misma para los E2E
 * (playwright.config.js, E2E_DATABASE_URL) y para los tests de integracion del
 * backend (backend/tests/integracion, TEST_DATABASE_URL). Solo pasa la BD de
 * pruebas local, el servicio db-test de e2e/docker-compose.yml: la de
 * desarrollo (5432 o 5434), Neon y Render se rechazan antes de levantar nada.
 * Sus tests estan en backend/tests/integracion/guardia-bd.test.js.
 *
 * Es .cjs para que lo carguen igual el backend (CommonJS) y la config de
 * Playwright. El mensaje muestra solo host:puerto/BD, nunca el usuario ni la
 * clave.
 */

// Forma exacta admitida, comprobada sobre la cadena tal cual y antes de
// parsearla:
//   - usuario y clave solo con letras, numeros y . _ ~ - (nada de @ & % ? # / :
//     de mas, espacios ni caracteres de control);
//   - host 127.0.0.1, sin localhost: en Windows localhost puede resolver a ::1,
//     y ahi puede escuchar otro proceso;
//   - puerto 5433;
//   - BD de letras, numeros y _, terminada en _test;
//   - como mucho ?sslmode=...
// new URL y pg no leen igual todas las URL. src/db/db.js, ademas, borra
// sslmode con una expresion sobre la cadena entera, y con una "&sslmode=" en la
// clave y una @ en la ruta cambiaba el host y el puerto. Con esta forma, new
// URL, db.js y pg leen el mismo destino.
const FORMA = /^postgres(?:ql)?:\/\/[A-Za-z0-9._~-]+(?::[A-Za-z0-9._~-]*)?@127\.0\.0\.1:5433\/[A-Za-z0-9_]+_test(?:\?sslmode=[a-z-]+)?$/;
const FORMA_LEGIBLE = 'postgres://usuario:clave@127.0.0.1:5433/nombre_test (solo se admite ?sslmode=)';

/** Motivos por los que un destino { host, port, database } no es la BD de pruebas. */
function motivosDelDestino({ host, port, database }) {
  const motivos = [];
  if (host !== '127.0.0.1') motivos.push('el host no es 127.0.0.1');
  if (String(port) !== '5433') motivos.push('el puerto no es 5433');
  if (!String(database ?? '').endsWith('_test')) motivos.push('el nombre de la BD no termina en _test');
  return motivos;
}

/**
 * Lo que se le puede decir a quien escribio la URL, sin mostrar el usuario ni
 * la clave. Solo sirve para el mensaje: la decision la toma FORMA.
 */
function diagnostico(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { recibido: 'algo que no es una URL', motivos: ['no es una URL valida de PostgreSQL'] };
  }
  const bd = u.pathname.replace(/^\//, '');
  const motivos = [];
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) motivos.push('el protocolo no es postgres:// ni postgresql://');
  motivos.push(...motivosDelDestino({ host: u.hostname, port: u.port, database: bd }));
  const otros = [...u.searchParams.keys()].filter((k) => k !== 'sslmode');
  if (otros.length > 0) motivos.push(`trae parametros no permitidos (${otros.join(', ')})`);
  if (motivos.length === 0) {
    motivos.push('trae caracteres fuera de la forma permitida en el usuario, la clave, la BD o sslmode');
  }
  return { recibido: `${u.hostname || '?'}:${u.port || '(sin puerto)'}/${bd || '?'}`, motivos };
}

function exigirBdDePruebas(url, variable) {
  // Dos casos con su propio mensaje; FORMA tambien los rechaza.
  if (/\s/.test(url)) throw new Error(`${variable} no puede tener espacios.`);
  // Lo que va despues de # es fragmento para new URL, que no lo revisa, pero no
  // para pg: db.js, al quitar sslmode, convertia "?sslmode=x#&port=5436" en
  // "?&port=5436".
  if (url.includes('#')) throw new Error(`${variable} no puede tener #.`);
  if (FORMA.test(url)) return;
  const { recibido, motivos } = diagnostico(url);
  throw new Error(
    `${variable} debe tener la forma ${FORMA_LEGIBLE}: la BD de pruebas local, db-test. ` +
      `Recibido: ${recibido}. Motivo: ${motivos.join('; ')}. ` +
      `Levantala con "docker compose -f e2e/docker-compose.yml up -d --wait db-test" (desde la raiz) y no apuntes ${variable} a otra BD.`,
  );
}

module.exports = { exigirBdDePruebas, motivosDelDestino };
