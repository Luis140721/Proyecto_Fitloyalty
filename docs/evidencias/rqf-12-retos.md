# RQF-12: retos de asistencia

**Requisito:** «El sistema debe permitir al administrador crear retos de asistencia con meta, duración, segmento elegible y recompensa; registrar el progreso de cada miembro inscrito y notificar al administrador y al miembro al completar el reto.»
**Historias:** HU-28 (crear), HU-29 (progreso), HU-30 (editar), HU-31 (notificar), HU-49 (inscribir) y HU-50 (cancelar). **Issue relacionado:** #46 (bandeja de la app del miembro).
**Fecha:** 2026-11-17. **Código:** rama `feat/rqf-12-retos`, sobre `develop` @ `2794bc5`.
**Resultado:** el administrador crea, edita, cancela y sigue los retos desde Configuración; el check-in inscribe por segmento, suma el progreso y, al llegar a la meta, marca el reto como completado una sola vez y avisa en la campana y en la app del miembro, que ahora tiene bandeja de mensajes. Se probó contra una base creada con `ConsultasDB` y otra creada con las migraciones: 29 de 29 pruebas en cada una.

## Lo que había

- Las tablas `reto` y `reto_miembro` en las dos bases, pero con columnas distintas: Docker (`002_esquema_inicial.sql:278-301`) tenía `meta`, `premio`, `progreso` y `completado`; producción (`ConsultasDB/Query_Inicial_Crear_Tablas.sql`) tiene `meta_asistencias`, `recompensa`, `segmento_elegible`, `estado`, `checkins_acumulados`, `porcentaje_avance` y `fecha_inscripcion`. La migración 009 había agregado a Docker casi todas las de producción.
- `GET /api/cliente/retos`, que la app listaba, sin filtrar por segmento.
- Nada creaba retos, el check-in no tocaba `reto_miembro` y nadie avisaba al completar.

## Qué cambió

### Base de datos

| Qué | Dónde |
|---|---|
| **015**: `notificacion.destinatario` (`GIMNASIO` o `MIEMBRO`, DEFAULT `GIMNASIO`), su CHECK con el nombre que le da PostgreSQL en ConsultasDB y el índice `(id_miembro, destinatario, leida)` | `backend/migrations/015_notificacion_destinatario.sql:31-47` |
| **016**: `reto.creado_por` con su FK y `reto_miembro.fecha_inscripcion`, como en producción | `016_reto_como_produccion.sql:38-52` |
| 016: las columnas viejas de Docker (`meta`, `premio`, `tipo`, `progreso`, `completado`) se pasan a las de producción donde estas están vacías y se quitan | `016_reto_como_produccion.sql:55-93` |
| 016: segmento `TODOS` y porcentaje para los retos viejos de Docker; NOT NULL, `nombre VARCHAR(100)` y `reto_check` (fin ≥ inicio), cada uno solo si los datos lo permiten | `016_reto_como_produccion.sql:97-132` |
| 016: los índices de producción que Docker no tenía y `idx_reto_miembro_miembro` para el check-in | `016_reto_como_produccion.sql:136-139` |
| ConsultasDB: la columna y el CHECK de la 015, al final de `notificacion`, y los dos índices nuevos | `ConsultasDB/Query_Inicial_Crear_Tablas.sql:432`, `:437`, `:472-473` |

No hizo falta una columna de segmento: `reto.segmento_elegible` ya existe en producción y en Docker (009).

### Backend

