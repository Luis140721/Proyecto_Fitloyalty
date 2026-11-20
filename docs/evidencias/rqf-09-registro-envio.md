# RQF-09: registro de la fecha y el estado de cada envío

**Requisito (la parte de este arreglo):** «registrando la fecha y estado de cada envío» de las alertas de abandono.
**Issue:** #24. **Fecha:** 2026-11-13. **Código:** rama `feat/rqf-09-registro-envio` @ `168e76f` (sobre `develop` @ `442a55c`; incluye las correcciones del verificador).
**Resultado:** `POST /api/admin/notificaciones/enviado` guarda el envío en `envio_mensaje` con el esquema real. Se comprobó contra una base creada con `ConsultasDB/Query_Inicial_Crear_Tablas.sql` y contra otra creada con las migraciones de `backend/migrations`: 18 de 18 pruebas en cada una (9 de la guardia y 9 contra la base).

## El problema

El endpoint insertaba `envio_mensaje (id_gimnasio, id_miembro, canal, estado, fecha_envio)`. En producción la columna `canal` no existe: la tabla usa `id_canal` (FK a `canal_comunicacion`, NOT NULL), exige `mensaje_copiado` (NOT NULL) y tiene `enviado_por`. `canal_comunicacion` es un catálogo por gimnasio sin filas para los gimnasios reales, así que tampoco había un `id_canal` válido. El endpoint respondía 503 y el frontend se tragaba el error.

## Qué cambió

**Backend** (`backend/src/routes/notificaciones.js`):

| Qué | Dónde |
|---|---|
| Validación: `mensaje` obligatorio (se recorta, de 1 a 2000 caracteres), `canal` solo `WHATSAPP` o `EMAIL` (por defecto `WHATSAPP`), `idAlerta` opcional | `notificaciones.js:255-270` |
| `canalDelGimnasio`: busca un canal **activo** del gimnasio (`:292`) y, si no hay, toma el bloqueo (`:301`), vuelve a buscar y crea uno activo (`:305-310`) | `notificaciones.js:272-312` |
| Todo va dentro del `try` (`:324-327`), así que si la base no responde, también al buscar al miembro o al pedir la conexión (`:343`), la respuesta es 503 y no 500 | `notificaciones.js:324-376` |
| El miembro tiene que ser del gimnasio del token (404 `MEMBER_NOT_FOUND`), como antes | `notificaciones.js:328-332` |
| La alerta, si viene, tiene que ser de ese miembro y de ese gimnasio (404 `ALERT_NOT_FOUND`) | `notificaciones.js:334-341` |
| Transacción: `BEGIN`, canal, `INSERT` en `envio_mensaje`, aviso en `notificacion`, `COMMIT`; ante un error, `ROLLBACK` y 503 | `notificaciones.js:344-376` (insert en `:352-358`) |
| `GET /admin/notificaciones` devuelve `idAlerta` en los avisos «en riesgo» | `notificaciones.js:213` |

**Borrado de miembros:** `envio_mensaje.id_miembro` apunta a `miembro` sin `ON DELETE CASCADE`, en producción y, desde la migración 014, en Docker. Ahora que `/enviado` guarda filas, borrar a un miembro al que se le escribió fallaba.

| Qué | Dónde |
|---|---|
| «Eliminar permanentemente» borra antes los envíos del miembro, en una transacción con el `DELETE` del miembro y filtrando por gimnasio. Si el miembro no es de ese gimnasio, 404 y `ROLLBACK`: no se borra ningún envío | `backend/src/routes/miembros.js:716-742` (envíos en `:724-727`) |
| `seed_demo.js --limpiar` borra los envíos de los miembros de demo antes de borrarlos | `backend/src/db/seed_demo.js:95-96` |

**Frontend:**

| Qué | Dónde |
|---|---|
| La campana manda `mensaje` (el `aviso.mensaje` que se abrió en WhatsApp) e `idAlerta` | `frontend/src/components/MenuNotificaciones.jsx:105-113` |
| Si el registro falla, una nota en el panel («Se abrió WhatsApp, pero no pudimos registrar el envío a …»); WhatsApp ya se abrió antes del POST | `MenuNotificaciones.jsx:114-117` y `:143-147` |
| La lista de miembros manda `mensaje` (`w.mensaje`) | `frontend/src/pages/MiembrosPage.jsx:846-851` |
| Si falla, un aviso `alert-warning` arriba de la lista, sin bloquear nada | `MiembrosPage.jsx:852-855` y `:1042-1047` |

