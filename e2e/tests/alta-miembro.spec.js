import { test, expect } from '@playwright/test';

test('Alta exitosa de un nuevo miembro en FitLoyalty', async ({ page }) => {
  // 1. Arrange: Navegar a la ruta de administración de miembros
  await page.goto('/admin/miembros');

  // 2. Act: Abrir el formulario y llenar los campos con datos únicos
  await page.getByRole('button', { name: /nuevo miembro|agregar miembro/i }).click();

  const emailUnico = `miembro_${Date.now()}@test.com`;

  await page.getByLabel(/nombre/i).fill('Daniel Torres');
  await page.getByLabel(/correo|email/i).fill(emailUnico);
  await page.getByLabel(/teléfono|celular/i).fill('3001234567');

  // Guardar el registro
  await page.getByRole('button', { name: /guardar|registrar/i }).click();

  // 3. Assert: Verificar que la persona usuaria ve el éxito en pantalla
  await expect(page.getByText('Miembro registrado con éxito')).toBeVisible();
});