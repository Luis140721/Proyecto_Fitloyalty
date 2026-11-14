# RQF-09: registro de la fecha y el estado de cada envío

**Requisito (la parte de este arreglo):** «registrando la fecha y estado de cada envío» de las alertas de abandono.
**Issue:** #24. **Fecha:** 2026-11-13. **Código:** rama `feat/rqf-09-registro-envio` @ `30cb421` (sobre `develop` @ `442a55c`).
**Resultado:** `POST /api/admin/notificaciones/enviado` guarda el envío en `envio_mensaje` con el esquema real. Se comprobó contra una base creada con `ConsultasDB/Query_Inicial_Crear_Tablas.sql` y contra otra creada con las migraciones de `backend/migrations`: 7 de 7 pruebas en cada una.

## El problema

El endpoint insertaba `envio_mensaje (id_gimnasio, id_miembro, canal, estado, fecha_envio)`. En producción la columna `canal` no existe: la tabla usa `id_canal` (FK a `canal_comunicacion`, NOT NULL), exige `mensaje_copiado` (NOT NULL) y tiene `enviado_por`. `canal_comunicacion` es un catálogo por gimnasio sin filas para los gimnasios reales, así que tampoco había un `id_canal` válido. El endpoint respondía 503 y el frontend se tragaba el error.

## Qué cambió

**Backend** (`backend/src/routes/notificaciones.js`):

| Qué | Dónde |
|---|---|
| Validación: `mensaje` obligatorio (se recorta, de 1 a 2000 caracteres), `canal` solo `WHATSAPP` o `EMAIL` (por defecto `WHATSAPP`), `idAlerta` opcional | `notificaciones.js:255-270` |
| `canalDelGimnasio`: busca el canal del gimnasio y, si no hay, toma el bloqueo, vuelve a buscar y lo crea | `notificaciones.js:272-311` (bloqueo en `:300`, creación en `:304-309`) |
| El miembro tiene que ser del gimnasio del token (404 `MEMBER_NOT_FOUND`), como antes | `notificaciones.js:323-327` |
| La alerta, si viene, tiene que ser de ese miembro y de ese gimnasio (404 `ALERT_NOT_FOUND`) | `notificaciones.js:329-336` |
| Transacción: `BEGIN`, canal, `INSERT` en `envio_mensaje`, aviso en `notificacion`, `COMMIT`; ante un error, `ROLLBACK` y 503 | `notificaciones.js:338-371` (insert en `:348-354`) |
| `GET /admin/notificaciones` devuelve `idAlerta` en los avisos «en riesgo» | `notificaciones.js:213` |

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
| `id_canal` | el canal del gimnasio para el tipo pedido (por defecto `WHATSAPP`), creado la primera vez |
| `id_alerta` | `idAlerta` si la petición lo trae (los avisos «en riesgo» de la campana); si no, NULL |
| `id_campana`, `id_plantilla` | NULL: este envío no sale de una campaña ni de una plantilla |
| `mensaje_copiado` | el texto que se abrió en WhatsApp, sin espacios en los extremos |
| `estado` | `ENVIADO`: el envío lo hace el teléfono del gimnasio por `wa.me`, el sistema no puede confirmar la entrega |
| `fecha_envio` | `NOW()` |
| `enviado_por` | `req.user.id`, el usuario del token |

En `canal_comunicacion` se crea `(id_gimnasio, tipo, activo = TRUE)`; el resto queda en su valor por defecto (en producción `es_principal = FALSE`). `nombre_remitente` y `credenciales_json` no se llenan: no existen en Docker y para `wa.me` no significan nada.

## Decisiones