## Qué se guarda en cada columna de `envio_mensaje`

| Columna | Valor |
|---|---|
| `id_gimnasio` | el gimnasio del token |
| `id_miembro` | `idMiembro`, ya comprobado que es de ese gimnasio |
| `id_canal` | el canal activo del gimnasio para el tipo pedido (por defecto `WHATSAPP`), creado si no hay ninguno activo |
| `id_alerta` | `idAlerta` si la petición lo trae (los avisos «en riesgo» de la campana); si no, NULL |
| `id_campana`, `id_plantilla` | NULL: este envío no sale de una campaña ni de una plantilla |
| `mensaje_copiado` | el texto que se abrió en WhatsApp, sin espacios en los extremos |
| `estado` | `ENVIADO`: quiere decir que el mensaje se abrió en WhatsApp, no que se entregó (ver «Límites») |
| `fecha_envio` | `NOW()` |
| `enviado_por` | `req.user.id`, el usuario del token |

En `canal_comunicacion` se crea `(id_gimnasio, tipo, activo = TRUE)`; el resto queda en su valor por defecto (en producción `es_principal = FALSE`). `nombre_remitente` y `credenciales_json` no se llenan: no existen en Docker y para `wa.me` no significan nada.

## Decisiones

- **El canal se crea bajo demanda**, la primera vez que el gimnasio envía, y no al registrar el gimnasio: así sirve para los gimnasios que ya existen sin tocar `auth.js` ni correr un script sobre producción.
- **Solo canales activos.** Si hay varios activos del tipo se usa el de menor `id_canal`; `es_principal` no existe en Docker, por eso no entra en el orden. Si el único del tipo está inactivo, no se usa: se crea uno activo con el mismo bloqueo.
- **Dos peticiones a la vez.** La tabla no tiene restricción única por `(id_gimnasio, tipo)` ni en producción ni en Docker, así que no se puede usar `ON CONFLICT`. Si la primera búsqueda no encuentra un canal activo, se toma `pg_advisory_xact_lock(hashtext('canal_comunicacion'), id_gimnasio)` y se vuelve a buscar. La segunda petición espera al `COMMIT` de la primera y encuentra el canal que esta creó. El bloqueo es de la transacción (se suelta solo con `COMMIT` o `ROLLBACK`), así que también funciona con un pooler en modo transacción como el de Neon, y solo se toma mientras no hay canal: después la primera búsqueda ya lo encuentra.
- **Sin migración.** Agregar la restricción única obligaría a revisar antes los duplicados que pueda haber en producción (los gimnasios de ejemplo ya tienen canales) y a correrla igual en Docker y en producción. El bloqueo resuelve la concurrencia sin tocar el esquema.
- **Sin `mensaje`, 400 `VALIDATION_ERROR`.** `mensaje_copiado` es NOT NULL y es lo que demuestra qué se le dijo al miembro. El servidor no sabe qué texto se abrió, así que no se inventa uno. Un frontend viejo que no manda `mensaje` recibe 400 en vez del 503 de antes: el efecto es el mismo (no queda registro) hasta que se despliega el frontend nuevo.
- **`SMS` ya no se acepta.** El CHECK de `canal_comunicacion` en producción solo admite `EMAIL` y `WHATSAPP`; crear un canal SMS fallaba (503). El frontend solo manda `WHATSAPP`.
- **El aviso en `notificacion` se mantiene** (tipo `SISTEMA`, `leida = TRUE`, sin `id_miembro`), dentro de la misma transacción: o quedan los dos registros o ninguno.
- **Borrar al miembro borra sus envíos.** `mensaje_copiado` lleva su nombre, así que es dato personal y se va con él. Los envíos de los demás miembros no se tocan.
- **Borrado de cuenta (Ley 1581):** `PASOS_ELIMINAR_CUENTA` borra `envio_mensaje` primero (`backend/src/routes/auth.js:522`), antes que `canal_comunicacion` (`:526`), `alerta_abandono`, `miembro` y `usuario`, así que las filas nuevas no lo rompen.

## Esquemas: producción (ConsultasDB) frente a Docker (migraciones)

Se crearon dos bases en un contenedor propio (`postgres:16`, versión 16.16, solo en `127.0.0.1`): `fl_consultas` con `ConsultasDB/Query_Inicial_Crear_Tablas.sql` y `fl_migraciones` con `node src/db/migrate.js` (las 15 migraciones, de la 002 a la 014). Después se comparó `pg_dump --schema-only -t <tabla>` de las dos:

- **`envio_mensaje`: idéntica.** La migración 014 la reconstruye con el DDL de ConsultasDB (mismas columnas, orden, restricciones, FK e índice `idx_envio_miembro`).
- **`canal_comunicacion`: distinta.** Ninguna migración la alinea:

| | Producción (ConsultasDB, `:217-228`) | Docker (`002_esquema_inicial.sql:302-309`) |
|---|---|---|
| `nombre_remitente`, `credenciales_json` | sí | no |
| `es_principal` | sí (NOT NULL DEFAULT FALSE) | no |
| `configuracion` (jsonb) | no | sí |
| CHECK de `tipo` | `EMAIL`, `WHATSAPP` | `EMAIL`, `WHATSAPP`, `SMS` |
| FK a `gimnasio` | sin `ON DELETE` | `ON DELETE CASCADE` |
| Restricción única `(id_gimnasio, tipo)` | no | no |

  El código solo usa `id_canal`, `id_gimnasio`, `tipo` y `activo`, que están en las dos, y la prueba con la base simulada lo comprueba leyendo los dos DDL. Alinear `canal_comunicacion` (una migración como la 014) queda fuera de este arreglo.
- **Fuera de estas dos tablas:** el `usuario` de ConsultasDB tiene `rol` (texto) y no tiene `id_rol`, que es lo que lee `authenticate` (`backend/src/middleware/auth.js:10-20`). Con la base de ConsultasDB tal cual, cualquier ruta autenticada responde 503. La prueba real lee al usuario de la base con `activo`, `id_gimnasio` y `rol`, que están en los dos esquemas. Esto indica que ConsultasDB no es igual a producción en `usuario`; no afecta a RQF-09.

## Cómo se probó

### Pruebas con la base simulada: `backend/tests/registro-envio.test.js` (32)

- Canal existente: lo usa, sin bloqueo ni `INSERT` en `canal_comunicacion` (`:135`).
- Primera vez: crea el canal `WHATSAPP` y lo usa; el orden es miembro, `BEGIN`, buscar, bloquear, buscar, crear, envío, aviso, `COMMIT` (`:148`).
- El segundo envío reutiliza el canal (`:166`); si otra petición lo creó mientras esta esperaba el bloqueo, no crea un segundo (`:175`); el canal de otro gimnasio no sirve (`:184`); `EMAIL` (`:192`).
- Canal inactivo: la búsqueda pide `activo = TRUE` (`:199`); si el único está inactivo, crea uno activo bajo bloqueo (`:206`); con uno inactivo y otro activo, usa el activo (`:216`).
- Miembro de otro gimnasio: 404 sin escribir nada y sin pedir conexión (`:229`). Sin mensaje, vacío, solo espacios o de más de 2000 caracteres: 400 sin tocar la base (`:241-257`). `PALOMA` y `SMS`: 400 (`:265`). `idAlerta` propia queda en `id_alerta`; ajena, 404 (`:270`, `:278`). Token de miembro: 403 (`:286`).
- El `INSERT` en `envio_mensaje` usa columnas que existen en el DDL de ConsultasDB e incluye todas sus obligatorias, y no usa `canal` (`:293`). El de `canal_comunicacion` usa columnas que están en ConsultasDB y en la 002 (`:310`).
- El aviso en `notificacion` va antes del `COMMIT` (`:325`). Si la base falla al guardar: 503, `ROLLBACK` y se libera la conexión (`:334`); si falla al buscar al miembro o al pedir la conexión: 503, no 500 (`:344`, `:352`).
- Borrado permanente: `BEGIN`, `DELETE` de los envíos, `DELETE` del miembro, `COMMIT`, los dos con el gimnasio del token (`:385`); miembro de otro gimnasio, 404 y `ROLLBACK` (`:395`); base caída, 503 y `ROLLBACK` (`:402`); recepcionista, 403 (`:410`).
- La campana devuelve `idAlerta` (`:416`).
- **Control del bloqueo:** sin la línea de `pg_advisory_xact_lock` fallan «primera vez» (`:148`), «dos a la vez» (`:175`) y la del canal inactivo (`:206`). Son estas pruebas las que detectan que falta el bloqueo.

