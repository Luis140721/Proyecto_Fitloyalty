import { expect, test } from '@playwright/test';
import { AltaMiembroPage } from './support/alta-miembro-page.js';
import { crearMiembro, documentoUnico, miembrosConDocumento, nombreUnico } from './support/datos.js';
import { SESION } from './support/entorno.js';

// Alta de un miembro por el asistente de 5 pasos de /admin/miembros (flujo
// critico de Daniel), contra el backend real y la BD de pruebas. La sesion del
// dueno es la que guardo auth.setup.js, asi que el test no pasa por el login ni
// simula el API: si el POST /api/admin/miembros se rompe, estos tests lo ven.
// Lo que el test necesita de antes (un miembro con ese documento) se crea por API.
// Los avisos se comparan por su texto: el icono de cada aviso es una ligadura de
// Material Symbols y su nombre ("error") tambien es texto.
test.use({ storageState: SESION });

test('should create the member and list it when the receptionist completes the five steps', async ({ page, request }) => {
  // Arrange: nombre y documento unicos, porque la BD conserva lo de corridas anteriores
  const nombre = nombreUnico();
  const documento = documentoUnico();
  const alta = new AltaMiembroPage(page);
  await alta.abrirAlta();

  // Act: los obligatorios del paso 1, el valor del plan en el 3 y los terminos en el 5
  await alta.llenarAlta({ nombre, documento });
  await alta.crear.click();

  // Assert: el aviso de exito, el QR con los datos del miembro, su fila en la lista y un solo registro
  await expect(alta.avisoCreado).toBeVisible();
  await expect(alta.dialogoQr).toContainText(`Documento: ${documento}`);
  await expect(alta.filaDe(nombre)).toContainText(documento);
  expect(await miembrosConDocumento(request, documento)).toHaveLength(1);
});

test('should refuse the member and keep the first one when the document is already registered', async ({ page, request }) => {
  // Arrange: ya hay un miembro activo con ese documento
  const existente = await crearMiembro(request);
  const alta = new AltaMiembroPage(page);
  await alta.abrirAlta();
  await alta.llenarAlta({ nombre: nombreUnico(), documento: existente.documento });

  // Act
  await alta.crear.click();

  // Assert: el 409 del backend se ve, el formulario sigue abierto y no hay un segundo miembro
  await expect(alta.alerta('Ya existe un miembro activo con ese documento.')).toBeVisible();
  await expect(alta.crear).toBeEnabled();
  const conEseDocumento = await miembrosConDocumento(request, existente.documento);
  expect(conEseDocumento.map((m) => m.nombre)).toEqual([existente.nombre]);
});

test('should explain in Spanish that the email is not valid when the server rejects it', async ({ page, request }) => {
  // Arrange: el formulario acepta dos puntos seguidos en el correo, el backend (zod) no
  const documento = documentoUnico();
  const alta = new AltaMiembroPage(page);
  await alta.abrirAlta();
  await alta.llenarAlta({ nombre: nombreUnico(), documento, email: 'ana..perez@correo.co' });

  // Act
  await alta.crear.click();

  // Assert: la recepcion entiende que corregir y el miembro no queda guardado
  await expect(alta.alerta('Este correo no tiene un formato válido.')).toBeVisible();
  expect(await miembrosConDocumento(request, documento)).toHaveLength(0);
});
