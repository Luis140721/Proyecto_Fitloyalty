# Evidencia RQNF-06: verificación entre navegadores

**Responsables:** Daniel (D4: primera prueba del 22/10 y repetición con backend en el PR #52) y Luis, con el agente ejecutor (recorrido completo del 13/11)

**Base de código:** `develop` en `442a55c` más el arreglo del PR #71 (`fix/modal-foco`, `5a75733`)

**Fecha de ejecución:** 2026-11-13 (hora de Colombia)

## Requisito

Texto de RQNF-06 en la matriz y en el documento de requisitos:

> El sistema debe funcionar correctamente en los navegadores Chrome, Firefox y
> Edge en sus dos últimas versiones mayores, sin requerir instalación de
> software adicional en el cliente.

## Resultado

**Los cinco navegadores pasan las 9 pantallas principales: 45 de 45
comprobaciones.** Cada paso se comprueba en la pantalla y, cuando escribe
datos, también en la base: la fila nueva, el método del check-in y el valor
editado.

| Navegador | Versión | Portada | Login | Dashboard | Miembros | Edición | Alta | Check-in manual | Check-in QR | Configuración |
|---|---|---|---|---|---|---|---|---|---|---|
| Chrome | 157.0.8103.52 (estable instalada) | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa (MANUAL) | Pasa (QR) | Pasa |
| Chrome | 156.0.8078.80 (Chrome for Testing) | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa (MANUAL) | Pasa (QR) | Pasa |
| Edge | 157.0.4341.46 (estable instalada) | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa (MANUAL) | Pasa (QR) | Pasa |
| Firefox | 160.0 | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa (MANUAL) | Pasa (QR) | Pasa |
| Firefox | 159.0.1 | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa | Pasa (MANUAL) | Pasa (QR) | Pasa |

**Versiones.** Al 13/11/2026, las dos últimas versiones mayores son Chrome 157
y 156 (canal estable 157.0.8103.78, según Chrome for Testing), Firefox 160 (del
10/11) y 159, y Edge 157 y 156.

- **Chrome 156:** Chrome for Testing 156.0.8078.80, descargado de
  `storage.googleapis.com/chrome-for-testing-public`.
- **Firefox 160.0 y 159.0.1:** compilaciones oficiales en español de
  `archive.mozilla.org`, con la firma de Mozilla Corporation válida.
- **Edge 156:** Microsoft no publica instaladores de versiones anteriores, así
  que no se probó directamente. Edge 156 usa el mismo motor que Chrome 156
  (Chromium 156), que sí pasó todo, y Edge 157 también pasó. Por decisión de
  Luis, se acepta esa equivalencia.

## Pantallas y comprobaciones

| Paso | Qué se hace | Qué se comprueba |
|---|---|---|
| Portada | Abrir `/` | Carga sin errores de JavaScript |
| Login | Correo y contraseña de la cuenta de prueba | Redirige a `/admin` |
| Dashboard | Abrir `/admin/dashboard` | Los 8 indicadores muestran números, ya terminada su animación |
| Miembros | Abrir `/admin/miembros` | La tabla lista los miembros |
| Edición | Abrir un miembro, escribir un teléfono nuevo y guardar | La captura muestra el modal con el número completo; luego «Miembro actualizado.» y el teléfono nuevo en la base |
| Alta | «Nuevo miembro»: nombre, documento y teléfono; en «Plan y cobros», el valor; en «Términos», las dos casillas; «Crear miembro» | «Miembro creado exitosamente» y el documento nuevo en la base |
| Check-in manual | Escribir el documento y pulsar Enter | «Ingreso registrado.» y exactamente una fila nueva con método `MANUAL` |
| Check-in QR | Escribir el código QR en el campo del lector y pulsar Enter, como lo hace un lector USB | «Ingreso registrado.» y exactamente una fila nueva con método `QR` |
| Configuración | Cambiar un valor y «Guardar Configuración» | «Configuración guardada exitosamente.» |

Cada navegador usó miembros distintos para no chocar con la ventana antirrebote
de 90 s del check-in (`backend/src/routes/checkin.js:22`).

## Capturas

Son 45 capturas a **1366 × 768**, una por pantalla y navegador, en
`docs/evidencias/capturas/rqnf-06/`. Están reducidas a 256 colores para que pesen poco
en el repositorio. Solo muestran datos sintéticos: la cuenta de `seed_dev.js`, los
miembros `DEMO-…` de `seed_demo.js` y los miembros «Prueba …» creados por el
recorrido.

| Navegador | Capturas |
|---|---|
| Chrome 157 | [portada](./capturas/rqnf-06/chrome157-portada.png) · [login](./capturas/rqnf-06/chrome157-login.png) · [dashboard](./capturas/rqnf-06/chrome157-dashboard.png) · [miembros](./capturas/rqnf-06/chrome157-miembros.png) · [edición](./capturas/rqnf-06/chrome157-edicion-miembro.png) · [alta](./capturas/rqnf-06/chrome157-alta-miembro.png) · [check-in manual](./capturas/rqnf-06/chrome157-checkin-manual.png) · [check-in QR](./capturas/rqnf-06/chrome157-checkin-qr.png) · [configuración](./capturas/rqnf-06/chrome157-configuracion.png) |
| Chrome 156 | [portada](./capturas/rqnf-06/chrome156-portada.png) · [login](./capturas/rqnf-06/chrome156-login.png) · [dashboard](./capturas/rqnf-06/chrome156-dashboard.png) · [miembros](./capturas/rqnf-06/chrome156-miembros.png) · [edición](./capturas/rqnf-06/chrome156-edicion-miembro.png) · [alta](./capturas/rqnf-06/chrome156-alta-miembro.png) · [check-in manual](./capturas/rqnf-06/chrome156-checkin-manual.png) · [check-in QR](./capturas/rqnf-06/chrome156-checkin-qr.png) · [configuración](./capturas/rqnf-06/chrome156-configuracion.png) |
| Edge 157 | [portada](./capturas/rqnf-06/edge157-portada.png) · [login](./capturas/rqnf-06/edge157-login.png) · [dashboard](./capturas/rqnf-06/edge157-dashboard.png) · [miembros](./capturas/rqnf-06/edge157-miembros.png) · [edición](./capturas/rqnf-06/edge157-edicion-miembro.png) · [alta](./capturas/rqnf-06/edge157-alta-miembro.png) · [check-in manual](./capturas/rqnf-06/edge157-checkin-manual.png) · [check-in QR](./capturas/rqnf-06/edge157-checkin-qr.png) · [configuración](./capturas/rqnf-06/edge157-configuracion.png) |
| Firefox 160 | [portada](./capturas/rqnf-06/firefox160-portada.png) · [login](./capturas/rqnf-06/firefox160-login.png) · [dashboard](./capturas/rqnf-06/firefox160-dashboard.png) · [miembros](./capturas/rqnf-06/firefox160-miembros.png) · [edición](./capturas/rqnf-06/firefox160-edicion-miembro.png) · [alta](./capturas/rqnf-06/firefox160-alta-miembro.png) · [check-in manual](./capturas/rqnf-06/firefox160-checkin-manual.png) · [check-in QR](./capturas/rqnf-06/firefox160-checkin-qr.png) · [configuración](./capturas/rqnf-06/firefox160-configuracion.png) |
| Firefox 159 | [portada](./capturas/rqnf-06/firefox159-portada.png) · [login](./capturas/rqnf-06/firefox159-login.png) · [dashboard](./capturas/rqnf-06/firefox159-dashboard.png) · [miembros](./capturas/rqnf-06/firefox159-miembros.png) · [edición](./capturas/rqnf-06/firefox159-edicion-miembro.png) · [alta](./capturas/rqnf-06/firefox159-alta-miembro.png) · [check-in manual](./capturas/rqnf-06/firefox159-checkin-manual.png) · [check-in QR](./capturas/rqnf-06/firefox159-checkin-qr.png) · [configuración](./capturas/rqnf-06/firefox159-configuracion.png) |

## Entorno

Una copia aislada en el equipo de Luis, sin tocar producción, Neon ni las bases
del bootcamp:

- **Base:** contenedor `postgres:16-alpine` desechable, con las migraciones 002
  a 014 (`backend/src/db/migrate.js`), la cuenta de `backend/src/db/seed_dev.js`
  y los datos de `backend/src/db/seed_demo.js`.
- **Backend:** `node src/index.js` de `develop`, con `DISABLE_SCHEDULER=true` y
  `ENABLE_WHATSAPP=false`. Se usó el puerto 4310 porque Firefox bloquea el 4190
  (es el de ManageSieve y está en su lista de puertos prohibidos).
- **Frontend:** el build de producción (`vite build`) servido con
  `vite preview`, que es el mismo build que publica Vercel.
- **Navegadores:** sin interfaz (modo headless), ventana de 1366 × 768 y un perfil
  nuevo en cada corrida. Se manejaron con `puppeteer-core` 24.43.1: CDP para
  Chrome y Edge, y WebDriver BiDi para Firefox (el Firefox oficial, no una
  versión modificada).
- **Script:** [`rqnf-06/recorrido.js`](./rqnf-06/recorrido.js), el mismo de la
  corrida. Solo cambian las rutas, que ahora salen de variables de entorno, y
  la guardia que exige una base local.

**Ajuste en la base de prueba.** `seed_dev.js` no llena la columna vieja
`usuario.rol`, que queda en `RECEPCIONISTA` por defecto, así que `GET
/api/auth/me` trataba a la cuenta como recepción. Se puso `ADMINISTRADOR` solo
en la base de prueba. En producción no pasa: el registro llena las dos columnas
(`backend/src/routes/auth.js:148`). Hay que corregir `seed_dev.js`.

## Consola

- **Chrome y Edge:** 2 errores `401` por navegador, de `GET
  /api/billing/trial-status` en la portada y en el login, antes de iniciar
  sesión. Se esperan, porque no hay sesión. Observación: el frontend podría no
  consultar ese endpoint sin token. Con el servidor de desarrollo eran 4, porque
  React en modo estricto ejecuta dos veces los efectos.
- **Firefox:** en una de las dos versiones, `downloadable font: download failed`
  (Hanken Grotesk 600, `NS_BINDING_ABORTED`). Ocurre cuando se cambia de página
  mientras la fuente baja de Google Fonts, y cambia de una corrida a otra. Las
  capturas se toman después de `document.fonts.ready` y no se ve ningún efecto.
- Ningún otro error de JavaScript en los cinco navegadores.

## Diferencias visuales

- **Fondo de los modales en Firefox:** en las capturas de Firefox, el fondo de
  los modales no sale desenfocado, así que la tabla de atrás se nota a través
  del modal (por ejemplo, en `firefox160-edicion-miembro.png`). En Chrome y Edge
  sí sale desenfocado. Firefox sí soporta la propiedad: `CSS.supports('backdrop-filter',
  'blur(4px)')` da `true` y el estilo calculado del fondo es `blur(4px)`. Todo
  indica que el modo sin ventana no lo dibuja en la captura, pero no se pudo
  confirmar con ventana. Los campos del modal se leen y funcionan igual.
- **Columna QR:** los miembros creados desde la pantalla muestran en la columna
  QR el código cifrado completo, y los de `seed_demo.js`, uno corto `FL-…`. Sale
  igual en los cinco navegadores, así que no es de compatibilidad.

## Defecto encontrado y corregido

**En «Editar miembro» solo se podía escribir un carácter seguido**, en los tres
navegadores.
- El causante era `frontend/src/components/Modal.jsx`: el efecto que mueve el
  foco dependía de `onClose`, que las páginas pasan como función en línea.
- Con cada tecla, el foco saltaba al botón de cerrar.
- Está en `main` desde el 20/08, así que también afecta a producción.
- Se corrige en el PR #71, y esta corrida ya lo incluye.

**Antes, la prueba de Daniel en el PR #52** encontró que editar un miembro sin
fecha de nacimiento daba 503. Se corrigió en el PR #55.

## Limitaciones

- **Cámara:** no se probó leer el QR con la cámara (`html5-qrcode`). Por
  decisión de Luis, RQNF-06 se cumple con el lector USB o pegando el código,
  que es el método del recorrido.
- **Edge 156:** no se probó directamente; ver «Versiones».
- **Alcance:** la prueba es en escritorio a 1366 × 768. La vista de 375 px está
  en `docs/sustentacion/evidencias/QA_Responsive_375px.md`.
- **Entorno:** corrió contra una copia local con el código de `develop`, no
  contra producción. Producción todavía no tiene `develop` desplegado.

## Antecedentes

- **22/10 (PR #43, Daniel):** portada y login en Chrome 155, Firefox 157 y Edge
  155, sin backend. Sus capturas siguen en `docs/evidencias/capturas/` como
  [chrome-login.png](./capturas/chrome-login.png),
  [firefox-login.png](./capturas/firefox-login.png) y
  [edge-login.png](./capturas/edge-login.png).
- **26/10 (PR #52, Daniel):** las mismas pantallas de este informe con el
  backend, en Chrome 155, Edge 155 y Firefox 157.0.1. El verificador lo aprobó
  con observaciones: faltaban los dashboards de Chrome y Edge, que salieron a
  medio cargar, y la versión anterior de cada navegador. Este informe completa
  esas dos cosas y reemplaza al #52, que se cierra sin fusionar con crédito a
  Daniel.

## Veredicto

**Implementado.** Las pantallas principales funcionan en Chrome, Firefox y Edge
en sus dos últimas versiones mayores, con Edge 156 cubierto por Chromium 156.
No hace falta instalar nada en el cliente: es una aplicación web que solo
necesita el navegador. Requiere fusionar el PR #71.