De las cinco pruebas de `/enviado` que había en `checkin-notificaciones.test.js`, solo «deja constancia del envío» comprobaba la columna `canal`; se reemplazó por las de este archivo. Las otras cuatro tienen su equivalente aquí: miembro de otro gimnasio (`:229`), canal inválido (`:265`), base caída (`:334`) y token de miembro (`:286`).

### Prueba contra el esquema real: `backend/tests/registro-envio-real.test.js` (18)

Levanta los routers reales de notificaciones y de miembros sobre la base de `TEST_DATABASE_URL`, crea tres gimnasios propios (con personal, miembros, una alerta y, en uno, un canal inactivo) y al final borra todo lo que creó, tabla por tabla. Sin `TEST_DATABASE_URL` las 9 pruebas contra la base se saltan (`:101`), así que en CI quedan saltadas.

**Guardia** (`:36-60`): el host se toma del mismo parser que usa pg (`pg/lib/connection-parameters`), que obedece `?host=` en la query y las variables `PG*`, y no del hostname de `new URL`. Se revisa dos veces antes de conectarse: la URL tal cual (`:51`) y la configuración que `db.js` le pasa a pg (`:59`), porque `db.js` reescribe la URL al quitar `sslmode`. Solo pasa `localhost`, `127.0.0.1` o `::1`. Sus 9 pruebas no se conectan a nada y corren siempre, también en CI (`:62-99`):

- aceptan `127.0.0.1`, `localhost` y `[::1]`;
- rechazan una base remota, `?host=` remoto con un hostname local, `?host=/tmp` (socket), varios hosts y un socket codificado como host;
- rechazan `...?sslmode=disable#&host=ep-algo.neon.tech`: para pg el host es `127.0.0.1`, pero `db.js` lo convierte en `?&host=ep-algo.neon.tech`.

Con `TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55436/fl_consultas?host=ep-algo.neon.tech` el archivo falla al cargarse, sin conectarse: «Me niego: TEST_DATABASE_URL lleva a "ep-algo.neon.tech" y esta prueba solo corre contra una base local (localhost o 127.0.0.1).»

```bash
docker run -d --name fl-rqf09-pg -e POSTGRES_PASSWORD=... -p 127.0.0.1:55436:5432 postgres:16
docker exec fl-rqf09-pg psql -U postgres -c "CREATE DATABASE fl_consultas" -c "CREATE DATABASE fl_migraciones"
docker exec -i fl-rqf09-pg psql -U postgres -d fl_consultas -v ON_ERROR_STOP=1 < ConsultasDB/Query_Inicial_Crear_Tablas.sql
cd backend
DATABASE_URL=postgres://postgres:...@127.0.0.1:55436/fl_migraciones DB_SSL=false node src/db/migrate.js
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55436/fl_consultas   npx jest tests/registro-envio-real.test.js
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55436/fl_migraciones npx jest tests/registro-envio-real.test.js
```

Salida (igual en las dos bases; se corrió tres veces en cada una, siempre 18 de 18):

```
PASS tests/registro-envio-real.test.js
  guardia de la base de pruebas
    √ acepta una base local: postgres://u:c@127.0.0.1:55433/fl_consultas
    √ acepta una base local: postgres://u:c@localhost/fl_consultas
    √ acepta una base local: postgres://u:c@[::1]:55433/fl_consultas
    √ rechaza una base remota
    √ rechaza ?host= remoto con hostname local
    √ rechaza ?host= de socket
    √ rechaza varios hosts
    √ rechaza un socket codificado como host
    √ rechaza una URL que db.js reescribe hacia otro host al quitar sslmode
  RQF-09 contra la base real: POST /api/admin/notificaciones/enviado
    √ el gimnasio nuevo no tiene canales
    √ primer envio: crea el canal WHATSAPP y guarda el envio con fecha, estado y quien lo envio
    √ segundo envio: reutiliza el canal del gimnasio
    √ cinco envios a la vez en un gimnasio sin canal: crean un solo canal
    √ miembro de otro gimnasio: 404 y no escribe nada
    √ alerta de otro miembro: 404 y no escribe nada
    √ sin mensaje: 400 y no escribe nada
    √ si el unico canal WhatsApp esta inactivo: crea uno activo y no usa el inactivo
    √ borrado permanente de un miembro al que se le escribio: borra sus envios y al miembro
Tests:       18 passed, 18 total
```