- **El canal se crea bajo demanda**, la primera vez que el gimnasio envía, y no al registrar el gimnasio: así sirve para los gimnasios que ya existen sin tocar `auth.js` ni correr un script sobre producción.
- **Dos peticiones a la vez.** La tabla no tiene restricción única por `(id_gimnasio, tipo)` ni en producción ni en Docker, así que no se puede usar `ON CONFLICT`. Si la primera búsqueda no encuentra el canal, se toma `pg_advisory_xact_lock(hashtext('canal_comunicacion'), id_gimnasio)` y se vuelve a buscar. La segunda petición espera al `COMMIT` de la primera y encuentra el canal que esta creó. El bloqueo es de la transacción (se suelta solo con `COMMIT` o `ROLLBACK`), así que también funciona con un pooler en modo transacción como el de Neon, y solo se toma la primera vez: después la primera búsqueda ya lo encuentra.
- **Sin migración.** Agregar la restricción única obligaría a revisar antes los duplicados que pueda haber en producción (los gimnasios de ejemplo ya tienen canales) y a correrla igual en Docker y en producción. El bloqueo resuelve la concurrencia sin tocar el esquema.
- **Si hay varios canales del tipo**, se usa el activo y, entre ellos, el de menor `id_canal` (`ORDER BY activo DESC, id_canal`). `es_principal` no existe en Docker, por eso no entra en el orden. Un canal inactivo se reutiliza en vez de crear otro: el envío igual salió por WhatsApp.
- **Sin `mensaje`, 400 `VALIDATION_ERROR`.** `mensaje_copiado` es NOT NULL y es lo que demuestra qué se le dijo al miembro. El servidor no sabe qué texto se abrió, así que no se inventa uno. Un frontend viejo que no manda `mensaje` recibe 400 en vez del 503 de antes: el efecto es el mismo (no queda registro) hasta que se despliega el frontend nuevo.
- **`SMS` ya no se acepta.** El CHECK de `canal_comunicacion` en producción solo admite `EMAIL` y `WHATSAPP`; crear un canal SMS fallaba (503). El frontend solo manda `WHATSAPP`.
- **El aviso en `notificacion` se mantiene** (tipo `SISTEMA`, `leida = TRUE`), dentro de la misma transacción: o quedan los dos registros o ninguno.
- **Borrado de cuenta (Ley 1581):** `PASOS_ELIMINAR_CUENTA` borra `envio_mensaje` primero (`backend/src/routes/auth.js:522`), antes que `canal_comunicacion` (`:526`), `alerta_abandono`, `miembro` y `usuario`, así que las filas nuevas no lo rompen.

## Esquemas: producción (ConsultasDB) frente a Docker (migraciones)

Se crearon dos bases en un contenedor propio (`postgres:16`, versión 16.16, en `127.0.0.1:55433`): `fl_consultas` con `ConsultasDB/Query_Inicial_Crear_Tablas.sql` y `fl_migraciones` con `node src/db/migrate.js` (las 15 migraciones, de la 002 a la 014). Después se comparó `pg_dump --schema-only -t <tabla>` de las dos:

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

### Pruebas con la base simulada: `backend/tests/registro-envio.test.js` (23)

- Canal existente: lo usa, sin bloqueo ni `INSERT` en `canal_comunicacion` (`:120`).
- Primera vez: crea el canal `WHATSAPP` y lo usa; el orden es miembro, `BEGIN`, buscar, bloquear, buscar, crear, envío, aviso, `COMMIT` (`:133`).
- El segundo envío reutiliza el canal (`:151`); si otra petición lo creó mientras esta esperaba el bloqueo, no crea un segundo (`:160`); el canal de otro gimnasio no sirve (`:169`); `EMAIL` (`:177`).
- Miembro de otro gimnasio: 404 sin escribir nada (`:186`). Sin mensaje, vacío, solo espacios o de más de 2000 caracteres: 400 sin tocar la base (`:197-213`). `PALOMA` y `SMS`: 400 (`:221`). `idAlerta` propia queda en `id_alerta`; ajena, 404 (`:226`, `:234`). Token de miembro: 403 (`:242`).
- El `INSERT` en `envio_mensaje` usa columnas que existen en el DDL de ConsultasDB e incluye todas sus obligatorias, y no usa `canal` (`:249`). El de `canal_comunicacion` usa columnas que están en ConsultasDB y en la 002 (`:266`).
- El aviso en `notificacion` va antes del `COMMIT` (`:281`); si la base falla: 503, `ROLLBACK` y se libera la conexión (`:290`). La campana devuelve `idAlerta` (`:302`).

Las cinco pruebas de `/enviado` que había en `checkin-notificaciones.test.js` comprobaban la columna `canal` y pasaron a este archivo.

### Prueba contra el esquema real: `backend/tests/registro-envio-real.test.js` (7)

Levanta el router real sobre la base de `TEST_DATABASE_URL`, crea dos gimnasios propios (con recepcionista, miembro y una alerta) y al final borra todo lo que creó, tabla por tabla. Sin `TEST_DATABASE_URL` se salta (`:42`), así que en CI queda saltada. Si la URL no es `localhost`, `127.0.0.1` o `::1`, el archivo falla antes de conectarse (`:30-34`), como `backend/scripts/medir-checkin.js`.

