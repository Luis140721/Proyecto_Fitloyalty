import { expect, test } from '@playwright/test';
import { AltaMiembroPage } from './support/alta-miembro-page.js';
import { documentoUnico, enviarAlta, miembrosConDocumento, nombreUnico } from './support/datos.js';
import { SESION } from './support/entorno.js';
import { RUTA_MIEMBROS, peticionesA, retenerRespuestas, retrasarRespuestas } from './support/red.js';

// Defectos de tiempos del alta de miembro (Parte 3 de la semana 7, parte de
// Daniel). Con el backend local todo responde en milisegundos, asi que la red
// lenta se provoca con page.route, reteniendo o retrasando respuestas: sin eso
// estos tests pasarian aunque el defecto existiera.
test.use({ storageState: SESION });

// Las respuestas retenidas o retrasadas pueden seguir pendientes cuando el test termina.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test.describe('doble envio', () => {
  // La respuesta del POST se retiene hasta despues del doble clic: asi el segundo
  // clic llega, seguro, con el primer envio todavia en camino.

  test('should create a single member when the receptionist double-clicks Crear miembro', async ({ page, request }) => {
    // Arrange
    const documento = documentoUnico();
    const alta = new AltaMiembroPage(page);
    await alta.abrirAlta();
    await alta.llenarAlta({ nombre: nombreUnico(), documento });
    const soltarRespuesta = await retenerRespuestas(page, 'POST', RUTA_MIEMBROS);
    const posts = peticionesA(page, 'POST', RUTA_MIEMBROS);

    // Act
    await alta.crear.dblclick();
    soltarRespuesta();

    // Assert: un solo POST y un solo miembro en la BD
    await expect(alta.avisoCreado).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(await miembrosConDocumento(request, documento)).toHaveLength(1);
  });

  // Con la pagina desplazada hasta el final, el paso 5 (mas bajo que el 4) hace que
  // el navegador suba el desplazamiento: todo baja y "Crear miembro" queda justo
  // bajo el puntero, donde cae el segundo clic. Sin desplazar, ese clic cae en el
  // fondo de la pagina. En la suite en paralelo pasaba a veces, segun lo larga que
  // estuviera la lista del gimnasio compartido; aqui se fija: lista vacia (stub de
  // GET /api/admin/miembros) y la pagina abajo del todo.
  test('should wait for Crear miembro when the receptionist double-clicks Siguiente on step 4 at the bottom of the page', async ({ page, request }) => {
    // Arrange: los terminos ya estan marcados y la recepcion volvio al paso 4 a revisar algo
    await page.route((url) => url.pathname.endsWith(RUTA_MIEMBROS), (route) => (route.request().method() === 'GET'
      ? route.fulfill({ json: { miembros: [], total: 0, page: 0, pageSize: 100 } })
      : route.fallback()));
    const documento = documentoUnico();
    const alta = new AltaMiembroPage(page);
    await alta.abrirAlta();
    await alta.llenarAlta({ nombre: nombreUnico(), documento });
    await alta.anterior.click();
    await page.mouse.wheel(0, 10_000);
    await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight)).toBe(true);
    await expect(alta.siguiente).toBeInViewport();
    const soltarRespuesta = await retenerRespuestas(page, 'POST', RUTA_MIEMBROS);
    const posts = peticionesA(page, 'POST', RUTA_MIEMBROS);

    // Act: el doble clic de alguien con prisa
    await alta.siguiente.dblclick();

    // Assert: llega al paso 5 y el alta espera a que pulsen "Crear miembro". Con el
    // defecto el segundo clic enviaba el formulario y el boton quedaba en
    // "Creando miembro..."
    await expect(alta.paso).toHaveText('Paso 5 de 5');
    await expect(alta.botonCrear).toBeEnabled();
    expect(posts).toHaveLength(0);
    soltarRespuesta();
    expect(await miembrosConDocumento(request, documento)).toHaveLength(0);
  });

  // Dos peticiones al mismo tiempo con el mismo documento, como dos recepcionistas
  // registrando a la misma persona. El navegador ya no manda dos (tests de arriba),
  // pero el backend revisa el documento y despues inserta, sin bloqueo ni
  // restriccion unica: las dos pasan la revision. Falla 20 de 20 veces, por eso
  // esta marcado como fallo esperado hasta que se corrija la incidencia.
  test.fail('should keep a single member when two requests create the same document at the same time', {
    annotation: { type: 'issue', description: 'Incidencia por crear: texto en el PR (carrera en POST /api/admin/miembros)' },
  }, async ({ request }) => {
    // Arrange
    const datos = { nombre: nombreUnico(), documento: documentoUnico() };

    // Act
    const respuestas = await Promise.all([enviarAlta(request, datos), enviarAlta(request, datos)]);

    // Assert: una se crea y la otra recibe el 409 del documento repetido
    expect(respuestas.map((r) => r.status()).sort()).toEqual([201, 409]);
    expect(await miembrosConDocumento(request, datos.documento)).toHaveLength(1);
  });
});

