import { test, expect } from '@playwright/test';

test('Alta exitosa de un nuevo miembro en FitLoyalty con sesión simulada', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-jwt-token-admin');
    localStorage.setItem('usuario', JSON.stringify({ rol: 'admin', nombre: 'Admin Test' }));
  });

  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: { role: 'admin', name: 'Admin Test' } }),
    });
  });

  await page.route('**/api/miembros', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Miembro creado' }),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/admin/miembros');

  // Tomar captura si falla el botón para ver qué muestra la pantalla
  try {
    // Buscar cualquier botón en la página de administración de miembros
    await page.locator('button').first().click({ timeout: 10000 });
  } catch (e) {
    await page.screenshot({ path: 'error-pantalla.png' });
    throw e;
  }

  const emailUnico = `miembro_${Date.now()}@test.com`;
  
  await page.getByLabel(/nombre/i).fill('Daniel Torres');
  await page.getByLabel(/correo|email/i).fill(emailUnico);
  await page.getByLabel(/teléfono|celular/i).fill('3001234567');
  
  await page.locator('button').filter({ hasText: /guardar|registrar|crear/i }).last().click();

  await expect(page.locator('.alert-success')).toContainText('Miembro creado');
});