| Qué | Dónde |
|---|---|
| Segmentos en SQL: `TODOS`, `NUEVOS` (registro en los últimos 30 días), `INACTIVOS` (sin ingreso válido en los últimos N días, con N el umbral amarillo del gimnasio; sin contar el ingreso actual) y `PROXIMOS_A_VENCER` (último plan no congelado que vence entre hoy y 7 días) | `backend/src/lib/retos.js:42-76` |
| Reto vigente: activo, no cancelado y con el día de hoy **en Colombia** entre sus fechas | `lib/retos.js:27`, `:39-40` |
| `registrarProgresoRetos`: si el gimnasio no tiene retos vigentes, una consulta y nada más (`:122-126`); si tiene, en una transacción inscribe en los de su segmento (`:133-151`), suma 1 en las inscripciones `EN_CURSO` y marca `COMPLETADO` con fecha al llegar a la meta (`:155-170`), deja los dos avisos (`:174-182`) y confirma (`:184`). Ante cualquier error, `ROLLBACK` y `null` (`:201-204`): nunca lanza | `lib/retos.js:117-208` |
| El check-in llama a la gamificación y a los retos a la vez y devuelve `retos` en la respuesta; los ingresos rechazados (vencido, congelado, sin plan) y los repetidos de la ventana antirrebote responden antes y no llegan ahí | `backend/src/routes/checkin.js:211-229` |
| CRUD del administrador, solo rol administrador y filtrado por el gimnasio del token: listar con inscritos y completados (`:122`), crear con `creado_por` (`:153`), editar (`:190`), cancelar (`:282`) y progreso con filtro `?estado=` (`:344`) | `backend/src/routes/retos.js` |
| Validación (zod): nombre 1-100, descripción hasta 500, meta entera 1-1000, recompensa obligatoria hasta 200, segmento de la lista y fechas AAAA-MM-DD que existan; fin ≥ inicio y fin ≥ hoy | `routes/retos.js:68-117` |
| Editar: `FOR UPDATE`, 404 si es de otro gimnasio, 409 `RETO_CANCELADO` o `RETO_FINALIZADO`; con inscritos, 409 `RETO_CON_INSCRITOS` si cambia la meta, las fechas o el segmento (el nombre, la descripción y la recompensa sí se cambian) | `routes/retos.js:207-242` |
| Cancelar (HU-50): estado `CANCELADO`, deja de sumar, las inscripciones `EN_CURSO` pasan a `CANCELADO` con su progreso y a cada una le llega un mensaje en la app; las completadas no se tocan | `routes/retos.js:282-336` |
| Avisos de retos completados para la campana (administrador y recepción): `GET /api/admin/retos/avisos` y `POST /api/admin/retos/avisos/:id/leida`, solo `destinatario = 'GIMNASIO'` | `routes/retos.js:395-465` |
| Montaje del router | `backend/src/index.js:115` |
| La campana (`GET /api/admin/notificaciones`) lee el acceso bloqueado solo con `destinatario = 'GIMNASIO'`; es el único cambio en ese archivo | `backend/src/routes/notificaciones.js:112` |
| Bandeja del miembro (issue #46): `GET /api/cliente/mensajes` con `{ mensajes, no_leidos }` (`:464`), `PATCH /mensajes/leidos` (`:487`) y `PATCH /mensajes/:id/leido` (`:502`, 404 si es ajeno), siempre con el miembro y el gimnasio del token y `destinatario = 'MIEMBRO'` (`:454`) | `backend/src/routes/cliente.js:442-519` |
| `GET /api/cliente/retos`: los vigentes en los que participa o para los que hoy es elegible, y los que ya completó; fechas como AAAA-MM-DD y el porcentaje como número | `cliente.js:403-440` |

### Panel web

| Qué | Dónde |
|---|---|
| Sección «Retos de asistencia» en Configuración, debajo de Hitos y con su mismo estilo: lista con estado, segmento, meta, fechas, recompensa, inscritos y completados; progreso de cada inscrito con barra y filtro por estado; crear, editar (con inscritos solo nombre, descripción y recompensa), «Usar de base» y cancelar con confirmación | `frontend/src/components/RetosConfig.jsx`, `frontend/src/pages/ConfigPage.jsx:6`, `:329` |
| La campana suma los avisos de retos completados (si esa consulta falla, los demás se muestran igual) y los marca como vistos por su ruta; para ellos no sale «Sin teléfono» | `frontend/src/components/MenuNotificaciones.jsx:31-34`, `:52-55`, `:92`, `:210` |
| El check-in muestra «🎯 ¡Completaste el reto X!» con la recompensa, y el avance de los demás retos | `frontend/src/pages/CheckinPage.jsx:424-436` |

### App del miembro (Flutter)

| Qué | Dónde |
|---|---|
| `PATCH` en el cliente HTTP | `fitloyalty_cliente/lib/cliente/services/api_client.dart:91`, `:138` |
| Modelo, servicio y provider de la bandeja | `models/mensaje.dart`, `services/mensajes_service.dart`, `providers/mensajes_provider.dart` (registrado en `lib/main.dart:62`) |
| Pantalla «Mensajes»: lista con fecha y punto de no leído, deslizar para refrescar, tocar para marcar leído y «Marcar todo como leido» | `screens/mensajes_screen.dart` |
| Quinta pestaña con campana y contador (`Badge`), que se refresca al entrar, al volver a la app y al abrir la pestaña | `screens/home_screen.dart:29`, `:51`, `:63-72`, `:101-111` |
| Retos: el progreso también en los completados, la recompensa a la vista («Ganaste: …. Reclamala en recepcion.», sin tildes como el resto de la app), cuándo termina o empieza y, si no está inscrito, la meta y que se inscribe con su próximo ingreso | `screens/gamificacion_screen.dart:263-368` |
| El modelo lee el porcentaje como número o como texto (antes, el NUMERIC llegaba como texto y el `as num?` fallaba) y `elegible` | `models/gamificacion.dart:120-147` |

## Decisiones

- **Columnas de producción.** El pedido habla de `meta`, `premio` y `POR_VENCER`, pero en producción las columnas son `meta_asistencias` y `recompensa`, y el CHECK `reto_segmento_elegible_check` solo admite `PROXIMOS_A_VENCER` (el mismo nombre que usa `campana.segmento`). Se usan esos nombres en la base y en la API; `POR_VENCER` responde 400. `ETIQUETA` cabe en el CHECK, pero no se ofrece: las etiquetas de comportamiento no tienen pantalla.
- **Inscripción en el check-in (HU-49).** El miembro queda inscrito con su primer ingreso válido dentro de las fechas si en ese momento es del segmento, y ese ingreso ya suma. Después sigue inscrito aunque deje de ser del segmento: un inactivo que vuelve deja de ser inactivo justo con ese ingreso. No hay inscripción manual desde el panel.
- **INACTIVOS** usa `configuracion_gimnasio.umbral_alerta_amarilla` (7 si el gimnasio no tiene fila) y, como `jobs/abandono.js`, quien nunca vino cuenta desde su fecha de registro. El ingreso que se está registrando no cuenta (`c.id_checkin <> $3`).
- **Progreso.** Cada check-in válido suma 1 (la meta es un número de check-ins, como el hito de total de asistencias), también dos en el mismo día si están fuera de la ventana antirrebote.
- **Completado una sola vez.** El `UPDATE` solo toca inscripciones `EN_CURSO` y cambia a `COMPLETADO` en la misma sentencia. Si dos ingresos llegan a la vez, el segundo espera el bloqueo de la fila, la vuelve a leer ya completada y no la toca, así que los avisos (que van en la misma transacción) salen una vez. La inscripción usa `ON CONFLICT DO NOTHING` y va ordenada por `id_reto` para que dos transacciones no se bloqueen en cruz.
- **Tolerancia a fallos.** Igual que la gamificación: `registrarProgresoRetos` nunca lanza; si algo falla, se deshace su transacción, el ingreso queda registrado y la respuesta trae `retos: null`.
- **Avisos.** Dos filas en `notificacion` con `tipo = 'RETO'`: `GIMNASIO` («Ana completó el reto «X». Recompensa: Y.») y `MIEMBRO` («¡Completaste el reto «X»! Tu recompensa: Y. Reclámala en recepción.»). Los avisos de retos de la campana se sirven desde `routes/retos.js` y el frontend los junta con los demás, porque en `notificaciones.js` solo se tocó el filtro de la lectura (otro ejecutor trabaja en ese archivo).
- **Fechas en hora de Colombia.** Un ingreso a las 8 p. m. del último día cuenta aunque en UTC ya sea el día siguiente. Las fechas salen como texto AAAA-MM-DD para que el navegador y la app no las corran un día.
- **Editar con inscritos (HU-30).** No se cambian las reglas para no alterar el progreso de quien ya va avanzando; mandar el mismo valor no cuenta como cambio.
- **Cancelar (HU-50)** no borra: en producción las FK de `reto_miembro` no tienen CASCADE y el progreso se conserva.

## Migraciones: prueba en los dos esquemas

Contenedor propio `fl-rqf12-pg` (`postgres:16`, solo en `127.0.0.1:55437`), cuatro bases:

| Base | Cómo se creó |
|---|---|
| `fl_consultas` | `ConsultasDB/Query_Inicial_Crear_Tablas.sql` de esta rama y `node src/db/migrate.js` (002 a 016), como queda producción: el servidor aplica las migraciones al arrancar |
| `fl_consultas_dev` | el `Query_Inicial_Crear_Tablas.sql` de `develop`, sin `destinatario` (como Neon hoy), y `migrate.js`: aquí la 015 sí agrega la columna |
| `fl_migraciones` | solo `migrate.js` (Docker) |
| `fl_docker_datos` | migraciones 002 a 008, un reto y dos inscripciones con las columnas viejas (`meta = 10`, `premio`, `progreso = 4`, `completado = TRUE`) y después 009 a 016 |

- `migrate.js` aplicó las 17 migraciones sin error en las tres primeras.
- **Idempotencia:** después se corrieron la 015 y la 016 dos veces más en cada base con `psql -v ON_ERROR_STOP=1`. Sin errores, y el `pg_dump --schema-only` de `notificacion`, `reto` y `reto_miembro` quedó idéntico al de antes en las cuatro.
- **Comparación entre bases** (`pg_dump --schema-only`):
  - `notificacion`: **idéntica** en las cuatro (columnas, orden, CHECK, FK e índices).
  - `reto` y `reto_miembro`: idénticas entre `fl_consultas` y `fl_consultas_dev`. Frente a Docker solo cambian el orden de las columnas y el `ON DELETE CASCADE` de las FK de Docker; tipos, NOT NULL, defaults, CHECK (con los mismos nombres) e índices son iguales.
- **Datos viejos de Docker:** en `fl_docker_datos` el reto quedó con `meta_asistencias = 10`, `recompensa = 'Camiseta'` y `segmento_elegible = 'TODOS'`; las inscripciones, con `checkins_acumulados` 4 (40 %) en curso y 10 (100 %) `COMPLETADO`, y `fecha_inscripcion` llena.

## Cómo se probó

### Pruebas con la base simulada: `backend/tests/retos.test.js` (53)

- `registrarProgresoRetos` (9): sin retos vigentes, una consulta y sin transacción; con reto, el orden `BEGIN`, inscripción, progreso, `COMMIT`, con el gimnasio, el miembro y el check-in del ingreso; la inscripción lleva los cuatro segmentos, el umbral del gimnasio, `ON CONFLICT` y la condición de vigencia; el progreso solo toca `EN_CURSO`; al completar, los dos avisos antes del `COMMIT` con sus textos; si falla, `ROLLBACK`, suelta la conexión y devuelve `null`; sin id de check-in pasa 0; los textos sin recompensa.
- Check-in (4): 201 con `retos` y el id del ingreso nuevo; si los retos fallan, 201 y `retos: null`; vencido y repetido no tocan los retos.
- CRUD (29): crear con el gimnasio y el usuario del token (aunque el cuerpo traiga otro `id_gimnasio`); 11 casos de validación con 400 sin escribir (sin nombre, sin recompensa, meta 0, decimal o texto, segmento desconocido, `POR_VENCER`, fecha mal escrita o inexistente, fin antes del inicio, reto ya terminado); un reto de un día; 403 para recepción y miembros; listar filtra por gimnasio; id inválido 400; editar (otro gimnasio 404 con `ROLLBACK`, reglas con inscritos 409, nombre y recompensa sí, fechas revalidadas, cancelado o terminado 409, nada que cambiar 400); cancelar (avisos a los inscritos en curso, sin avisos si no hay, 409 y 404, 503 con `ROLLBACK`); progreso (404 de otro gimnasio, filtro, estado inválido 400).
- Campana (4): los avisos de retos filtran `destinatario = 'GIMNASIO'`; marcar visto uno de otro gimnasio, 404; el miembro, 403; `GET /admin/notificaciones` lee el acceso bloqueado con `destinatario = 'GIMNASIO'`.
- Bandeja (7): solo el miembro y el gimnasio del token con `destinatario = 'MIEMBRO'` (y el límite se recorta a 100); marcar ajeno 404; propio 200 con el contador; todos; id inválido 400 y token del personal 403; base caída 503; `/cliente/retos` con el segmento.

### Prueba contra el esquema real: `backend/tests/retos-real.test.js` (29)

Levanta los routers reales de retos, check-in, notificaciones y de la app sobre `TEST_DATABASE_URL` y los llama por HTTP. **Guardia** igual a la de `registro-envio-real.test.js`: el host sale del parser de pg y se revisa la URL y lo que `db.js` le pasa a pg; solo `localhost`, `127.0.0.1` o `::1`. Sin `TEST_DATABASE_URL` sus 24 pruebas contra la base se saltan (en CI) y corren solo las 5 de la guardia. Crea dos gimnasios (el A con umbral amarillo de 10 días), personal y once miembros con planes e ingresos anteriores a medida, y al final borra todo lo que creó.

- CRUD (`:272-331`): crea los retos de cada segmento y uno programado; `creado_por` queda con el administrador; validaciones; recepción 403; aislamiento (el gimnasio B no ve, no edita, no cancela ni consulta el progreso de los retos de A).
- Check-in (`:333-421`): Ana entra solo al reto de TODOS (1 de 2, 50 %); un ingreso repetido en la ventana no suma; INACTIVOS con el umbral del gimnasio (Inés, 15 días sin venir, entra; Iván, 8, no, aunque con el umbral por defecto de 7 sí entraría); quien nunca vino es inactiva desde su registro; NUEVOS y PROXIMOS_A_VENCER; los rechazados (congelada, vencido) no dejan filas; al llegar a la meta, `COMPLETADO` con fecha y 100 % y el mensaje para la pantalla; los dos avisos con sus textos exactos; otro ingreso después no completa ni avisa de nuevo.
- Progreso (`:423`), campana (`:440-478`, incluido un mensaje para el miembro con el mismo tipo y título que el acceso bloqueado, que no sale en la campana, mientras los accesos bloqueados reales sí), bandeja (`:480-534`: propios contra ajenos, de otro gimnasio y del gimnasio; marcar uno y todos; los retos de la app con su segmento, progreso y recompensa), editar y cancelar (`:536-574`).
- Concurrencia (`:576`): tres ingresos a la vez del mismo miembro en un reto de meta 1: queda `COMPLETADO` con 1 check-in y un solo aviso de cada tipo.

```bash
docker run -d --name fl-rqf12-pg -e POSTGRES_PASSWORD=... -p 127.0.0.1:55437:5432 postgres:16
# bases como en la tabla de arriba
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55437/fl_consultas   npx jest tests/retos-real.test.js
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55437/fl_migraciones npx jest tests/retos-real.test.js
```

| Base | `retos-real.test.js` | con `registro-envio-real.test.js` (RQF-09) |
|---|---|---|
| `fl_consultas` | 29 de 29 | 47 de 47 |
| `fl_consultas_dev` | 29 de 29 | 47 de 47 |
| `fl_migraciones` | 29 de 29 | 47 de 47 |

Después de cada corrida las bases quedaron sin filas en `gimnasio`, `miembro`, `checkin`, `reto`, `reto_miembro` y `notificacion`. La prueba de RQF-09 sigue pasando con la 015 aplicada.

**Controles** (se rompió a propósito una línea, se corrieron las dos pruebas y se restauró el archivo):

| Línea quitada | Base real | Simulada |
|---|---|---|
| `n.destinatario = 'GIMNASIO'` en la campana (`notificaciones.js:112`) | 1 falla | 1 falla |
| `rm.estado = 'EN_CURSO'` en el progreso (`lib/retos.js:165`) | 6 fallan | 1 falla |
| la condición de segmento en la inscripción | 18 fallan | 1 falla |
| `destinatario = 'MIEMBRO'` en la bandeja (`cliente.js:454`) | 2 fallan | 2 fallan |

### Suite completa de backend

```
Test Suites: 16 passed, 16 total
Tests:       33 skipped, 346 passed, 379 total
```

Sin `TEST_DATABASE_URL`, como en CI. En `develop` @ `2794bc5` eran 288 pasadas y 9 saltadas: entran 53 de `retos.test.js` y 5 de la guardia nueva, y se saltan las 24 contra la base. El worktree vive bajo `.claude/`, así que se corrió con una copia de `jest.config.js` con `testRegex` (como en RQF-09); en un checkout normal basta `npm test`.

### Frontend y app

- Los `.jsx` cambiados compilan con esbuild.
- Revisión en el navegador: `RetosConfig` y `MenuNotificaciones` se empaquetaron con esbuild contra el backend local y `fl_migraciones` (gimnasio de muestra con tres retos e ingresos hechos por la API). Se vio la lista, el progreso con su filtro, la edición con inscritos (reglas deshabilitadas, se guardó la recompensa), la cancelación con confirmación, la campana con los dos retos completados y «Visto». A 375 px de ancho, sin desborde horizontal (se corrigieron el ancho del texto de cada reto y las filas del progreso).
- `flutter analyze`: **No issues found.** `flutter test`: 7 de 7 (la de humo y 6 nuevas de los modelos en `fitloyalty_cliente/test/retos_mensajes_test.dart`). El Dart instalado es 3.12.2 y el `pubspec.yaml` pide `^3.13.2`, así que se corrió sobre una copia con la restricción de SDK en `>=3.12.0`, sin cambiar el archivo del repositorio. La app no se ejecutó en un emulador.

## Límites

- **Sin notificaciones push.** La bandeja se actualiza al abrir la app, al volver a ella, al abrir la pestaña y al deslizar.
- **Solo los retos escriben en la bandeja.** Los otros eventos del issue #46 (vencimiento, acceso bloqueado, abandono, hito) siguen sin mensaje para el miembro.
- **Sin inscripción manual** desde el panel (HU-49, criterio 4) ni aviso al publicar un reto (HU-28, criterio 5; HU-49, criterio 5) ni al editarlo (HU-30, criterio 4). La edición no queda en `auditoria` (HU-30, criterio 5).
- **Recompensa:** queda registrada como `COMPLETADO` en `reto_miembro` y en los avisos; no hay un campo de «entregada».
- **FK sin CASCADE en producción.** «Eliminar permanentemente» un miembro (`routes/miembros.js`, que no es de este requisito) sigue fallando en producción si el miembro tiene `reto_miembro` o `notificacion`, como ya pasaba con `checkin`. En Docker esas FK tienen CASCADE y no falla.
- `reto` y `reto_miembro` siguen con otro orden de columnas y con CASCADE en Docker.
- `GET /api/cliente/retos` calcula la elegibilidad de cada reto del gimnasio en cada consulta; con pocos retos por gimnasio es barato, pero no tiene paginación (tope de 50).
