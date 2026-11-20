# Pruebas E2E (Playwright)

Prueban la app completa desde el navegador. `pnpm test` levanta el backend real (puerto 3001) y el frontend (puerto 5173); la base de datos es una BD de pruebas desechable en Docker (puerto 5433).

- `tests/login.spec.js`: inicio de sesión. Simula el API con `page.route`.
- `tests/register-gym.spec.js`: registro de gimnasio. Usa el backend real y la BD de pruebas.
- `tests/checkin.spec.js`: check-in de un miembro por documento (plan vigente, vencido, congelado y documento que no existe). Backend real y BD de pruebas.
- `tests/checkin-tiempos.spec.js`: defectos de tiempos del check-in (doble envío y red lenta), con respuestas retrasadas por `page.route`.
- `tests/alta-miembro.spec.js`: alta de un miembro con el asistente de 5 pasos (caso feliz, documento repetido y correo que rechaza el servidor). Backend real y BD de pruebas.
- `tests/alta-miembro-tiempos.spec.js`: defectos de tiempos del alta (doble clic en «Crear miembro» y en «Siguiente →», dos altas simultáneas con el mismo documento y red lenta). El de las altas simultáneas está marcado con `test.fail()` mientras siga abierta su incidencia, la [#87](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/87).
- `tests/miembros-api-simulada.spec.js`: estados de la lista y del alta que el backend real no da cuando uno quiere (API caído, lista vacía, error de validación). Simula solo `/api/admin/miembros` con `page.route`; cada test anota qué doble usa.

## Sesión y datos

- La sesión se prepara una sola vez por corrida, como en la guía «Authentication» de Playwright: `tests/auth.setup.js` es el proyecto `setup` de `playwright.config.js`, del que dependen los demás. Crea por API un gimnasio nuevo con su dueño, escribe el token en `localStorage` (el front no usa cookies) y guarda el estado del navegador en `e2e/playwright/.auth/user.json`, que está en `.gitignore`.
- Los archivos que necesitan la sesión la cargan con `test.use({ storageState: SESION })` (`tests/support/entorno.js`). Los del login y el registro no la cargan: prueban justamente eso.
- Los datos de cada test se crean por API con el fixture `request` y valores únicos (`tests/support/datos.js`): los tests corren en paralelo sobre el mismo gimnasio y la BD conserva lo de corridas anteriores. Por la UI solo va lo que el test prueba.
- `tests/support/checkin-page.js` y `tests/support/alta-miembro-page.js` son los objetos de página del check-in y del alta de miembros (locators y pasos, sin aserciones). `tests/support/red.js` retrasa o retiene las respuestas de una ruta y cuenta peticiones.
- Las ayudas de `datos.js` mandan `Connection: close`: el `request` de Playwright reutiliza la conexión y el backend la cierra a los 5 s sin uso, y una llamada que sale justo entonces termina en «socket hang up».
- `tests/support/bd.js` abre una transacción en la BD de pruebas que retiene los INSERT de miembros de un gimnasio (bloquea su fila con `FOR UPDATE`). Lo usa el test de las altas simultáneas para que las dos peticiones lleguen al INSERT a la vez, sin depender de la velocidad del equipo. Usa el `pg` del backend y la misma guardia de la config.

## Requisitos

- Node.js 22 o superior (el CI usa 24) y pnpm 12.15.0 (`npm install -g pnpm@12.15.0`).
- Docker Desktop (o Docker Engine) corriendo.
- Dependencias del backend y del frontend instaladas (`pnpm install` en `backend/` y en `frontend/`). En el backend puedes saltarte la descarga de Chrome, que solo usa WhatsApp: `PUPPETEER_SKIP_DOWNLOAD=true pnpm install`.

## Antes de correr

Cierra el front y el back de desarrollo: Playwright necesita libres los puertos **5173** y **3001**. Si usas el `docker-compose.yml` de la raíz, detén sus servicios con `docker compose stop backend frontend`. Playwright no reutiliza servidores abiertos a propósito: uno que ya esté corriendo podría estar conectado a la BD de desarrollo o apuntar a otro API.

## Pasos

```bash
cd e2e
pnpm install
pnpm exec playwright install chromium   # la primera vez y al subir Playwright (unos 325 MB)
pnpm run db:up                          # crea la BD de pruebas y espera a que esté lista
pnpm test                               # levanta backend y frontend y corre los tests
pnpm run db:down                        # destruye la BD de pruebas y sus datos
```

Al arrancar, el backend aplica las migraciones de `backend/migrations`, así que la BD vacía queda lista sin pasos extra.

Para ver el detalle de un fallo: `pnpm report` (abre el reporte HTML). En el CI (`CI` definida) un test que falla se reintenta una vez y ese reintento graba la traza (`trace: 'on-first-retry'`); en el reporte, el test fallido enlaza su **Trace**. En local no hay reintentos: para grabar la traza usa `pnpm exec playwright test --trace on`. Un test que pasa solo al reintentar sale como *flaky*: es una tarea pendiente, no un test aprobado (`--fail-on-flaky-tests` hace fallar la corrida).

Para medir la estabilidad: `pnpm exec playwright test --repeat-each=5`.

## Por qué no se usa la BD de desarrollo

- Los tests crean gimnasios y usuarios reales: llenarían tu BD de desarrollo de datos de prueba.
- La BD de pruebas guarda los datos en memoria (`tmpfs`): `pnpm run db:down` la borra por completo. Solo escucha en `127.0.0.1:5433`, y sus credenciales son solo de prueba, no secretos.
- `playwright.config.js` usa la guardia con lista permitida de `guardia-bd.cjs` (la misma de los tests de integración del backend): la URL de la BD (por defecto la de `db-test`, o la que pongas en `E2E_DATABASE_URL`) debe tener la forma exacta `postgres://usuario:clave@127.0.0.1:5433/nombre_test`, con `?sslmode=` como único parámetro. El usuario, la clave y la BD solo pueden llevar letras, números y `. _ ~ -`, y el host es `127.0.0.1`, no `localhost`. Con cualquier otra forma, `new URL`, `backend/src/db/db.js` y pg pueden leer destinos distintos. Si algo no cumple, lanza un error antes de levantar nada; el mensaje muestra solo `host:puerto/BD`, nunca la clave.
- Playwright le pasa al backend sus variables (`DATABASE_URL` de pruebas, `JWT_SECRET` de prueba, el cron y WhatsApp apagados, sin claves de correo). `dotenv` no pisa variables que ya existen, así que `backend/.env` no las cambia.

## Grabar un flujo nuevo con codegen

Con la BD de pruebas arriba, levanta el backend contra ella y el frontend, cada uno en su terminal:

```bash
# Terminal 1 (backend)
cd backend
DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test \
DB_SSL=false JWT_SECRET=jwt-solo-para-e2e-no-es-secreto \
DISABLE_SCHEDULER=true ENABLE_WHATSAPP=false node src/index.js

# Terminal 2 (frontend)
cd frontend && pnpm run dev

# Terminal 3 (codegen)
cd e2e && pnpm run codegen
```

> En Windows (PowerShell) define las variables antes del comando: `$env:DATABASE_URL="postgres://..."`, `$env:DB_SSL="false"`, etc.

Lo que graba codegen es un borrador. Antes de guardarlo como test: usa locators por rol o etiqueta (`getByRole`, `getByLabel`), rutas relativas (`page.goto('/register-owner')`), estructura Arrange, Act y Assert, datos únicos con `Date.now()` y al menos una aserción sobre lo que ve la persona. Cierra el backend y el frontend antes de volver a correr `pnpm test`.
