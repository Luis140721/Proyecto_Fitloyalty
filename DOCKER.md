# FitLoyalty — Guía de Docker Compose (desarrollo local integral)

Esta guía cubre el nuevo flujo **todo-en-uno** con Docker Compose: un solo comando
levanta PostgreSQL, el backend (Express) y el frontend (Vite + nginx), sin instalar
Node ni Postgres en tu maquina.

> Para el flujo tradicional sin Docker, mira `COMO_CORRER.md`.

---

## Requisitos

- **Docker Desktop** (Windows/Mac) o **Docker Engine** (Linux), version >= 24.
- En Windows, **WSL2** activado (Docker Desktop lo instala por ti).
- ~1 GB libres para las imagenes (la mayoria ya esta cacheada si corriste el stack antes).

## Arranque (primera vez)

```bash
# 1. Ir a la raiz del proyecto
cd Proyecto_FitLoyalty

# 2. Crear tu .env a partir del ejemplo
cp .env.example .env
# (Opcional) editar .env y cambiar JWT_SECRET por algo aleatorio.

# 3. Levantar la pila completa (db + backend + frontend)
docker compose --env-file .env up --build -d

# 4. Esperar ~40s a que el backend termine de migrar y arrancar.

# 5. Ver logs en vivo (Ctrl+C para salir)
docker compose --env-file .env logs -f

# 6. Ver estado de los servicios
docker compose --env-file .env ps

# 7. Abrir en el navegador:
#    http://localhost:5173  -> App React (FitLoyalty)
#    http://localhost:3001/api/healthz -> Health del backend
```

## Comandos del dia a dia

| Accion | Comando |
|---|---|
| Arrancar todo | `docker compose --env-file .env up -d` |
| Re-build tras cambiar codigo | `docker compose --env-file .env up --build -d` |
| Ver logs en vivo | `docker compose --env-file .env logs -f` |
| Solo logs del backend | `docker compose --env-file .env logs -f backend` |
| Estado de servicios | `docker compose --env-file .env ps` |
| Parar todo (sin borrar datos) | `docker compose --env-file .env stop` |
| Reanudar tras parar | `docker compose --env-file .env start` |
| **Borrar todo y empezar de cero** | `docker compose --env-file .env down -v` |
| Entrar al contenedor del backend | `docker compose exec backend sh` |
| Conectarse a Postgres | `docker compose exec db psql -U fitloyalty -d fitloyalty` |
| Reiniciar solo el backend | `docker compose --env-file .env restart backend` |

## Arquitectura local

```
Navegador -> http://localhost:5173 (frontend, contenedor nginx)
                  |
                  | nginx proxy /api/* -> http://backend:3001
                  v
              backend (contenedor Node 24)
                  |
                  | postgres://fitloyalty:fitlocal@db:5432/fitloyalty
                  v
              db (contenedor PostgreSQL 16, volumen fitloyalty_pgdata)
```

Los datos de Postgres viven en el volumen nombrado `fitloyalty_pgdata`, asi que
`docker compose stop` + `start` NO los pierde. Solo `down -v` los borra (volumen
+ red + contenedores).

## Endpoints utiles para pruebas manuales

| URL | Para que |
|---|---|
| `http://localhost:5173/` | App FitLoyalty (registro + login + dashboard) |
| `http://localhost:5173/api/healthz` | Proxy test: llega al backend via nginx |
| `http://localhost:3001/api/healthz` | Health directo del backend |
| `http://localhost:3001/api/admin/diagnostics` | Info del esquema (necesita JWT) |

### Smoke test end-to-end con curl

```bash
# 1. Registrar un gimnasio + admin
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "ownerEmail":"santiago@test.co",
    "ownerName":"Santiago Test",
    "password":"DockerCompose_2026",
    "gymName":"Gimnasio Docker",
    "gymPhone":"3001234567"
  }'
# -> devuelve { token, user, gym }

# 2. Loguearse
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"santiago@test.co","password":"DockerCompose_2026"}'

# 3. Endpoint protegido (reemplaza TOKEN)
curl http://localhost:3001/api/admin/dashboard \
  -H "Authorization: Bearer TOKEN"
```

## Solucionar problemas comunes

| Sintoma | Causa | Fix |
|---|---|---|
| `port is already allocated` al levantar | Postgres local de tu PC ocupa el puerto | Cambiar `POSTGRES_PORT` en `.env` (5433, 5434...) |
| Backend reinicia en bucle: "SSL not supported" | Postgres de compose no usa SSL pero el backend lo intenta | Verificar que `DB_SSL=false` llega al contenedor: `docker inspect fitloyalty_backend \| grep DB_SSL` |
| `/api/auth/signup` devuelve 500 "relation X does not exist" | BD vacia, migraciones no aplicadas (volumen nuevo) | `docker compose restart backend`; o borrar volumen: `down -v && up --build -d` |
| Frontend dice "Network error" | nginx no resuelve `backend` (DNS interno) | Confirmar que `fitloyalty_backend` esta `Up` con `docker compose ps` |
| Cambios en el codigo no se reflejan | El contenedor tiene copia vieja | `docker compose up --build -d` para re-construir |
| "DATABASE does not exist" al conectar | Volumen viejo con BD diferente | `down -v` para borrar el volumen `pgdata` |
| Quiero resetear la BD sin perder imagenes | Parar backend + borrar volumen + relanzar | `docker compose stop backend && docker compose down -v && docker compose up -d` |

## Variables de entorno

Todas viven en `.env` (NO commitear). Valores por defecto funcionan "out of the
box" para desarrollo local. Para produccion cambia **obligatoriamente**:

- `JWT_SECRET` — usa `openssl rand -hex 32` para generar uno nuevo.
- `POSTGRES_PASSWORD` — distinto del `fitlocal` por defecto.
- `SMTP_*` o `RESEND_API_KEY` — solo si quieres enviar correo real.

Si prefieres seguir contra **Neon** (como Render) en vez del Postgres local,
pon en `.env`:
```
DATABASE_URL=postgresql://owner:pass@ep-restless-....neon.tech/neondb?sslmode=require
```
y elimina el servicio `db` de `docker-compose.yml` (o comenta el bloque).

## Para la sustentacion / evaluadores

1. `git clone <repo>` (rama `santiago`).
2. `cp .env.example .env`
3. `docker compose --env-file .env up --build -d`
4. Esperar 40s, abrir `http://localhost:5173`.
5. Registrar un gimnasio, entrar al dashboard.

Sin instalar Node, sin clonar Node, sin configurar Postgres. Una sola maquina,
dos imagenes, una red.

## Archivos del stack

| Archivo | Rol |
|---|---|
| `docker-compose.yml` | Orquesta `db`, `backend`, `frontend` |
| `.env.example` / `.env` | Variables del entorno (NO commitear `.env`) |
| `backend/Dockerfile` | Build multi-stage del backend (Node 24 + npm + `npm start`) |
| `backend/.dockerignore` | Excluye `node_modules`, `.env`, logs |
| `backend/migrations/00*.sql` | Esquema (aplicadas automaticamente al arrancar) |
| `frontend/Dockerfile` | Build Vite + runtime nginx:alpine |
| `frontend/nginx.conf` | SPA fallback + proxy `/api` al backend |
| `frontend/.dockerignore` | Excluye `node_modules`, `dist`, `.env` |
