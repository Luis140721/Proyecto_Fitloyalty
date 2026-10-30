import { expect, test } from '@playwright/test';

test('registra un miembro tras iniciar sesión y completar los cinco pasos', async ({ page }) => {
  const documento = String(Date.now()).slice(-10);
  let miembroEnviado;

  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'e2e-test-token',
        user: { id_usuario: 1, role: 'admin', name: 'Admin E2E' },
      }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id_usuario: 1, role: 'admin', name: 'Admin E2E' },
        gym: null,
      }),
    });
  });

  await page.route('**/api/admin/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config: {} }),
    });
  });

  await page.route('**/api/admin/miembros**', async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ miembros: [] }),
      });
      return;
    }

    if (request.method() === 'POST') {
      miembroEnviado = request.postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          miembro: {
            id_miembro: 7001,
            nombre: miembroEnviado.nombre,
            telefono: miembroEnviado.telefono,
            codigo_qr: `e2e-${documento}`,
          },
        }),
      });
      return;
    }

    if (request.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fulfill({ status: 405, body: 'Método no permitido' });
  });

  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('admin-e2e@example.test');
  await page.getByRole('textbox', { name: /Contraseña/ }).fill('clave-e2e-simulada');
  await page.getByRole('button', { name: /Entrar a mi panel/ }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  await page.goto('/admin/miembros');
  await expect(page.getByRole('heading', { name: 'Miembros', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo miembro', exact: true }).click();

  await page.getByLabel('Nombre completo *').fill('Miembro de prueba E2E');
  await page.getByLabel('Número documento *').fill(documento);
  await page.getByLabel('Teléfono / WhatsApp *').fill('3001234567');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 5')).toBeVisible();

  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 3 de 5')).toBeVisible();
  await page.getByLabel('Valor total del plan *').fill('50000');

  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 4 de 5')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 5 de 5')).toBeVisible();

  await page.getByLabel(/Acepto los términos y condiciones/).check();
  await page.getByLabel(/Autorizo el uso de mis datos/).check();
  await page.getByRole('button', { name: 'Crear miembro' }).click();

  await expect(page.getByRole('status')).toContainText('Miembro creado exitosamente.');
  expect(miembroEnviado).toMatchObject({
    nombre: 'Miembro de prueba E2E',
    documento,
    telefono: '3001234567',
    valor_total: '50000',
    acepto_terminos: true,
    autorizo_datos: true,
  });
});