- «Primer envío» (`:228`) lee la fila de `envio_mensaje` y comprueba `id_gimnasio`, `id_miembro`, `id_canal` (el canal recién creado), `id_alerta`, `id_campana` e `id_plantilla` NULL, `mensaje_copiado`, `estado = 'ENVIADO'`, `enviado_por` (la recepcionista) y que `fecha_envio` es de ese momento. También comprueba que `canal_comunicacion` tiene una sola fila (`WHATSAPP`, activa) y que quedó el aviso en `notificacion`.
- «Canal inactivo» (`:314`): el gimnasio queda con el canal inactivo y uno activo nuevo, y el envío usa el activo.
- «Borrado permanente» (`:326`): el `DELETE /api/admin/miembros/:id/permanent` responde 200 y no quedan ni el miembro ni sus envíos; los de otra miembro del gimnasio siguen. **Control:** sin el `DELETE` de los envíos en `miembros.js`, esta prueba falló en las dos bases (503 en vez de 200).
- «Cinco a la vez» (`:277`) comprueba en la base real que queda un solo canal, pero no es un control fiable del bloqueo: sin el bloqueo falló en unas corridas y pasó en otras, según cómo se intercalaron las peticiones. El que lo detecta siempre es el control de las pruebas simuladas (`registro-envio.test.js:148` y `:175`).
- `seed_demo.js --limpiar`, a mano en `fl_migraciones`: se sembró un gimnasio, se registraron envíos a tres miembros de demo y `--limpiar` retiró los 18 miembros sin error (sin envíos al final). La versión de `develop` falla en el mismo caso: «violates foreign key constraint "envio_mensaje_id_miembro_fkey"».
- Después de las corridas, las dos bases quedaron sin filas en `gimnasio`, `usuario`, `miembro`, `canal_comunicacion`, `envio_mensaje`, `notificacion` y `alerta_abandono`.

### Suite completa de backend

```
Test Suites: 14 passed, 14 total
Tests:       9 skipped, 288 passed, 297 total
```

Sin `TEST_DATABASE_URL`, como en CI: pasan 288 (las 9 de la guardia incluidas) y se saltan las 9 contra la base. Estas cifras son solo del backend. En `develop` @ `442a55c` pasaban 252: salen 5 de `checkin-notificaciones.test.js` y entran 32 de `registro-envio.test.js` y 9 de la guardia. `node --check` pasa en todo `src/`. Del frontend solo se revisó que los dos `.jsx` cambiados compilan con esbuild; no tiene pruebas para estos botones.

Nota: el worktree donde se corrió vive bajo `.claude/`, y el `testMatch` de `jest.config.js` no entra en carpetas que empiezan por punto. Por eso se usó una copia de la configuración con `testRegex: 'tests[\\/][^\\/]+\.test\.js$'` en lugar de `testMatch`. En un checkout normal basta con `npm test`.

## Límites

- **`ENVIADO` quiere decir que el mensaje se abrió en WhatsApp, no que se entregó.** El chat se abre por `wa.me` en el teléfono o el navegador del gimnasio y la persona le da enviar; el sistema no se entera de si lo envió, si llegó o si se leyó.
- **El canal se crea solo, sin pantalla de configuración.** No hay dónde ver, activar o desactivar los canales del gimnasio. Un canal inactivo solo existe por un cambio hecho directamente en la base o por los datos de ejemplo de `ConsultasDB/Poblar_Tablas.sql`, donde el gimnasio 3 tiene su WhatsApp inactivo.
- **`EMAIL` se acepta pero nada lo envía.** El endpoint registra un envío por correo si se lo piden, pero ninguna pantalla lo usa y el sistema no manda correos de retención; solo deja constancia.
- `canal_comunicacion` sigue distinta entre Docker y producción (tabla de arriba).
- Solo este endpoint crea canales. Si otro código los crea después sin el mismo bloqueo, podría haber dos canales activos del mismo tipo por gimnasio. No rompe nada (se usa el de menor id), pero una restricción única lo evitaría.
- La lista de miembros no manda `idAlerta`: su «en riesgo» se calcula por días sin venir, no sale de `alerta_abandono`.
- El borrado permanente de un miembro puede seguir fallando por otras tablas que no son de RQF-09. En las dos bases, `notificacion.id_miembro` no tiene `ON DELETE CASCADE`, y el aviso de acceso bloqueado (`backend/src/lib/accesos.js`) sí llena esa columna. En una base con la forma de ConsultasDB tampoco tienen CASCADE `checkin`, `membresia`, `alerta_abandono` y otras.
