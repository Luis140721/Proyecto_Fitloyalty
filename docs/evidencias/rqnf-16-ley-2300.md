# RQNF-16: mensajes a los miembros según la Ley 2300 de 2023

**Requisito:** «El sistema debe aplicar la Ley 2300 de 2023 a los mensajes que se envían a los miembros (retención, campañas y avisos de vencimiento): usar solo los canales que el miembro autorizó; enviarlos de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca domingos ni festivos; no contactar al mismo miembro más de una vez al día ni por varios canales en la misma semana; y ofrecer un mecanismo sencillo para que el miembro cancele en cualquier momento la recepción de mensajes comerciales.»
**Categoría:** Cumplimiento. **Fecha:** 2026-11-21. **Rama:** `feat/rqnf-16-ley2300`, creada desde `feat/qr-dinamico-retos-campanas` (PR #100 de Santiago, con las campañas de RQF-10) y con `develop` fusionado encima dos veces, sin rebase: primero `907af1a` (PR #102) y después `ad90d73` (PR #104 con el #100, la bandeja del miembro y la migración 016, y los PR de documentos #103 y #107).
**Resultado:** implementado en el backend, el panel y la app del miembro, con las migraciones 017 y 018. Pruebas: 683 en el backend, todas en verde contra las dos bases reales (también con la base adelantada a `Pacific/Kiritimati`); 181 nuevas sin base (reglas, campañas, preferencias, envíos, vencimientos y mutaciones), 26 nuevas contra cada base real, 5 de widget en la app y 9 de `node --test` en el panel.

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
| Hora de Colombia (`America/Bogota`, UTC−5 todo el año) con `Intl`, sin depender de la zona del servidor | `contacto-legal.js:120-137` |
| Reloj inyectable para las pruebas (`ahora`, `establecerReloj`) | `contacto-legal.js:95-102` |
| Festivos calculados cada año: fijos, Ley 51 de 1983 (al lunes siguiente), los de la Pascua (Meeus/Jones/Butcher) y, desde 2026, la Virgen de Chiquinquirá (9 de julio al lunes siguiente, Ley 2578 de 2026): 19 por año | `contacto-legal.js:35-46` (comentario), `:172-238` (Chiquinquirá en `:226-228`) |
| Franjas: L-V `[7:00, 19:00)`, sábado `[8:00, 15:00)`. A las 7:00 p. m. o a las 3:00 p. m. en punto ya no se contacta | `contacto-legal.js:72-79` |
| `evaluarHorario`, `siguienteHorarioPermitido` y `describirInstante` («lunes 23 de noviembre a las 7:00 a. m.») | `contacto-legal.js:254-294` |
| Frecuencia: un contacto al día (por cualquier canal) y un solo canal por semana (lunes a domingo, hora de Colombia) | `contacto-legal.js:305-321` |
| Clases pedidas: `AVISO` (vencida, por vencer, acceso bloqueado) y `COMERCIAL` (todo lo demás: en riesgo, reto completado, campañas, sin tipo). En RQF-09 el servidor confirma el aviso con el plan (ver abajo) | `contacto-legal.js:57-61`, `:328-330` |
| `puedeContactar`: permiso y canal (comercial) o canal WhatsApp (aviso), luego horario y al final frecuencia; motivos `NO_AUTORIZA`, `CANAL_NO_AUTORIZADO`, `FUERA_DE_HORARIO`, `FRECUENCIA` | `contacto-legal.js:370-411` |

### Base de datos de la ley (`backend/src/lib/contacto-miembro.js`)

| Qué | Dónde |
|---|---|
| Aceptación comercial vigente de varios miembros: la última fila `MENSAJES_COMERCIALES` (sin fila = no acepta) | `contacto-miembro.js:44-74` |
| Historial de la semana: `envio_mensaje` con estado ENVIADO (RQF-09 y campañas) y `alerta_vencimiento_enviada` (avisos automáticos) | `contacto-miembro.js:92-132` |
| Bloqueo por miembro (`pg_advisory_xact_lock`): dos envíos a la vez al mismo miembro van en fila y el segundo ve el primero | `contacto-miembro.js:139-141` |
| `registrarEnvio`: la fecha del envío es la del reloj con que se decidió | `contacto-miembro.js:159-174` |
| `guardarComerciales`: agrega una fila solo si algo cambió; aceptar sin canal es 400 `SIN_CANAL` | `contacto-miembro.js:188-216` |
| Textos v2: el de mensajes comerciales (opcional, horario, frecuencia y cómo cancelar) | `backend/src/lib/autorizaciones.js:75-81` |

### Dónde se aplican las reglas

| Mensaje | Qué se aplica | Dónde |
|---|---|---|
| **Campañas (RQF-10)** | Comercial: aceptación por el canal de la campaña, horario y frecuencia. Al ejecutarla, los que no se pueden contactar quedan `OMITIDO` con su motivo; al entregar a cada uno se vuelve a revisar con su fila bloqueada | `backend/src/lib/campanas.js:115-164` (motivo en `:144`), `:220-314` |
| | Fuera de horario no se ejecuta; «Enviar ahora» la deja programada para el siguiente horario (202 con el mensaje) | `campanas.js:343-353`; `backend/src/routes/campanas.js:385-415` |
| | Programar una campaña fuera de horario: 400 `FUERA_DE_HORARIO` con el siguiente horario | `routes/campanas.js:282-289` |
| | Si la franja se cierra a mitad del envío, el resto sigue `PENDIENTE` con motivo `FUERA_DE_HORARIO` | `campanas.js:66`, `:247-253` |
| | Enlace de baja al final de cada mensaje | `campanas.js:90-92` |
| **RQF-09** (`POST /api/admin/notificaciones/enviado`) | La clase la decide el servidor: un tipo de aviso solo es AVISO si el miembro está activo y su último plan lo confirma (vencida: venció hace 30 días o menos y no está congelado; por vencer: vence entre hoy y los días de aviso del gimnasio; acceso bloqueado: hay un bloqueo de las últimas 24 h y sigue sin poder entrar); si no, es COMERCIAL (`aviso_no_confirmado` y la razón en el 409). Si es AVISO, el texto que se registra y se abre es el de la plantilla del servidor. Con el bloqueo de contacto se revisa la ley antes de registrar; si no se puede, 409 `CONTACTO_NO_PERMITIDO` con el motivo y el siguiente horario, sin guardar nada. Al comercial se le agrega el enlace de baja | `backend/src/routes/notificaciones.js:340-367` (comentario), `:422-492` (`claseDelEnvio`; el miembro inactivo en `:455-457`), `:515`, `:529-562`; la campana (GET) usa el mismo tope de «vencida» (`:147-162`) y la misma frase de cada aviso (`datoAviso`, `:55-72`) |
| **Avisos de vencimiento** (`jobs/expiracion.js`) | Aviso del contrato: horario y frecuencia, sin permiso comercial. Fuera de horario el job no envía nada; si ya se le escribió hoy (u otro canal esta semana), queda para otro día. La revisión, el envío y la marca van en una transacción con el bloqueo | `backend/src/jobs/expiracion.js:22-35`, `:157-166`, `:234-280` |
| | El reintento diario pasa de las 3:00 p. m. a las 2:00 p. m., para que sirva también el sábado | `backend/src/jobs/scheduler.js:47-69` |

En el panel, la constancia se pide **antes** de abrir WhatsApp (`frontend/src/lib/contactoWhatsapp.js`, rescatado): la pestaña se abre en blanco con el clic y luego se lleva a wa.me, o se cierra si la ley no deja. Se usa en la campana (`frontend/src/components/MenuNotificaciones.jsx:107`), en la lista de miembros (`frontend/src/pages/MiembrosPage.jsx:892`) y en las campañas (`frontend/src/pages/CampanasPage.jsx:240-264`). Campañas muestra el horario y avisa cuando está fuera (`CampanasPage.jsx:311-318`), los omitidos con su motivo y el botón «Reintentar».

### Para cancelar los mensajes comerciales

| Mecanismo | Dónde |
|---|---|
| **App:** `GET/PATCH /api/cliente/preferencias`; constancia con canal `APP`; un menor solo puede cancelarlos (403 `REPRESENTANTE_REQUERIDO` si intenta aceptar) | `backend/src/routes/preferencias.js:110-149` (menor en `:133`) |
| **App (Flutter):** pestaña «Más» → «Mensajes del gimnasio»: interruptor y canales | `fitloyalty_cliente/lib/cliente/screens/more_tab.dart:129-133`, `fitloyalty_cliente/lib/cliente/widgets/preferencias_comerciales.dart`, `fitloyalty_cliente/lib/cliente/services/preferencias_service.dart` |
| **Enlace público** `/baja/:token`: token `<id_miembro>.<id_gimnasio>.<firma>` con HMAC-SHA256 (clave derivada de `BAJA_SECRET` o `JWT_SECRET`), sin datos personales. El GET solo muestra el primer nombre y el gimnasio; la baja la hace el POST (el botón), para que las vistas previas de WhatsApp o del correo no den de baja a nadie. Constancia con canal `ENLACE`. Límite de 20 por minuto por IP | `backend/src/lib/baja-mensajes.js`; `routes/preferencias.js:167-194`; `backend/src/index.js:99-104`, `:128-129`; `frontend/src/pages/BajaMensajesPage.jsx`, ruta en `frontend/src/App.jsx:51` |
| **Panel:** interruptor y canales en la ficha del miembro y en el alta (`CasillaMensajesComerciales`); constancia con canal `PANEL` y quien la registró; si es menor, la da el representante | `frontend/src/components/AutorizacionesMiembro.jsx:178-246`; `MiembrosPage.jsx:1557` (alta) y `:2268` (ficha); `backend/src/routes/miembros.js:369-372` (alta), `:500-507` (edición) |

### Ajustes de las campañas que pidió el verificador del #100

| Ajuste | Dónde |
|---|---|
| `GET /admin/campanas` ya no ejecuta las vencidas: solo lee; las ejecuta el scheduler | `routes/campanas.js:293-296` |
| `campanasVencidas` filtra por gimnasio en la consulta (`$1::int IS NULL OR id_gimnasio = $1`) y el scheduler toma hasta 50 de todos | `lib/campanas.js:463-474`; `routes/campanas.js:207-220` |
| La constancia manual de WhatsApp revisa el estado con la fila del destinatario bloqueada (`FOR UPDATE OF d`) dentro de la transacción: un doble clic devuelve 200 con `duplicado: true` y no agrega otra fila | `lib/campanas.js:388-457` (duplicado en `:407-420`); `routes/campanas.js:495-520` |
| Los destinatarios que quedaron `PENDIENTE` porque el proceso se cayó se reintentan: botón «Reintentar» (`POST /admin/campanas/:id/reintentar`) y el scheduler (campañas con pendientes de más de 10 minutos, solo correo o WhatsApp del servidor). Cada destinatario se toma con `FOR UPDATE SKIP LOCKED` y solo se envía si sigue `PENDIENTE` | `lib/campanas.js:220-245`, `:360-374`, `:482-496`; `routes/campanas.js:227-240`, `:417-441`; `backend/src/jobs/campanas.js` |

### Páginas legales

`frontend/src/pages/PrivacidadPage.jsx:227-265` (sección 12) y `frontend/src/pages/PoliticaDatosPage.jsx:201-235` (sección 13) describen la política tal como quedó implementada: horario y festivos, frecuencia, canales, qué es comercial, que por defecto no se aceptan, cómo cancelar y que los avisos del plan no piden la aceptación. Donde se cita el Decreto 1377 de 2013 se agregó el artículo equivalente del Decreto 1074 de 2015: art. 6 → 2.2.2.25.2.3, art. 7 → 2.2.2.25.2.4, art. 8 → 2.2.2.25.2.5 y art. 12 → 2.2.2.25.2.9 (también en `TerminosPage.jsx:98`). El art. 7 → 2.2.2.25.2.4 no venía en la lista del encargo; sale de la misma numeración consecutiva (arts. 4 a 12 del 1377 → 2.2.2.25.2.1 a .9).

## Decisiones

1. **La aceptación es una autorización más** (`MENSAJES_COMERCIALES` en `autorizacion_miembro`), no una columna de `miembro`: así tiene el mismo historial inmutable que RQNF-17 (fecha, versión del texto, canal y quien la registró), y los canales quedan en la misma fila. La vigente es la última.
2. **Por defecto nadie acepta**, tampoco los miembros que ya existen: la migración no inventa aceptaciones. El alta registra la decisión desde el primer día (una fila con `otorgada = false` si no se marca).
3. **Qué es comercial:** campañas, mensajes de retención («en riesgo»), felicitaciones de reto y cualquier mensaje sin tipo. **Qué es aviso:** vencida, por vencer y acceso bloqueado. Ante la duda, comercial (lo más estricto). En RQF-09 el `tipo` que manda el panel no basta: el servidor confirma el aviso con el último plan del miembro y, si no lo confirma (por ejemplo, `vencida` con el plan al día y un texto de retención), lo trata como comercial. Un miembro inactivo no confirma ningún aviso: el envío se trata como comercial. Sin aceptación responde 409 con `aviso_no_confirmado` y la razón «el miembro está inactivo»; si el miembro había aceptado mensajes comerciales por ese canal, sale como COMERCIAL, con el enlace de baja.
4. **El aviso del plan va solo por WhatsApp**, porque es el canal que informa el contrato (cláusula 5). No pide la aceptación comercial, pero sí el horario y la frecuencia.
5. **Frecuencia:** cuenta todos los contactos que salen del sistema (también los avisos). La semana es de lunes a domingo en hora de Colombia; el día se corta a la medianoche de Colombia.
6. **Solo el horario se espera.** Si un destinatario de campaña no se puede contactar por permiso, canal o frecuencia, queda `OMITIDO` para esa campaña; si es por horario, sigue `PENDIENTE` y sale en la siguiente franja.
7. **Fuera de horario, «Enviar ahora» programa la campaña** para el siguiente horario permitido (202, con el mensaje), en vez de rechazarla: el administrador la puede editar o cancelar mientras tanto. Programar a mano fuera de horario sí se rechaza (400), con el siguiente horario en el mensaje.
8. **En wa.me la constancia va antes de abrir el chat**, porque es la única forma de impedir el envío: el servidor no ve si la persona le dio enviar en WhatsApp. Se cuenta como contacto desde que se abre (lo más estricto para la frecuencia).
9. **El reloj de la ley** es el de Node (`lib/contacto-legal`), y los envíos se guardan con esa misma hora. En producción coincide con `NOW()`; en las pruebas se fija.
10. **Un menor** puede cancelar en la app o con el enlace, pero no aceptar: eso lo hace su representante en el gimnasio (igual que los datos sensibles en RQNF-17).
11. **El contrato y el QR de bienvenida** no pasan por estas reglas: se entregan al inscribirse, a pedido del miembro, y son parte del servicio, no mensajes comerciales ni avisos.
12. **Nada se marca solo.** El texto dice «por los canales que marco»: en la app y en el panel, para aceptar hay que marcar antes al menos un canal; el interruptor no se enciende sin canal y no se elige WhatsApp por el miembro (`fitloyalty_cliente/lib/cliente/widgets/preferencias_comerciales.dart`, `frontend/src/components/AutorizacionesMiembro.jsx:178-246`). En el panel, quitar el último canal apaga la aceptación, en el alta y en la ficha: la regla está en `cambiarCanalComercial` (`frontend/src/lib/autorizaciones.js`) y el alta aplica los dos cambios del mismo evento sobre el formulario anterior (`setForm((prev) => aplicarCambio(prev, …))`, `frontend/src/lib/formularioMiembro.js`; antes el segundo cambio pisaba al primero y quedaba WhatsApp marcado con el interruptor apagado). En la app no se deja quitar el último canal con el interruptor encendido.
13. **Festivo nuevo:** la Virgen de Chiquinquirá. La Ley 2578 del 1 de junio de 2026 la declara festivo el 9 de julio con el descanso de la Ley 51 de 1983, o sea el lunes siguiente si no cae en lunes (art. 6), y rige desde su promulgación (art. 7), en el Diario Oficial 53.510 del 2 de junio de 2026 (texto en SUIN-Juriscol). Se calcula desde 2026; en 2025 y antes no se cuenta. 2029 es el caso sin traslado: el 9 de julio cae en lunes.
14. **«Vencida» es aviso solo 30 días** (`DIAS_AVISO_VENCIDA`, `backend/src/lib/contacto-legal.js:63-67`): dentro de ese plazo «tu plan venció, renuévalo» es un aviso del contrato; después es un mensaje para recuperar al cliente, o sea comercial, y pide la aceptación. La campana del panel solo ofrece como aviso las vencidas de ese plazo, y el POST responde 409 con `aviso_no_confirmado` y la razón («el plan venció hace más de 30 días») si se le pide una más vieja.
15. **El texto del aviso lo arma el servidor.** Si la clase es AVISO, la constancia guarda el texto de la plantilla de la campana (`mensajeParaMiembro` con `datoAviso`), no el `mensaje` que manda el panel, y es el que se abre en WhatsApp (`texto_del_servidor: true`; en un comercial, `false`). Así un «aviso» no puede llevar un texto de promoción.

## Cómo se probó

Jest con configuración propia (carpeta del scratchpad, `testRegex` sobre `backend/tests/`), `NODE_PATH` del backend principal. PostgreSQL 16 en un contenedor propio (`fl-ley2300-pg`, `127.0.0.1:55444`), con tres bases:

- `fl_consultas`: `ConsultasDB/Query_Inicial_Crear_Tablas.sql` de develop `ad90d73` y luego `node src/db/migrate.js` (como producción);
- `fl_migraciones`: solo `migrate.js` (como Docker);
- `fl_orden_viejo`: todas las migraciones con 017 y 018 **después** de 019 y 020 (una base que ya tenía el #102).

En `fl_consultas` y `fl_migraciones` las migraciones 015 a 020 corrieron juntas: `migrate.js` dos veces (la segunda dice «Nada pendiente») y después 015, 016, 017, 018, 019 y 020 otra vez con `psql -v ON_ERROR_STOP=1`, sin errores. `pg_dump --schema-only` de `autorizacion_miembro` y `campana_destinatario` da el mismo esquema en las tres bases (solo cambia el token `\restrict` del volcado).

Cifras después de fusionar develop `ad90d73` y de las tres rondas de ajustes de la revisión del PR #108 (2026-11-21):

| Suite | Sin base | `fl_consultas` | `fl_migraciones` |
|---|---|---|---|
| Todo el backend (31 archivos) | 590 pasan, 93 saltadas (las reales) | 683 de 683 | 683 de 683 |
| Todo el backend con la base adelantada (`ALTER DATABASE … SET timezone = 'Pacific/Kiritimati'`, UTC+14: `CURRENT_DATE` de la base es el 22 de noviembre y en Colombia es el 21) | — | 683 de 683 | 683 de 683 |
| App: `flutter analyze` / `flutter test` (copia con SDK `^3.12.0`) | sin problemas / 23 de 23 | — | — |
| Panel: `node --test tests/formularioMiembro.test.js tests/fechas.test.js` (desde `frontend/`) | 16 de 16 | — | — |

El panel se prueba nombrando los archivos: `node --test tests/` (la carpeta) falla en Node 24. Las tres suites reales que cambió este PR y que tardan más (`registro-envio-real`, `legal-real` y `ley2300-real`) ponen `jest.setTimeout(30000)` en una línea al principio, porque con la máquina cargada sus hooks pasaban de 5 s.

Con la base adelantada ninguna regla del código falló: la campana, el POST y el job cuentan los días del plan con el `CURRENT_DATE` de la base, y las pruebas reales arman las fechas de los planes con esa misma fecha. La prueba que no lo hacía era la del plan de Eva en `ley2300-real` (fechas de Colombia calculadas en JS): con la base adelantada fallaba, y ahora usa `CURRENT_DATE - 28` y `CURRENT_DATE + 2` (`backend/tests/ley2300-real.test.js`, ver la mutación abajo). Las demás que este PR agrega o cambia y usan la fecha de Colombia en JS no la comparan con la de la base: `hoyMas` programa campañas (en domingo en `ley2300-real`, el siguiente día hábil en `retos-campanas-real`), que el código también cuenta en hora de Colombia, y `nacido()` arma una edad con 10 días de margen. Los planes de `retos-campanas-real` son del #100 (este PR no los cambió): también usan la fecha de Colombia y pasaron con la base adelantada.

Antes de los ajustes del #108 eran 647, después de la primera ronda 671 (dos corridas en cada base) y después de la segunda 679; la tercera base (`fl_orden_viejo`) pasó las cinco suites reales, 106 de 106. Antes de la primera fusión había 432 pruebas en el backend (383 sin base); las 45 que se sumaron con `ad90d73` son de la bandeja del miembro y los avisos de retos (#104). Las nuevas o cambiadas por RQNF-16:

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `backend/tests/contacto-legal.test.js` | 67 | Festivos completos de 2026 y 2027 (19 cada año, con la Virgen de Chiquinquirá el 13-jul-2026 y el 12-jul-2027; no se cuenta antes de 2026), Pascua de 5 años, Ley 51 (corridos y los que ya caen en lunes), bordes del horario (6:59, 7:00, 18:59, 19:00; sábado 7:59, 8:00, 14:59, 15:00), domingo, festivo, siguiente horario (fin de semana, puente festivo, Semana Santa, Nochebuena), día cortado a la medianoche de Colombia, frecuencia diaria y semanal, permiso y canal, avisos |
| `backend/tests/campanas-ley2300.test.js` | 25 | Base falsa con estado: OMITIDO con los tres motivos, por defecto nadie, semana anterior, enlace de baja firmado, correo sin correo, WhatsApp no listo, horario (4 casos), franja que se cierra, reintento (envía, no duplica, salta filas tomadas, baja intermedia), constancia manual (doble clic, fuera de horario, baja), filtro por gimnasio |
| `backend/tests/ley2300-preferencias.test.js` | 35 | App (por defecto no, aceptar, sin canal, doble toque, cancelar, menor, aislamiento), enlace (GET sin cambios, POST con ENLACE, firma alterada, otro miembro u otro gimnasio), panel y alta, y los ajustes del #102 |
| `backend/tests/ley2300-envios.test.js` | 33 | RQF-09: comercial sin aceptación (3 tipos), con aceptación y enlace de baja (`texto_del_servidor: false`), canal no autorizado, avisos confirmados por el plan (3 tipos) con el texto del servidor aunque el panel mande otro, y aviso por correo; el texto cubre «vence hoy», congelada y sin plan; borde de 30 y 31 días de «vencida»; avisos **no** confirmados que pasan a comercial (11 casos: plan al día, sin plan, congelado, vencido hace 400 días, fuera de los días de aviso, ya vencido, sin bloqueo en 24 h y miembro inactivo con «vencida» o con «acceso bloqueado»); el miembro inactivo da 409 con su razón y, activo, el mismo plan es AVISO; horario (4 casos), frecuencia diaria y semanal, orden del bloqueo |
| `backend/tests/ley2300-mutaciones.test.js` | 11 | Las mutaciones que sobrevivieron en la revisión del #108: un envío FALLIDO o PENDIENTE no cuenta en la frecuencia y uno ENVIADO sí; los avisos automáticos de vencimiento sí cuentan (mismo día y otro canal en la semana); semana pasada; tabla de avisos ausente; el scheduler programa el reintento a las 14:00 (y no a las 15:00) en hora de Colombia; la firma del enlace de baja incluye el gimnasio y el miembro, probada en `lib/baja-mensajes.js` sin el filtro de la ruta |
| `fitloyalty_cliente/test/preferencias_comerciales_test.dart` | 5 | Widget de la app: sin canal el interruptor no se enciende y no se marca WhatsApp solo; marcar con el interruptor apagado no guarda; al encenderlo se guarda solo el canal marcado; apagarlo cancela; no se puede quitar el último canal; un menor no puede encenderlo pero sí apagarlo |
| `frontend/tests/formularioMiembro.test.js` | 9 | Panel, alta de miembro: `cambiarCanalComercial` (marca solo lo marcado, quitar el último canal apaga la aceptación, sin canal no se enciende); dos cambios en el mismo evento con `setForm((prev) => …)` dejan todo apagado y sin canales, y la versión anterior (`{ ...form }`) reproduce el defecto; el precio sugerido por plan y el estado del pago siguen igual, y un precio con centavos (`NUMERIC(10,2)`) se redondea al peso |
| `backend/tests/expiracion.test.js` | 24 (10 nuevas) | Domingo, festivo, antes de las 7:00, sábado a las 3:00 p. m., sábado a las 8:00, contacto de hoy, otro canal esta semana, semana pasada, sin permiso comercial, hora y transacción |
| `backend/tests/ley2300-real.test.js` | 27 (26 contra la base; desde el 22 de noviembre, 28 y todas contra la base) | Columnas y CHECK de 017 y 018 (y que el CHECK viejo ya no está), miembro existente sin fila, app, doble toque concurrente, enlace, panel, ajustes (1) y (2), RQF-09 con `vencida` y el plan al día (409 comercial) y `por-vencer` confirmado; «vencida» hace 30 días es AVISO con el texto del servidor y hace 31 o «vence hoy» es comercial; la campana ofrece la de 30 y no la de 31, con el mismo texto que registra el POST; «acceso bloqueado» con un bloqueo de hace 23 h es AVISO, de hace 25 h u otra notificación (otro tipo, otro título o para la app del miembro) no; un miembro inactivo no confirma el aviso (409 con la razón y sin constancia); un FALLIDO de hoy que no cuenta y un aviso automático de hoy que sí, campaña con los tres motivos y la hora del reloj, otro canal en la semana, «Enviar ahora» un sábado a las 4:00 p. m. (queda programada para el lunes 23 a las 7:00 a. m.), programar en domingo, GET que no ejecuta y scheduler por gimnasio, reintento concurrente (botón y scheduler) sin duplicar, doble clic concurrente, avisos de vencimiento (domingo, frecuencia, miércoles) |
| `backend/tests/registro-envio-real.test.js`, `retos-campanas-real.test.js`, `legal-real.test.js`, `registro-envio.test.js`, `autorizaciones.test.js`, `miembros-update.test.js`, `retos-campanas.test.js` | ajustadas | Reloj fijo, aceptación comercial de sus miembros, textos v2 y contrato v3. En RQF-09, los cinco envíos a la vez al mismo miembro ahora dan un 201 y cuatro 409 `FRECUENCIA` (antes eran cinco 201): es el bloqueo de contacto funcionando |

Además: `esbuild` compila los `.jsx` cambiados y el bundle de `src/main.jsx` con todos sus imports; `flutter analyze` sobre una copia con el SDK relajado a `^3.12.0` (Flutter 3.44.8, Dart 3.12.2): **No issues found**, y `flutter test`: 23 de 23 (en la copia se creó un `assets/.env` vacío para que no avise por el asset; no se copió el `.env` real). Arranque del `app` completo de Express: `/api/baja/abc` responde 404 `ENLACE_INVALIDO` y `/api/cliente/preferencias` sin token, 401.

**Mutaciones a mano (segunda ronda del #108).** Cada una se aplicó al código, se corrieron `ley2300-envios`, `ley2300-real`, `registro-envio`, `registro-envio-real` y `contacto-legal` sin base y contra `fl_migraciones`, y se revirtió (el `md5sum` de los archivos quedó igual que antes). Todas mueren:

| Mutación | Sin base | Con base |
|---|---|---|
| Bloqueo: `INTERVAL '24 hours'` → `'30 days'` | sobrevive | muere (1) |
| Bloqueo: sin `tipo = $3 AND titulo = $4` | sobrevive | muere (1) |
| «vencida»: `fecha_fin < CURRENT_DATE` → `<=` | sobrevive | muere (1) |
| Tope de 30 días quitado del POST | muere (2) | muere (3) |
| Tope del POST en 31 días | muere (1) | muere (2) |
| `DIAS_AVISO_VENCIDA = 31` | muere (1) | muere (3) |
| Tope de 30 días quitado del GET de la campana | sobrevive | muere (1) |
| Chiquinquirá `f(7, 9)` → `f(7, 10)` | muere (1) | muere (1) |
| Texto del aviso: el del panel en vez del del servidor | muere (7) | muere (9) |

**Mutaciones a mano (tercera ronda del #108).** Igual, con `ley2300-envios`, `ley2300-real`, `registro-envio` y `registro-envio-real` sin base y contra `fl_migraciones` (ya adelantada a `Pacific/Kiritimati`), y la del panel con `node --test tests/formularioMiembro.test.js`. Se revirtieron y el `md5sum` quedó igual. Todas mueren:

| Mutación | Sin base | Con base |
|---|---|---|
| `texto_del_servidor: clase === 'AVISO'` → `true` | muere (1) | muere (1) |
| Bloqueo: sin `destinatario = 'GIMNASIO'` | sobrevive | muere (1) |
| Sin la regla del miembro inactivo | muere (3) | muere (4) |
| Panel: `String(Math.round(sugerido))` → `String(sugerido)` | muere (1) | — |
| La prueba de Eva con las fechas de Colombia en JS en vez de `CURRENT_DATE` (se muta la prueba, no el código) | — (es real) | falla (1) |

Las cinco que sobreviven sin base son de SQL (las cuatro de la segunda ronda y la de `destinatario`) y solo las mata la base real, que es donde se prueba el SQL. El arreglo del alta del panel no se puede mutar desde `node --test` (está en un `.jsx`); la prueba reproduce las dos versiones con un arnés que encola las actualizaciones como React y muestra que la anterior deja WhatsApp marcado y la nueva no.

## Después de fusionar el bootcamp de pruebas (2026-11-22)

El 22 de noviembre se fusionó en esta rama `develop` con el bootcamp de pruebas (#48, `d9e5c8d`) y después con las fotos de la landing (#114, `f3a1a71`). Lo de «Cómo se probó» describe la verificación original; esto es lo que cambió.

**Cómo se corre ahora.** El proyecto pasó de npm a pnpm y las pruebas contra base real ya no leen `TEST_DATABASE_URL`: usan la BD de pruebas del proyecto (`backend/tests/integracion/bd-pruebas.js`: `DATABASE_URL` del entorno del proceso, solo `127.0.0.1:5433` y una base terminada en `_test`). `ley2300-real.test.js` se pasó a esa guardia y se sumó a `test:integracion` (`backend/package.json`), así que **el job `integracion` del CI la corre contra PostgreSQL 16 y falla si alguna prueba se salta**. Su prueba propia de la guardia se quitó (la guardia se prueba en `tests/integracion/guardia-bd.test.js`) y se le sumaron dos: quedan 28, todas contra la base.

```bash
pnpm --dir backend test                # sin base: las de integración se saltan
DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test   pnpm --dir backend run test:integracion
TZ=UTC pnpm --dir frontend test
pnpm --dir e2e test
```

**Cifras del 22 de noviembre** (Windows 11, Node 24; integración y E2E en contenedores con PostgreSQL 16.15, sin puertos publicados):

| Job del CI | Resultado | Cobertura (umbral) |
|---|---|---|
| `backend` (`pnpm test`) | 1329 pasan y 242 se saltan (las de integración), 60 suites | sentencias 92,44 % (90), ramas 86,11 % (84), funciones 91,88 % (89), líneas 93,28 % (91) |
| `integracion` | 262 de 262, ninguna saltada (10 suites; `ley2300-real` 28, `legal-real` 7, `registro-envio-real` 9) | — |
| `frontend` (`pnpm test`) | 798 de 798, 46 archivos | líneas y sentencias 87,16 % (85), ramas 93,60 % (92), funciones 95,96 % (93) |
| `e2e` (Playwright) | 44 de 44, ninguna saltada ni inestable | — |

Las dos suites reales que siguen con `TEST_DATABASE_URL` (`retos-campanas-real` y `bandeja-mensajes-real`, de RQF-10 y RQF-12) también pasan contra esa base: 53 de 53. Ningún umbral de cobertura cambió.

**Pruebas del bootcamp adaptadas.** 41 pruebas del bootcamp estaban escritas contra el comportamiento anterior a la Ley 2300 y fallaban (25 en el backend, 16 en el panel). Se adaptaron sin quitar casos, y el código nuevo del panel quedó cubierto con pruebas en el estilo del bootcamp. La tabla prueba por prueba (qué afirmaba, qué afirma y por qué) está en [`rqnf-16-pruebas-bootcamp.md`](rqnf-16-pruebas-bootcamp.md).

**Errores que destaparon esas pruebas, corregidos en este PR:**

| # | Qué pasaba | Arreglo | Dónde | Prueba |
|---|---|---|---|---|
| 1 | El envío a mano de una campaña armaba el texto sin la fecha de vencimiento ni los días sin venir: la constancia y el chat decían «llevas varios días sin venir… Tu plan vence el .», distinto de lo que el panel había mostrado. Afectaba todo WhatsApp a mano, que es el único camino en Render | `registrarEnvioManual` trae los mismos datos que `destinatariosDeCampana` | `backend/src/lib/campanas.js` | `campanas-rutas.test.js` («…exactly the message the recipients list shows…») y `ley2300-real.test.js` («el texto que se registra es el de la lista…»), que falla si se quita el arreglo |
| 2 | Sin el módulo de WhatsApp en el servidor, un destinatario sin teléfono quedaba `PENDIENTE` para siempre: el panel no ofrece el botón y nada lo sacaba de ahí. Antes de este PR quedaba `FALLIDO` | Con módulo o sin él, quien no tiene teléfono queda `FALLIDO` (`SIN_TELEFONO`); quien sí tiene sigue `PENDIENTE` para el envío a mano | `backend/src/lib/campanas.js` (`entregarPendientes`) | Las tres pruebas del bootcamp que lo afirmaban vuelven a su forma original (`fallidos: 1, pendientes: 2`) |
| 3 | En la ficha del miembro, «Guardar cambios» estaba activo mientras cargaba el registro, o si la carga fallaba. El formulario era entonces la fila de la lista, y guardarlo vaciaba campos y registraba una revocación (datos sensibles y, con este PR, mensajes comerciales) que nadie decidió | El botón espera al registro completo, se avisa si no cargó, y la respuesta tardía de otra ficha no pisa la que está en pantalla | `frontend/src/pages/MiembrosPage.jsx` | `MiembrosPage.ficha.test.jsx`, bloque «la ficha solo se guarda con el registro completo» (9 pruebas) |
| 4 | `POST /admin/campanas/:id/reintentar` respondía 503 si la campaña dejaba de estar `ENVIADA` entre la lectura y el reintento | 409 `CAMPANA_NO_EJECUTABLE` | `backend/src/routes/campanas.js` | `campanas-rutas.test.js` (2 casos) |
| 5 | Los mensajes de horario terminaban en «a. m..» | La frase ya no agrega otro punto | `backend/src/lib/campanas.js`, `backend/src/routes/campanas.js`, `frontend/src/pages/CampanasPage.jsx` | Las pruebas comparan el texto completo |
| 6 | El aviso de guardado de Configuración (3 s) y el «Copiado» del QR (2 s) dejaban un timer vivo al salir de la página; en la corrida de pruebas podía dispararse con la página ya desmontada y tumbarla («window is not defined») | El timer se guarda y se cancela al salir (y al cerrar la ficha) | `frontend/src/pages/ConfigPage.jsx`, `frontend/src/pages/MiembrosPage.jsx` | `ConfigPage.test.jsx` (3) y `MiembrosPage.ficha.test.jsx` (5) |

**Quinta revisión independiente (22 de noviembre, sobre `e3f4ebd`).** No encontró nada que bloqueara. Reprodujo las cifras, corrió 17 cambios temporales propios y probó contra PostgreSQL el arreglo 2 con tres reintentos a la vez. De sus observaciones salieron estos arreglos, ya en la rama:

| # | Qué pasaba | Arreglo | Dónde | Prueba |
|---|---|---|---|---|
| 7 | En la ficha, el plan del miembro anterior seguía en pantalla al abrir otra ficha (siempre después de «Guardar cambios», y también si el plan, «Guardar plan» o «Congelar» de la primera contestaban tarde). «Guardar plan» lo guardaba en el miembro equivocado. Es anterior a este PR | Al abrir una ficha se limpia lo de la anterior, y el plan, el QR, el guardado del plan y el congelamiento recuerdan la ficha desde la que salieron: lo que llega tarde no se muestra en otra | `frontend/src/pages/MiembrosPage.jsx` | `MiembrosPage.entreFichas.test.jsx` (19) |
| 8 | La ficha mandaba la aceptación de mensajes comerciales en cada guardado, tal como había llegado. Si el miembro se daba de baja por el enlace o la app con la ficha abierta, guardar cualquier otro campo registraba una aceptación nueva (canal PANEL) que nadie decidió | La aceptación solo viaja si el personal la cambió en esa ficha | `frontend/src/pages/MiembrosPage.jsx` (`comercialesCargados`, `mismaDecisionComercial`) | `MiembrosPage.comerciales.test.jsx` (7 nuevas) y cuatro ajustadas en `MiembrosPage.ficha.test.jsx` |
| 9 | La lista de destinatarios y la constancia del envío a mano leían los datos del mensaje con dos consultas copiadas: así nació el error 1 | Comparten `DATOS_DEL_MENSAJE` y `PLAN_VIGENTE` | `backend/src/lib/campanas.js` | Las del error 1 |
| 10 | Menores: un 200 sin el registro del miembro habilitaba el guardado con la fila de la lista; los timers del arreglo 6 aún podían nacer si la respuesta llegaba con la página ya desmontada; el 429 del enlace de baja no llevaba `code` | Se trata como carga fallida; no se crea el timer; `code: 'RATE_LIMITED'` | `MiembrosPage.jsx`, `ConfigPage.jsx`, `backend/src/index.js` | `MiembrosPage.ficha.test.jsx`, `ConfigPage.test.jsx`, `contrato-front.test.js` |

El arreglo 2 quedó además con prueba contra la base real (`ley2300-real.test.js`: «sin WhatsApp en el servidor, quien no tiene un telefono valido queda FALLIDO…»), que falla si se quita.

**Lo que se vio y no se cambió** (menor; no guarda datos en el miembro equivocado):
- En la ficha, «Guardando…» y «Congelando…» son un solo estado para todas las fichas: si se abre otra ficha mientras la anterior sigue guardando su plan, el botón del plan sale ocupado hasta que conteste.
- Después de guardar un plan o congelar, la lista se recarga con el texto de búsqueda de cuando se pulsó el botón; si entre tanto se cambió la búsqueda, la lista puede no coincidir con el buscador hasta la siguiente búsqueda.
- La autorización de datos sensibles (RQNF-17, #102) sí sigue viajando en cada guardado de la ficha: si el miembro la revocara desde la app con la ficha abierta, guardar la ficha la volvería a registrar. Es el mismo patrón del arreglo 8 y queda para un PR de RQNF-17.
- Si un envío sale y su constancia falla, el reintento puede enviarlo otra vez (ver «Entrega al menos una vez» abajo).

## Límites y riesgos

- **Otros horarios a pedido del miembro (art. 3):** no están implementados. El sistema siempre aplica la franja legal, también si el miembro pidiera otro horario (más estricto que la ley).
- **Los miembros actuales no reciben campañas** hasta que acepten (por defecto no aceptan). Las campañas de Santiago, que antes llegaban a todo el segmento, ahora llegan solo a quienes aceptaron: hay que pedir la aceptación en recepción o en la app.
- **Los mensajes «en riesgo» de RQF-09 también quedan bloqueados** mientras nadie acepte: son de retención (comerciales), así que el botón de WhatsApp de la campana y de la lista de miembros responde «no ha aceptado recibir mensajes comerciales» y no abre el chat. Lo mismo las felicitaciones de reto por WhatsApp. Los avisos del plan (vencida, por vencer, acceso bloqueado) sí salen, si el plan los confirma.
- **Solo cuenta lo que pasa por el sistema:** un mensaje que el gimnasio mande por fuera (su WhatsApp personal) no entra en la frecuencia.
- **Entrega al menos una vez:** si el proceso se cae entre el envío y la constancia, el reintento puede volver a enviar ese mensaje una vez.
- **El enlace de baja no vence** y depende de la clave: si se rota `JWT_SECRET` (o `BAJA_SECRET`), los enlaces ya enviados dejan de servir; el miembro igual puede cancelar en la app o en recepción. `FRONTEND_URL` en Render debe tener como primer valor la URL pública del panel, o los enlaces irán a `localhost`.
- **Festivos:** se calculan con las reglas vigentes (fijos, Ley 51 de 1983, Pascua y, desde 2026, la Virgen de Chiquinquirá de la Ley 2578 de 2026, arts. 6 y 7, Diario Oficial 53.510: 19 festivos por año). Si una ley cambia un festivo, hay que cambiar `festivosColombia`.
- **Tope de 30 días de «vencida»:** pasado ese plazo, avisarle a un miembro que su plan venció ya es comercial y necesita su aceptación; la campana deja de mostrarlo como aviso. El plazo es una decisión del equipo (`DIAS_AVISO_VENCIDA`), no un número de la ley: conviene que lo confirme quien revise la parte legal. La lista de miembros sigue ofreciendo «Avisar» a un vencido de más de 30 días; si no aceptó mensajes comerciales, el POST lo explica y no abre el chat.
- **«Acceso bloqueado» no tiene el tope de 30 días** y el POST no exige que la notificación del bloqueo siga sin leer: basta un ingreso bloqueado de las últimas 24 h y que el miembro siga sin poder entrar, aunque el plan haya vencido hace meses o el administrador ya haya marcado el aviso como visto (la campana sí lo exige: solo muestra los no leídos). En este aviso la campana tampoco filtra los inactivos: si se desactiva a alguien dentro de esas 24 h, la campana lo sigue mostrando y el POST responde que no es un aviso (el miembro está inactivo).
- **Con los recordatorios de cobro apagados** (Configuración), la campana no ofrece «vencida» ni «por vencer», pero el POST las sigue aceptando como AVISO si el plan las confirma (por ejemplo, desde «Avisar» en la lista de miembros).
- **Entre las 7:00 p. m. y la medianoche de Colombia**, con la base en UTC, el `CURRENT_DATE` de la base ya es el día siguiente: la campana cuenta los días del plan con esa fecha y puede mostrar un día de más. A esa hora el POST responde siempre 409 (`FUERA_DE_HORARIO`, o `NO_AUTORIZA` si es un comercial sin aceptación, porque el permiso se revisa antes que el horario), así que con ese conteo no se registra ni se abre nada.
- **El texto final lo envía el administrador desde su WhatsApp.** El sistema registra el texto propuesto (en un aviso, el de la plantilla del servidor) y abre el chat con él, pero no puede impedir que el administrador lo cambie antes de enviarlo ni comprobar que lo envió.
- **El día de vencimiento en domingo o festivo:** el job no envía ese día y el aviso de «vence hoy» se pierde (el de días antes sí sale); antes salía cualquier día.
- **Los textos v2 y el contrato v3** cambian lo que el miembro ve; las filas viejas conservan su versión. El texto de las páginas legales y de las autorizaciones lo debe revisar un abogado.
- **No se probó en un navegador ni en un teléfono:** el panel se compiló con esbuild y la app con `flutter analyze`; el flujo de abrir wa.me después de la respuesta depende de que el navegador deje la pestaña en blanco abierta (si un bloqueador la cierra, se intenta abrir de nuevo con la respuesta).
- **No se corrió contra Neon ni producción**, solo contra las tres bases locales.
- **Fusión con develop `ad90d73` (PR #104):** solo chocó `tests/retos-campanas-real.test.js`, donde se conservaron los dos ayudantes (`otraSemana` de RQNF-16 y `avisos` del #104). `routes/notificaciones.js` se fusionó solo: el filtro `destinatario = 'GIMNASIO'` del #104 en el GET y en «marcar visto» quedó junto al POST `/enviado` de RQNF-16, cuya fila de `notificacion` («Recordatorio enviado») toma el valor por defecto `GIMNASIO`. `perfil_provider.dart` y `main.dart` también se fusionaron solos.
- **Avisos de retos en la bandeja (#104):** `avisarRetoCompletado` (`backend/src/lib/retos.js:133-152`) y el aviso de reto cancelado solo escriben filas de `notificacion` (`MIEMBRO` para la bandeja de la app y `GIMNASIO` para la campana del panel). Son mensajes internos de la app, no salen por WhatsApp ni por correo, así que no pasan por las reglas de la Ley 2300 ni cuentan en la frecuencia. Si el administrador felicita al miembro por WhatsApp desde la campana, ese envío va por `POST /enviado` con el tipo `reto-completado`, que es comercial: pide la aceptación, el horario y la frecuencia.
