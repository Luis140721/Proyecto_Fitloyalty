# FitLoyalty

CRM de fidelización para gimnasios de barrio. Permite gestionar miembros,
membresías, check-ins por QR y campañas de retención desde un panel único.

Proyecto formativo — **SENA, TG. Análisis y Desarrollo de Software, Ficha 3228973 A, V Trimestre.**

---

## Tabla de contenido

- [Stack](#stack)
- [Arranque rápido con Docker](#arranque-rápido-con-docker-recomendado)
- [Arranque sin Docker](#arranque-sin-docker)
- [Variables de entorno](#variables-de-entorno)
- [Usuarios de prueba](#usuarios-de-prueba)
- [Estructura del proyecto](#estructura-del-proyecto)
- [API](#api)
- [Base de datos](#base-de-datos)
- [Pruebas](#pruebas)
- [Correo transaccional (Brevo)](#correo-transaccional-brevo)
- [Ramas](#ramas)
- [Documentación](docs/README.md)
- [Problemas frecuentes](#problemas-frecuentes)

---

## Stack

| Capa      | Tecnología                                                        |
|-----------|-------------------------------------------------------------------|
| Frontend  | React 18, Vite 5, React Router 6, Axios                           |
| Backend   | Node 24, Express 4, `pg`, `zod`, `express-rate-limit`             |
| Seguridad | JWT (`jsonwebtoken`), hash de contraseñas con `bcryptjs`          |
| BD        | PostgreSQL 16                                                     |
| Correo    | Brevo API HTTPS (`@getbrevo/brevo`)                               |
| Infra     | Docker Compose; nginx sirve el build y proxea `/api` al backend   |

---

## Arranque rápido con Docker (recomendado)

**Requisito único:** Docker Desktop. No necesitas instalar Node ni PostgreSQL.

```bash
git clone https://github.com/Luis140721/Proyecto_Fitloyalty.git
cd Proyecto_Fitloyalty
cp .env.example .env
```

Abre `.env` y define **`JWT_SECRET`** — es obligatorio, el compose no arranca sin él.
Las demás variables tienen valores por defecto que sirven para desarrollo.

```bash
docker compose up --build -d
```

Cuando los tres contenedores estén `healthy`:

| Servicio | URL                              |
|----------|----------------------------------|
| App      | http://localhost:5173            |
| API      | http://localhost:3001/api        |
| Health   | http://localhost:3001/api/health |

Crea una cuenta de administrador para entrar:

```bash
docker compose exec backend node src/db/seed_dev.js tucorreo@ejemplo.com tuclave123 "Mi Gimnasio"
```

### Comandos útiles

```bash
docker compose ps                  # estado de los servicios
docker compose logs -f backend     # logs del backend en vivo
docker compose down                # detener todo (conserva los datos)
docker compose down -v             # detener y BORRAR la base de datos
docker compose exec db psql -U fitloyalty -d fitloyalty
```

> Guía ampliada de Docker en [`docs/guias/DOCKER.md`](docs/guias/DOCKER.md).

---

## Arranque sin Docker

Requiere **Node 22 o superior** (el CI y las imágenes de Docker usan 24), **pnpm 12.15.0** (`npm install -g pnpm@12.15.0`) y **PostgreSQL** corriendo en local con una base `fitloyalty` creada.

```bash
pnpm run install:all                     # instala raíz + backend + frontend
cp backend/.env.example backend/.env     # ajusta DB_USER, DB_PASSWORD, JWT_SECRET
pnpm run dev                             # levanta API y web en una sola terminal
```

Frontend en http://localhost:5173 y API en http://localhost:3001.

> **Importante:** en modo local añade `DB_SSL=false` a `backend/.env`. El pool de
> conexiones activa SSL por defecto (lo necesitan Neon y Render), pero un
> PostgreSQL local no lo soporta y la conexión falla con
> `The server does not support SSL connections`.

---

## Variables de entorno

Se leen del archivo `.env` en la raíz (usado por `docker compose`) o de
`backend/.env` cuando corres sin Docker. Plantillas: [`.env.example`](.env.example)
y [`backend/.env.example`](backend/.env.example).

Ninguno de los dos archivos `.env` se versiona — están cubiertos por `.gitignore`.

### Base de datos

| Variable            | Obligatoria | Por defecto  | Descripción |
|---------------------|:-----------:|--------------|-------------|
| `POSTGRES_USER`     | no          | `fitloyalty` | Usuario del contenedor de Postgres |
| `POSTGRES_PASSWORD` | no          | `fitlocal`   | Contraseña del contenedor |
| `POSTGRES_DB`       | no          | `fitloyalty` | Nombre de la base |
| `POSTGRES_PORT`     | no          | `5432`       | Puerto publicado en el host |
| `DATABASE_URL`      | no          | —            | URL completa. Tiene prioridad sobre `DB_HOST`/`DB_PORT`/… |
| `DB_SSL`            | no          | `true`       | `false` para Postgres local. Neon/Render requieren `true` |

### Backend

| Variable             | Obligatoria | Por defecto | Descripción |
|----------------------|:-----------:|-------------|-------------|
| `JWT_SECRET`         | **sí**      | —           | Clave de firma de los JWT. El compose falla si no está |
| `JWT_EXPIRES_IN`     | no          | `8h`        | Vigencia del token del personal (`8h`, `30m`, `1d`; un número sin unidad son segundos). El de la app del miembro dura 30 días y no cambia. Ojo: `docker-compose.yml` pasa `7d` si no la defines en `.env` |
| `PORT`               | no          | `3001`      | Puerto del backend |
| `NODE_ENV`           | no          | `production`| Entorno de ejecución |
| `SUPPORT_EMAIL`      | no          | `fitloyaltysaas@gmail.com` | Correo de soporte mostrado en los emails |
| `SUPPORT_TRIAL_DAYS` | no          | `7`         | Días de prueba al registrar un gimnasio |

### Correo

| Variable              | Obligatoria | Por defecto | Descripción |
|-----------------------|:-----------:|-------------|-------------|
| `BREVO_API_KEY`       | no          | —           | API key v3 de Brevo (`xkeysib-…`). **Sin ella no se envía ningún correo** |
| `MAIL_FROM`           | no          | `FitLoyalty <fitloyaltysaas@gmail.com>` | Remitente, formato `Nombre <correo>` |
| `SHOW_DEV_CODE_IN_UI` | no          | `false`     | Muestra el código de recuperación en pantalla. Solo para demos en un equipo local: tiene efecto únicamente con `NODE_ENV=development` o `test` |

### Frontend

| Variable         | Obligatoria | Por defecto | Descripción |
|------------------|:-----------:|-------------|-------------|
| `VITE_API_BASE`  | no          | vacío       | Déjalo vacío para usar rutas relativas y el proxy de nginx |
| `VITE_INACTIVIDAD_MIN` | no    | `30`        | Minutos sin actividad (mouse, teclado, toque o scroll) antes de cerrar la sesión del panel. Se lee al compilar (`pnpm run build`, Vercel); el build de Docker no la recibe y usa 30 |
| `FRONTEND_PORT`  | no          | `5173`      | Puerto publicado del frontend |

---

## Usuarios de prueba

El proyecto **no incluye datos de demo**. Crea tu propia cuenta de administrador:

```bash
# Con Docker
docker compose exec backend node src/db/seed_dev.js admin@fitloyalty.local admin12345 "Gimnasio Demo"

# Sin Docker
node backend/src/db/seed_dev.js admin@fitloyalty.local admin12345 "Gimnasio Demo"
```

El script es idempotente: si el correo ya existe, actualiza la contraseña. La cuenta
se crea sin periodo de prueba (acceso ilimitado).

También puedes registrarte desde la interfaz en `/register-owner`, que crea el
gimnasio y su administrador con 7 días de prueba.

> `pnpm run seed` (`seed_pg.js`) **no crea usuarios**: solo actualiza contraseñas y
> fotos de una lista fija de correos que ya deben existir en la base. Sobre una base
> vacía no hace nada. Usa `seed_dev.js`.

### Roles

| Rol en BD       | `id_rol` | Rol en el JWT  |
|-----------------|:--------:|----------------|
| `ADMINISTRADOR` | 1        | `admin`        |
| `RECEPCIONISTA` | 2        | `receptionist` |

---

## Estructura del proyecto

```
Proyecto_FitLoyalty/
├── backend/
│   ├── migrations/          → SQL versionado, se aplica solo al arrancar
│   └── src/
│       ├── db/              → pool de conexión, migrador y seeds
│       ├── lib/             → validadores (zod), errores, correo, helpers de auth
│       ├── middleware/      → authenticate (JWT) y authorize (roles)
│       ├── routes/          → auth, miembros, checkin, staff, dashboard, billing…
│       └── index.js         → servidor Express
├── frontend/
│   ├── nginx.conf           → sirve el build y proxea /api al backend
│   └── src/
│       ├── components/      → CardGlass, BadgeEstado, EmptyState, Modal…
│       ├── context/         → AuthContext (JWT + estado global), TrialContext
│       ├── pages/           → Login, Dashboard, Miembros, Check-in, Equipo…
│       └── styles/
├── fitloyalty_cliente/      → app móvil del miembro (Flutter)
├── ConsultasDB/             → scripts SQL de creación y poblado
├── Documentación/           → backlog, casos de uso, estimaciones
├── docs/                    → guías, arquitectura, sustentación, evidencias y seguimiento (ver docs/README.md)
└── docker-compose.yml
```

---

## API

Base: `http://localhost:3001/api` (o `/api` a través de nginx en el puerto 5173).

La autenticación es **JWT vía cabecera** `Authorization: Bearer <token>`.
Las rutas marcadas con 🔒 la exigen; sin token responden `401`.

### Autenticación — `/api/auth`

| Método | Ruta                 | Descripción |
|--------|----------------------|-------------|
| POST   | `/signup`            | Crea gimnasio + administrador e inicia el periodo de prueba |
| POST   | `/login`             | Devuelve el JWT. Limitado por `express-rate-limit` |
| GET    | `/me` 🔒             | Perfil del usuario autenticado |
| POST   | `/logout` 🔒         | Cierre de sesión |
| POST   | `/forgot-password`   | Envía el código de recuperación. Limitado por rate limit |
| POST   | `/verify-reset-code` | Valida el código recibido |
| POST   | `/reset-password`    | Define la nueva contraseña |
| DELETE | `/account` 🔒        | Elimina la cuenta |

### Miembros — `/api` 🔒

| Método | Ruta                     | Descripción |
|--------|--------------------------|-------------|
| GET    | `/admin/miembros`        | Lista paginada con filtros |
| POST   | `/admin/miembros`        | Crea un miembro y genera su código QR |
| GET    | `/admin/miembros/lookup` | Búsqueda rápida por documento o QR |
| GET    | `/admin/miembros/:id`    | Detalle |
| PUT    | `/admin/miembros/:id`    | Actualiza |
| DELETE | `/admin/miembros/:id`    | Desactiva (baja lógica) |

### Resto

| Método | Ruta                                  | Descripción |
|--------|---------------------------------------|-------------|
| GET    | `/admin/dashboard` 🔒                 | Métricas del panel |
| GET    | `/admin/dashboard/export` 🔒          | Exporta el resumen a CSV |
| POST   | `/admin/checkin` 🔒                   | Registra un ingreso |
| GET    | `/admin/checkin` 🔒                   | Últimos ingresos |
| GET    | `/admin/staff` 🔒                     | Equipo del gimnasio |
| POST   | `/admin/staff/invite` 🔒              | Invita a un miembro del equipo por correo |
| GET    | `/admin/staff/invitations` 🔒         | Invitaciones pendientes |
| POST   | `/admin/staff/invitations/:id/revoke` 🔒 | Revoca una invitación |
| PATCH  | `/admin/staff/:id` 🔒                 | Edita nombre o rol, desactiva o reactiva a un usuario del equipo (solo admin; nadie se desactiva a sí mismo y la cuenta del dueño no se desactiva) |
| GET    | `/auth/accept-invite/:token`          | Valida el token de invitación (público) |
| POST   | `/auth/accept-invite`                 | Crea la cuenta desde la invitación (público) |
| GET    | `/asistencia` 🔒                      | Historial de asistencia |
| GET    | `/vista/miembros-activos` 🔒          | Lee la vista SQL `vista_miembros_activos` |
| GET    | `/billing/trial-status` 🔒            | Estado del periodo de prueba |
| GET    | `/health`                             | Estado del servicio y de la BD (público) |

---

## Base de datos

### Migraciones

Se aplican **solas** al arrancar el backend. Cada archivo de `backend/migrations/`
se ejecuta una única vez y queda registrado en la tabla `schema_migrations`, así que
reiniciar el contenedor no las repite.

```
backend/migrations/
├── 002_esquema_inicial.sql                 → tablas, índices y roles
├── 003_invitacion_staff.sql                → invitaciones de equipo
├── 004_cliente_pin.sql                     → PIN de la app del miembro
├── 004_extender_miembro_cobros.sql         → datos del miembro y plan_cobro
├── 005_cliente_password.sql                → contraseña de la app del miembro
├── 005_fix_missing_columns.sql             → columnas que faltaban en miembro
├── 006_gimnasio_dias_aviso.sql             → días de aviso de vencimiento
├── 007_alerta_vencimiento_enviada.sql      → avisos de vencimiento ya enviados
├── 008_contrato_enviado.sql                → contratos enviados por WhatsApp
├── 009_auditoria_y_gamificacion.sql        → auditoria y columnas de hitos y retos
├── 010_congelar_membresia.sql              → membresías congeladas
├── 011_vista_miembros_activos_gimnasio.sql → vista filtrable por gimnasio
├── 013_gimnasio_id_dueno.sql               → dueño del gimnasio (gimnasio.id_dueno)
└── 014_notificacion_envio_como_produccion.sql → notificacion y envio_mensaje iguales a producción
```

La 012 está reservada. La 014 deja `notificacion` y `envio_mensaje` de una base creada
solo con migraciones iguales a las de producción (`ConsultasDB/`). En producción no
cambia nada, y una base Docker con filas viejas las conserva en `notificacion_docker` y
`envio_mensaje_docker`.

### Vista SQL

`ConsultasDB/Query_Inicial_Crear_Tablas.sql` define la vista `vista_miembros_activos`,
que consume `GET /api/vista/miembros-activos`.

> Esta vista **no está incluida en las migraciones**. Si el endpoint responde `503`,
> aplícala a mano:
> ```bash
> docker compose exec -T db psql -U fitloyalty -d fitloyalty < ConsultasDB/Query_Inicial_Crear_Tablas.sql
> ```

### Pruebas de integración (BD real)

Los tests de `backend/tests/integracion/` y `backend/tests/registro-envio-real.test.js` corren
contra PostgreSQL de verdad, en la BD de pruebas desechable `db-test` de `e2e/docker-compose.yml`: la misma de los E2E, en
`127.0.0.1:5433`, BD `fitloyalty_test`, con los datos en memoria. El esquema lo crean las
migraciones de `backend/migrations`, con la misma función que aplica el backend al arrancar.
Desde la raíz:

```bash
docker compose -f e2e/docker-compose.yml up -d --wait db-test
DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test pnpm --dir backend run test:integracion
docker compose -f e2e/docker-compose.yml down -v
```

En PowerShell, el segundo comando es
`$env:DATABASE_URL='postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test'; pnpm --dir backend run test:integracion; Remove-Item Env:DATABASE_URL`
(el `Remove-Item` evita que la variable siga definida en la terminal).

- Sin `DATABASE_URL`, `pnpm test` los muestra como *skipped*: así corren en el job `backend`.
  En el CI corren en el job `integracion` de `.github/workflows/tests.yml`, con PostgreSQL como
  servicio, y ese job falla si queda alguno saltado.
- La variable es `DATABASE_URL`, como en el bootcamp, pero solo cuenta la del entorno del
  proceso: la que exportas en la terminal o la que pone el CI. `backend/.env` trae la de
  desarrollo y `dotenv` la cargaría; `tests/integracion/entorno-del-proceso.js` (`setupFiles` de
  `jest.config.js`) guarda la del proceso antes de que un test cargue nada, así que la del `.env`
  no activa estos tests.
- Dos revisiones, las dos antes de abrir una conexión:
  - Al cargar los tests, la guardia de `e2e/guardia-bd.cjs`, la misma de los E2E, exige la forma
    exacta `postgres://usuario:clave@127.0.0.1:5433/nombre_test`, con `?sslmode=` como único
    parámetro. El usuario, la clave y la BD solo pueden llevar letras, números y `. _ ~ -`. El
    host es `127.0.0.1` y nunca `localhost`, que en Windows puede resolver a `::1`.
  - Antes de migrar, se revisan el host, el puerto y la BD que `pg` va a usar de verdad con el
    pool de la app ya construido. Si no son los de la BD de pruebas, los tests fallan sin conectarse.
- La guardia confía en lo que escuche en `127.0.0.1:5433`. En Windows, si ese puerto ya lo ocupa
  otro Postgres (de otro proyecto), los tests se conectan a ese: antes de correrlos, comprueba que
  `docker ps --filter publish=5433` muestre solo el contenedor de `db-test`.

---

## Pruebas

El proceso completo está en [`docs/pruebas/`](docs/pruebas/README.md): plan de pruebas,
matriz de casos, colección Postman, reporte de ejecución y registro de defectos.

| Nivel | Herramienta | Comando (desde la raíz) | Resultado del 2026-11-23 |
|---|---|---|---|
| Unitarias backend | Jest + Supertest | `pnpm --dir backend test` | 1.343 pasan · cobertura 92,4 % (umbral en `jest.config.js`) |
| Integración con BD real | Jest + PostgreSQL 16 | ver [Pruebas de integración](#pruebas-de-integración-bd-real) | 272 pasan (71 de ellas también corren en la fila anterior) |
| Componentes frontend | Vitest + Testing Library + MSW | `pnpm --dir frontend test` | 895 pasan · cobertura 87,3 % |
| End-to-end | Playwright (Chromium) | `pnpm --dir e2e run db:up` y `pnpm --dir e2e test` | 44 pasan |
| API (matriz de casos) | Postman + Newman | ver [docs/pruebas/postman](docs/pruebas/postman/README.md) | 29 de 29 casos (el 2026-11-22 falló CP-12 → defecto D-10, #117, ya corregido) |

En total, 2.512 pruebas distintas, y pasan todas. El conteo está en el
[reporte](docs/pruebas/reporte-ejecucion-2026-11-22.md#resumen); el bloque para
repetirlo todo, en el [plan, sección 8](docs/pruebas/plan-de-pruebas.md#8-cómo-repetir-las-pruebas).

- **Módulo crítico:** el check-in. Cobertura de `backend/src/routes/checkin.js` 97,6 % y de
  `frontend/src/pages/CheckinPage.jsx` 97,7 %.
- **Ambiente de pruebas separado:** todo lo que usa base de datos corre contra `db-test`
  (`127.0.0.1:5433`, datos en memoria), nunca contra la base de desarrollo (5432) ni producción.
- **En el CI** (`.github/workflows/tests.yml`) corren los jobs `backend`, `frontend`,
  `integracion` y `e2e` en cada push y PR; la cobertura no puede bajar del umbral.
- **Defectos:** se registran como issues con la etiqueta `bug`, una de severidad y una de estado
  ([criterios y registro](docs/pruebas/defectos.md)). El commit que corrige un defecto lo
  referencia: `fix(modulo): ... (cierra #N)`.

---

## Correo transaccional (Brevo)

El envío usa la **API HTTPS de Brevo**, no SMTP, porque el plan gratuito de Render
bloquea los puertos SMTP salientes.

Para activarlo, pon tu API key v3 en `.env`:

```env
BREVO_API_KEY=xkeysib-tu-clave-aqui
MAIL_FROM=FitLoyalty <tucorreo@tudominio.com>
```

y reinicia el backend: `docker compose up -d backend`.

**Sin `BREVO_API_KEY` los correos no se envían.** El sistema cae a "modo consola":
deja en el log a quién iba el correo y su asunto, sin enviarlo. El código de
recuperación **no** viaja en la respuesta HTTP. Fuera de desarrollo (`NODE_ENV`
distinto de `development` o `test`) los números de 4 cifras o más del asunto salen tapados, porque el
asunto del correo de recuperación lleva el código. Para ensayar la recuperación sin
correo, usa el modo demo de `SHOW_DEV_CODE_IN_UI` (ver la nota de abajo).

Verifica que funciona pidiendo un restablecimiento y mirando el log:

```bash
docker compose logs backend | grep EMAIL
```

| Mensaje en el log                | Significado |
|----------------------------------|-------------|
| `BREVO_API_KEY no configurada`   | Falta la clave → modo consola |
| `Cliente Brevo API inicializado` | La clave se leyó correctamente |
| `Enviado OK: <id>`               | Correo entregado |
| `Error Brevo: Status code: 401`  | La clave es inválida o expiró |

> ⚠️ **`SHOW_DEV_CODE_IN_UI`**: muestra el código de recuperación en pantalla
> para ensayar el flujo sin correo. Solo funciona con `SHOW_DEV_CODE_IN_UI=true` y
> `NODE_ENV=development` (o `test`); si `NODE_ENV` falta o trae otro valor, cuenta como
> producción. Con `docker compose`, `NODE_ENV` vale `production` por defecto: para el
> modo demo pon `NODE_ENV=development` y `SHOW_DEV_CODE_IN_UI=true` en tu `.env`. En
> producción el código llega únicamente por correo: si el envío falla, la persona ve
> el mensaje de siempre y el servidor deja el motivo en el log. (Antes, si el correo fallaba, el código salía en la respuesta
> aunque la variable estuviera en `false`, y cualquiera que conociera un correo del
> panel podía cambiarle la contraseña).

---

## Ramas

| Rama | Para qué |
|---|---|
| `main` | Lo estable: lo que se despliega y se entrega. Solo recibe releases desde `develop`, aprobadas por otra persona |
| `develop` | Integración del trabajo de todos |
| `feat/…`, `fix/…`, `docs/…`, `chore/…` | Una por tarea; sale de `develop`, vuelve a `develop` por Pull Request y se borra al fusionar |

Nadie hace push directo a `main` ni a `develop`. Flujo completo, releases, dueños de archivos y
convención de nombres en [`CONTRIBUTING.md`](CONTRIBUTING.md). Plan de la semana en
[`docs/plan-trabajo.md`](docs/plan-trabajo.md).

---

## Problemas frecuentes

**`ports are not available: … bind: Only one usage of each socket address`**
Otro proceso ocupa el 3001 o el 5173. Búscalo y ciérralo:
```bash
netstat -ano | findstr "5173"
```
Suele ser un `pnpm run dev` anterior que quedó vivo. Ojo: un servidor Vite escuchando
solo en `::1` (IPv6) **tapa al contenedor** sin dar error de puerto, porque
`localhost` resuelve IPv6 primero. Si la app responde pero se comporta raro,
comprueba quién contesta — debe decir `Server: nginx`:
```bash
curl -sD - -o /dev/null http://localhost:5173/
```

**`The server does not support SSL connections`**
Postgres local sin SSL. Añade `DB_SSL=false` a tu `.env`.

**El puerto 5432 ya está ocupado**
Tienes un PostgreSQL instalado en el sistema. Cambia el puerto publicado del
contenedor en `.env`, por ejemplo `POSTGRES_PORT=5434`. El backend no se ve afectado:
dentro de la red de Docker se conecta a `db:5432`.

**`409 Conflict` al registrar**
El correo ya existe. `usuario.email` es único **en toda la plataforma**, no por
gimnasio. El cuerpo de la respuesta indica cuál choca: `USER_EMAIL_TAKEN` (correo del
dueño) o `GYM_EMAIL_TAKEN` (correo del gimnasio, que además es opcional y puedes
dejar vacío).

**El dashboard aparece en ceros**
Es lo esperado en una base recién creada: no hay datos de demo. Registra miembros y
check-ins desde la interfaz.
