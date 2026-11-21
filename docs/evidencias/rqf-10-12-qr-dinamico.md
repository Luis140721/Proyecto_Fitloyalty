# RQF-10 (campañas), RQF-12 (retos) y QR dinámico del check-in

**Fecha:** 2026-11-20. **Rama:** `feat/qr-dinamico-retos-campanas` (sobre `develop` @ `55923b6`). **Responsable:** Santiago. **Correcciones del verificador:** 2026-11-21, rama `feat/rqf-12-completo` (la de Santiago con `develop` @ `907af1a` fusionado), ver «Correcciones» al final.
**Resultado:** los dos requisitos que quedaban Pendientes en el código (RQF-10 y RQF-12) quedan implementados, y el QR del check-in pasa a ser dinámico. Pruebas, en la corrida final de `feat/rqf-12-completo`: sin base (lo que corre el CI), 25 suites y **410 pasan, 67 se saltan** (las que necesitan `TEST_DATABASE_URL`), 477 en total; con la base real, **477 de 477** en cada una de las dos bases, el esquema de producción (`ConsultasDB/Query_Inicial_Crear_Tablas.sql` de `develop` + migraciones) y el de Docker (solo migraciones). De esas, las de base real del requisito son 71 por base: `retos-campanas-real` 42, `registro-envio-real` 18 y `bandeja-mensajes-real` 11. La cifra anterior de esta línea («320 de 320») no era cierta: en el commit de Santiago (`00f8b7e`) `npm test` daba 19 suites, 332 pasan y 42 se saltan (374). Además se probó en el navegador contra la base local (capturas abajo; ver la nota sobre lo que muestra cada una).

## 1. QR dinámico (RQF-05, RQNF-03)

**Decisión.** Había dos caminos: un QR **del gimnasio** (un cartel en la entrada que el miembro escanea con la app) o un QR **dinámico del miembro**. Se eligió el dinámico porque mantiene el flujo que ya exige RQF-05 (el lector HID o la cámara de recepción leen el QR del miembro) y RQNF-04 (2 interacciones), no obliga a la app a usar la cámara y corrige el problema real: el QR fijo se podía fotografiar o reenviar y cualquiera entraba con él.

**Cómo funciona.** Es un código de un solo uso por tiempo, como los de verificación en dos pasos (TOTP, RFC 6238, con HMAC-SHA256):

- El texto del QR es `FLD<id_miembro>T<8 dígitos>` y cambia cada 30 segundos. Solo letras y números: los lectores HID escriben como un teclado y símbolos como `:` o `-` cambian según la distribución del teclado (en español `:` sale como `Ñ`).
- Cada miembro tiene un secreto = HMAC(clave del servidor, `id_miembro:codigo_qr`). No se guarda: se recalcula. Si se regenera el `codigo_qr`, los códigos viejos dejan de servir.
- La app recibe el secreto una vez (`GET /api/cliente/qr`) y calcula el código **sin internet**. La hora del servidor viene en la misma respuesta para corregir un reloj del teléfono que no esté exacto.
- El check-in acepta el paso actual, dos hacia atrás (~90 s, por la lectura o un reloj atrasado) y uno hacia adelante. Una captura de hace 2 minutos ya no entra.
- **Opción por gimnasio** (`gimnasio.qr_dinamico_obligatorio`, en Configuración): si se activa, el QR fijo se rechaza con `QR_ESTATICO_NO_PERMITIDO`. Por defecto está apagada para no dejar sin entrar a nadie al desplegar. El ingreso por documento sigue funcionando siempre.

