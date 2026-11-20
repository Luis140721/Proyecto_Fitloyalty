import { expect, test } from '@playwright/test';
import { crearDueno, usarIpPropia } from './support/cuentas.js';
import { LoginPage } from './support/login-page.js';

// Semana 7, Parte 3 sobre el inicio de sesion: doble envio y red lenta.

const esLogin = (url) => url.pathname.endsWith('/api/auth/login');

/**
 * Retiene la respuesta del login hasta que el test la suelta. La peticion si
 * llega al backend; solo el navegador espera. Asi el segundo clic o Enter llega,
 * seguro, con el primero en camino, aunque el equipo este lento.
 */
async function retenerLogin(page) {
  let soltar;
  const suelta = new Promise((resolve) => { soltar = resolve; });
  await page.route(esLogin, async (route) => {
    const respuesta = await route.fetch();
    await suelta;
    await route.fulfill({ response: respuesta });
  });
  return soltar;
}

/** POST de login que salen del navegador. */
function contarLogins(page) {
  const peticiones = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && esLogin(new URL(r.url()))) peticiones.push(r);
  });
  return peticiones;
}

test.describe('inicio de sesion: defectos de tiempos', () => {
  test.beforeEach(({ page }) => usarIpPropia(page));

  test('should send a single login when the button is double-clicked', async ({ page, request }) => {
    // Arrange
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    const peticiones = contarLogins(page);
    const soltar = await retenerLogin(page);
    await login.abrir();
    await login.llenar(dueno.correo, dueno.clave);

    // Act: doble clic con la primera respuesta todavia en camino
    await login.entrar.dblclick();
    await expect(login.entrar).toBeDisabled();
    soltar();

    // Assert
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    expect(peticiones).toHaveLength(1);
  });

  test('should send a single login when Enter is pressed twice', async ({ page, request }) => {
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    const peticiones = contarLogins(page);
    const soltar = await retenerLogin(page);
    await login.abrir();
    await login.llenar(dueno.correo, dueno.clave);

    await login.clave.press('Enter');
    await login.clave.press('Enter');
    await expect(login.entrar).toBeDisabled();
    soltar();

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    expect(peticiones).toHaveLength(1);
  });

  test('should show the progress and lock the button while the network is slow', async ({ page, request }) => {
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    const soltar = await retenerLogin(page);
    await login.abrir();

    await login.iniciarSesion(dueno.correo, dueno.clave);

    // Mientras no llega la respuesta: el boton dice que esta trabajando y no se puede usar.
    await expect(login.entrar).toContainText('Entrando');
    await expect(login.entrar).toBeDisabled();
    await expect(page).toHaveURL(/\/login$/);
    soltar();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
});
