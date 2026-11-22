# RQNF-16: pruebas del bootcamp adaptadas a la Ley 2300

**Fecha:** 2026-11-22 · **PR:** #108 (`feat/rqnf-16-ley2300`), después de fusionarle `develop` (`d9e5c8d`, el bootcamp de pruebas del #48).

Al fusionar `develop`, 41 pruebas del bootcamp fallaban: estaban escritas contra el comportamiento anterior a la Ley 2300 (campañas sin aceptación ni horario, constancia después de abrir WhatsApp, ficha sin la aceptación comercial). Este documento deja, prueba por prueba, qué afirmaba cada una y qué afirma ahora. Ninguna se quitó ni se saltó, ningún archivo perdió casos y ningún umbral de cobertura cambió. «Decisión N» remite a la sección «Decisiones» de `rqnf-16-ley-2300.md`.

| Capa | Archivo | Pruebas en `develop` | Fallaban | Pruebas ahora |
|---|---|---|---|---|
| API | `backend/tests/campanas-rutas.test.js` | 69 | 23 | 120 |
| API | `backend/tests/miembros-rutas.test.js` | 87 | 1 | 89 |
| API | `backend/tests/miembros-api-crud.test.js` | 15 | 1 | 15 |
| Front | `frontend/tests/CampanasPage.test.jsx` | 42 | 11 | 61 |
| Front | `frontend/tests/MenuNotificaciones.test.jsx` | 13 | 2 | 17 |
| Front | `frontend/tests/MiembrosPage.ficha.test.jsx` | 36 | 3 | 52 |
| Front | `frontend/tests/App.test.jsx` | 10 | 0 | 11 |
| Front | `frontend/tests/ConfigPage.test.jsx` | 14 | 0 | 17 |
| Front | cinco archivos nuevos (`BajaMensajesPage`, `contactoWhatsapp`, `AutorizacionesMiembro`, `MiembrosPage.comerciales`, `autorizaciones`) | 0 | — | 92 |

Cada prueba adaptada o nueva se hizo fallar al menos una vez con un cambio temporal en el código (34 cambios en el backend y 62 en el panel, todos revertidos), y las suites pasan con el reloj del sistema en distintos días y zonas horarias: el reloj de la ley va fijo en las pruebas.

## Backend: pruebas existentes que cambiaron

CR = `campanas-rutas.test.js`, MR = `miembros-rutas.test.js`, MC = `miembros-api-crud.test.js`. «Reloj» = martes 17-nov-2026, 10:00 a. m. de Colombia.

