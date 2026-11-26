# ADR 0001: QR dinámico del miembro para el check-in

| Dato | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-21 |
| Decidió | Luis |
| Código verificado | `develop` @ `9fb3f7b` (el QR dinámico entró con el PR #104, que trae el #100 de Santiago) |
| Requisitos relacionados | RQF-05 (check-in), RQF-15 (app del miembro), RQNF-04 (usabilidad del check-in) |

## Contexto

El check-in por QR usaba solo el código fijo del miembro (`miembro.codigo_qr`). Ese código se puede fotografiar, imprimir o reenviar por WhatsApp, y quien tenga la foto entra como ese miembro. El equipo tenía que elegir cómo cerrar ese hueco antes de la entrega, sin perder el ingreso por documento en recepción.

## Decisión

Se queda el **QR dinámico del miembro**, el que entró con el PR #104:

- **Cambia cada 30 segundos (TOTP).** Cada miembro tiene un secreto que sale de una clave del servidor y de su código fijo (`secretoMiembro`, `backend/src/lib/qr-dinamico.js:109-113`). El código de cada paso de 30 s son 8 dígitos de HMAC-SHA256 con el truncado de la RFC 4226 (`PASO_SEG` y `DIGITOS`, `:43-44`; `codigoEnPaso`, `:121-131`), y el QR lleva el texto `FLD<id_miembro>T<código>` (`tokenEn`, `:134-136`).
- **Se calcula en el teléfono, sin internet una vez cargado.** La app recibe una vez el secreto, el paso y la hora del servidor en `GET /api/cliente/qr` (`backend/src/routes/cliente.js:244`, `:261`; `datosParaApp`, `qr-dinamico.js:165-178`) y calcula sola el código de cada paso, corrigiendo la diferencia con el reloj del servidor (`fitloyalty_cliente/lib/cliente/utils/qr_dinamico.dart:39-42`, `:63-74`, `:85-90`). Esos datos no se guardan en el teléfono: si la app se abre sin red y todavía no los cargó, no hay QR dinámico.
- **El servidor lo valida en el check-in.** Reconoce la forma del texto (`leerToken`, `qr-dinamico.js:142-146`; `backend/src/routes/checkin.js:126-127`) y acepta el paso actual, dos hacia atrás y uno hacia adelante, comparando en tiempo constante (`codigoValido`, `qr-dinamico.js:49-50`, `:152-162`). Un código vencido responde 400 `QR_DINAMICO_VENCIDO` (`checkin.js:140-144`).
- **El gimnasio puede activar «Exigir QR dinámico».** Es la casilla «Exigir el QR dinámico de la app (más seguro)» de Configuración (`frontend/src/pages/ConfigPage.jsx:249-257`), que guarda `gimnasio.qr_dinamico_obligatorio` (migración 015; `backend/src/routes/config.js:41`, `:204-209`). Con ella activa, el QR fijo ya no entra: 400 `QR_ESTATICO_NO_PERMITIDO` (`checkin.js:146-162`).
- **El respaldo es el documento en recepción.** El ingreso por documento no depende del QR (`checkin.js:196-203`), y desde el PR #109 un documento escrito en el campo del QR también se registra como ingreso manual (`frontend/src/lib/checkin.js:39-41`, `:47-49`).

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Un código fijo por gimnasio (por ejemplo, un QR pegado en la entrada que el miembro escanea con la app) | Se puede fotografiar y usar desde fuera del gimnasio, igual que el QR fijo del miembro. El miembro se registraría solo, sin que recepción vea en pantalla si tiene el plan vencido o congelado. Y no daba el tiempo: había que hacer otro flujo en la app y en el backend antes de la entrega. |
| Dejar solo el QR fijo del miembro | Es el problema que se quería resolver: una foto del QR basta para entrar. |

## Consecuencias

- **Para producción falta `QR_DINAMICO_SECRET` en Render.** Sin una clave propia, el secreto sale de `QR_ENCRYPTION_KEY` o de la clave de respaldo que está en el repositorio (`claveBase`, `qr-dinamico.js:57-64`), y con ella cualquiera podría calcular los códigos. Por eso, en producción y sin esa variable, el gimnasio no puede activar «Exigir QR dinámico»: 409 `QR_DINAMICO_SIN_SECRETO` (`puedeExigirse`, `qr-dinamico.js:76-78`; `config.js:180-188`), y el servidor lo avisa al arrancar (`avisarSecretoAlArrancar`, `qr-dinamico.js:90-106`, llamado en `backend/src/index.js:175`). Mientras tanto, el QR fijo y el documento siguen funcionando.
- **Hoy no existe registro de salida.** La tabla `checkin` solo guarda el ingreso (`backend/migrations/002_esquema_inicial.sql:95-105`) y no hay ninguna ruta de salida. Si algún día se necesita, es otra decisión.
- **Recepción sigue viendo cada ingreso.** El check-in lo hace el personal con el lector, la cámara o el documento, así que el bloqueo por plan vencido o congelado se muestra en la pantalla de recepción como antes (RQF-04 y RQF-06).
- **Pruebas.** `backend/tests/qr-dinamico.test.js` y `backend/tests/arranque-qr-dinamico.test.js` en el backend, y `fitloyalty_cliente/test/qr_dinamico_test.dart` en la app, con un vector fijo compartido entre los dos lados. Detalle en `docs/evidencias/rqf-10-12-qr-dinamico.md`.
