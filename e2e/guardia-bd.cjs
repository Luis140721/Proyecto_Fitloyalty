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

// Unico parametro admitido en la URL. pg copia todos los parametros a su
// configuracion, y ?host= y ?port= mandan sobre el host y el puerto de la URL.
const PARAMETROS_PERMITIDOS = ['sslmode'];

/** Motivos por los que un destino { host, port, database } no es la BD de pruebas. */
function motivosDelDestino({ host, port, database }) {
  const motivos = [];
  if (!['localhost', '127.0.0.1'].includes(host)) motivos.push('el host no es 127.0.0.1 ni localhost');
  if (String(port) !== '5433') motivos.push('el puerto no es 5433');
  if (!String(database ?? '').endsWith('_test')) motivos.push('el nombre de la BD no termina en _test');
  return motivos;
}

function exigirBdDePruebas(url, variable) {
  // new URL recorta los espacios de los extremos y pg no.
  if (/\s/.test(url)) throw new Error(`${variable} no puede tener espacios.`);
  // Lo que va despues de # es fragmento para new URL, que no lo revisa, pero no
  // para pg: src/db/db.js, al quitar sslmode, convierte "?sslmode=x#&port=5436"
  // en "?&port=5436".
  if (url.includes('#')) throw new Error(`${variable} no puede tener #.`);
  let u;
  let bd;
  try {
    u = new URL(url);
    bd = decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`${variable} no es una URL valida de PostgreSQL.`);
  }
  const motivos = [];
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) motivos.push('el protocolo no es postgres:// ni postgresql://');
  motivos.push(...motivosDelDestino({ host: u.hostname, port: u.port, database: bd }));
  const otros = [...u.searchParams.keys()].filter((k) => !PARAMETROS_PERMITIDOS.includes(k));
  if (otros.length > 0) motivos.push(`trae parametros no permitidos (${otros.join(', ')}); solo se admite sslmode`);
  if (motivos.length > 0) {
    throw new Error(
      `${variable} debe apuntar a la BD de pruebas local (db-test, 127.0.0.1:5433, BD terminada en _test). ` +
        `Recibido: ${u.hostname || '?'}:${u.port || '(sin puerto)'}/${bd || '?'}. Motivo: ${motivos.join('; ')}. ` +
        `Levantala con "docker compose -f e2e/docker-compose.yml up -d --wait db-test" (desde la raiz) y no apuntes ${variable} a otra BD.`,
    );
  }
}

module.exports = { exigirBdDePruebas, motivosDelDestino };
