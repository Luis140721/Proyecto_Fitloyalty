// Ayudas de red para /api/admin/checkin (POST registra el ingreso, GET trae el
// historial del dia).
const esCheckin = (url) => url.pathname.endsWith('/api/admin/checkin');

/**
 * Simula una red lenta: la peticion llega al backend de inmediato, pero su
 * respuesta se entrega al navegador "ms" milisegundos despues. El setTimeout es
 * la latencia simulada, no una pausa del test.
 */
export async function retrasarRespuestas(page, metodo, ms) {
  await page.route(esCheckin, async (route) => {
    if (route.request().method() !== metodo) return route.fallback();
    const respuesta = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.fulfill({ response: respuesta });
  });
}

/**
 * Retiene las respuestas hasta que el test llama a la funcion que devuelve. La
 * peticion llega al backend de inmediato (el ingreso se guarda), pero el
 * navegador no recibe la respuesta: asi un segundo clic o Enter llega, seguro,
 * con el primero en camino, aunque el equipo este lento.
 */
export async function retenerRespuestas(page, metodo) {
  let soltar;
  const suelta = new Promise((resolve) => { soltar = resolve; });
  await page.route(esCheckin, async (route) => {
    if (route.request().method() !== metodo) return route.fallback();
    const respuesta = await route.fetch();
    await suelta;
    await route.fulfill({ response: respuesta });
  });
  return soltar;
}

/** Peticiones con ese metodo que salen del navegador hacia /api/admin/checkin. */
export function peticionesDeCheckin(page, metodo) {
  const peticiones = [];
  page.on('request', (peticion) => {
    if (peticion.method() === metodo && esCheckin(new URL(peticion.url()))) peticiones.push(peticion);
  });
  return peticiones;
}
