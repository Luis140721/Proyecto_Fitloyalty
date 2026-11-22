// Ayudas de red para los tests de tiempos. Por defecto actuan sobre
// /api/admin/checkin (POST registra el ingreso, GET trae el historial del dia);
// los del alta de miembro pasan RUTA_MIEMBROS (POST crea, GET trae la lista).
export const RUTA_CHECKIN = '/api/admin/checkin';
export const RUTA_MIEMBROS = '/api/admin/miembros';

// endsWith y no includes: /api/admin/miembros/42 (el PUT del QR) no cuenta.
const deRuta = (ruta) => (url) => url.pathname.endsWith(ruta);

/**
 * Simula una red lenta: la peticion llega al backend de inmediato, pero su
 * respuesta se entrega al navegador "ms" milisegundos despues. El setTimeout es
 * la latencia simulada, no una pausa del test.
 */
export async function retrasarRespuestas(page, metodo, ms, ruta = RUTA_CHECKIN) {
  await page.route(deRuta(ruta), async (route) => {
    if (route.request().method() !== metodo) return route.fallback();
    const respuesta = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.fulfill({ response: respuesta });
  });
}

/**
 * Retiene las respuestas hasta que el test llama a la funcion que devuelve. La
 * peticion llega al backend de inmediato (el registro se guarda), pero el
 * navegador no recibe la respuesta: asi un segundo clic o Enter llega, seguro,
 * con el primero en camino, aunque el equipo este lento.
 */
export async function retenerRespuestas(page, metodo, ruta = RUTA_CHECKIN) {
  let soltar;
  const suelta = new Promise((resolve) => { soltar = resolve; });
  await page.route(deRuta(ruta), async (route) => {
    if (route.request().method() !== metodo) return route.fallback();
    const respuesta = await route.fetch();
    await suelta;
    await route.fulfill({ response: respuesta });
  });
  return soltar;
}

/** Peticiones con ese metodo que salen del navegador hacia la ruta. */
export function peticionesA(page, metodo, ruta) {
  const peticiones = [];
  page.on('request', (peticion) => {
    if (peticion.method() === metodo && deRuta(ruta)(new URL(peticion.url()))) peticiones.push(peticion);
  });
  return peticiones;
}

/** Peticiones con ese metodo que salen del navegador hacia /api/admin/checkin. */
export function peticionesDeCheckin(page, metodo) {
  return peticionesA(page, metodo, RUTA_CHECKIN);
}