| Qué | Dónde |
|---|---|
| Secreto, código del paso, lectura y validación del token | `backend/src/lib/qr-dinamico.js:109`, `:121`, `:142`, `:152`, `:165` |
| Check-in: reconoce el token (`:77`), lo valida (`:91`, 400 `QR_DINAMICO_VENCIDO` en `:94`) y rechaza el QR fijo si el gimnasio lo exige (`:112`) | `backend/src/routes/checkin.js:77-115` |
| La app recibe el secreto y si el gimnasio exige el dinámico | `backend/src/routes/cliente.js:261`, `:263` |
| Configuración: `qr_dinamico_obligatorio` | `backend/src/routes/config.js:41`, `:59`, `:206`; `frontend/src/pages/ConfigPage.jsx:222-223` |
| Columna nueva | `backend/migrations/015_qr_dinamico_retos_campanas.sql` (sección 1) |
| App: mismo cálculo en Dart, QR que se redibuja cada segundo con la cuenta regresiva, también en pantalla completa | `fitloyalty_cliente/lib/cliente/utils/qr_dinamico.dart`, `widgets/qr_dinamico_view.dart`, `screens/qr_tab.dart`, `screens/qr_fullscreen.dart` |
| Pruebas: vector fijo compartido por Node y Dart (`06530560`), ventana de tiempo, otro miembro, código regenerado, check-in con el token, QR fijo rechazado y documento aceptado | `backend/tests/qr-dinamico.test.js` (25), `fitloyalty_cliente/test/qr_dinamico_test.dart` (3) |

**Límite:** el secreto vive en la app del miembro, así que quien tenga el teléfono desbloqueado del miembro puede entrar como él (lo mismo que con cualquier app de acceso). La clave del servidor sale de `QR_DINAMICO_SECRET` o, si no está, de `QR_ENCRYPTION_KEY`, que todavía tiene un valor por defecto en el código (observación de RQNF-03). Desde las correcciones, en producción sin `QR_DINAMICO_SECRET` no se puede activar «Exigir QR dinámico» y el servidor lo avisa al arrancar (ver «Correcciones», punto 4).

## 2. RQF-12: retos de asistencia

> El sistema debe permitir al administrador crear retos de asistencia con meta, duración, segmento elegible y recompensa; registrar el progreso de cada miembro inscrito y notificar al administrador y al miembro al completar el reto.

| Parte del requisito | Cómo se cumple | Dónde |
|---|---|---|
| Crear retos con meta, duración, segmento y recompensa | `GET`, `POST`, `PUT` y cancelar en `/api/admin/retos`; valida meta ≥ 1, fin ≥ inicio, fin ≥ hoy y segmento (TODOS, INACTIVOS, NUEVOS, PROXIMOS_A_VENCER). El estado (PROGRAMADO, ACTIVO, terminado, CANCELADO) sale de las fechas | `backend/src/routes/retos.js:108`, `:127`, `:149`, `:187`; `lib/retos.js:57` |
| Inscribir a los miembros | Los retos de segmento TODOS inscriben solos a quien hace check-in; para los demás, «Inscribir elegibles» en el panel o «Unirme» en la app, que comprueba el segmento (403 `RETO_NO_ELEGIBLE`) | `lib/retos.js:205-217`; `routes/retos.js:238`, `:249`; `routes/cliente.js:465` |
| Registrar el progreso | En cada check-in válido se recalcula `checkins_acumulados` y `porcentaje_avance` contando los **días distintos** con ingreso dentro de las fechas del reto (hora de Colombia); recalcular en vez de sumar hace que repetir no cambie nada | `lib/retos.js:81-106`; `routes/checkin.js:250` |
| Notificar al completar | `reto_miembro` pasa a COMPLETADO con `fecha_completado`; al administrador le llega un aviso tipo RETO en la campana, con «Visto» y botón de WhatsApp para felicitar al miembro; el miembro lo ve en la pantalla del check-in y, desde las correcciones, le llega un mensaje a la bandeja de la app, por cualquiera de los cuatro caminos que completan un reto | `lib/retos.js:133`, `:160`, `:255`; `routes/notificaciones.js:176`, `:299`; `frontend/src/pages/CheckinPage.jsx:426-431`; ver «Correcciones», punto 2 |
| Pantalla | Retos: crear, editar, cancelar, participantes con su avance e inscribir elegibles | `frontend/src/pages/RetosPage.jsx`; menú en `Sidebar.jsx:10`, ruta en `App.jsx:84` |
| App del miembro | Botón «Unirme» en los retos disponibles; los completados siguen en la lista; pestaña Mensajes con contador | `fitloyalty_cliente/lib/cliente/screens/gamificacion_screen.dart`, `screens/mensajes_screen.dart`, `screens/home_screen.dart` |

