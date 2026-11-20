# RQF-10 (campañas), RQF-12 (retos) y QR dinámico del check-in

**Fecha:** 2026-11-20. **Rama:** `feat/qr-dinamico-retos-campanas` (sobre `develop` @ `55923b6`). **Responsable:** Santiago.
**Resultado:** los dos requisitos que quedaban Pendientes en el código (RQF-10 y RQF-12) quedan implementados, y el QR del check-in pasa a ser dinámico. Pruebas: 320 de 320 en `npm test` (lo que corre el CI) y 52 de 52 contra una base real, repetidas con el esquema de producción (`ConsultasDB/Query_Inicial_Crear_Tablas.sql` + migraciones) y con el de Docker (solo migraciones). Además se probó en el navegador contra la base local (capturas abajo).

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
| Secreto, código del paso, lectura y validación del token | `backend/src/lib/qr-dinamico.js:53`, `:65`, `:86`, `:96`, `:109` |
| Check-in: reconoce el token (`:77`), lo valida (`:91`, 400 `QR_DINAMICO_VENCIDO` en `:94`) y rechaza el QR fijo si el gimnasio lo exige (`:112`) | `backend/src/routes/checkin.js:77-115` |
| La app recibe el secreto y si el gimnasio exige el dinámico | `backend/src/routes/cliente.js:248`, `:250` |
| Configuración: `qr_dinamico_obligatorio` | `backend/src/routes/config.js:40`, `:58`, `:189`; `frontend/src/pages/ConfigPage.jsx:222-223` |
| Columna nueva | `backend/migrations/015_qr_dinamico_retos_campanas.sql` (sección 1) |
| App: mismo cálculo en Dart, QR que se redibuja cada segundo con la cuenta regresiva, también en pantalla completa | `fitloyalty_cliente/lib/cliente/utils/qr_dinamico.dart`, `widgets/qr_dinamico_view.dart`, `screens/qr_tab.dart`, `screens/qr_fullscreen.dart` |
| Pruebas: vector fijo compartido por Node y Dart (`06530560`), ventana de tiempo, otro miembro, código regenerado, check-in con el token, QR fijo rechazado y documento aceptado | `backend/tests/qr-dinamico.test.js` (25), `fitloyalty_cliente/test/qr_dinamico_test.dart` (3) |

**Límite:** el secreto vive en la app del miembro, así que quien tenga el teléfono desbloqueado del miembro puede entrar como él (lo mismo que con cualquier app de acceso). La clave del servidor sale de `QR_DINAMICO_SECRET` o, si no está, de `QR_ENCRYPTION_KEY`, que todavía tiene un valor por defecto en el código (observación de RQNF-03): conviene definir las dos en Render.

## 2. RQF-12: retos de asistencia

> El sistema debe permitir al administrador crear retos de asistencia con meta, duración, segmento elegible y recompensa; registrar el progreso de cada miembro inscrito y notificar al administrador y al miembro al completar el reto.

