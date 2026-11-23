import { expect, test } from '@playwright/test';
import { crearDueno, usarIpPropia } from './support/cuentas.js';
import { CLAVE_TOKEN } from './support/entorno.js';
import { LoginPage } from './support/login-page.js';

// Semana 7, flujo critico de Santiago: el inicio de sesion, con el backend real
// contra la BD de pruebas (login.spec.js de la semana 1 lo simula con page.route).
// Cada test crea su propio dueno por API; por la UI solo va el formulario.
//
// Sin storageState: lo que se prueba es justamente entrar sin sesion.

const tokenGuardado = (page) => page.evaluate((clave) => localStorage.getItem(clave), CLAVE_TOKEN);

// Forma de un JWT: tres partes en base64url separadas por puntos.
const FORMA_JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;

test.describe('inicio de sesion con el backend real', () => {
  test.beforeEach(({ page }) => usarIpPropia(page));

  test('should open the owner dashboard and keep the session after a reload when the credentials are right', async ({ page, request }) => {
    // Arrange
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    await login.abrir();
    const respuestaLogin = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/api/auth/login'),
    );

    // Act
    await login.iniciarSesion(dueno.correo, dueno.clave);

    // Assert: entra al panel y guarda exactamente el token que firmo el backend.
    const { token } = await (await respuestaLogin).json();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Hola, Sofia' })).toBeVisible();
    expect(token).toMatch(FORMA_JWT);
    expect(await tokenGuardado(page)).toBe(token);

    // La sesion sobrevive a recargar la pagina: no hay que volver a entrar.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hola, Sofia' })).toBeVisible();
  });

  test('should log in when the email has capitals and spaces around it', async ({ page, request }) => {
    // Arrange
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    await login.abrir();

    // Act
    await login.iniciarSesion(`  ${dueno.correo.toUpperCase()} `, dueno.clave);

    // Assert
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test('should stay on the login and show the backend message when the password is wrong', async ({ page, request }) => {
    // Arrange
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    await login.abrir();

    // Act
    await login.iniciarSesion(dueno.correo, 'otraClave99');

    // Assert
    await expect(login.aviso).toContainText('Credenciales incorrectas');
    await expect(page).toHaveURL(/\/login$/);
    expect(await tokenGuardado(page)).toBeNull();
    // El correo queda escrito para corregir solo la clave.
    await expect(login.correo).toHaveValue(dueno.correo);
  });

  test('should give the same message as a wrong password when the email does not exist', async ({ page }) => {
    // Arrange: mismo texto que con la clave mala; el login no revela que
    // correos estan registrados.
    const login = new LoginPage(page);
    await login.abrir();

    // Act
    await login.iniciarSesion('nadie.registrado@example.com', 'cualquiera1');

    // Assert
    await expect(login.aviso).toContainText('Credenciales incorrectas');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('should ask for both fields without calling the API when they are empty', async ({ page }) => {
    // Arrange
    const peticiones = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/auth/login')) peticiones.push(r);
    });
    const login = new LoginPage(page);
    await login.abrir();

    // Act
    await login.entrar.click();

    // Assert
    await expect(login.aviso).toContainText('Ingresa tu correo y contraseña');
    expect(peticiones).toHaveLength(0);
  });

  test('should block with a readable message when it is the sixth attempt in a minute', async ({ page, request }) => {
    // Arrange: cinco intentos con la clave mala desde la IP de este test
    const dueno = await crearDueno(request);
    const login = new LoginPage(page);
    await login.abrir();
    for (let i = 0; i < 5; i += 1) {
      await login.iniciarSesion(dueno.correo, `mala${i}clave`);
      await expect(login.aviso).toContainText('Credenciales incorrectas');
    }

    // Act: el sexto, ya con la clave correcta
    await login.iniciarSesion(dueno.correo, dueno.clave);

    // Assert: la persona sabe que debe esperar, y no entra
    await expect(login.aviso).toContainText('Demasiados intentos');
    await expect(page).toHaveURL(/\/login$/);
  });
});
