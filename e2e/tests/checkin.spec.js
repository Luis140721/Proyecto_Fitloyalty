import { expect, test } from '@playwright/test';
import { CheckinPage } from './support/checkin-page.js';
import { PLAN_VENCIDO, congelarPlan, crearMiembro, documentoUnico, ingresosDe } from './support/datos.js';
import { SESION } from './support/entorno.js';

// Check-in de un miembro por documento (flujo critico de Luis): backend real y
// BD de pruebas. La sesion del dueno es la que guardo auth.setup.js; el miembro
// y su plan se crean por API en cada test. Por la UI solo va el ingreso.
// Los avisos se comparan con toContainText: el icono de cada aviso es una
// ligadura de Material Symbols y su nombre ("error", "warning") tambien es texto.
test.use({ storageState: SESION });

test('should register the entry and list it in today check-ins when the member has a current plan', async ({ page, request }) => {
  // Arrange
  const miembro = await crearMiembro(request);
  const checkin = new CheckinPage(page);
  await checkin.goto();

  // Act
  await checkin.registrarPorDocumento(miembro.documento);

  // Assert: la recepcion ve el ingreso y el historial del dia lo muestra como manual
  await expect(checkin.resultado).toContainText('Ingreso registrado.');
  await expect(checkin.resultado).toContainText(`${miembro.nombre} (${miembro.documento})`);
  await expect(checkin.ingresoDe(miembro.nombre)).toContainText(`MANUAL · ${miembro.documento}`);
  await expect(checkin.documento).toHaveValue('');
});

test('should deny the entry with the expired message when the member plan has ended', async ({ page, request }) => {
  // Arrange
  const miembro = await crearMiembro(request, PLAN_VENCIDO);
  const checkin = new CheckinPage(page);
  await checkin.goto();

  // Act
  await checkin.registrarPorDocumento(miembro.documento);

  // Assert: el aviso sale en pantalla y el ingreso no queda guardado
  await expect(checkin.error).toContainText('Acceso denegado: Membresía vencida');
  await expect(checkin.resultado).toContainText(`${miembro.nombre} (${miembro.documento})`);
  expect(await ingresosDe(request, miembro.documento)).toHaveLength(0);
});

test('should deny the entry with the frozen message when the member plan is frozen', async ({ page, request }) => {
  // Arrange
  const miembro = await crearMiembro(request);
  await congelarPlan(request, miembro.id);
  const checkin = new CheckinPage(page);
  await checkin.goto();

  // Act
  await checkin.registrarPorDocumento(miembro.documento);

  // Assert: dice que esta congelada, no vencida, y no deja entrar
  await expect(checkin.error).toContainText(
    'Tu membresía está congelada. Pide en recepción que la reactiven para poder ingresar.',
  );
  expect(await ingresosDe(request, miembro.documento)).toHaveLength(0);
});

test('should say the member was not found when nobody in the gym has that document', async ({ page }) => {
  // Arrange: un documento que nadie tiene en el gimnasio
  const documento = documentoUnico();
  const checkin = new CheckinPage(page);
  await checkin.goto();

  // Act
  await checkin.registrarPorDocumento(documento);

  // Assert: el 404 del backend se ve y el documento queda en el campo para corregirlo
  await expect(checkin.error).toContainText('Miembro no encontrado en este gimnasio.');
  await expect(checkin.documento).toHaveValue(documento);
});