| # | Archivo | Prueba (antes → después) | Qué afirmaba antes | Qué afirma ahora | Por qué (Ley 2300) |
|---|---|---|---|---|---|
| 1 | CR | `should answer the campaigns with the segments, their default days and the variables when nothing is due` → `should answer the campaigns with the segments, their default days, the variables and the schedule of the law when it is inside the allowed schedule` | 200 con `{campanas, segmentos, variables}`; lista pedida con `[7]` | Lo mismo más `horario: {permitido: true, texto, siguiente: null, siguiente_texto: null}` y `omitidos: 0` en la campaña | La lista informa el horario legal y ya no busca vencidas |
| 2 | CR | `should run first only the due campaigns of the gym of the admin when the server slept through their time` → dos pruebas: `should only read and leave the due campaigns to the scheduler when the server slept through their time` y, en el job, `should ask the database only for the due campaigns of one gym and run them when it is called for that gym` | GET ejecutaba la 5 del gimnasio 7 y no la 6 del 8: `FOR UPDATE` `[[5,7]]`, `ENVIADA` con `[5]` | (a) GET con una vencida: 200, la campaña sigue igual, sin consulta de vencidas, sin escrituras, transacciones ni envíos. (b) `ejecutarVencidas(7)` manda `[7]` al filtro SQL, ejecuta `[[5,7]]` y marca `ENVIADA` con `[5, reloj]` | La lista solo lee; ejecuta el scheduler y el filtro por gimnasio va en la consulta |
| 3 | CR | `should keep listing and log the cause when a due campaign fails to run` → (job) `should keep running the rest and log the cause when a due campaign fails to run` | GET 200, `console.error('[campanas] No se pudo ejecutar la campana 5:', 'fallo de la BD')`, `BEGIN, ROLLBACK, release` | `runJob()`: mismo `console.error`, la 5 hace ROLLBACK y suelta el cliente, la 6 sí le envía a Ana (con enlace de baja); resumen `ejecutadas: 1, destinatarios: 1, enviados: 1` | Ese camino ya no existe en GET; quedó en el scheduler |
| 4 | CR | `should answer 503 DB_UNREACHABLE when the campaigns cannot be read` (mismo nombre) | 503 con su cuerpo | Igual; solo se quitó del Arrange la consulta de vencidas | GET ya no la hace |
| 5 | CR | `should count the members with WhatsApp and with email using the default days of the segment when no days are sent` → `should count the members with WhatsApp and with email, and the ones who accepted commercial messages by each channel, using …` | `total: 3, con_telefono: 2, con_correo: 2`, muestra, params `[7, 7]` | Además `aceptan_whatsapp: 1, aceptan_correo: 2` (Ana los dos, Beto canceló, Carla solo correo) y aceptación pedida con `[[41,42,43], 7]` | La vista previa cuenta quién aceptó por canal (arts. 2 y 5) |
| 6 | CR | Ídem 5, caso `when the days come empty` | Ídem | Ídem | Ídem |
| 7 | CR | Ídem 5, caso `the days sent when the admin writes them` (15 días) | Ídem con `[7, 15]` | Ídem | Ídem |
| 8 | CR | `should show a sample of at most 10 members when the segment is bigger` (mismo nombre) | `total: 12, con_telefono: 0, con_correo: 0`, muestra de 10 | Además `aceptan_whatsapp: 0, aceptan_correo: 0` | Por defecto nadie acepta |
| 9 | CR | `should send by WhatsApp to the members with a phone and mark the one without a phone as FALLIDO when the WhatsApp module is active` → `should send by WhatsApp, with the unsubscribe link, to the members who accepted it and have a phone, and mark the one without a phone as FALLIDO when the WhatsApp module is active` | Resumen `3 / 2 enviados / 1 fallido`; textos sin enlace; destinatario `[4, id]`; `envio_mensaje` de 8 parámetros | Resumen con `omitidos: 0, omitidosPorMotivo: {}, cerroFranja: false`; textos con enlace de baja firmado; destinatario `[4, id, 'PENDIENTE', null]`; motivo `SIN_TELEFONO`; aceptación leída al congelar y en cada entrega; `ENVIADA` y `envio_mensaje` con la hora del reloj | Campaña = mensaje comercial: aceptación por canal, enlace de baja y reloj de la ley |
| 10 | CR | `should leave PENDIENTE for sending by hand every member with a phone when the WhatsApp module is not active` (nombre original) | `{destinatarios: 3, enviados: 0, fallidos: 1, pendientes: 2}`; sin llamadas a WhatsApp; Beto `[42, 'FALLIDO']` | Lo mismo, más los campos nuevos del resumen; Beto `[42, 'FALLIDO', 'SIN_TELEFONO']`; la única constancia es la suya, con enlace de baja y hora del reloj; dos transacciones; el bloqueo de contacto solo para él (`[[42]]`) | Vuelve el comportamiento original (quien no tiene teléfono queda FALLIDO aunque el servidor no tenga WhatsApp); la ley suma el resumen con omitidos, el motivo y el enlace de baja |
| 11 | CR | `should stop trying WhatsApp and leave the rest PENDIENTE when the client answers WHATSAPP_NO_LISTO` (nombre original) | `fallidos: 1, pendientes: 2`; `enviarWhatsapp` una vez; Beto `[42, 'FALLIDO']` | Lo mismo, más los campos nuevos; la única llamada es a Ana, con enlace de baja; Beto `SIN_TELEFONO`; una constancia (`42, FALLIDO`); transacciones: congelar, intento de Ana deshecho, fallido de Beto | Ídem 10; cada entrega va en su transacción |
| 12 | CR | Ídem 11, caso `WHATSAPP_DESHABILITADO` | Ídem | Ídem | Ídem |
| 13 | CR | `should mark FALLIDO the member whose WhatsApp fails for another reason and keep sending to the rest` (mismo nombre) | Resumen `1 enviado / 2 fallidos`; estados sin motivo | Resumen con los campos nuevos; `ERROR_ENVIO`, `SIN_TELEFONO` y ENVIADO | Resumen con omitidos y motivo por destinatario |
| 14 | CR | `should send an email to each member with email and mark FALLIDO the ones without email or whose email was not delivered when the channel is EMAIL` → `should send an email, with the unsubscribe link, to each member who accepted it and has an email, and mark FALLIDO …` | Resumen `4 / 1 / 3`; correo a Ana sin enlace | Los cuatro aceptaron correo; resumen con campos nuevos; correo con enlace de baja; motivos `SIN_CORREO` y `ERROR_ENVIO` | Aceptación por canal y enlace de baja |
| 15 | CR | `should answer 409 CAMPANA_NO_EJECUTABLE and roll back when another execution took the campaign first` (mismo nombre) | 409, ROLLBACK, sin escrituras | Igual, sin tocar el cuerpo: fallaba solo por el reloj real | Ejecutar depende del horario; ahora corre con el reloj fijo |
| 16 | CR | `should roll back, release the client and answer 503 DB_UNREACHABLE when the recipients cannot be saved` (mismo nombre) | 503, `BEGIN, ROLLBACK, release`, sin `ENVIADA` | Igual; el Arrange suma aceptación e historial | Se leen antes de guardar los destinatarios |
| 17 | CR | `should roll back the record of the delivery and answer 503 DB_UNREACHABLE when it cannot be saved` (mismo nombre) | 503, transacciones, sin `UPDATE campana_destinatario` | Igual, más que el correo salió una vez; el Arrange suma aceptación, historial y bloqueo de contacto | La entrega revisa la ley con el miembro bloqueado |
| 18 | CR | `should answer each recipient with the WhatsApp number and the message of today ready to send by hand` → `should answer each recipient with the WhatsApp number, the reason it was not sent and the message of today, with the unsubscribe link, ready to send by hand` | Dos destinatarios con mensaje sin enlace | Tres (PENDIENTE; FALLIDO `SIN_TELEFONO`; OMITIDO `NO_AUTORIZA`), cada uno con `motivo` y mensaje con enlace; `horario` permitido | El detalle muestra por qué no se envió y el horario |
| 19 | CR | `should write "tu gimnasio" in the message when the gym name cannot be found` (mismo nombre) | Mensaje exacto sin enlace | Mismo mensaje más el enlace de baja | Enlace de baja en todo mensaje comercial |
| 20 | CR | `should record the delivery with the text sent and mark the recipient as ENVIADO` → `should record the delivery with the text the server builds, with the unsubscribe link, and mark the recipient as ENVIADO when the panel sends its own text` / `… sends no text` (2 casos) | 201 `{destinatario}`; `envio_mensaje` con el texto del panel | 201 `{duplicado: false, destinatario, mensaje, telefono}`; `envio_mensaje` con el texto del servidor y la hora del reloj; bloqueo de contacto `[41]`; aceptación `[[41], 7]` | La constancia se pide antes de abrir el chat y el texto lo arma el servidor |
| 21 | CR | `should answer 404 NOT_FOUND without recording when the member is not a recipient of the campaign` (mismo nombre) | 404, sin `envio_mensaje` | Igual, más params `[4, 99, 7]` y `BEGIN, ROLLBACK, release`; campaña ya ENVIADA | El destinatario se busca con la fila bloqueada |
| 22 | CR | `should answer 400 VALIDATION_ERROR without touching the database when the message sent is missing` → `… when the message sent is not a text` / `… has more than 2000 characters` (2 casos) | `{mensaje: '   '}` → 400, path `['mensaje']` | `{mensaje: 123}` y 2001 caracteres → 400, path `['mensaje']`, sin tocar la base | El mensaje es opcional y se ignora; vacío ya no es error |
| 23 | CR | `should run the due campaigns of every gym and add up their summaries when the scheduler calls it` (mismo nombre) | `{ejecutadas: 2, destinatarios: 2, enviados: 0, pendientes: 1, fallidos: 1}`; `FOR UPDATE` de las tres; entrega fallida de la 6 a nombre del creador | Escenario original (5: Ana; 6: Beto sin teléfono; 7 ya enviada, sin módulo) más Carla, que no aceptó: `{ejecutadas: 2, reintentadas: 0, destinatarios: 3, enviados: 0, pendientes: 1, fallidos: 1, omitidos: 1}`; vencidas con `[null]`; constancia de Beto con enlace, reloj y creador `2`; reintento pedido con `[null, false]` | El resumen del job suma `omitidos` y `reintentadas`; quien no aceptó queda OMITIDO |
| 24 | CR | `should answer zeros when no campaign is due` (mismo nombre) | Cinco ceros | Siete ceros (con `reintentadas` y `omitidos`), sin transacciones | Campos nuevos del resumen |
| 25 | MR | `should return the member of the gym when the id exists` (mismo nombre) | Miembro con los campos de RQNF-17 | Además `acepta_mensajes_comerciales: false, canales_comerciales: []` | La ficha trae la aceptación; sin fila, no acepta |
| 26 | MC | `should answer 200 in JSON with the member as it is stored, without the password hash nor the gym` (mismo nombre) | Miembro guardado más los campos de RQNF-17 | Además `acepta_mensajes_comerciales: false, canales_comerciales: []` | Ídem |