## 3. RQF-10: campañas y plantillas

> El sistema debe permitir crear, programar y ejecutar campañas de mensajes dirigidas a segmentos de miembros definidos (inactivos, nuevos, próximos a vencer), con soporte para plantillas de mensaje reutilizables.

| Parte del requisito | Cómo se cumple | Dónde |
|---|---|---|
| Plantillas reutilizables | CRUD en `/api/admin/plantillas`, únicas por gimnasio; variables `{primer_nombre}`, `{nombre}`, `{gimnasio}`, `{dias_sin_venir}`, `{fecha_vencimiento}` | `routes/campanas.js:109-160`; `lib/campanas.js:42` |
| Segmentos | Inactivos (N días sin venir, 7 por defecto, sin congelados), nuevos (registrados en los últimos N días, 30), próximos a vencer (vence en N días, 7, sin congelados) y todos; vista previa con el conteo de hoy | `lib/segmentos.js:47-90`; `routes/campanas.js:252` |
| Crear | `POST /api/admin/campanas` con segmento, canal (WhatsApp o correo), plantilla o texto, y disparo manual o programado (fecha y hora de Colombia, futura) | `routes/campanas.js:267`, `:284` |
| Programar | El scheduler revisa cada 10 minutos y al arrancar; abrir la pantalla también ejecuta las vencidas, por si Render estaba dormido | `backend/src/jobs/scheduler.js:96-97`; `jobs/campanas.js`; `routes/campanas.js:228` |
| Ejecutar | Con la campaña bloqueada (`FOR UPDATE`) guarda los destinatarios del segmento y la pasa a ENVIADA: dos ejecuciones a la vez la mandan una sola vez. Correo: sale por Brevo. WhatsApp: sale solo si el servidor tiene WhatsApp conectado; si no, los destinatarios quedan pendientes y el panel los envía uno a uno con wa.me. Cada envío queda en `campana_destinatario` y en `envio_mensaje` (con `id_campana` e `id_plantilla`), como RQF-09 | `lib/campanas.js:59-96`, `:102-130`, `:135-190`; `routes/campanas.js:309`, `:336`, `:380` |
| Pantalla | Campañas: formulario con vista previa del mensaje y del segmento, lista con conteos, destinatarios y plantillas | `frontend/src/pages/CampanasPage.jsx`; menú en `Sidebar.jsx:11`, ruta en `App.jsx:92` |

**Esquema.** En producción `plantilla_mensaje`, `campana` y `campana_destinatario` ya tenían la forma que usa el código. En Docker (migración 002) eran otras y ninguna ruta las usaba; la migración 015 las reconstruye con el DDL de ConsultasDB (si tuvieran filas, las renombra a `_002` en vez de borrarlas) y agrega `campana.canal` a las dos bases. Con la 015, el `pg_dump -s` de esas tres tablas y de `envio_mensaje` sale **idéntico** en las dos bases. También se probó sobre una base de producción con los datos de `Poblar_Tablas.sql`: las 10 campañas, 8 retos y 12 plantillas de ejemplo se conservan.

**Límites:** ENVIADO por WhatsApp a mano significa que se abrió el mensaje, no que se entregó (igual que RQF-09). En Render no hay Chrome, así que allí las campañas por WhatsApp siempre quedan para enviar a mano; por correo salen solas si `BREVO_API_KEY` está configurada. El segmento ETIQUETA existe en el CHECK de producción pero no se ofrece (no hay etiquetas en la aplicación).

