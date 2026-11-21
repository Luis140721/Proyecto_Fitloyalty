import { randomUUID } from 'node:crypto';
import { expect, test as setup } from '@playwright/test';
import { API_URL, CLAVE_TOKEN, SESION } from './support/entorno.js';

// Proyecto "setup" de playwright.config.js: corre una sola vez por corrida, antes
// que los tests que dependen de el. Inicia sesion por API y guarda el estado del
// navegador en SESION; los archivos que lo necesitan lo cargan con
// test.use({ storageState: SESION }) y no pasan por el formulario de login.
//
// El front guarda el token en localStorage, no en una cookie: por eso, despues
// del POST, el token se escribe en la pagina y se guarda el storageState del
// contexto del navegador (el del `request` solo tendria cookies).
setup('should save the owner session when the gym is created through the API', async ({ page, request }) => {
  // Arrange: gimnasio y correo unicos, porque la BD conserva lo de corridas anteriores
  const sufijo = randomUUID().slice(0, 8);
  const registro = await request.post(`${API_URL}/auth/signup`, {
    data: {
      gymName: `Gimnasio E2E ${sufijo}`,
      gymPhone: '3001234567',
      ownerName: 'Recepcion E2E',
      ownerEmail: `dueno.${sufijo}@example.com`,
      password: `clave${sufijo}1`,
    },
  });
  expect(registro.status(), `POST /api/auth/signup respondio ${registro.status()}: ${await registro.text()}`).toBe(201);
  const { token } = await registro.json();
  expect(token, 'POST /api/auth/signup respondio 201 sin token').toBeTruthy();

  // Act: el front lee el token de localStorage al cargar
  await page.goto('/login');
  await page.evaluate(([clave, valor]) => localStorage.setItem(clave, valor), [CLAVE_TOKEN, token]);
  // El panel solo abre si GET /auth/me responde 200. Con otra respuesta (un 503,
  // un corte de red), AuthContext deja la sesion sin usuario y ProtectedRoute
  // manda al login: sin esta comprobacion, el setup fallaria esperando
  // "Hola, Recepcion" sin decir por que.
  const pedidoMe = page.waitForRequest((r) => r.method() === 'GET' && r.url() === `${API_URL}/auth/me`);
  await page.goto('/admin/dashboard');
  const pedido = await pedidoMe;
  const me = await pedido.response();
  expect(me, `GET /api/auth/me no tuvo respuesta: ${pedido.failure()?.errorText}`).not.toBeNull();
  expect(me.status(), `GET /api/auth/me respondio ${me.status()}: ${await me.text()}`).toBe(200);

  // Assert: con ese token el panel abre sin pasar por el login
  await expect(page.getByRole('heading', { name: 'Hola, Recepcion' })).toBeVisible();

  // La ultima actividad no se guarda: si quedara la hora de ahora, una corrida
  // de mas de 30 minutos (RQF-02) cerraria la sesion por inactividad.
  await page.evaluate(() => localStorage.removeItem('fitloyalty_ultima_actividad'));
  await page.context().storageState({ path: SESION });
});
