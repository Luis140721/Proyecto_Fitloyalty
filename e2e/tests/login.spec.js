import { expect, test } from '@playwright/test';

const API = 'http://localhost:3001/api';

// JWT de mentira con vencimiento lejano: el front solo lo decodifica para saber cuando vence.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFalso = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: 1, role: 'admin', gymId: 1, exp: 4102444800 })}.firma`;

const ADMIN = { id: 1, name: 'Ana Duarte', email: 'ana@fitgym.co', role: 'admin', gymId: 1 };

const DASHBOARD = {
  totalMiembros: 12, checkinsHoy: 3, vencen7: 1, enRiesgo: 0, retention: 80, ingresosMes: 0,
  enRiesgoList: [], proximos: [], recientes: [], weekly: [],
};

async function simularApi(page, { login }) {
  await page.route(`${API}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/auth/login')) return route.fulfill(login);
    if (pathname.endsWith('/admin/dashboard/horas-pico')) return route.fulfill({ json: { horas: [], total: 0, etiqueta: 'Hoy', horaPico: null } });
    if (pathname.endsWith('/admin/dashboard')) return route.fulfill({ json: DASHBOARD });
    if (pathname.endsWith('/auth/me')) return route.fulfill({ json: { user: ADMIN } });
    return route.fulfill({ json: {} });
  });
}

test('should show the dashboard after logging in with valid credentials', async ({ page }) => {
  // Arrange
  await simularApi(page, { login: { json: { token: tokenFalso, user: ADMIN, gym: { id: 1, name: 'FitGym' } } } });
  await page.goto('/login');

  // Act
  await page.getByLabel('Correo electrónico').fill('ana@fitgym.co');
  await page.getByLabel(/^Contraseña/).fill('clave1234');
  await page.getByRole('button', { name: /iniciar sesión|ingresar|entrar/i }).click();

  // Assert
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
});

test('should show an error when the password is wrong', async ({ page }) => {
  // Arrange
  await simularApi(page, {
    login: { status: 401, json: { error: { code: 'BAD_CREDENTIALS', message: 'Correo o contraseña incorrectos' } } },
  });
  await page.goto('/login');

  // Act
  await page.getByLabel('Correo electrónico').fill('ana@fitgym.co');
  await page.getByLabel(/^Contraseña/).fill('incorrecta1');
  await page.getByRole('button', { name: /iniciar sesión|ingresar|entrar/i }).click();

  // Assert
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