## Backend: pruebas nuevas

Las ramas nuevas de `routes/campanas.js` (el 202 de «Enviar ahora» fuera de horario, reintentar, los 409 de la constancia, programar fuera de horario) solo las cubrían las suites contra base real, que el job `backend` del CI salta. Con las 25 fallando, la cobertura de ramas quedaba en 84,13 % contra un umbral de 84.

| Archivo | Bloque | Prueba | Casos |
|---|---|---|---|
| CR | GET lista | `should say that it cannot be sent now and when the next allowed time is when it is %s` (domingo, festivo, viernes 7 p. m., sábado 3 p. m.) | 4 |
| CR | POST crear | `should answer 400 FUERA_DE_HORARIO with the next allowed time, without creating it, when the scheduled time is %s`; cuerpo exacto, terminado en «a. m.» | 4 |
| CR | ejecutar | `should leave OMITIDO with its reason, without writing to them, the members who did not accept commercial messages by that channel or were already contacted today` | 1 |
| CR | ejecutar | `should omit every member when nobody has accepted commercial messages, which is the default` | 1 |
| CR | ejecutar | `should send nothing and answer 202 with the campaign scheduled for the next allowed time when it is %s`; cuerpo exacto, las dos frases terminan en «a. m.» | 4 |
| CR | reintentar (bloque nuevo) | `should send to the recipients left PENDIENTE who still accept, omit the one who cancelled and answer the new summary` | 1 |
| CR | reintentar | `should answer that the pending ones are sent by hand, without trying any delivery, when the campaign is by WhatsApp and the module is not active` | 1 |
| CR | reintentar | `should answer 409 FUERA_DE_HORARIO with the next allowed time, without sending, when it is %s`; cuerpo exacto | 3 |
| CR | reintentar | `should answer that there is nothing pending, without looking for recipients, when the campaign has no PENDIENTE left` | 1 |
| CR | reintentar | `should answer 409 CAMPANA_NO_EJECUTABLE without sending when the campaign is %s` (PROGRAMADA, CANCELADA) | 2 |
| CR | reintentar | **Del arreglo del reintento:** `should answer 409 CAMPANA_NO_EJECUTABLE without sending when the campaign %s between the read of the route and the retry` (`is no longer ENVIADA`, `no longer exists`) | 2 |
| CR | reintentar | `should answer 404 NOT_FOUND when the campaign is not of the gym of the admin` | 1 |
| CR | destinatarios | `should answer that it cannot be sent now and the next allowed time when the recipients are opened on a Sunday` | 1 |
| CR | enviado | **Del arreglo del texto del envío a mano:** `should record and answer exactly the message the recipients list shows for that member when the template uses the days without coming and the expiration date` | 1 |
| CR | enviado | `should answer 200 with duplicado and the text already recorded, without recording again, when the recipient was already ENVIADO (double click)` | 1 |
| CR | enviado | `should answer 409 CONTACTO_NO_PERMITIDO and leave the recipient OMITIDO, without recording, when the member %s` | 5 |
| CR | enviado | `should answer 409 CONTACTO_NO_PERMITIDO with the next allowed time and keep the recipient PENDIENTE, without recording, when it is %s` | 4 |
| CR | enviado | `should answer 409 CONTACTO_NO_PERMITIDO with the saved reason, without checking again nor recording, when the recipient was left OMITIDO` | 1 |
| CR | enviado | `should answer 409 CONTACTO_NO_PERMITIDO and roll back, without recording, when the member has no valid phone` | 1 |
| CR | enviado | `should answer 409 CAMPANA_NO_EJECUTABLE without looking for the recipient when the campaign %s` (por correo, sin ejecutar) | 2 |
| CR | enviado | `should roll back, release the client and answer 503 DB_UNREACHABLE when the delivery cannot be recorded` | 1 |
| CR | job | `should retry the recipients left PENDIENTE in the campaigns already sent and count them as reintentadas` | 1 |
| CR | job | `should keep going and log the cause when the retry of a campaign fails` | 1 |
| CR | job | `should not run nor retry anything, without reading the database, when the scheduler calls it on %s` | 4 |
| MR | detalle | `should answer the commercial messages as %s` (aceptó, canales en orden fijo; canceló) | 2 |

