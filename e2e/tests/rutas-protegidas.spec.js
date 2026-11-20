import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';

// Las rutas de /admin contra el backend real y la BD de pruebas: el front solo
// sabe si hay un token guardado; si sirve o no lo decide GET /api/auth/me.
// Test nuevo de la capa E2E de la semana 8 (ningun spec cubria este flujo).
const API = 'http://localhost:3001/api';
// La clave donde el front guarda la sesion (frontend/src/api.js).
const TOKEN_KEY = 'fitloyalty_token';
// El JWT_SECRET de prueba que playwright.config.js le pasa al backend.
const SECRETO_E2E = 'jwt-solo-para-e2e-no-es-secreto';

const RUTAS_ADMIN = ['/admin/dashboard', '/admin/miembros', '/admin/checkin', '/admin/staff', '/admin/config'];

/** Crea un gimnasio con su dueño por API y devuelve el token y el nombre del gimnasio. */
async function crearCuenta(request) {
  const sufijo = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const gymName = `Gimnasio Rutas ${sufijo}`;
  const res = await request.post(`${API}/auth/signup`, {
    data: {
      gymName,
      gymPhone: '3001234567',
      ownerName: 'Luis Rutas',
      ownerEmail: `luis.rutas.${sufijo}@example.com`,
      password: 'clave1234',
    },
  });
  expect(res.status(), 'la cuenta debe crearse por API').toBe(201);
  const { token } = await res.json();
  return { token, gymName };
}

/** Un JWT HS256 con los datos de `token` y lo que cambie `cambios`, firmado con `secreto`. */
function firmar(token, secreto, cambios) {
  const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const datos = { ...JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()), ...cambios };
  const cuerpo = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(datos)}`;
  return `${cuerpo}.${crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}

/** Guarda el token como lo haria el login y abre la ruta (carga completa de la pagina). */
async function abrirConToken(page, token, ruta) {
  await page.goto('/login');
  await page.evaluate(([clave, valor]) => localStorage.setItem(clave, valor), [TOKEN_KEY, token]);
  await page.goto(ruta);
}

const tokenGuardado = (page) => page.evaluate((clave) => localStorage.getItem(clave), TOKEN_KEY);

for (const ruta of RUTAS_ADMIN) {
  test(`should send a visitor without a session to the login when they open ${ruta}`, async ({ page }) => {
    // Act
    await page.goto(ruta);

    // Assert
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible();
  });
}

test('should show the gym panel when the saved session is valid', async ({ page, request }) => {
  // Arrange
  const { token, gymName } = await crearCuenta(request);

  // Act
  await abrirConToken(page, token, '/admin/miembros');

  // Assert: el nombre sale de /api/auth/me, no del token
  await expect(page).toHaveURL(/\/admin\/miembros$/);
  await expect(page.getByText(gymName)).toBeVisible();
});

// Los casos siguientes solo los puede ver el backend. El token tiene la forma de
// uno bueno, y el front lo descarta recien cuando /api/auth/me responde 401: por
// la firma, porque el usuario ya no existe o porque vencio.
test('should drop a token with a forged signature and show the login', async ({ page, request }) => {
  // Arrange: los datos de una cuenta real, firmados con otro secreto
  const { token } = await crearCuenta(request);
  const falso = firmar(token, 'otro-secreto-que-el-backend-no-conoce', {});

  // Act
  await abrirConToken(page, falso, '/admin/miembros');

  // Assert
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bienvenido otra vez' })).toBeVisible();
  expect(await tokenGuardado(page)).toBeNull();
});

test('should drop the session of a deleted account and say why', async ({ page, request }) => {
  // Arrange: la cuenta existia al iniciar sesion y se elimina despues
  const { token } = await crearCuenta(request);
  const borrado = await request.delete(`${API}/auth/account`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { password: 'clave1234' },
  });
  expect(borrado.status(), 'la cuenta debe eliminarse por API').toBe(200);

  // Act: el token sigue bien firmado y vigente, pero su usuario ya no existe
  await abrirConToken(page, token, '/admin/miembros');

  // Assert
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toContainText('Tu cuenta fue desactivada o cambió de gimnasio');
  expect(await tokenGuardado(page)).toBeNull();
});

test('should drop an expired token and show the login', async ({ page, request }) => {
  // Arrange: el mismo usuario y el secreto correcto, pero vencido hace un minuto
  const { token } = await crearCuenta(request);
  const ahora = Math.floor(Date.now() / 1000);
  const vencido = firmar(token, SECRETO_E2E, { iat: ahora - 3600, exp: ahora - 60 });

  // Act
  await abrirConToken(page, vencido, '/admin/dashboard');

  // Assert
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible();
  expect(await tokenGuardado(page)).toBeNull();
});
