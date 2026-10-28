/**
 * tests/integracion/guardia-bd.js
 *
 * Lista permitida de la BD de los tests de integracion. Es la misma regla que
 * e2e/playwright.config.js aplica a E2E_DATABASE_URL (si cambias una, cambia la
 * otra): solo pasa la BD de pruebas local, el servicio db-test de
 * e2e/docker-compose.yml. La de desarrollo (5432 o 5434), Neon y Render se
 * rechazan antes de abrir una conexion.
 *
 * pg obedece ?host=, ?port= y ?hostaddr= por encima del host y el puerto de la
 * URL, por eso esos parametros tambien se rechazan. El mensaje muestra solo
 * host:puerto/BD, nunca el usuario ni la clave.
 */
function exigirBdDePruebas(url, variable = 'TEST_DATABASE_URL') {
  let u;
  let bd;
  // new URL recorta los espacios de los extremos y pg no: con ellos, los dos
  // leerian destinos distintos.
  if (/\s/.test(url)) throw new Error(`${variable} no puede tener espacios.`);
  try {
    u = new URL(url);
    bd = decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`${variable} no es una URL valida de PostgreSQL.`);
  }
  const motivos = [];
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) motivos.push('el protocolo no es postgres:// ni postgresql://');
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) motivos.push('el host no es 127.0.0.1 ni localhost');
  if (u.port !== '5433') motivos.push('el puerto no es 5433');
  if (!bd.endsWith('_test')) motivos.push('el nombre de la BD no termina en _test');
  const redirigen = [...u.searchParams.keys()].filter((k) => ['host', 'port', 'hostaddr'].includes(k.toLowerCase()));
  if (redirigen.length > 0) motivos.push(`trae parametros que cambian el destino (${redirigen.join(', ')})`);
  if (motivos.length > 0) {
    throw new Error(
      'Los tests de integracion solo corren contra la BD de pruebas local (db-test, 127.0.0.1:5433, BD terminada en _test). ' +
        `Recibido: ${u.hostname || '?'}:${u.port || '(sin puerto)'}/${bd || '?'}. Motivo: ${motivos.join('; ')}. ` +
        `Levantala con "docker compose -f e2e/docker-compose.yml up -d --wait db-test" y no apuntes ${variable} a otra BD.`,
    );
  }
}

module.exports = { exigirBdDePruebas };