En CR son 48 pruebas nuevas, más 3 que salen de dividir las filas 2, 20 y 22: 69 + 51 = 120.

## Panel: pruebas existentes que cambiaron

Las 16 que fallaban son las filas 2 a 13 y 15 a 18; las filas 1 y 14 pasaban y se reforzaron o ajustaron.

| # | Archivo | Prueba (antes → después si cambió el nombre) | Qué afirmaba antes | Qué afirma ahora | Por qué (Ley 2300) |
|---|---|---|---|---|---|
| 1 | CampanasPage | `should show each campaign with its state, segment, channel and dates and the actions it allows when the page loads` | La enviada dice «3 destinatarios · 1 enviados · 1 por enviar · 1 fallidos» | Dice además «· 0 omitidos (Ley 2300)» y, como le queda un pendiente, ofrece «Reintentar». El resto igual | La tarjeta cuenta los omitidos por la ley y deja reintentar los pendientes |
| 2 | CampanasPage | `should say how many members would receive the campaign today and how many have phone and email` → `should say how many members are in the segment and how many accepted commercial messages by WhatsApp when the page loads` | «Hoy la recibirían 3 miembros (2 con teléfono, 1 con correo).», una sola petición `segmento=INACTIVOS`, placeholder 7 | «En el segmento hay 3 miembros; aceptaron mensajes comerciales por WhatsApp 1. Solo a ellos les llega.» (la respuesta trae 2 con teléfono y 1 que aceptó). Misma petición y placeholder | Tener teléfono ya no basta: solo la reciben quienes aceptaron por ese canal (arts. 2 y 5) |
| 3 | CampanasPage | `should ask the days with its own label and send them when the segment is NUEVOS` | «Hoy la recibirían 1 miembro (1 con teléfono, 0 con correo).», etiqueta, placeholder 30 y `&dias=15` | «En el segmento hay 1 miembro; aceptaron mensajes comerciales por WhatsApp 1. Solo a ellos les llega.» y lo demás igual | Mismo cambio de la vista previa |
| 4 | CampanasPage | `should ask the days with its own label and send them when the segment is PROXIMOS_A_VENCER` | Igual que la 3, con placeholder 7 | Igual que la 3 | Igual |
| 5 | CampanasPage | `should fill the message from an active template, preview it with sample data and save a manual campaign` | El único `role="status"` dice «Campaña guardada. Pulsa «Enviar ahora» cuando quieras lanzarla.»; POST exacto; formulario vacío; 2 cargas | Lo mismo, pero la confirmación es la alerta verde, y exige que haya exactamente una | La página muestra siempre el horario de la ley en otro `role="status"` |
| 6 | CampanasPage | `should schedule an email campaign with its days, date and time when the admin chooses Programado` | Único status «Campaña programada. El servidor la envía a la hora indicada.» y POST exacto | Igual, sobre la alerta verde | Igual que la 5 |
| 7 | CampanasPage | `should fill the form with the campaign and save the changes with PUT when the admin edits it` | Único status «Campaña programada.», PUT exacto, sin POST | Igual, sobre la alerta verde | Igual que la 5 |
| 8 | CampanasPage | `should send the campaign, show the summary and open the recipients when some are left to send by hand` | ««Te extrañamos»: 3 destinatarios · 1 enviados · 1 por enviar a mano · 1 fallidos.», confirm, POST y diálogo | «… · 1 fallidos · 0 omitidos por la Ley 2300.» y que no dice «Se cerró el horario permitido». Lo demás igual | El resumen cuenta los omitidos |
| 9 | CampanasPage | `should not open the recipients when every message went out` | «2 destinatarios · 2 enviados · 0 por enviar a mano · 0 fallidos.», sin diálogo ni petición | «… · 0 fallidos · 0 omitidos por la Ley 2300.» y lo demás igual | Igual que la 8 |
| 10 | CampanasPage | `should open WhatsApp with the message, record the delivery and reload the recipients when the admin sends one by hand` → `should record the delivery first and then open WhatsApp with the phone and the message of the server when the admin sends one by hand` | `window.open` a wa.me con el texto de la lista; POST `…/41/enviado` con `{ mensaje }`; la fila pasa a «Enviado» sin botón | `window.open('about:blank','_blank')` una vez; POST una vez con `{}`; la pestaña va una vez a `wa.me/573005550000` con el texto del servidor (con el enlace de baja); el POST va antes; `opener` en `null`; no se cierra; sin alerta; fila «Enviado» sin botón | Decisión 8: la constancia va antes de abrir el chat, y el texto y el teléfono los da el servidor |
| 11 | CampanasPage | `should mark the button as opened and show the message of the API when the delivery cannot be recorded` → `should close the blank tab without opening WhatsApp and show the message of the API when the delivery cannot be recorded` | Alerta con el mensaje del API y botón «Abierto» | Alerta con el texto exacto; la pestaña se cierra una vez y nunca va a wa.me; `window.open` solo con `about:blank`; el botón sigue «WhatsApp» habilitado; no hay «Abierto» | El escenario viejo ya no existe: sin constancia no se abre el chat |
| 12 | CampanasPage | `…show a generic message…` (el otro caso del mismo `test.each`) | «Se abrió WhatsApp, pero no se pudo dejar constancia del envío.» y botón «Abierto» | «No se pudo dejar constancia del envío; no se abrió WhatsApp.» y lo mismo que la 11 | Igual que la 11 |
| 13 | MenuNotificaciones | `should open WhatsApp, record the sending and mark it as sent when the WhatsApp button of a notice is clicked` → `should record the sending first, open WhatsApp with the text of the server and mark it as sent when the WhatsApp button of a notice is clicked` | `window.open` a wa.me con el texto del aviso; POST con `idMiembro 3, WHATSAPP, riesgo, mensaje, idAlerta 31`; «Enviado»; panel abierto | `about:blank` una vez; POST una vez con lo mismo más `antesDeAbrir: true`; la pestaña va una vez a wa.me con el texto del servidor (con el enlace de baja), después del POST; `opener` en `null`; no se cierra; sin aviso; «Enviado»; panel abierto | Decisión 8, y el enlace de baja en los mensajes comerciales (art. 5) |
| 14 | MenuNotificaciones | `should ignore other keys and open WhatsApp when Space is pressed on the WhatsApp button` | Tras una letra, `window.open` no se llama; tras la barra, se llama con wa.me, `'_blank'`, `'noopener,noreferrer'` | Tras la letra, ni `window.open` ni POST; tras la barra, la misma llamada, esperada con `waitFor` | El chat se abre después de la respuesta; con `window.open → null` es el camino del bloqueador |
| 15 | MenuNotificaciones | `should say that the sending was not recorded when the API fails after opening WhatsApp` → `should not open WhatsApp and say that the sending could not be recorded when the API fails` | Status «Se abrió WhatsApp, pero no pudimos registrar el envío a Carlos Ruiz.» | Status exactamente «No se abrió WhatsApp porque no pudimos registrar el envío a Carlos Ruiz. Intenta de nuevo.»; pestaña cerrada una vez; nunca va a wa.me; el botón sigue «WhatsApp» y ninguno dice «Enviado» | El escenario viejo ya no existe |
| 16 | MiembrosPage.ficha | `should send only the fields the API accepts when the user saves the changes` | El PUT no lleva claves fuera de la lista de editables | La lista incluye `acepta_mensajes_comerciales` y `canales_comerciales`, y el cuerpo los lleva en `false` y `[]` | La ficha manda la decisión comercial en cada guardado; el `updateSchema` del backend los acepta |
| 17 | MiembrosPage.ficha | `should open the chat with the message of the server and record it without opening the file when WhatsApp is clicked` → `should record the sending first and open the chat with the message of the server without opening the file when WhatsApp is clicked` | `window.open` a wa.me con el mensaje de la lista; POST con `idMiembro 2, WHATSAPP, vencida, mensaje`; «Enviado»; sin diálogo ni aviso | `about:blank` una vez; POST una vez con lo mismo más `antesDeAbrir: true`; la pestaña va a wa.me con el texto del servidor (distinto del de la lista), después del POST; `opener` en `null`; no se cierra; «Enviado»; sin diálogo; sin «No se abrió WhatsApp» | Decisiones 8 y 15 (el texto del aviso lo arma el servidor) |
| 18 | MiembrosPage.ficha | `should warn that the sending was not recorded when the chat opens but the record fails` → `should not open the chat and warn that the sending could not be recorded when the record fails` | Status «Se abrió WhatsApp, pero no pudimos registrar el envío a Carlos Ruiz.» y botón «Enviado» | Status exactamente «No se abrió WhatsApp porque no pudimos registrar el envío a Carlos Ruiz. Intenta de nuevo.»; pestaña cerrada; nunca va a wa.me; el botón sigue «Avisar» | El escenario viejo ya no existe |

