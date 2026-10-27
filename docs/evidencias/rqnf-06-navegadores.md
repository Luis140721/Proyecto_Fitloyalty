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

Se inició el frontend y el backend local con una cuenta y datos sintéticos.
En Chrome y Edge se recorrieron el inicio de sesión, dashboard, listado y
edición de miembros, check-in manual y por código QR, configuración y
formulario de alta. El backend tenía aplicadas las migraciones 009–014; se
deshabilitaron el scheduler y WhatsApp para evitar tareas programadas y envíos
externos durante la prueba.

Las capturas de todas las pantallas se tomaron a **1366 × 768**. En Firefox
solo se completó el recorrido parcial de portada, login, dashboard, listado
de miembros y apertura del formulario de alta; no se verificaron edición,
check-in ni configuración.

## Resultados

| Navegador | Versión | Login / dashboard | Miembros / edición | Check-in manual y QR | Configuración | Sin overflow horizontal | JS/API en recorrido autenticado |
|---|---|---|---|---|---|---|---|
| Chrome | 155.0.8059.85 | Pasa | Pasa | Pasa | Pasa | Pasa (1366 px) | Sin errores |
| Edge | 155.0.4283.62 | Pasa | Pasa | Pasa | Pasa | Pasa (1366 px) | Sin errores |
| Firefox | 157.0 | Pasa en recorrido parcial | Lista y formulario visibles; edición no probada | No probado | No probado | Pasa en pantallas capturadas (1366 px) | Sin errores reportados en el recorrido parcial |

El alta se envió desde la interfaz y confirmó creación en Chrome durante una
prueba diagnóstica aislada. En la corrida comparativa, el alta se capturó en
los tres navegadores, pero solo se envió en Chrome. Para probar el resto de
los flujos, los registros temporales se prepararon con datos sintéticos; se
actualizó un miembro desde la interfaz y se verificó el registro por
documento y por código QR. El modo QR se validó pegando un código de prueba;
no se verificó el uso de una cámara física.

La app puede consultar `trial-status` antes del login y recibir un `401`
esperado mientras no hay sesión. Después del login no hubo errores de API ni
de JavaScript en las corridas completas de Chrome y Edge. Los registros y la
cuenta de prueba se eliminaron al finalizar.

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
| Firefox | [Portada](./capturas/rqnf-06/firefox-home.png) · [Login](./capturas/rqnf-06/firefox-login.png) · [Dashboard](./capturas/rqnf-06/firefox-dashboard.png) · [Miembros](./capturas/rqnf-06/firefox-miembros.png) · [Alta](./capturas/rqnf-06/firefox-alta-miembro.png) |

## Limitaciones pendientes

- D4 **no está completo**: faltan los flujos de edición, check-in manual y QR,
  y configuración en Firefox.
- Se probó una sola versión mayor por navegador. El requisito pide las dos
  últimas; por tanto, también falta probar la versión mayor anterior de cada
  navegador. El objetivo de compilación de Vite no reemplaza esas pruebas
  reales.
- El check-in QR se hizo con un código pegado en el formulario; no se probó
  cámara física.

## Veredicto

**Parcial.** Chrome y Edge completaron los flujos principales con backend
activo a 1366 × 768. Firefox tiene evidencia parcial y las versiones
anteriores no se ejecutaron. No marcar RQNF-06 como Implementado hasta cubrir
esas pruebas pendientes.
