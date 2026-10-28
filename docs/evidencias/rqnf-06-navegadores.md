# Evidencia RQNF-06: verificación entre navegadores

**Responsable:** Daniel

**Rama:** `docs/rqnf-06-d4-completado`

**Base de código:** `develop` (`7e3ede9`)

**Fecha de ejecución:** 2026-10-26

## Requisito

> El sistema debe funcionar correctamente en los navegadores Chrome, Firefox y
> Edge en sus dos últimas versiones mayores, sin requerir instalación de
> software adicional en el cliente.

## Alcance ejecutado

Se inició el frontend y el backend local contra la base aislada
`fitloyalty_d5_test_20261026`, con cuenta y datos sintéticos. En los tres
navegadores se recorrieron login, dashboard, listado y edición de miembros,
check-in manual y por código QR, configuración y formulario de alta. Para
evitar tareas programadas y envíos externos, se deshabilitaron el scheduler y
WhatsApp. No se usó producción.

Firefox se probó en la versión 157.0.1. Se guardó la edición del miembro de
prueba, se verificó en la base que los check-in quedaran registrados con los
métodos `MANUAL` y `QR`, y luego se eliminaron esos registros sintéticos. La
configuración se guardó y la interfaz mostró confirmación. Las capturas
actualizadas se tomaron y verificaron a **1366 × 768**.

## Resultados

| Navegador | Versión | Login / dashboard | Miembros / edición | Check-in manual y QR | Configuración | Sin overflow horizontal | JS/API en recorrido autenticado |
|---|---|---|---|---|---|---|---|
| Chrome | 155.0.8059.85 | Pasa | Pasa | Pasa | Pasa | Pasa (1366 px) | Sin errores |
| Edge | 155.0.4283.62 | Pasa | Pasa | Pasa | Pasa | Pasa (1366 px) | Sin errores |
| Firefox | 157.0.1 | Pasa | Pasa | Pasa; métodos `MANUAL` y `QR` verificados en PostgreSQL local | Pasa; guardado confirmado | Pasa visualmente en las capturas (1366 px) | Flujos API confirmados; consola JS no instrumentada |

El alta se envió desde la interfaz y confirmó creación en Chrome durante una
prueba diagnóstica aislada. En la corrida comparativa, el alta se capturó en
los tres navegadores, pero solo se envió en Chrome. Para probar el resto de
los flujos, los registros temporales se prepararon con datos sintéticos; se
actualizó un miembro desde la interfaz y se verificó el registro por
documento y por código QR. El modo QR se validó pegando un código de prueba;
no se verificó el uso de una cámara física.

La app puede consultar `trial-status` antes del login y recibir un `401`
esperado mientras no hay sesión. No se observaron errores bloqueantes durante
los recorridos autenticados de Firefox; en ese navegador se verificaron las
escrituras de edición y check-in en la base local. No se recopiló su consola
JavaScript. Los check-in sintéticos se eliminaron al finalizar; la base de
pruebas y su cuenta sintética se conservaron para la sesión D5 local.

### Regresión encontrada y corregida

Al guardar la edición, el formulario enviaba `fecha_nacimiento: ""`. La
validación del backend preservaba esa cadena y PostgreSQL rechazaba el valor
para una columna `date`. Se ajustó `vacioANull` para convertir la cadena vacía
a `null` antes de aplicar la alternativa opcional del esquema, y se agregó
una prueba de regresión en `backend/tests/miembros-update.test.js`. La prueba
focal pasó.

## Capturas

Las capturas son evidencia de los recorridos indicados arriba; la ausencia de
una captura de una pantalla en un navegador significa que ese flujo no se
verificó allí.

| Navegador | Evidencia a 1366 × 768 |
|---|---|
| Chrome | [Portada](./capturas/rqnf-06/chrome-home.png) · [Login](./capturas/rqnf-06/chrome-login.png) · [Dashboard](./capturas/rqnf-06/chrome-dashboard.png) · [Miembros](./capturas/rqnf-06/chrome-miembros.png) · [Edición](./capturas/rqnf-06/chrome-edicion-miembro.png) · [Check-in manual](./capturas/rqnf-06/chrome-checkin-manual.png) · [Check-in QR](./capturas/rqnf-06/chrome-checkin-qr.png) · [Configuración](./capturas/rqnf-06/chrome-configuracion.png) · [Alta](./capturas/rqnf-06/chrome-alta-miembro.png) |
| Edge | [Portada](./capturas/rqnf-06/edge-home.png) · [Login](./capturas/rqnf-06/edge-login.png) · [Dashboard](./capturas/rqnf-06/edge-dashboard.png) · [Miembros](./capturas/rqnf-06/edge-miembros.png) · [Edición](./capturas/rqnf-06/edge-edicion-miembro.png) · [Check-in manual](./capturas/rqnf-06/edge-checkin-manual.png) · [Check-in QR](./capturas/rqnf-06/edge-checkin-qr.png) · [Configuración](./capturas/rqnf-06/edge-configuracion.png) · [Alta](./capturas/rqnf-06/edge-alta-miembro.png) |
| Firefox | [Portada](./capturas/rqnf-06/firefox-home.png) · [Login](./capturas/rqnf-06/firefox-login.png) · [Dashboard](./capturas/rqnf-06/firefox-dashboard.png) · [Miembros](./capturas/rqnf-06/firefox-miembros.png) · [Edición](./capturas/rqnf-06/firefox-edicion-miembro.png) · [Check-in manual](./capturas/rqnf-06/firefox-checkin-manual.png) · [Check-in QR](./capturas/rqnf-06/firefox-checkin-qr.png) · [Configuración](./capturas/rqnf-06/firefox-configuracion.png) · [Alta](./capturas/rqnf-06/firefox-alta-miembro.png) |

## Limitaciones pendientes

- Se probó una sola versión mayor por navegador. El requisito pide las dos
  últimas; por tanto, también falta probar la versión mayor anterior de cada
  navegador. El objetivo de compilación de Vite no reemplaza esas pruebas
  reales.
- El check-in QR se hizo con un código pegado en el formulario; no se probó
  cámara física.

## Veredicto

**Parcial.** Los flujos principales se completaron en Chrome 155, Edge 155 y
Firefox 157.0.1 a 1366 × 768. No se probaron las versiones mayores anteriores
de los navegadores ni la cámara física para el QR. No marcar RQNF-06 como
Implementado hasta resolver esas limitaciones.
