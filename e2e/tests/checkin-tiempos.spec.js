import { expect, test } from '@playwright/test';
import { CheckinPage } from './support/checkin-page.js';
import { crearMiembro, ingresosDe } from './support/datos.js';
import { SESION } from './support/entorno.js';
import { peticionesDeCheckin, retenerRespuestas, retrasarRespuestas } from './support/red.js';

// Defectos de tiempos del check-in (Parte 3 de la semana 7). Con el backend
// local todo responde en milisegundos, asi que la red lenta se provoca con
// page.route, reteniendo o retrasando respuestas: sin eso estos tests pasarian
// aunque el defecto existiera.
test.use({ storageState: SESION });

// Las respuestas retrasadas pueden seguir pendientes cuando el test termina.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test.describe('doble envio', () => {
  // La respuesta del POST se retiene hasta despues del segundo clic o Enter. Con
  // un retraso fijo (1 s) no alcanzaba: con la suite en paralelo, a veces el
  // segundo Enter llegaba cuando el primer ingreso ya habia respondido.

  test('should send a single check-in when the receptionist double-clicks Registrar', async ({ page, request }) => {
    // Arrange
    const miembro = await crearMiembro(request);
    const soltarRespuesta = await retenerRespuestas(page, 'POST');
    const posts = peticionesDeCheckin(page, 'POST');
    const checkin = new CheckinPage(page);
    await checkin.goto();
    await checkin.documento.fill(miembro.documento);

    // Act
    await checkin.registrar.dblclick();
    soltarRespuesta();

    // Assert: un solo POST y un solo ingreso en la BD
    await expect(checkin.resultado).toContainText('Ingreso registrado.');
    expect(posts).toHaveLength(1);
    expect(await ingresosDe(request, miembro.documento)).toHaveLength(1);
  });

  test('should send a single check-in when the receptionist presses Enter twice in the document field', async ({ page, request }) => {
    // Arrange
    const miembro = await crearMiembro(request);
    const soltarRespuesta = await retenerRespuestas(page, 'POST');
    const posts = peticionesDeCheckin(page, 'POST');
    const checkin = new CheckinPage(page);
    await checkin.goto();
    await checkin.documento.fill(miembro.documento);

    // Act: el Enter del campo registra por documento (como un lector de codigo de barras)
    await checkin.documento.press('Enter');
    await checkin.documento.press('Enter');
    soltarRespuesta();

    // Assert: con el segundo POST la pantalla terminaba en "ya registro su
    // ingreso hace un momento", aunque el ingreso si quedo
    await expect(checkin.resultado).toContainText('Ingreso registrado.');
    expect(posts).toHaveLength(1);
    expect(await ingresosDe(request, miembro.documento)).toHaveLength(1);
  });
});

test.describe('red lenta', () => {
  // El historial del dia tarda 8 s en llegar; un ingreso no deberia esperarlo.
  const LATENCIA_GET_MS = 8_000;

  test('should let the receptionist register the next member while today check-ins are still loading', async ({ page, request }) => {
    // Arrange
    const primero = await crearMiembro(request);
    const segundo = await crearMiembro(request);
    await retrasarRespuestas(page, 'GET', LATENCIA_GET_MS);
    const checkin = new CheckinPage(page);
    await checkin.goto();

    // Act: dos ingresos seguidos mientras el historial sigue cargando
    await checkin.registrarPorDocumento(primero.documento);
    await expect(checkin.resultado).toContainText(primero.nombre);
    await checkin.documento.fill(segundo.documento);
    // El ingreso ya termino: el boton debe volver a "Registrar" sin esperar el historial.
    await expect(checkin.botonDeIngreso).toBeEnabled();
    await checkin.registrar.click();

    // Assert: el segundo entra, y cuando el historial llega no falta ninguno
    await expect(checkin.resultado).toContainText(segundo.nombre);
    await expect(checkin.ingresoDe(primero.nombre)).toBeVisible({ timeout: 2 * LATENCIA_GET_MS });
    await expect(checkin.ingresoDe(segundo.nombre)).toBeVisible({ timeout: 2 * LATENCIA_GET_MS });
  });
});