```bash
docker run -d --name fl-rqf09-pg -e POSTGRES_PASSWORD=... -p 127.0.0.1:55433:5432 postgres:16
docker exec fl-rqf09-pg psql -U postgres -c "CREATE DATABASE fl_consultas" -c "CREATE DATABASE fl_migraciones"
docker exec -i fl-rqf09-pg psql -U postgres -d fl_consultas -v ON_ERROR_STOP=1 < ConsultasDB/Query_Inicial_Crear_Tablas.sql
cd backend
DATABASE_URL=postgres://postgres:...@127.0.0.1:55433/fl_migraciones DB_SSL=false node src/db/migrate.js
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55433/fl_consultas   npx jest tests/registro-envio-real.test.js
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55433/fl_migraciones npx jest tests/registro-envio-real.test.js
```

Salida (igual en las dos bases; se corrió tres veces en cada una, siempre 7 de 7):

```
PASS tests/registro-envio-real.test.js
  RQF-09 contra la base real: POST /api/admin/notificaciones/enviado
    √ el gimnasio nuevo no tiene canales
    √ primer envio: crea el canal WHATSAPP y guarda el envio con fecha, estado y quien lo envio
    √ segundo envio: reutiliza el canal del gimnasio
    √ cinco envios a la vez en un gimnasio sin canal: crean un solo canal
    √ miembro de otro gimnasio: 404 y no escribe nada
    √ alerta de otro miembro: 404 y no escribe nada
    √ sin mensaje: 400 y no escribe nada
Tests:       7 passed, 7 total
```

- «Primer envío» lee la fila de `envio_mensaje` y comprueba `id_gimnasio`, `id_miembro`, `id_canal` (el canal recién creado), `id_alerta`, `id_campana` e `id_plantilla` NULL, `mensaje_copiado`, `estado = 'ENVIADO'`, `enviado_por` (la recepcionista) y que `fecha_envio` es de ese momento. También comprueba que `canal_comunicacion` tiene una sola fila (`WHATSAPP`, activa) y que quedó el aviso en `notificacion`.
- Después de las corridas, las dos bases quedaron sin filas en `gimnasio`, `usuario`, `miembro`, `canal_comunicacion`, `envio_mensaje`, `notificacion` y `alerta_abandono`.
- **Control del bloqueo:** con `pg_advisory_xact_lock` cambiado a mano por `pg_sleep(1)`, la prueba de «cinco a la vez» falló: las cinco peticiones buscaron el canal antes de que alguna lo creara y cada una creó el suyo. Con el bloqueo pasa siempre. El cambio se deshizo antes del commit.
- Con `TEST_DATABASE_URL=postgres://u:x@db.ejemplo.invalid:5432/x` la prueba se niega: «Me niego: TEST_DATABASE_URL apunta a "db.ejemplo.invalid" y esta prueba solo corre contra una base local.»

### Suite completa de backend y frontend

```
Test Suites: 1 skipped, 13 passed, 13 of 14 total
Tests:       7 skipped, 270 passed, 277 total
```

Sin `TEST_DATABASE_URL`, como en CI: pasan 270 y se saltan las 7 de la prueba real. En `develop` @ `442a55c` pasaban 252: salen 5 de `checkin-notificaciones.test.js` y entran 23. `node --check` pasa en todo `src/`, y los dos `.jsx` cambiados compilan con esbuild.

Nota: el worktree donde se corrió vive bajo `.claude/`, y el `testMatch` de `jest.config.js` no entra en carpetas que empiezan por punto. Por eso se usó una copia de la configuración con `testRegex: 'tests[\\/][^\\/]+\.test\.js$'` en lugar de `testMatch`. En un checkout normal basta con `npm test`.

## Lo que no cubre

- El estado es `ENVIADO`, no la entrega: el teléfono del gimnasio envía por `wa.me` y el sistema no se entera de si el mensaje llegó o se leyó.
- `canal_comunicacion` sigue distinta entre Docker y producción (tabla de arriba).
- Solo este endpoint crea canales. Si otro código los crea después sin el mismo bloqueo, podría haber dos canales del mismo tipo por gimnasio. No rompe nada (se usa el primero), pero una restricción única lo evitaría.
- La lista de miembros no manda `idAlerta`: su «en riesgo» se calcula por días sin venir, no sale de `alerta_abandono`.
