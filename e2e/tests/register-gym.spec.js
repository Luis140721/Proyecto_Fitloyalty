import { expect, test } from '@playwright/test';

// Estos tests usan el backend real y la BD de pruebas (pnpm run db:up): no simulan el API.
const API = 'http://localhost:3001/api';

test('should open the dashboard of the new gym when the owner signs up with valid data', async ({ page }) => {
  // Arrange: correo unico porque la BD conserva los registros entre corridas
  const sufijo = Date.now();
  await page.goto('/register-owner');

  // Act
  await page.getByLabel('Nombre del gimnasio').fill(`Gimnasio E2E ${sufijo}`);
  await page.getByLabel('Teléfono').fill('3001234567');
  await page.getByLabel('Tu nombre completo').fill('Luis Prueba');
  await page.getByLabel('Tu correo').fill(`luis.registro.${sufijo}@example.com`);
  // El label de la contraseña tambien envuelve el boton "Mostrar contraseña": por eso el ^.
  await page.getByLabel(/^Contraseña/).fill('clave1234');
  await page.getByRole('button', { name: /Crear mi gimnasio/ }).click();

  // Assert: entra al panel con la cuenta que acaba de crear
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Hola, Luis' })).toBeVisible();
});

test('should show an error when the owner email is already registered', async ({ page, request }) => {
  // Arrange: la cuenta ya existe. Se crea por API, sin pasar por la pantalla
  const correo = `luis.duplicado.${Date.now()}@example.com`;
  const previa = await request.post(`${API}/auth/signup`, {
    data: {
      gymName: 'Gimnasio E2E previo',
      gymPhone: '3001234567',
      ownerName: 'Luis Prueba',
      ownerEmail: correo,
      password: 'clave1234',
    },
  });
  expect(previa.status(), 'la cuenta previa debe crearse por API').toBe(201);
  await page.goto('/register-owner');

  // Act: alguien intenta registrar otro gimnasio con el mismo correo
  await page.getByLabel('Nombre del gimnasio').fill('Otro gimnasio E2E');
  await page.getByLabel('Teléfono').fill('3007654321');
  await page.getByLabel('Tu nombre completo').fill('Luis Prueba');
  await page.getByLabel('Tu correo').fill(correo);
  await page.getByLabel(/^Contraseña/).fill('clave1234');
  await page.getByRole('button', { name: /Crear mi gimnasio/ }).click();

  // Assert: el 409 del backend se ve en el formulario y no entra al panel
  await expect(page.getByRole('alert').filter({ hasText: 'Ya existe una cuenta con ese correo.' })).toBeVisible();
  await expect(page.getByLabel('Tu correo')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/register-owner$/);
});
