const { test, expect } = require('@playwright/test');
const { MiembrosPage } = require('./support/miembros-page');

test('muestra errores accesibles antes de enviar datos personales incompletos', async ({ page }) => {
  const miembrosPage = new MiembrosPage(page);
  let createRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/admin/miembros')) {
      createRequests += 1;
    }
  });

  await miembrosPage.goto();
  await miembrosPage.startRegistration();
  await miembrosPage.fillName('Miembro incompleto');
  await page.getByRole('button', { name: /Siguiente/ }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Escribe el número de documento.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Escribe el teléfono.' })).toBeVisible();
  expect(createRequests).toBe(0);
});
