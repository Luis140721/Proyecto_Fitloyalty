const { test, expect } = require('@playwright/test');
const { MiembrosPage } = require('./support/miembros-page');
const { createMemberData } = require('./support/member-data');

const API_URL = `http://127.0.0.1:${process.env.API_PORT ?? '3001'}/api`;

test('un doble clic durante un POST lento crea un solo miembro', async ({ page, request }, testInfo) => {
  const miembrosPage = new MiembrosPage(page);
  const member = createMemberData(testInfo);
  let createRequests = 0;

  await miembrosPage.goto();
  await miembrosPage.startRegistration();
  await miembrosPage.completeRegistration(member);

  await page.route('**/api/admin/miembros**', async (route) => {
    const requestInfo = route.request();
    if (requestInfo.method() === 'POST' && requestInfo.url().endsWith('/api/admin/miembros')) {
      createRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });

  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/admin/miembros') && response.request().method() === 'POST'
  );
  await miembrosPage.submit({ doubleClick: true });
  const createResponse = await createResponsePromise;

  expect(createResponse.status()).toBe(201);
  expect(createRequests).toBe(1);
  await expect(page.getByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeVisible();

  const created = await createResponse.json();
  const token = await page.evaluate(() => localStorage.getItem('fitloyalty_token'));
  const listResponse = await request.get(
    `${API_URL}/admin/miembros?q=${encodeURIComponent(member.document)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(listResponse.status()).toBe(200);
  const { miembros } = await listResponse.json();
  expect(miembros.filter((item) => item.id_miembro === created.miembro.id_miembro)).toHaveLength(1);
});

test('el formulario sigue disponible mientras tarda la carga de miembros', async ({ page }) => {
  const memberListStarted = page.waitForRequest((request) =>
    request.method() === 'GET' && request.url().startsWith(`${API_URL}/admin/miembros`)
  );

  await page.route('**/api/admin/miembros**', async (route) => {
    if (route.request().method() === 'GET') {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await route.continue();
  });

  await page.goto('/admin/miembros');
  await memberListStarted;
  await page.getByRole('button', { name: 'Nuevo miembro' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo miembro' })).toBeVisible();
  await page.getByLabel(/Nombre completo/).fill('Carga lenta E2E');

  await expect(page.getByLabel(/Nombre completo/)).toHaveValue('Carga lenta E2E');
});