test.describe('Siguiente del paso 4', () => {
  // Buscando el doble envio aparecio algo peor: un solo clic en "Siguiente →" del
  // paso 4 ya enviaba el formulario. React reutilizaba el mismo <button> y le
  // cambiaba el tipo a "submit" durante el clic, y el navegador enviaba el
  // formulario con el tipo nuevo.

  test('should reach the terms step without errors when the receptionist clicks Siguiente on step 4', async ({ page }) => {
    // Arrange: el alta normal, todavia sin marcar los terminos
    const alta = new AltaMiembroPage(page);
    await alta.abrirAlta();
    await alta.llenarDatosPersonales({ nombre: nombreUnico(), documento: documentoUnico() });
    await alta.siguiente.click();
    await alta.siguiente.click();
    await alta.valorTotal.fill('90000');
    await alta.siguiente.click();
    const posts = peticionesA(page, 'POST', RUTA_MIEMBROS);

    // Act
    await alta.siguiente.click();

    // Assert: con el defecto, al llegar ya salian "Revisa los campos marcados
    // antes de guardar." y los dos terminos en rojo, sin haber pulsado "Crear miembro"
    await expect(alta.paso).toHaveText('Paso 5 de 5');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(posts).toHaveLength(0);
  });

  test('should wait for Crear miembro when the receptionist clicks Siguiente on step 4 with the terms accepted', async ({ page, request }) => {
    // Arrange: los terminos ya estan marcados y la recepcion volvio al paso 4 a revisar algo
    const documento = documentoUnico();
    const alta = new AltaMiembroPage(page);
    await alta.abrirAlta();
    await alta.llenarAlta({ nombre: nombreUnico(), documento });
    await alta.anterior.click();
    const soltarRespuesta = await retenerRespuestas(page, 'POST', RUTA_MIEMBROS);
    const posts = peticionesA(page, 'POST', RUTA_MIEMBROS);

    // Act
    await alta.siguiente.click();

    // Assert: con el defecto, este clic creaba el miembro y el boton quedaba en "Creando miembro..."
    await expect(alta.paso).toHaveText('Paso 5 de 5');
    await expect(alta.botonCrear).toBeEnabled();
    expect(posts).toHaveLength(0);
    soltarRespuesta();
    expect(await miembrosConDocumento(request, documento)).toHaveLength(0);
  });
});

test.describe('red lenta', () => {
  // La lista de miembros tarda 5 s en llegar; el alta no deberia esperarla.
  const LATENCIA_GET_MS = 5_000;

  test('should create the member and list it when the member list is still loading', async ({ page }) => {
    // Arrange
    const nombre = nombreUnico();
    await retrasarRespuestas(page, 'GET', LATENCIA_GET_MS, RUTA_MIEMBROS);
    const alta = new AltaMiembroPage(page);
    await alta.abrirAlta();

    // Act: el alta completa mientras la lista sigue cargando
    await alta.llenarAlta({ nombre, documento: documentoUnico() });
    await alta.crear.click();

    // Assert: se crea sin esperar la lista y, cuando la lista llega, el miembro esta
    await expect(alta.avisoCreado).toBeVisible();
    await expect(alta.filaDe(nombre)).toBeVisible({ timeout: 3 * LATENCIA_GET_MS });
  });
});
