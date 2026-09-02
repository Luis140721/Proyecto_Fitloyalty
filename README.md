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
- [Correo transaccional (Brevo)](#correo-transaccional-brevo)
- [Ramas](#ramas)
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

> Guía ampliada de Docker en [`DOCKER.md`](DOCKER.md).

---

## Arranque sin Docker

Requiere **Node 18+** y **PostgreSQL** corriendo en local con una base `fitloyalty` creada.

```bash
npm run install:all                      # instala raíz + backend + frontend
cp backend/.env.example backend/.env     # ajusta DB_USER, DB_PASSWORD, JWT_SECRET
npm run dev                              # levanta API y web en una sola terminal
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
| `JWT_EXPIRES_IN`     | no          | `7d`        | Vigencia del token |
| `PORT`               | no          | `3001`      | Puerto del backend |
| `NODE_ENV`           | no          | `production`| Entorno de ejecución |
| `SUPPORT_EMAIL`      | no          | `fitloyaltysaas@gmail.com` | Correo de soporte mostrado en los emails |
| `SUPPORT_TRIAL_DAYS` | no          | `7`         | Días de prueba al registrar un gimnasio |

### Correo

| Variable              | Obligatoria | Por defecto | Descripción |
|-----------------------|:-----------:|-------------|-------------|
| `BREVO_API_KEY`       | no          | —           | API key v3 de Brevo (`xkeysib-…`). **Sin ella no se envía ningún correo** |
| `MAIL_FROM`           | no          | `FitLoyalty <fitloyaltysaas@gmail.com>` | Remitente, formato `Nombre <correo>` |
| `SHOW_DEV_CODE_IN_UI` | no          | `false`     | Expone el código de recuperación en la respuesta HTTP. Solo para demos |

### Frontend

| Variable         | Obligatoria | Por defecto | Descripción |
|------------------|:-----------:|-------------|-------------|
| `VITE_API_BASE`  | no          | vacío       | Déjalo vacío para usar rutas relativas y el proxy de nginx |
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

> `npm run seed` (`seed_pg.js`) **no crea usuarios**: solo actualiza contraseñas y
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
├── ConsultasDB/             → scripts SQL de creación y poblado
├── Documentación/           → backlog, casos de uso, estimaciones
├── Evidencias_Sustentacion/ → pruebas E2E y QA responsive
├── Historias de Usuario/    → historias y capturas del tablero Azure DevOps
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
├── 002_esquema_inicial.sql     → tablas, índices y roles
└── 003_invitacion_staff.sql    → invitaciones de equipo
```

### Vista SQL

`ConsultasDB/Query_Inicial_Crear_Tablas.sql` define la vista `vista_miembros_activos`,
que consume `GET /api/vista/miembros-activos`.

> Esta vista **no está incluida en las migraciones**. Si el endpoint responde `503`,
> aplícala a mano:
> ```bash
> docker compose exec -T db psql -U fitloyalty -d fitloyalty < ConsultasDB/Query_Inicial_Crear_Tablas.sql
> ```

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
registra el mensaje en el log y devuelve el código de recuperación dentro de la
respuesta HTTP para que la interfaz pueda mostrarlo.

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

> ⚠️ **`SHOW_DEV_CODE_IN_UI`**: cuando el envío falla, la API incluye el código de
> recuperación en la respuesta HTTP aunque esta variable esté en `false`. Es útil
> para demostrar el flujo sin dominio verificado, pero significa que **cualquiera
> podría restablecer una contraseña ajena si el correo deja de funcionar**. Antes de
> exponer el servicio a usuarios reales, configura `BREVO_API_KEY` y elimina ese
> fallback en `backend/src/routes/auth.js`.

---

## Ramas

| Rama                 | Contenido |
|----------------------|-----------|
| `main`               | Rama principal |
| `integracion-docker` | Integra el stack de Docker con los componentes de UI. **Rama al día** |
| `santiago`           | Backend, despliegue y Docker |
| `luis-frontend`      | Componentes de interfaz |
| `principal`          | Documentación y evidencias |

---

## Problemas frecuentes

**`ports are not available: … bind: Only one usage of each socket address`**
Otro proceso ocupa el 3001 o el 5173. Búscalo y ciérralo:
```bash
netstat -ano | findstr "5173"
```
Suele ser un `npm run dev` anterior que quedó vivo. Ojo: un servidor Vite escuchando
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