## Cómo se probó

Cifras de la corrida final de `feat/rqf-12-completo` (2026-11-21). Las de Santiago que había aquí («320 de 320, 18 suites») no eran ciertas: en su commit `00f8b7e` daban 19 suites, 332 pasan y 42 se saltan.

1. Toda la suite de `backend/` sin base (lo que corre el CI): **25 suites, 410 pasan y 67 se saltan** (las de base real, sin `TEST_DATABASE_URL`), 477 en total. Nuevas en las correcciones: `retos-avisos.test.js` (24) y `arranque-qr-dinamico.test.js` (2).
2. Toda la suite con la base real, en un PostgreSQL 16.16 propio (contenedor `postgres:16` solo en `127.0.0.1:55443`, borrado al terminar), en dos bases: `fl_consultas` (`ConsultasDB/Query_Inicial_Crear_Tablas.sql` de `develop` + `node src/db/migrate.js`) y `fl_migraciones` (solo las migraciones). **477 de 477 en cada una.** Las del requisito, por separado:
   ```
   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55443/fl_consultas   npx jest tests/retos-campanas-real.test.js    # 42/42
   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55443/fl_consultas   npx jest tests/registro-envio-real.test.js    # 18/18
   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55443/fl_consultas   npx jest tests/bandeja-mensajes-real.test.js  # 11/11
   (las mismas tres en fl_migraciones: 42/42, 18/18 y 11/11; legal-real.test.js: 15/15 en las dos)
   ```
   Cubre segmentos, QR dinámico (vencido, de otro gimnasio, QR fijo rechazado, 409 en producción sin `QR_DINAMICO_SECRET`), retos (validaciones, inscripción automática, avance por días distintos, los cuatro caminos que completan un reto con su aviso al gimnasio y al miembro una sola vez, cuatro recálculos a la vez que avisan una vez, cancelar con mensaje a quien iba en curso, completados visibles en la app, aislamiento entre gimnasios), la bandeja del miembro (propios frente a ajenos y entre gimnasios, la campana sin mensajes del miembro) y campañas (plantillas, WhatsApp pendiente y envío a mano, correo, WhatsApp automático, programada que se ejecuta una sola vez con dos ejecuciones a la vez, cancelar, aislamiento). Al terminar, las dos bases quedan sin gimnasios, retos ni notificaciones: cada prueba borra lo que crea.
3. `flutter analyze` sin hallazgos y `flutter test` **18 de 18** (en una copia con `sdk: ^3.12.0`, porque el Dart local es 3.12.2 y el `pubspec.yaml` pide `^3.13.2`; el código es el mismo).
4. `npm run build` del frontend sin errores.
5. En el navegador, con el backend local contra la base de Docker: crear un reto, check-in con el QR dinámico por el campo del lector (avance «1 de 2»), crear y enviar una campaña a inactivos, envío a mano por WhatsApp (queda «Enviado») y, con la opción activada en Configuración, el QR fijo rechazado.

| Captura | Qué muestra |
|---|---|
| `capturas/rqf-10-12/checkin-qr-dinamico-reto.jpg` | Ingreso registrado de «Ana Martinez (1001)», racha y «Reto «Dos visitas esta semana»: 1 de 2 asistencias». **No prueba que se usó el QR dinámico:** el campo del lector está vacío y en la imagen no aparece el token `FLD…` ni nada que diga cómo se registró; el campo «o por documento» muestra `79123456`. El check-in con el token sí está probado en `retos-campanas-real.test.js` («check-in con el QR dinámico…») y en `qr-dinamico.test.js` |
| `capturas/rqf-10-12/campana-pendiente-whatsapp.jpg` | Campaña ejecutada sin WhatsApp en el servidor: el destinatario queda «Por enviar» con el botón de WhatsApp. Ojo: el texto dice «llevas varios días sin venir» y el de la captura siguiente, del mismo destinatario, «llevas 20 días sin venir», así que las dos no salen del mismo envío |
| `capturas/rqf-10-12/campana-enviado.jpg` | Después del envío a mano: «Enviado», con el texto personalizado («llevas 20 días sin venir») |

