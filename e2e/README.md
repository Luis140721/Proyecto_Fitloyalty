# Pruebas E2E (Playwright)

Prueban la app completa desde el navegador. `npm test` levanta el backend real (puerto 3001) y el frontend (puerto 5173); la base de datos es una BD de pruebas desechable en Docker (puerto 5433).

- `tests/login.spec.js`: inicio de sesión. Simula el API con `page.route`.
- `tests/register-gym.spec.js`: registro de gimnasio. Usa el backend real y la BD de pruebas.

## Requisitos

- Node.js 20 o superior, con npm.
- Docker Desktop (o Docker Engine) corriendo.
- Dependencias del backend y del frontend instaladas (`npm install` en `backend/` y en `frontend/`). En el backend puedes saltarte la descarga de Chrome, que solo usa WhatsApp: `PUPPETEER_SKIP_DOWNLOAD=true npm install`.

## Antes de correr

Cierra el front y el back de desarrollo: Playwright necesita libres los puertos **5173** y **3001**. Si usas el `docker-compose.yml` de la raíz, detén sus servicios con `docker compose stop backend frontend`. Playwright no reutiliza servidores abiertos a propósito: uno que ya esté corriendo podría estar conectado a la BD de desarrollo o apuntar a otro API.

## Pasos

```bash
cd e2e
npm install
npx playwright install chromium   # solo la primera vez (unos 110 MB)
npm run db:up                     # crea la BD de pruebas y espera a que esté lista
npm test                          # levanta backend y frontend y corre los tests
npm run db:down                   # destruye la BD de pruebas y sus datos
```

Al arrancar, el backend aplica las migraciones de `backend/migrations`, así que la BD vacía queda lista sin pasos extra. Para ver el detalle de un fallo: `npx playwright show-report`.

## Por qué no se usa la BD de desarrollo

- Los tests crean gimnasios y usuarios reales: llenarían tu BD de desarrollo de datos de prueba.
- La BD de pruebas guarda los datos en memoria (`tmpfs`): `npm run db:down` la borra por completo. Solo escucha en `127.0.0.1:5433`, y sus credenciales son solo de prueba, no secretos.
- `playwright.config.js` tiene una guardia con lista permitida: la URL de la BD (por defecto la de `db-test`, o la que pongas en `E2E_DATABASE_URL`) debe usar `postgres://` o `postgresql://`, el host `127.0.0.1` o `localhost`, exactamente el puerto 5433 y una BD cuyo nombre termine en `_test`, y no puede traer los parámetros `host`, `port` ni `hostaddr` (pg los obedece por encima de la URL). Si algo no cumple, lanza un error antes de levantar nada; el mensaje muestra solo `host:puerto/BD`, nunca la clave.
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
cd frontend && npm run dev

# Terminal 3 (codegen)
cd e2e && npm run codegen
```

> En Windows (PowerShell) define las variables antes del comando: `$env:DATABASE_URL="postgres://..."`, `$env:DB_SSL="false"`, etc.

Lo que graba codegen es un borrador. Antes de guardarlo como test: usa locators por rol o etiqueta (`getByRole`, `getByLabel`), rutas relativas (`page.goto('/register-owner')`), estructura Arrange, Act y Assert, datos únicos con `Date.now()` y al menos una aserción sobre lo que ve la persona. Cierra el backend y el frontend antes de volver a correr `npm test`.
