import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { documentoUnico } from './support/datos.js';
import { SESION } from './support/entorno.js';

// Alta de un miembro por el asistente de 5 pasos de /admin/miembros (flujo
// critico de Daniel), contra el backend real y la BD de pruebas. La sesion del
// dueno es la que guardo auth.setup.js, asi que el test no pasa por el login ni
// simula el API: si el POST /api/admin/miembros se rompe, este test lo ve.
test.use({ storageState: SESION });

test('should create the member and list it when the receptionist completes the five steps', async ({ page }) => {
  // Arrange: nombre y documento unicos, porque la BD conserva lo de corridas anteriores
  const nombre = `Miembro E2E ${randomUUID().slice(0, 8)}`;
  const documento = documentoUnico();
  await page.goto('/admin/miembros');
  // Con la lista vacia, el estado vacio repite el boton "Nuevo miembro"; el de la
  // cabecera esta siempre y va primero.
  await page.getByRole('button', { name: 'Nuevo miembro', exact: true }).first().click();

  // Act: los obligatorios del paso 1, el valor del plan en el 3 y los terminos en el 5
  await page.getByLabel('Nombre completo *').fill(nombre);
  await page.getByLabel('Número documento *').fill(documento);
  await page.getByLabel('Teléfono / WhatsApp *').fill('3001234567');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Valor total del plan *').fill('90000');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel(/Acepto los términos y condiciones/).check();
  await page.getByLabel(/Autorizo el uso de mis datos/).check();
  await page.getByRole('button', { name: 'Crear miembro' }).click();

  // Assert: el aviso de exito, el QR con los datos del miembro y su fila en la lista
  await expect(page.getByRole('status').filter({ hasText: 'Miembro creado exitosamente.' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toContainText(`Documento: ${documento}`);
  await expect(page.getByRole('row').filter({ hasText: nombre })).toContainText(documento);
});