Las capturas son de la rama de Santiago, antes de las correcciones: no muestran la bandeja del miembro ni el bloqueo del QR dinámico, que quedan probados solo con las pruebas automáticas de arriba.

## Antes de desplegar

- Las migraciones 015 y 016 corren solas al arrancar (`applyMigrations`). En producción solo agregan columnas, restricciones con los nombres de producción e índices; no reconstruyen tablas, porque ya tienen la forma de ConsultasDB. Como con la 014, conviene correrlas antes en una copia de producción dentro de `BEGIN; … ROLLBACK;`.
- Definir `QR_DINAMICO_SECRET` (y `QR_ENCRYPTION_KEY`) en Render. Sin la primera, en producción no se puede activar «Exigir QR dinámico» y el arranque lo avisa en el log. Al definirla cambian los secretos de todos los miembros: la app toma el nuevo al volver a abrir el QR y los códigos calculados con el viejo dejan de entrar.
- La app del miembro necesita una versión nueva (`crypto` en `pubspec.yaml`) para mostrar el QR dinámico y la pestaña Mensajes; la versión vieja sigue mostrando el QR fijo, que entra mientras el gimnasio no active la opción, y no ve la bandeja.

## Correcciones del verificador (2026-11-21, `feat/rqf-12-completo`)

