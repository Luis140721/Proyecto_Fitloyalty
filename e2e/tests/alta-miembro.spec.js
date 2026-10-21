import { test, expect } from '@playwright/test';

test('Alta exitosa de un nuevo miembro en FitLoyalty', async ({ page }) => {
  // 1. Arrange: Navegar a la vista de administración de miembros
  await page.goto('/admin/miembros');

  // 2. Act: Llenar el formulario usando datos únicos
  const emailUnico = `miembro_${Date.now()}@test.com`;
  
  await page.getByLabel(/nombre/i).fill('Daniel Torres');
  await page.getByLabel(/correo|email/i).fill(emailUnico);
  await page.getByLabel(/teléfono|celular/i).fill('3001234567');
  
  // Clic en el botón de guardar o registrar
  await page.getByRole('button', { name: /guardar|registrar|crear miembro/i }).click();

  // 3. Assert: Verificar que la persona usuaria ve el éxito en pantalla
  await expect(page.getByText(/exito|registrado correctamente|miembro creado/i)).toBeVisible();
});