| Parte del requisito | Cómo se cumple | Dónde |
|---|---|---|
| Crear retos con meta, duración, segmento y recompensa | `GET`, `POST`, `PUT` y cancelar en `/api/admin/retos`; valida meta ≥ 1, fin ≥ inicio, fin ≥ hoy y segmento (TODOS, INACTIVOS, NUEVOS, PROXIMOS_A_VENCER). El estado (PROGRAMADO, ACTIVO, terminado, CANCELADO) sale de las fechas | `backend/src/routes/retos.js:103`, `:122`, `:144`, `:180`; `lib/retos.js:43` |
| Inscribir a los miembros | Los retos de segmento TODOS inscriben solos a quien hace check-in; para los demás, «Inscribir elegibles» en el panel o «Unirme» en la app, que comprueba el segmento (403 `RETO_NO_ELEGIBLE`) | `lib/retos.js:114-125`; `routes/retos.js:232`, `:243`; `routes/cliente.js:437` |
| Registrar el progreso | En cada check-in válido se recalcula `checkins_acumulados` y `porcentaje_avance` contando los **días distintos** con ingreso dentro de las fechas del reto (hora de Colombia); recalcular en vez de sumar hace que repetir no cambie nada | `lib/retos.js:67-92`; `routes/checkin.js:250` |
| Notificar al completar | `reto_miembro` pasa a COMPLETADO con `fecha_completado`; al administrador le llega un aviso tipo RETO en la campana, con «Visto» y botón de WhatsApp para felicitar al miembro; el miembro lo ve en la pantalla del check-in y en la app | `lib/retos.js:95-111`, `:168`; `routes/notificaciones.js:234`, `:283`; `frontend/src/pages/CheckinPage.jsx:426-431` |
| Pantalla | Retos: crear, editar, cancelar, participantes con su avance e inscribir elegibles | `frontend/src/pages/RetosPage.jsx`; menú en `Sidebar.jsx:10`, ruta en `App.jsx:84` |
| App del miembro | Botón «Unirme» en los retos disponibles | `fitloyalty_cliente/lib/cliente/screens/gamificacion_screen.dart` |

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

1. `npm test` en `backend/` (lo que corre el CI): **320 de 320**, 18 suites. Nuevas: `qr-dinamico.test.js` (25) y `retos-campanas.test.js` (12), sin base.
2. `retos-campanas-real.test.js` (34) y `registro-envio-real.test.js` (18, de Luis) contra PostgreSQL 18 local, que se niegan a correr si la base no es local:
   ```
   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55433/fl_consultas npx jest tests/retos-campanas-real.test.js tests/registro-envio-real.test.js   # 52/52
   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55433/fl_migr      npx jest tests/retos-campanas-real.test.js tests/registro-envio-real.test.js   # 52/52
   ```
   Cubre segmentos, QR dinámico (vencido, de otro gimnasio, QR fijo rechazado), retos (validaciones, inscripción automática, avance por días distintos, completado con aviso en la campana, unirse desde la app, recálculo al cambiar la meta, cancelar, aislamiento entre gimnasios) y campañas (plantillas, WhatsApp pendiente y envío a mano, correo, WhatsApp automático, programada que se ejecuta una sola vez con dos ejecuciones a la vez, cancelar, aislamiento).
3. `flutter analyze` sin hallazgos y `flutter test` 4 de 4.
4. `npm run build` del frontend sin errores.
5. En el navegador, con el backend local contra la base de Docker: crear un reto, check-in con el QR dinámico por el campo del lector (avance «1 de 2»), crear y enviar una campaña a inactivos, envío a mano por WhatsApp (queda «Enviado») y, con la opción activada en Configuración, el QR fijo rechazado.

| Captura | Qué muestra |
|---|---|
| `capturas/rqf-10-12/checkin-qr-dinamico-reto.jpg` | Check-in con `FLD9T…`: ingreso registrado, racha y «Reto «Dos visitas esta semana»: 1 de 2 asistencias» |
| `capturas/rqf-10-12/campana-pendiente-whatsapp.jpg` | Campaña ejecutada sin WhatsApp en el servidor: el destinatario queda «Por enviar» con el botón de WhatsApp |
| `capturas/rqf-10-12/campana-enviado.jpg` | Después del envío a mano: «Enviado», con el texto personalizado («llevas 20 días sin venir») |

## Antes de desplegar

- La migración 015 corre sola al arrancar (`applyMigrations`). En producción solo agrega columnas, restricciones con los nombres de producción e índices; no reconstruye tablas, porque ya tienen la forma de ConsultasDB. Como con la 014, conviene correrla antes en una copia de producción dentro de `BEGIN; … ROLLBACK;`.
- Definir `QR_DINAMICO_SECRET` (y `QR_ENCRYPTION_KEY`) en Render.
- La app del miembro necesita una versión nueva (`crypto` en `pubspec.yaml`) para mostrar el QR dinámico; la versión vieja sigue mostrando el QR fijo, que entra mientras el gimnasio no active la opción.