Se conservaron los commits de Santiago; la rama sale de la suya con `develop` (`907af1a`, con el #102 legal) fusionado sin conflictos.

1. **El aviso al miembro ahora le llega.** Se trajo la bandeja del PR #75 (`origin/feat/rqf-12-retos`, `99e8858`), adaptada al código de Santiago:
   - Migración `backend/migrations/016_notificacion_destinatario.sql`: `notificacion.destinatario` (GIMNASIO o MIEMBRO, `DEFAULT 'GIMNASIO'`, `:46`), su CHECK `notificacion_destinatario_check` (`:48-58`) y el índice `idx_notificacion_miembro_destinatario` (`:60`). Lo mismo en `ConsultasDB/Query_Inicial_Crear_Tablas.sql:432`, `:437` y `:475`.
   - `GET /api/cliente/mensajes`, `PATCH /api/cliente/mensajes/leidos` y `PATCH /api/cliente/mensajes/:id/leido` en `backend/src/routes/cliente.js:540`, `:563` y `:578`, todos con el filtro `id_gimnasio = $1 AND id_miembro = $2 AND destinatario = 'MIEMBRO'` (`:530`) tomado del token: un mensaje ajeno, de otro gimnasio o del gimnasio responde 404.
   - La campana del panel solo lee y marca filas GIMNASIO: `backend/src/routes/notificaciones.js:113` (acceso bloqueado), `:176` (reto completado), `:272` y `:299` (marcar como visto).
   - App: `models/mensaje.dart`, `services/mensajes_service.dart`, `providers/mensajes_provider.dart` (con `limpiar()` para que otro miembro en el mismo teléfono no vea los mensajes del anterior), `screens/mensajes_screen.dart` y la pestaña Mensajes con contador en `screens/home_screen.dart:121` (`IconoMensajes`); el provider se registra en `lib/main.dart:62`.
2. **`avisarRetoCompletado` deja los dos avisos y la llaman los cuatro caminos.** `backend/src/lib/retos.js:133` escribe la fila GIMNASIO («Reto completado») y la MIEMBRO («¡Completaste un reto!», con la recompensa); `recalcularYAvisar` (`:160`) la llama en la misma transacción que el recálculo, solo cuando el UPDATE pasa la fila de EN_CURSO a COMPLETADO, así que sale una sola vez por miembro y reto (probado también con cuatro recálculos a la vez) y, si el aviso falla, el reto sigue EN_CURSO y se completa con su aviso en el siguiente intento. Caminos: check-in (`lib/retos.js:233`, desde `routes/checkin.js:250`), «Unirme» (`routes/cliente.js:500`, que además responde `completado`), «Inscribir elegibles» (`routes/retos.js:276`) y bajar la meta o mover las fechas (`routes/retos.js:179`).
   - Al cancelar un reto, `cancelarParticipaciones` (`lib/retos.js:183`, llamada en `routes/retos.js:200`, dentro de la transacción) pasa a CANCELADO las participaciones en curso y le deja a cada uno un mensaje «Reto cancelado»; las completadas no se tocan y cancelar dos veces no repite el mensaje.
   - Los completados siguen en la app: `GET /api/cliente/retos` (`routes/cliente.js:423`) trae los vigentes y además los que el miembro completó aunque el reto haya terminado o lo hayan cancelado (`:428`, `vigente`), primero los pendientes; fechas `AAAA-MM-DD` y `porcentaje_avance::float` (`:435`). En la app, `models/gamificacion.dart` lee el porcentaje también como texto (antes, con un reto en curso, la lista fallaba con «Error inesperado al cargar los retos», porque pg entrega NUMERIC como texto) y `screens/gamificacion_screen.dart:265` muestra «Completado el …»; «Unirme» solo sale en los vigentes (`:353`).
3. **Índice `idx_reto_miembro_miembro` unificado** como `(id_miembro, estado)`, el de la 015 (`015_qr_dinamico_retos_campanas.sql:54`), que sirve a la consulta del check-in (retos EN_CURSO de un miembro): `ConsultasDB/Query_Inicial_Crear_Tablas.sql:473` y `016_notificacion_destinatario.sql:63-73`, que rehace el índice si una base lo tiene como `(id_miembro)` (la rama del PR #75). Comprobado: en una base con el índice viejo, la 016 lo rehace; corrida otra vez, no cambia nada.
4. **Secreto del QR dinámico.** `backend/src/lib/qr-dinamico.js:67` (`secretoPropio`: ni vacío ni la clave del repositorio) y `:76` (`puedeExigirse`: fuera de producción siempre; en producción solo con `QR_DINAMICO_SECRET`). `PUT /api/admin/config` responde **409 `QR_DINAMICO_SIN_SECRETO`** con el mensaje de `:80` antes de guardar nada (`routes/config.js:186`); apagarlo, o reenviarlo encendido si ya lo estaba, sí se puede. `GET /api/admin/config` trae `qr_dinamico_disponible` (`routes/config.js:61`) y Configuración no deja marcar la casilla y dice por qué (`frontend/src/pages/ConfigPage.jsx:225`, `:230`). Al arrancar, `avisarSecretoAlArrancar` (`lib/qr-dinamico.js:90`, llamada en `backend/src/index.js:160`) escribe la advertencia, con cuántos gimnasios ya lo tienen activado. El QR fijo no cambia: sigue con `QR_ENCRYPTION_KEY`, y sus pruebas (`checkin-notificaciones`, `aislamiento`) pasan igual.
5. **Esta evidencia:** cifras corregidas con las de la corrida final, notas sobre lo que muestran las capturas y las citas archivo:línea de las tablas de arriba actualizadas (se movieron con estos cambios).

**Migraciones, probadas:** con `ConsultasDB` de `develop` + migraciones y con solo migraciones, la tabla `notificacion` sale idéntica en `pg_dump -s` (mismas columnas, CHECK e índices), y `idx_reto_miembro_miembro` es `(id_miembro, estado)` en las dos. Con el `ConsultasDB` de esta rama + migraciones, la 016 no cambia nada y `notificacion` y `reto_miembro` salen iguales que con el de `develop`. Sobre una base de producción con los datos de `Poblar_Tablas.sql`, las 20 notificaciones quedan como GIMNASIO y las 20 participaciones se conservan.
