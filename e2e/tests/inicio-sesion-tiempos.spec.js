import { expect, test } from '@playwright/test';
import { crearDueno, usarIpPropia } from './support/cuentas.js';
import { LoginPage } from './support/login-page.js';

// Semana 7, Parte 3 sobre el inicio de sesion: doble envio y red lenta, tanto
// del POST del login como del GET de carga de la sesion (/api/auth/me).

const esLogin = (url) => url.pathname.endsWith('/api/auth/login');
const esSesion = (url) => url.pathname.endsWith('/api/auth/me');

/**
 * Retiene las respuestas que cumplan `coincide` hasta que el test las suelta.
 * La peticion si llega al backend; solo el navegador espera. En vez de un
 * retraso fijo (un sleep), la respuesta queda en camino todo el tiempo que el
 * test necesite para mirar la pantalla, aunque el equipo este lento.
 */
async function retener(page, coincide) {
  let soltar;
  const suelta = new Promise((resolve) => { soltar = resolve; });
  await page.route(coincide, async (route) => {
    const respuesta = await route.fetch();
    await suelta;
    await route.fulfill({ response: respuesta });
  });
  return soltar;
}

const retenerLogin = (page) => retener(page, esLogin);

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
    // Arrange
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    const peticiones = contarLogins(page);
    const soltar = await retenerLogin(page);
    await login.abrir();
    await login.llenar(dueno.correo, dueno.clave);

    // Act: dos Enter con la primera respuesta todavia en camino
    await login.clave.press('Enter');
    await login.clave.press('Enter');
    await expect(login.entrar).toBeDisabled();
    soltar();

    // Assert
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    expect(peticiones).toHaveLength(1);
  });

  test('should show the progress and lock the button when the login answer is slow', async ({ page, request }) => {
    // Arrange
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    const soltar = await retenerLogin(page);
    await login.abrir();

    // Act
    await login.iniciarSesion(dueno.correo, dueno.clave);

    // Assert: mientras no llega la respuesta, el boton dice que esta trabajando
    // y no se puede usar; al llegar, entra.
    await expect(login.entrar).toContainText('Entrando');
    await expect(login.entrar).toBeDisabled();
    await expect(page).toHaveURL(/\/login$/);
    soltar();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test('should keep the session and hide the dashboard until it loads when GET /auth/me is slow after a reload', async ({ page, request }) => {
    // Arrange: sesion abierta por la UI y, desde ahora, el GET que revalida la
    // sesion al cargar la app (AuthContext) queda retenido.
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    const saludo = page.getByRole('heading', { name: 'Hola, Sofia' });
    const menu = page.getByRole('navigation').first();
    await login.abrir();
    await login.iniciarSesion(dueno.correo, dueno.clave);
    await expect(saludo).toBeVisible();
    await expect(menu).toBeVisible();
    const soltar = await retener(page, esSesion);
    const pidioSesion = page.waitForRequest((r) => r.method() === 'GET' && esSesion(new URL(r.url())));

    // Act: recargar con el GET en camino
    await page.reload();
    await pidioSesion;

    // Assert: con el token guardado la persona no vuelve al login, y el panel
    // no se muestra a medias (sin usuario todavia no hay nada que usar).
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(login.correo).toBeHidden();
    await expect(saludo).toBeHidden();
    await expect(menu).toBeHidden();
    soltar();
    await expect(saludo).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
});
