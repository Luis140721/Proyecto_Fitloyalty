import { expect, test } from '@playwright/test';
import { AltaMiembroPage } from './support/alta-miembro-page.js';
import { crearMiembro, documentoUnico, nombreUnico } from './support/datos.js';
import { SESION } from './support/entorno.js';
import { RUTA_MIEMBROS } from './support/red.js';

// Semana 5, capa E2E (parte de Daniel, cubierta por Luis): estados de la lista y
// del alta de miembros que el backend real no da cuando uno quiere. Con
// page.route se reemplaza SOLO /api/admin/miembros; la sesion (auth.setup.js),
// /auth/me y la configuracion del gimnasio siguen yendo al backend real.
//
// Que ve esto que no ve MiembrosPage.test.jsx: alli vi.mock cambia el modulo
// api.js entero, asi que no corre el interceptor de axios que traduce un
// servidor caido en "Sin conexion con el servidor..." ni el { error, code } del
// backend en el mensaje. Aqui el navegador hace la peticion de verdad y solo la
// respuesta es de mentira.
//
// No repite login.spec.js (que simula el login) ni los E2E de la semana 7, que
// van contra el backend real.
test.use({ storageState: SESION });

const esListaOAlta = (url) => url.pathname.endsWith(RUTA_MIEMBROS);
const SIN_CONEXION = 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.';

test('should say the members could not be loaded instead of an empty gym when the API is down', async ({ page }) => {
  // Arrange. Doble: stub. route.abort('connectionrefused') hace lo que haria un
  // backend apagado: el navegador no recibe respuesta. Es un stub porque solo
  // da una respuesta fija (la falla) y el test no le pregunta nada despues.
  // Con el backend real habria que apagarlo a mitad de la corrida.
  await page.route(esListaOAlta, (route) =>
    (route.request().method() === 'GET' ? route.abort('connectionrefused') : route.fallback()));
  const alta = new AltaMiembroPage(page);

  // Act
  await alta.goto();

  // Assert (estado): el aviso dice por que, y la tabla no afirma que el gimnasio no tiene miembros
  await expect(alta.alerta(SIN_CONEXION)).toBeVisible();
  await expect(alta.tabla.getByText('No pudimos cargar los miembros')).toBeVisible();
  await expect(alta.tabla.getByText('Sin miembros que mostrar')).toBeHidden();
});

test('should load the members again when the API comes back and the receptionist retries', async ({ page, request }) => {
  // Arrange. Doble: stub que falla solo mientras `caido` es true; despues deja
  // pasar la peticion al backend real (route.fallback). El miembro se crea por
  // API, de verdad, antes de abrir la pantalla.
  const miembro = await crearMiembro(request);
  let caido = true;
  await page.route(esListaOAlta, (route) =>
    (caido && route.request().method() === 'GET' ? route.abort('connectionrefused') : route.fallback()));
  const alta = new AltaMiembroPage(page);
  await alta.goto();
  await expect(alta.alerta(SIN_CONEXION)).toBeVisible();
  caido = false;
  // Espia: page.waitForRequest registra la peticion que sale al reintentar.
  const reintento = page.waitForRequest((p) => p.method() === 'GET' && esListaOAlta(new URL(p.url())));

  // Act
  await alta.tabla.getByRole('button', { name: 'Reintentar' }).click();

  // Assert (comportamiento y estado): se volvio a pedir la lista, el miembro aparece y el aviso se va
  await reintento;
  await expect(alta.filaDe(miembro.nombre)).toContainText(miembro.documento);
  await expect(alta.alerta(SIN_CONEXION)).toBeHidden();
});

test('should show the empty state and open the form from it when the gym has no members', async ({ page }) => {
  // Arrange. Doble: stub con route.fulfill: una lista vacia con la forma real
  // de GET /api/admin/miembros. En la BD de pruebas el gimnasio de la sesion casi
  // nunca esta vacio, porque los otros tests le crean miembros en paralelo.
  await page.route(esListaOAlta, (route) => (route.request().method() === 'GET'
    ? route.fulfill({ json: { miembros: [], total: 0, page: 0, pageSize: 100 } })
    : route.fallback()));
  const alta = new AltaMiembroPage(page);
  await alta.goto();

  // Act: el boton del estado vacio, no el de la cabecera
  await alta.tabla.getByRole('button', { name: 'Nuevo miembro' }).click();

  // Assert (estado)
  await expect(alta.tabla.getByText('Sin miembros que mostrar')).toBeVisible();
  await expect(page.getByText('Mostrando 0 de 0 miembros')).toBeVisible();
  await expect(alta.paso).toHaveText('Paso 1 de 5');
  await expect(alta.nombre).toBeEditable();
});

test('should keep the form and show the server reason when the API rejects the member as invalid', async ({ page }) => {
  // Arrange. Dobles: stub y espia en el mismo route. El stub responde 400 con la
  // forma real de un AppError de validacion ({ error, code, details }); el
  // espia guarda el cuerpo del POST para ver con que datos se llamo. El
  // formulario ya revisa el telefono (10 digitos), asi que con el backend real
  // este 400 no se puede provocar desde la pantalla.
  const nombre = nombreUnico();
  const documento = documentoUnico();
  const enviados = [];
  await page.route(esListaOAlta, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    enviados.push(route.request().postDataJSON());
    return route.fulfill({
      status: 400,
      json: {
        error: 'El telefono es requerido',
        code: 'VALIDATION_ERROR',
        details: { issues: [{ path: ['telefono'], message: 'El telefono es requerido' }] },
      },
    });
  });
  const alta = new AltaMiembroPage(page);
  await alta.abrirAlta();
  await alta.llenarAlta({ nombre, documento });

  // Act
  await alta.crear.click();

  // Assert (estado): el motivo del servidor se ve y el formulario sigue en el paso 5, listo para reintentar
  await expect(alta.alerta('El telefono es requerido')).toBeVisible();
  await expect(alta.paso).toHaveText('Paso 5 de 5');
  await expect(alta.crear).toBeEnabled();
  await expect(alta.dialogoQr).toBeHidden();
  // Assert (comportamiento): un solo POST, con lo que escribio la recepcion
  expect(enviados).toHaveLength(1);
  expect(enviados[0]).toMatchObject({
    nombre, documento, telefono: '3001234567', valor_total: '90000', acepto_terminos: true, autorizo_datos: true,
  });
});
