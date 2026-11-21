# RQNF-16: mensajes a los miembros según la Ley 2300 de 2023

**Requisito:** «El sistema debe aplicar la Ley 2300 de 2023 a los mensajes que se envían a los miembros (retención, campañas y avisos de vencimiento): usar solo los canales que el miembro autorizó; enviarlos de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca domingos ni festivos; no contactar al mismo miembro más de una vez al día ni por varios canales en la misma semana; y ofrecer un mecanismo sencillo para que el miembro cancele en cualquier momento la recepción de mensajes comerciales.»
**Categoría:** Cumplimiento. **Fecha:** 2026-11-21. **Rama:** `feat/rqnf-16-ley2300`, creada desde `feat/qr-dinamico-retos-campanas` (PR #100 de Santiago, con las campañas de RQF-10) y con `develop` fusionado encima dos veces, sin rebase: primero `907af1a` (PR #102) y después `ad90d73` (PR #104 con el #100, la bandeja del miembro y la migración 016, y los PR de documentos #103 y #107).
**Resultado:** implementado en el backend, el panel y la app del miembro, con las migraciones 017 y 018. Pruebas: 647 en total, todas en verde contra las dos bases reales; 152 nuevas sin base (reglas, campañas, preferencias, envíos y vencimientos) y 19 nuevas contra cada base real.

> **Nota legal.** Los textos, las páginas legales y las reglas de este documento son una implementación técnica de la ley hecha por el equipo, no una asesoría jurídica. Conviene que los revise un abogado antes de usarlos con miembros reales.

## Base legal (Normograma de MinTIC)

| Artículo | Qué exige | Dónde se aplica |
|---|---|---|
| art. 2 | Contactar solo por los canales que el consumidor autorizó | Canales de la aceptación comercial (`canales_autorizados`) y aviso del plan solo por WhatsApp (el canal que informa el contrato) |
| art. 3 | Lunes a viernes 7:00 a. m. a 7:00 p. m. y sábados 8:00 a. m. a 3:00 p. m.; nunca domingos ni festivos. Tras un contacto, no por varios canales en la misma semana ni más de una vez al día. El consumidor puede pedir otros horarios | `lib/contacto-legal.js` (horario, festivos y frecuencia). Los otros horarios a pedido no están implementados (ver Límites) |
| art. 5 | Los mensajes comerciales y la publicidad exigen aceptación explícita y un mecanismo para cancelarlos en cualquier momento; no se puede obligar a aceptarlos | Tipo `MENSAJES_COMERCIALES` de `autorizacion_miembro`, interruptor en la app y en el panel, y enlace de baja al final de cada mensaje comercial |

## Qué cambió

### Migraciones

| Qué | Dónde |
|---|---|
| **017:** `autorizacion_miembro.canales_autorizados` (WHATSAPP y/o EMAIL) | `backend/migrations/017_mensajes_comerciales.sql:53` |
| **017:** el canal de la constancia admite `ENLACE` (baja con el enlace), además de `PANEL` y `APP` | `017:56-65` |
| **017:** CHECK de canales (solo WHATSAPP y EMAIL) y CHECK de que una aceptación comercial tenga al menos un canal | `017:67-85` |
| **017:** como las migraciones corren en orden alfabético, en una base nueva la 017 corre antes que la 019 (que crea la tabla). Por eso la 017 crea la tabla con el DDL exacto de la 019 si todavía no existe, y luego aplica sus cambios. La 019 la encuentra hecha | `017:24-51` |
| **017:** los miembros que ya existen no reciben ninguna fila: sin fila, no aceptan mensajes comerciales | `017:20-22` |
| **018:** `campana_destinatario.motivo` y el estado `OMITIDO` (se quita el CHECK sin nombre de `estado_envio`, buscándolo por su definición, y se crea uno con nombre) | `backend/migrations/018_campana_destinatario_ley2300.sql:28-50` |
| **018:** CHECK de los motivos y de que un `OMITIDO` siempre tenga motivo | `018:52-67` |

### Reglas (`backend/src/lib/contacto-legal.js`, rescatado del trabajo anterior y adaptado)

| Qué | Dónde |
|---|---|
| Hora de Colombia (`America/Bogota`, UTC−5 todo el año) con `Intl`, sin depender de la zona del servidor | `contacto-legal.js:109-126` |
| Reloj inyectable para las pruebas (`ahora`, `establecerReloj`) | `contacto-legal.js:84-91` |
| Festivos calculados cada año: fijos, Ley 51 de 1983 (al lunes siguiente) y los de la Pascua (Meeus/Jones/Butcher) | `contacto-legal.js:161-224` |
| Franjas: L-V `[7:00, 19:00)`, sábado `[8:00, 15:00)`. A las 7:00 p. m. o a las 3:00 p. m. en punto ya no se contacta | `contacto-legal.js:61-69` |
| `evaluarHorario`, `siguienteHorarioPermitido` y `describirInstante` («lunes 23 de noviembre a las 7:00 a. m.») | `contacto-legal.js:239-280` |
| Frecuencia: un contacto al día (por cualquier canal) y un solo canal por semana (lunes a domingo, hora de Colombia) | `contacto-legal.js:290-309` |
| Clases: `AVISO` (vencida, por vencer, acceso bloqueado) y `COMERCIAL` (todo lo demás: en riesgo, reto completado, campañas, sin tipo) | `contacto-legal.js:52-56`, `:313-315` |
| `puedeContactar`: permiso y canal (comercial) o canal WhatsApp (aviso), luego horario y al final frecuencia; motivos `NO_AUTORIZA`, `CANAL_NO_AUTORIZADO`, `FUERA_DE_HORARIO`, `FRECUENCIA` | `contacto-legal.js:355-396` |

### Base de datos de la ley (`backend/src/lib/contacto-miembro.js`)

| Qué | Dónde |
|---|---|
| Aceptación comercial vigente de varios miembros: la última fila `MENSAJES_COMERCIALES` (sin fila = no acepta) | `contacto-miembro.js:44-75` |
| Historial de la semana: `envio_mensaje` con estado ENVIADO (RQF-09 y campañas) y `alerta_vencimiento_enviada` (avisos automáticos) | `contacto-miembro.js:92-132` |
| Bloqueo por miembro (`pg_advisory_xact_lock`): dos envíos a la vez al mismo miembro van en fila y el segundo ve el primero | `contacto-miembro.js:139-141` |
| `registrarEnvio`: la fecha del envío es la del reloj con que se decidió | `contacto-miembro.js:159-176` |
| `guardarComerciales`: agrega una fila solo si algo cambió; aceptar sin canal es 400 `SIN_CANAL` | `contacto-miembro.js:188-220` |
| Textos v2: el de mensajes comerciales (opcional, horario, frecuencia y cómo cancelar) | `backend/src/lib/autorizaciones.js:75-81` |

### Dónde se aplican las reglas

| Mensaje | Qué se aplica | Dónde |
|---|---|---|
| **Campañas (RQF-10)** | Comercial: aceptación por el canal de la campaña, horario y frecuencia. Al ejecutarla, los que no se pueden contactar quedan `OMITIDO` con su motivo; al entregar a cada uno se vuelve a revisar con su fila bloqueada | `backend/src/lib/campanas.js:115-165` (motivo en `:144`), `:220-314` |
| | Fuera de horario no se ejecuta; «Enviar ahora» la deja programada para el siguiente horario (202 con el mensaje) | `campanas.js:343-357`; `backend/src/routes/campanas.js:385-415` |
| | Programar una campaña fuera de horario: 400 `FUERA_DE_HORARIO` con el siguiente horario | `routes/campanas.js:282-289` |
| | Si la franja se cierra a mitad del envío, el resto sigue `PENDIENTE` con motivo `FUERA_DE_HORARIO` | `campanas.js:66`, `:247-253` |
| | Enlace de baja al final de cada mensaje | `campanas.js:90-92` |
| **RQF-09** (`POST /api/admin/notificaciones/enviado`) | Clase según el tipo; con el bloqueo de contacto se revisa la ley antes de registrar; si no se puede, 409 `CONTACTO_NO_PERMITIDO` con el motivo y el siguiente horario, sin guardar nada. Al comercial se le agrega el enlace de baja | `backend/src/routes/notificaciones.js:316-329` (comentario), `:393`, `:415-437` |
| **Avisos de vencimiento** (`jobs/expiracion.js`) | Aviso del contrato: horario y frecuencia, sin permiso comercial. Fuera de horario el job no envía nada; si ya se le escribió hoy (u otro canal esta semana), queda para otro día. La revisión, el envío y la marca van en una transacción con el bloqueo | `backend/src/jobs/expiracion.js:22-35`, `:157-166`, `:234-280` |
| | El reintento diario pasa de las 3:00 p. m. a las 2:00 p. m., para que sirva también el sábado | `backend/src/jobs/scheduler.js:47-69` |

En el panel, la constancia se pide **antes** de abrir WhatsApp (`frontend/src/lib/contactoWhatsapp.js`, rescatado): la pestaña se abre en blanco con el clic y luego se lleva a wa.me, o se cierra si la ley no deja. Se usa en la campana (`frontend/src/components/MenuNotificaciones.jsx:107`), en la lista de miembros (`frontend/src/pages/MiembrosPage.jsx:913`) y en las campañas (`frontend/src/pages/CampanasPage.jsx:240-264`). Campañas muestra el horario y avisa cuando está fuera (`CampanasPage.jsx:311-318`), los omitidos con su motivo y el botón «Reintentar».

### Para cancelar los mensajes comerciales

| Mecanismo | Dónde |
|---|---|
| **App:** `GET/PATCH /api/cliente/preferencias`; constancia con canal `APP`; un menor solo puede cancelarlos (403 `REPRESENTANTE_REQUERIDO` si intenta aceptar) | `backend/src/routes/preferencias.js:110-157` (menor en `:133`) |
| **App (Flutter):** pestaña «Más» → «Mensajes del gimnasio»: interruptor y canales | `fitloyalty_cliente/lib/cliente/screens/more_tab.dart:129-133`, `fitloyalty_cliente/lib/cliente/widgets/preferencias_comerciales.dart`, `fitloyalty_cliente/lib/cliente/services/preferencias_service.dart` |
| **Enlace público** `/baja/:token`: token `<id_miembro>.<id_gimnasio>.<firma>` con HMAC-SHA256 (clave derivada de `BAJA_SECRET` o `JWT_SECRET`), sin datos personales. El GET solo muestra el primer nombre y el gimnasio; la baja la hace el POST (el botón), para que las vistas previas de WhatsApp o del correo no den de baja a nadie. Constancia con canal `ENLACE`. Límite de 20 por minuto por IP | `backend/src/lib/baja-mensajes.js`; `routes/preferencias.js:167-205`; `backend/src/index.js:99-104`, `:128-129`; `frontend/src/pages/BajaMensajesPage.jsx`, ruta en `frontend/src/App.jsx:51` |
| **Panel:** interruptor y canales en la ficha del miembro y en el alta (`CasillaMensajesComerciales`); constancia con canal `PANEL` y quien la registró; si es menor, la da el representante | `frontend/src/components/AutorizacionesMiembro.jsx:177-236`; `MiembrosPage.jsx:1578` (alta) y `:2289` (ficha); `backend/src/routes/miembros.js:369-372` (alta), `:500-507` (edición) |

### Ajustes de las campañas que pidió el verificador del #100

| Ajuste | Dónde |
|---|---|
| `GET /admin/campanas` ya no ejecuta las vencidas: solo lee; las ejecuta el scheduler | `routes/campanas.js:293-296` |
| `campanasVencidas` filtra por gimnasio en la consulta (`$1::int IS NULL OR id_gimnasio = $1`) y el scheduler toma hasta 50 de todos | `lib/campanas.js:463-475`; `routes/campanas.js:207-220` |
| La constancia manual de WhatsApp revisa el estado con la fila del destinatario bloqueada (`FOR UPDATE OF d`) dentro de la transacción: un doble clic devuelve 200 con `duplicado: true` y no agrega otra fila | `lib/campanas.js:388-458` (duplicado en `:407-420`); `routes/campanas.js:495-520` |
| Los destinatarios que quedaron `PENDIENTE` porque el proceso se cayó se reintentan: botón «Reintentar» (`POST /admin/campanas/:id/reintentar`) y el scheduler (campañas con pendientes de más de 10 minutos, solo correo o WhatsApp del servidor). Cada destinatario se toma con `FOR UPDATE SKIP LOCKED` y solo se envía si sigue `PENDIENTE` | `lib/campanas.js:220-245`, `:360-381`, `:482-497`; `routes/campanas.js:227-240`, `:417-441`; `backend/src/jobs/campanas.js` |

### Páginas legales

`frontend/src/pages/PrivacidadPage.jsx:227-265` (sección 12) y `frontend/src/pages/PoliticaDatosPage.jsx:201-235` (sección 13) describen la política tal como quedó implementada: horario y festivos, frecuencia, canales, qué es comercial, que por defecto no se aceptan, cómo cancelar y que los avisos del plan no piden la aceptación. Donde se cita el Decreto 1377 de 2013 se agregó el artículo equivalente del Decreto 1074 de 2015: art. 6 → 2.2.2.25.2.3, art. 7 → 2.2.2.25.2.4, art. 8 → 2.2.2.25.2.5 y art. 12 → 2.2.2.25.2.9 (también en `TerminosPage.jsx:98`). El art. 7 → 2.2.2.25.2.4 no venía en la lista del encargo; sale de la misma numeración consecutiva (arts. 4 a 12 del 1377 → 2.2.2.25.2.1 a .9).

## Decisiones

1. **La aceptación es una autorización más** (`MENSAJES_COMERCIALES` en `autorizacion_miembro`), no una columna de `miembro`: así tiene el mismo historial inmutable que RQNF-17 (fecha, versión del texto, canal y quien la registró), y los canales quedan en la misma fila. La vigente es la última.
2. **Por defecto nadie acepta**, tampoco los miembros que ya existen: la migración no inventa aceptaciones. El alta registra la decisión desde el primer día (una fila con `otorgada = false` si no se marca).
3. **Qué es comercial:** campañas, mensajes de retención («en riesgo»), felicitaciones de reto y cualquier mensaje sin tipo. **Qué es aviso:** vencida, por vencer y acceso bloqueado. Ante la duda, comercial (lo más estricto).
4. **El aviso del plan va solo por WhatsApp**, porque es el canal que informa el contrato (cláusula 5). No pide la aceptación comercial, pero sí el horario y la frecuencia.
5. **Frecuencia:** cuenta todos los contactos que salen del sistema (también los avisos). La semana es de lunes a domingo en hora de Colombia; el día se corta a la medianoche de Colombia.
6. **Solo el horario se espera.** Si un destinatario de campaña no se puede contactar por permiso, canal o frecuencia, queda `OMITIDO` para esa campaña; si es por horario, sigue `PENDIENTE` y sale en la siguiente franja.
7. **Fuera de horario, «Enviar ahora» programa la campaña** para el siguiente horario permitido (202, con el mensaje), en vez de rechazarla: el administrador la puede editar o cancelar mientras tanto. Programar a mano fuera de horario sí se rechaza (400), con el siguiente horario en el mensaje.
8. **En wa.me la constancia va antes de abrir el chat**, porque es la única forma de impedir el envío: el servidor no ve si la persona le dio enviar en WhatsApp. Se cuenta como contacto desde que se abre (lo más estricto para la frecuencia).
9. **El reloj de la ley** es el de Node (`lib/contacto-legal`), y los envíos se guardan con esa misma hora. En producción coincide con `NOW()`; en las pruebas se fija.
10. **Un menor** puede cancelar en la app o con el enlace, pero no aceptar: eso lo hace su representante en el gimnasio (igual que los datos sensibles en RQNF-17).
11. **El contrato y el QR de bienvenida** no pasan por estas reglas: se entregan al inscribirse, a pedido del miembro, y son parte del servicio, no mensajes comerciales ni avisos.

## Cómo se probó

Jest con configuración propia (carpeta del scratchpad, `testRegex` sobre `backend/tests/`), `NODE_PATH` del backend principal. PostgreSQL 16 en un contenedor propio (`fl-ley2300-pg`, `127.0.0.1:55444`), con tres bases:

- `fl_consultas`: `ConsultasDB/Query_Inicial_Crear_Tablas.sql` de develop `ad90d73` y luego `node src/db/migrate.js` (como producción);
- `fl_migraciones`: solo `migrate.js` (como Docker);
- `fl_orden_viejo`: todas las migraciones con 017 y 018 **después** de 019 y 020 (una base que ya tenía el #102).

En `fl_consultas` y `fl_migraciones` las migraciones 015 a 020 corrieron juntas: `migrate.js` dos veces (la segunda dice «Nada pendiente») y después 015, 016, 017, 018, 019 y 020 otra vez con `psql -v ON_ERROR_STOP=1`, sin errores. `pg_dump --schema-only` de `autorizacion_miembro` y `campana_destinatario` da el mismo esquema en las tres bases (solo cambia el token `\restrict` del volcado).

Cifras después de fusionar develop `ad90d73` (2026-11-21):

| Suite | Sin base | `fl_consultas` | `fl_migraciones` |
|---|---|---|---|
| Todo el backend (30 archivos) | 561 pasan, 86 saltadas (las reales) | 647 de 647, dos corridas | 647 de 647, dos corridas |
| `fl_orden_viejo` (las cinco suites reales) | — | 106 de 106 | — |
| App: `flutter analyze` / `flutter test` (copia con SDK `^3.12.0`) | sin problemas / 18 de 18 | — | — |

Antes de la primera fusión había 432 pruebas en el backend (383 sin base); las 45 que se sumaron con `ad90d73` son de la bandeja del miembro y los avisos de retos (#104). Las nuevas o cambiadas por RQNF-16:

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `backend/tests/contacto-legal.test.js` | 66 | Festivos completos de 2026 y 2027, Pascua de 5 años, Ley 51 (corridos y los que ya caen en lunes), bordes del horario (6:59, 7:00, 18:59, 19:00; sábado 7:59, 8:00, 14:59, 15:00), domingo, festivo, siguiente horario (fin de semana, puente festivo, Semana Santa, Nochebuena), día cortado a la medianoche de Colombia, frecuencia diaria y semanal, permiso y canal, avisos |
| `backend/tests/campanas-ley2300.test.js` | 25 | Base falsa con estado: OMITIDO con los tres motivos, por defecto nadie, semana anterior, enlace de baja firmado, correo sin correo, WhatsApp no listo, horario (4 casos), franja que se cierra, reintento (envía, no duplica, salta filas tomadas, baja intermedia), constancia manual (doble clic, fuera de horario, baja), filtro por gimnasio |
| `backend/tests/ley2300-preferencias.test.js` | 35 | App (por defecto no, aceptar, sin canal, doble toque, cancelar, menor, aislamiento), enlace (GET sin cambios, POST con ENLACE, firma alterada, otro miembro u otro gimnasio), panel y alta, y los ajustes del #102 |
| `backend/tests/ley2300-envios.test.js` | 16 | RQF-09: comercial sin aceptación (3 tipos), con aceptación y enlace de baja, canal no autorizado, avisos (3 tipos) y aviso por correo, horario (4 casos), frecuencia diaria y semanal, orden del bloqueo |
| `backend/tests/expiracion.test.js` | 24 (10 nuevas) | Domingo, festivo, antes de las 7:00, sábado a las 3:00 p. m., sábado a las 8:00, contacto de hoy, otro canal esta semana, semana pasada, sin permiso comercial, hora y transacción |
| `backend/tests/ley2300-real.test.js` | 20 (19 contra la base) | Columnas y CHECK de 017 y 018 (y que el CHECK viejo ya no está), miembro existente sin fila, app, doble toque concurrente, enlace, panel, ajustes (1) y (2), campaña con los tres motivos y la hora del reloj, otro canal en la semana, «Enviar ahora» un sábado a las 4:00 p. m. (queda programada para el lunes 23 a las 7:00 a. m.), programar en domingo, GET que no ejecuta y scheduler por gimnasio, reintento concurrente (botón y scheduler) sin duplicar, doble clic concurrente, avisos de vencimiento (domingo, frecuencia, miércoles) |
| `backend/tests/registro-envio-real.test.js`, `retos-campanas-real.test.js`, `legal-real.test.js`, `registro-envio.test.js`, `autorizaciones.test.js`, `miembros-update.test.js`, `retos-campanas.test.js` | ajustadas | Reloj fijo, aceptación comercial de sus miembros, textos v2 y contrato v3. En RQF-09, los cinco envíos a la vez al mismo miembro ahora dan un 201 y cuatro 409 `FRECUENCIA` (antes eran cinco 201): es el bloqueo de contacto funcionando |

Además: `esbuild` compila los `.jsx` cambiados y el bundle de `src/main.jsx` con todos sus imports; `flutter analyze` sobre una copia con el SDK relajado a `^3.12.0` (Flutter 3.44.8, Dart 3.12.2): **No issues found**, y `flutter test`: 18 de 18 (en la copia se creó un `assets/.env` vacío para que no avise por el asset; no se copió el `.env` real). Arranque del `app` completo de Express: `/api/baja/abc` responde 404 `ENLACE_INVALIDO` y `/api/cliente/preferencias` sin token, 401.

## Límites y riesgos

- **Otros horarios a pedido del miembro (art. 3):** no están implementados. El sistema siempre aplica la franja legal, también si el miembro pidiera otro horario (más estricto que la ley).
- **Los miembros actuales no reciben campañas** hasta que acepten (por defecto no aceptan). Las campañas de Santiago, que antes llegaban a todo el segmento, ahora llegan solo a quienes aceptaron: hay que pedir la aceptación en recepción o en la app.
- **Solo cuenta lo que pasa por el sistema:** un mensaje que el gimnasio mande por fuera (su WhatsApp personal) no entra en la frecuencia.
- **Entrega al menos una vez:** si el proceso se cae entre el envío y la constancia, el reintento puede volver a enviar ese mensaje una vez.
- **El enlace de baja no vence** y depende de la clave: si se rota `JWT_SECRET` (o `BAJA_SECRET`), los enlaces ya enviados dejan de servir; el miembro igual puede cancelar en la app o en recepción. `FRONTEND_URL` en Render debe tener como primer valor la URL pública del panel, o los enlaces irán a `localhost`.
- **Festivos:** se calculan con las reglas vigentes (fijos, Ley 51 de 1983 y Pascua). Si una ley cambia un festivo, hay que cambiar `festivosColombia`.
- **El día de vencimiento en domingo o festivo:** el job no envía ese día y el aviso de «vence hoy» se pierde (el de días antes sí sale); antes salía cualquier día.
- **Los textos v2 y el contrato v3** cambian lo que el miembro ve; las filas viejas conservan su versión. El texto de las páginas legales y de las autorizaciones lo debe revisar un abogado.
- **No se probó en un navegador ni en un teléfono:** el panel se compiló con esbuild y la app con `flutter analyze`; el flujo de abrir wa.me después de la respuesta depende de que el navegador deje la pestaña en blanco abierta (si un bloqueador la cierra, se intenta abrir de nuevo con la respuesta).
- **No se corrió contra Neon ni producción**, solo contra las tres bases locales.
- **Fusión con develop `ad90d73` (PR #104):** solo chocó `tests/retos-campanas-real.test.js`, donde se conservaron los dos ayudantes (`otraSemana` de RQNF-16 y `avisos` del #104). `routes/notificaciones.js` se fusionó solo: el filtro `destinatario = 'GIMNASIO'` del #104 en el GET y en «marcar visto» quedó junto al POST `/enviado` de RQNF-16, cuya fila de `notificacion` («Recordatorio enviado») toma el valor por defecto `GIMNASIO`. `perfil_provider.dart` y `main.dart` también se fusionaron solos.
- **Avisos de retos en la bandeja (#104):** `avisarRetoCompletado` (`backend/src/lib/retos.js:133-152`) y el aviso de reto cancelado solo escriben filas de `notificacion` (`MIEMBRO` para la bandeja de la app y `GIMNASIO` para la campana del panel). Son mensajes internos de la app, no salen por WhatsApp ni por correo, así que no pasan por las reglas de la Ley 2300 ni cuentan en la frecuencia. Si el administrador felicita al miembro por WhatsApp desde la campana, ese envío va por `POST /enviado` con el tipo `reto-completado`, que es comercial: pide la aceptación, el horario y la frecuencia.