**Escenarios que ya no existen** (filas 11, 12, 15 y 18): «se abrió WhatsApp pero no quedó constancia». Se reescribieron al equivalente más cercano: si la constancia falla, no se abre nada y el botón no queda marcado.

Cambios de arnés que no son pruebas:
- **CampanasPage:** `window.open` devuelve una pestaña falsa; las respuestas simuladas traen `horario`, `omitidos`, `motivo` y los conteos de quienes aceptaron.
- **App:** el doble del API responde también el enlace de baja.
- **ConfigPage y ficha:** ya no hay arnés de timers (punto A).

## Panel: pruebas nuevas

Las marcadas con **(2.ª)** cubren los arreglos de `frontend/src` que salieron de esta misma revisión.

| Archivo | Prueba | Qué comprueba |
|---|---|---|
| CampanasPage | `should count the members who accepted commercial messages by email when the channel of the campaign is Correo` | Con canal Correo muestra «por correo 2» (los que aceptaron) y no vuelve a pedir el segmento |
| CampanasPage | `should count nobody as accepted, not the ones with phone or email, when the server does not say how many accepted` | Si la respuesta no trae los conteos, dice 0 |
| CampanasPage | `should count the omitted members and open the recipients to see why when the law left some out` | «2 omitidos por la Ley 2300.» y abre los destinatarios aunque no haya pendientes |
| CampanasPage | `should explain that the pending ones go out in the next slot when the allowed schedule closed during the sending` | El resumen agrega «Se cerró el horario permitido: los pendientes salen en la siguiente franja.» |
| CampanasPage | `should say that the campaign was left scheduled and not open the recipients when Enviar ahora is pressed outside the schedule` | Con el 202 `programada` muestra el mensaje del servidor, recarga y no abre destinatarios |
| CampanasPage | `should remind the allowed schedule and that only who accepted receives the campaigns when messages can be sent now` | Aviso informativo con el horario completo |
| CampanasPage | `should warn that nothing can be sent now and say when Enviar ahora would leave the campaign scheduled when it is outside the schedule` | **(ajustada en la 2.ª)** Aviso de advertencia con el texto completo y exacto, terminado en «…a las 7:00 a. m.», y sin «a. m..» |
| CampanasPage | `should keep the general reminder of the schedule when the server does not say whether messages can be sent now` | Sin `horario` en la respuesta queda el aviso general |
| CampanasPage | `should offer Reintentar only when a sent campaign still has pending recipients` | «Reintentar» solo en la enviada con pendientes |
| CampanasPage | `should process the pending recipients again, show the answer of the server and reload the list when Reintentar is pressed` | POST `/admin/campanas/5/reintentar`, mensaje del servidor, recarga, sin confirmación |
| CampanasPage | `should show %s when the campaign cannot be retried` (2 casos) | El 409 fuera de horario con su texto exacto, o «No se pudo reintentar la campaña.» |
| CampanasPage | `should not open WhatsApp, say why and show the member as omitted when the law does not allow the contact` | Con 409 `CONTACTO_NO_PERMITIDO`: motivo, pestaña cerrada, fila «Omitido» sin botón |
| CampanasPage | `should not open a second chat nor show an error when the server says the delivery was already recorded` | Con `duplicado: true` no abre chat ni muestra error, y recarga |
| CampanasPage | `should ask the server only once and say Revisando when the admin clicks another recipient while the first one is on its way` | «Revisando…» deshabilitado, un solo POST, una sola pestaña |
| CampanasPage | `should mark the button as opened when the chat opened but the recipients cannot be reloaded` | Si la recarga falla, el botón dice «Abierto» y no hay alerta |
| CampanasPage | `should open the chat with the phone and the text of the list when the server only confirms the delivery` | Si el servidor responde solo `{ destinatario }`, usa el teléfono y el texto de la lista |
| CampanasPage | `should close the recipients when Escape is pressed` | El diálogo cierra con Escape |
| CampanasPage | `should show why each member was left out or is still waiting and hide the message of the omitted ones when the law kept the campaign from some recipients` | Texto de cada motivo; el omitido sin mensaje ni botón; el que espera la franja sigue «Por enviar»; un motivo desconocido tal cual |
| MenuNotificaciones | `should open the chat with the text the server wrote for the notice of the plan when the notice is an expired membership` | Un aviso del plan abre el texto del servidor |
| MenuNotificaciones | `should not open WhatsApp and say why when the member has not accepted commercial messages` | Con 409: motivo, pestaña cerrada, no queda «Enviado» |
| MenuNotificaciones | `should take the previous reason away when the next message can be sent` | El aviso del intento anterior se quita |
| MenuNotificaciones | `should not open WhatsApp for a completed challenge when the member has not accepted commercial messages, and mark it as seen through its own route` | Felicitar por un reto es comercial; «Visto» usa `/admin/notificaciones/reto/12/leida` |
| MiembrosPage.ficha | `should not open the chat and say why when the member at risk has not accepted commercial messages` | «Avisar» a un miembro en riesgo sin aceptación: motivo, pestaña cerrada, botón sin marcar |
| MiembrosPage.ficha | `should open the chat with the unsubscribe link the server adds when the member at risk accepted commercial messages` | Con aceptación, abre el texto del servidor con el enlace de baja |
| MiembrosPage.ficha | **(2.ª)** `should keep Guardar cambios disabled and send nothing when the form is submitted while the full record is still loading` | Mientras carga: botón deshabilitado, «Cargando…», ningún PUT ni con clic ni enviando el formulario, y sin el aviso de fallo |
| MiembrosPage.ficha | **(2.ª)** `should keep Guardar cambios disabled, say why and send nothing when the full record cannot be loaded` | Si la carga falla: error, `role="status"` con el texto exacto «No se cargaron los datos completos del miembro, así que no se pueden guardar cambios. Cierra la ficha y vuelve a abrirla.», botón deshabilitado y ningún PUT |
| MiembrosPage.ficha | **(2.ª)** `should enable Guardar cambios and save the data of the full record when it arrives` | Al llegar el registro se habilita, y el PUT lleva lo del registro completo (ciudad, fecha, `acepta_mensajes_comerciales: true`, `['WHATSAPP']`) |
| MiembrosPage.ficha | **(2.ª)** `should save when Enter submits the form and the full record is loaded` | Con el registro cargado, enviar el formulario sí guarda |
| MiembrosPage.ficha | **(2.ª)** `should leave the second file untouched when the answer of the first one arrives after another file was opened` | La respuesta tardía de Ana no cambia la ficha de Carlos; no se pide el plan de Ana; el PUT va a `/admin/miembros/2` con lo de Carlos |
| MiembrosPage.ficha | **(2.ª)** `should keep loading the second file when the answer of the first one arrives before its own` | La respuesta de Ana no termina la carga de Carlos: sigue «Cargando…», sin datos de Ana y con el botón deshabilitado, hasta que llega la suya |
| MiembrosPage.ficha | **(2.ª)** `should not show the error of the first file in the second one when the first one fails after another file was opened` | El fallo tardío de Ana no pone error ni aviso en la ficha de Carlos ni le bloquea el botón |
| MiembrosPage.ficha | **(2.ª)** `should stay closed and ask for nothing else when the answer of a file arrives after the file was closed` | Cerrada con la X: la respuesta tardía no reabre el diálogo ni pide el plan |
| MiembrosPage.ficha | **(2.ª)** `should load the file again from scratch when it is reopened after a late answer was thrown away` | Al reabrir vuelve a pedir el registro, y manda la respuesta de esa apertura, no la descartada |
| MiembrosPage.ficha | **(2.ª)** `should turn the button back to Copiar código by itself when 2 seconds pass with the file still open` | A los 1999 ms sigue «Copiado»; a los 2000 vuelve «Copiar código»; no quedan timers |
| MiembrosPage.ficha | **(2.ª)** `should keep Copiado 2 seconds from the last copy when the code is copied again before it goes away` | Copiar dos veces deja un solo timer y dura 2 s desde la última copia |
| MiembrosPage.ficha | **(2.ª)** `should leave no timer pending when the file is closed with %s right after copying` (2 casos: «Cancelar» y la X) | Al cerrar la ficha `vi.getTimerCount()` pasa de 1 a 0 |
| MiembrosPage.ficha | **(2.ª)** `should leave no timer pending when the person leaves the page right after copying` | Al desmontar `vi.getTimerCount()` pasa de 1 a 0 |
| ConfigPage | **(2.ª)** `should take the success notice away by itself when 3 seconds pass with the page still open` | A los 2999 ms el aviso sigue; a los 3000 se quita; no quedan timers |
| ConfigPage | **(2.ª)** `should keep the notice 3 seconds from the last save when the admin saves again before it goes away` | Guardar dos veces deja un solo timer del aviso y dura 3 s desde el último guardado |
| ConfigPage | **(2.ª)** `should leave no timer pending when the admin leaves the page right after saving` | Al desmontar `vi.getTimerCount()` pasa de 1 a 0 |
| App | `should open the unsubscribe page without asking for a session when the link of a commercial message is visited` | `/baja/:token` es pública: muestra el botón, no redirige y no pide `/auth/me` |
| BajaMensajesPage | `should greet the member by the first name, name the gym and offer the button when the link is valid` | «Cargando…», luego el saludo, el aviso de que los del plan siguen llegando y el botón; un GET con el token |
| BajaMensajesPage | `should not unsubscribe anybody when the link is only opened` | Abrir el enlace no hace POST |
| BajaMensajesPage | `should send the token as one piece of the URL when it has characters that mean something in a URL` | El token va codificado |
| BajaMensajesPage | `should say it is already done and not offer the button when the member no longer receives commercial messages` | «Listo, Ana», sin botón ni POST |
| BajaMensajesPage | `should say the link is not valid and how to unsubscribe another way when the server does not know the token` | Con 404: «El enlace no es válido» y la alternativa |
| BajaMensajesPage | `should show %s and not say the link is invalid when the link cannot be loaded` (2 casos) | Un 503 o 500 muestra el error y no dice que el enlace es inválido |
| BajaMensajesPage | `should unsubscribe with the token and confirm it when the member presses the button` | Un POST `/baja/<token>`, «Listo, Ana», desaparece el botón |
| BajaMensajesPage | `should send a single request and say Guardando when the button is pressed twice while the first one is on its way` | Botón «Guardando…» deshabilitado y un solo POST |
| BajaMensajesPage | `should show %s and keep the button to try again when the unsubscription cannot be saved` (3 casos) | Error del API, del límite de 20 por minuto o genérico; el botón sigue; no dice «Listo» |
| BajaMensajesPage | `should take the error away and confirm when the second try works` | El segundo intento confirma y quita el error |
| BajaMensajesPage | `should go to the landing when the member clicks Ir al inicio after unsubscribing` | El enlace lleva a `/` |
| BajaMensajesPage | `should keep the member of the second link when the answer of the first one arrives later` | Una respuesta vieja no pisa la del enlace en pantalla |
| BajaMensajesPage | `should not call the second link invalid when the first one fails later` | Un error viejo tampoco |
| BajaMensajesPage | `should unsubscribe the member of the link on screen when the button is pressed after changing the link` | El POST usa el token actual |
| contactoWhatsapp | `should open a blank tab with the click, ask the server and only then take the tab to WhatsApp when the contact is allowed` | Orden: pestaña en blanco, pregunta al servidor y solo con la respuesta va a wa.me |
| contactoWhatsapp | `should cut the link between WhatsApp and the panel when the tab goes to the chat` | `opener` queda en `null` |
| contactoWhatsapp | `should still take the tab to WhatsApp when the browser does not let the opener be removed` | Si asignar `opener` lanza, igual navega |
| contactoWhatsapp | `should close the blank tab, open nothing else and return the error of the server when the contact is not allowed` | Devuelve `{ ok: false, error }`, cierra la pestaña y no abre nada |
| contactoWhatsapp | `should not try to close the tab when the person already closed it and the contact is not allowed` | No llama `close` sobre una pestaña cerrada |
| contactoWhatsapp | `should open WhatsApp in a new tab once the server allows it when %s` (3 casos) | Con bloqueador, `window.open` que lanza o pestaña cerrada: se pregunta igual y se abre con `noopener,noreferrer` |
| contactoWhatsapp | `should open nothing at all when the blank tab was blocked and the contact is not allowed` | Con bloqueador y negativa no se abre nada |
| AutorizacionesMiembro | `should start off, with no channel marked and the switch blocked when the member has not decided` | Interruptor apagado y deshabilitado, ningún canal marcado |
| AutorizacionesMiembro | `should describe the switch with the whole text the member accepts when the box is shown` | La descripción accesible es el texto v2 completo |
| AutorizacionesMiembro | `should unblock the switch without turning it on when a channel is marked` | Marcar un canal no es aceptar |
| AutorizacionesMiembro | `should turn on only with the marked channel and say where the messages will arrive when the switch is clicked` | No se marca WhatsApp por el miembro |
| AutorizacionesMiembro | `should turn the acceptance off and block the switch when the last channel is unmarked` | Quitar el último canal apaga la aceptación (decisión 12) |
| AutorizacionesMiembro | `should keep the acceptance on with the other channel when one of two channels is unmarked` | Con dos canales, quitar uno la mantiene |
| AutorizacionesMiembro | `should cancel the messages and leave the channels as they were when the switch is turned off` | Apagar conserva los canales |
| AutorizacionesMiembro | `should ask for a channel and still let the switch be turned off when an acceptance arrives without channels` | «Marca al menos un canal o apaga…» y se puede apagar |
| AutorizacionesMiembro | `should keep the acceptance and stop asking for a channel when one is marked on an acceptance that arrived without channels` | Marcar un canal en ese estado la deja válida |
| AutorizacionesMiembro | `should say that the legal representative decides when the member is a minor` | Nota del menor |
| AutorizacionesMiembro | `should not mention the representative nor show a notice when the member is an adult and nothing changed` | Sin nota ni aviso |
| AutorizacionesMiembro | `should show the notice of the form as a status message when the form gives one` | El aviso sale como `role="status"` |
| AutorizacionesMiembro | `should say there is nothing registered yet when the member has no history` | Historial vacío |
| AutorizacionesMiembro | `should say the same when the history did not arrive` | Historial ausente |
| AutorizacionesMiembro | `should tell the channels, the text version, where it was taken and who registered it when commercial messages were accepted` | «otorgada (WhatsApp y correo) · texto v2 · panel del gimnasio · registró Luis Admin» y la de la app |
| AutorizacionesMiembro | `should say the acceptance was revoked through the unsubscribe link, without channels, when the member used the link` | «no otorgada o revocada · texto v2 · enlace de baja» |
| AutorizacionesMiembro | `should not list channels when the decision was to refuse, even if the row brings them` | Una negativa no muestra canales |
| AutorizacionesMiembro | `should name the other authorizations and who gave them when the history has them` | «por el representante legal», «cumplió 18 años», términos, y tipos o canales desconocidos tal cual |
| AutorizacionesMiembro | `should keep each piece of data of the legal representative under its own field when the reception fills them` | Cada campo del representante guarda su valor |
| AutorizacionesMiembro | `should explain that the representative is required without the age when the age is not known` | Texto sin la edad |
| AutorizacionesMiembro | `should mark the field and show its error when the form reports one` | `aria-invalid` y el mensaje |
| MiembrosPage.comerciales | `should register that the member does not accept commercial messages when the switch is left as it comes` | Alta: el POST lleva `acepta_mensajes_comerciales: false, canales_comerciales: []` aunque se acepten términos y datos |
| MiembrosPage.comerciales | `should send the acceptance with only the marked channel when the reception marks WhatsApp and turns the switch on` | `true, ['WHATSAPP']` |
| MiembrosPage.comerciales | `should send both channels in the order of the server when the member accepts by email and by WhatsApp` | `['WHATSAPP','EMAIL']` |
| MiembrosPage.comerciales | `should leave the switch off and the channel unmarked when the only channel is unmarked after accepting` | Regresión de la decisión 12; el POST lleva `false, []` |
| MiembrosPage.comerciales | `should not send any channel when the channels are marked but the member did not accept` | Canales marcados sin aceptar: `false, []` |
| MiembrosPage.comerciales | `should say that the legal representative decides and send the acceptance with the data of the representative when the member is a minor` | Alta de un menor: notas, y el POST con la aceptación y los cinco datos del representante |
| MiembrosPage.comerciales | `should show the switch off and blocked, with no channel marked, when the member has not accepted` | Ficha sin aceptación |
| MiembrosPage.comerciales | `should show the switch on with the accepted channels and the record of the decision when the member accepted` | Ficha con aceptación y su constancia en el historial |
| MiembrosPage.comerciales | `should warn that the member stops receiving campaigns and send the cancellation when the switch is turned off and saved` | Aviso antes de guardar; el PUT lleva `false, []`; mensaje del servidor |
| MiembrosPage.comerciales | `should register the acceptance with the marked channel when a member who had not accepted accepts by email` | PUT `true, ['EMAIL']` |
| MiembrosPage.comerciales | `should keep the acceptance with the channel that is left when one of the two channels is unmarked` | PUT `true, ['EMAIL']` |
| MiembrosPage.comerciales | `should turn the switch off, warn and send the cancellation when the last channel is unmarked` | PUT `false, []` |
| MiembrosPage.comerciales | `should say that the representative decides and send the acceptance in the name of the minor with the data of the representative when the member is a minor` | Ficha de un menor |
| autorizaciones | `should count the completed years when %s` (5 casos) | Edad y «es menor» con la fecha fija en 2026-11-22 |
| autorizaciones | `should not guess an age when %s` (3 casos) | Sin fecha, fecha inválida o texto: `null` |
| autorizaciones | `should take the identity card as a minor and any other document as an adult when there is no birth date` | Sin fecha, TI es menor |
| autorizaciones | `should believe the birth date and not the document when both are known` | La fecha manda sobre el documento |
| autorizaciones | `should read the same day in any time zone when it gets %s` (2 casos) | `isoADate` no corre el día con la medianoche UTC del API |
| autorizaciones | `should return null when it gets %j` (5 casos) | Entradas que no son fecha ISO |
| autorizaciones | `should mark only the chosen channel when the member had no list of channels` | `cambiarCanalComercial` sin lista previa |
| autorizaciones | `should ignore a channel that is not WhatsApp nor email when it is marked` | Canal desconocido ignorado |
| autorizaciones | `should say whether the acceptance can be turned on when the channels are %j` (6 casos) | `puedeAceptarComerciales` |
| autorizaciones | `should accept the representative when every piece of data is complete, with the phone written with spaces` | Representante válido |
| autorizaciones | `should explain what is missing in each field when the representative is empty` | Los cinco mensajes |
| autorizaciones | `should reject only that field when the representative has %s` (5 casos) | Teléfono de 6 o 16 dígitos, TI como documento, nombre o documento cortos |
