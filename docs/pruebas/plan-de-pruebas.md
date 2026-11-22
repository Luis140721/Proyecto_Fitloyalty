# Plan de pruebas — FitLoyalty (T6)

**Responsable:** Daniel · **Versión:** 1.0 · **Fecha:** 2026-11-22 · **Base probada:** `develop` @ `f3a1a71`

Documentos relacionados:
[matriz de casos](matriz-casos-prueba.md) ·
[reporte de ejecución](reporte-ejecucion-2026-11-22.md) ·
[defectos y su ciclo](defectos.md) ·
[colección Postman](postman/)

## 1. Objetivo

Verificar que FitLoyalty (panel web, API y base de datos) cumple los requisitos
funcionales y no funcionales del producto antes de la entrega de T6, con un
proceso documentado y reproducible: cualquiera del equipo, o el jurado, puede
repetir cada prueba con los comandos de la sección 8.

## 2. Alcance

### Dentro del alcance

| Módulo | Requisitos | Qué se prueba |
|---|---|---|
| Registro y sesión | RQF-19, RQF-02, RQNF-03 | Registro del gimnasio, login, JWT, rutas protegidas, roles |
| Miembros | RQF-03, RQF-04, RQNF-17 | Alta con plan, validaciones, duplicados, búsqueda, edición, autorizaciones |
| Check-in (**módulo crítico**) | RQF-05, RQF-06, RQNF-01, RQNF-04 | Ingreso por QR y documento, antirrebote, membresía vencida o congelada |
| Aislamiento entre gimnasios | RQNF-05 | Un gimnasio no ve ni modifica datos de otro |
| Dashboard, alertas, retos y campañas | RQF-07, RQF-08, RQF-10, RQF-12 | Métricas, umbrales, reglas de los retos, segmentos |
| App del miembro (API) | RQF-15 | Login por teléfono, QR, mensajes |
| Base de datos | — | Migraciones, restricciones (NOT NULL, largos, UNIQUE, FK), transacciones |

El **módulo crítico** es el check-in (`backend/src/routes/checkin.js` y
`frontend/src/pages/CheckinPage.jsx`): es la operación que hace el gimnasio
decenas de veces al día y decide si una persona entra o no.

### Fuera del alcance

- Envío real de WhatsApp y correo: dependen de Chrome con sesión de WhatsApp y
  de Brevo. Se prueban con dobles (mocks); en el ambiente de pruebas están apagados.
- App móvil Flutter en dispositivo: se prueba su API desde Postman y Jest, no la
  interfaz del teléfono.
- Carga y estrés: el producto apunta a gimnasios de barrio; RQNF-01 se mide por
  caso (tiempo de respuesta del check-in), no con pruebas de carga.
- Disponibilidad en producción (RQNF-02): la mide el monitor externo, no este plan.

## 3. Niveles y tipos de prueba

| Nivel | Herramienta | Dónde vive | Qué cubre | Cuándo corre |
|---|---|---|---|---|
| Unitarias backend | Jest + Supertest (BD simulada) | `backend/tests/*.test.js` | Rutas, validaciones, reglas de negocio, manejo de errores | Cada push y PR (job `backend`) |
| Unitarias / componentes frontend | Vitest + Testing Library + MSW | `frontend/tests/` | Pantallas, formularios, hooks, cliente de la API | Cada push y PR (job `frontend`) |
| Integración con BD real | Jest contra PostgreSQL 16 | `backend/tests/integracion/`, `*-real.test.js` | Esquema, restricciones, transacciones, concurrencia | Cada push y PR (job `integracion`) |
| API (sistema) | Postman + Newman | `docs/pruebas/postman/` | 29 casos de la matriz contra la API levantada | Antes de cada entrega y al verificar un defecto |
| End-to-end | Playwright (Chromium) | `e2e/tests/` | Flujos completos en el navegador: registro, login, alta, check-in | Cada push y PR (job `e2e`) |
| Usabilidad | Observación con 3 personas | `scripts/rqnf-04-sesiones/` | RQNF-04: check-in manual en ≤ 2 interacciones | Una vez, antes de la sustentación |

Tipos que se aplican en esos niveles: funcional (positivo y negativo), valores
límite (largos de columnas, metas, fechas), seguridad (JWT, aislamiento,
errores que no filtran SQL), concurrencia (dos peticiones a la vez) y regresión
(cada defecto corregido deja una prueba que lo reproduce).

## 4. Ambiente de prueba (separado del de desarrollo)

| | Desarrollo | **Pruebas** |
|---|---|---|
| Base de datos | Postgres de `docker-compose.yml` raíz, puerto **5432**, volumen persistente `pgdata` | Postgres 16.15 de `e2e/docker-compose.yml` (`db-test`), puerto **5433**, solo en `127.0.0.1`, datos en **memoria** (`tmpfs`) |
| Nombre de la BD | `fitloyalty` | `fitloyalty_test` (la guardia exige el sufijo `_test`) |
| Credenciales | las del `.env` del desarrollador | solo de prueba (`fitloyalty_test`), no son secretos |
| Backend | `pnpm run dev`, con el `.env` | `node src/index.js` con variables fijadas por el comando de prueba: `NODE_ENV=test`, `JWT_SECRET` de prueba, `DISABLE_SCHEDULER=true`, `ENABLE_WHATSAPP=false`, sin claves de correo |
| Datos | los que el equipo va creando | cada prueba crea los suyos y los borra; `npm run db:down` destruye la BD |

Protecciones para no tocar desarrollo ni producción:

- `e2e/guardia-bd.cjs` rechaza cualquier URL que no sea exactamente
  `postgres://usuario:clave@127.0.0.1:5433/nombre_test` antes de conectarse.
- `backend/tests/integracion/entorno-del-proceso.js` impide que el `.env` de
  desarrollo active las pruebas de integración.
- Las pruebas con base real se niegan a correr si el host no es local.
- Postman usa datos únicos por corrida (`Date.now()`), así que se puede repetir
  sin limpiar.

Equipo de la ejecución del 2026-11-22: Windows 11, Node.js 24.14.1,
pnpm 12.15.0, Docker Desktop, PostgreSQL 16.15-alpine, Chromium de Playwright.
El CI corre lo mismo en `ubuntu-latest` con Node 24 (`.github/workflows/tests.yml`).

## 5. Criterios de entrada y salida

**Entrada:** la rama compila (`node --check` de `src/`, `vite build`), el
ambiente de pruebas está arriba y las migraciones se aplicaron sin error.

**Salida (para dar una entrega por probada):**

1. Pruebas unitarias, de integración y E2E en verde en el CI.
2. Cobertura por encima del umbral de `jest.config.js` y `vite.config.js`, que
   nunca baja (regla de trinquete del bootcamp); el módulo crítico ≥ 50 %.
3. Colección Postman ejecutada, con cada fallo asociado a un defecto registrado.
4. Ningún defecto de severidad **crítica** abierto.

## 6. Gestión de defectos

Los defectos se registran como **issues de GitHub** con la etiqueta `bug`, una
de **severidad** y una de **estado**. El detalle y el registro actual están en
[defectos.md](defectos.md).

| Severidad | Criterio |
|---|---|
| `severidad: crítica` | Pérdida o corrupción de datos, o la función principal no se puede usar y no hay alternativa |
| `severidad: alta` | Una función principal falla o deja datos inconsistentes, pero hay alternativa |
| `severidad: media` | Una función secundaria falla, o un error se reporta mal (503 en vez de 400) |
| `severidad: baja` | Cosmético o de mensajes, sin efecto en los datos |

Ciclo: **detectado** (issue abierto, con cómo reproducirlo) → **en corrección**
(PR que lo referencia) → **corregido** (PR fusionado) → **verificado** (se
re-ejecuta el caso o la prueba de regresión y pasa; el issue se cierra).

## 7. Roles y calendario

| Persona | Responsabilidad en pruebas |
|---|---|
| Daniel | Plan, matriz, Postman, registro de defectos, reporte de ejecución |
| Luis | Corrección de defectos de su zona, pruebas de usabilidad (RQNF-04) |
| Santiago | Linter, documentación de la API, despliegue para la demo |

| Fecha | Hito |
|---|---|
| 2026-11-22 | Primera ejecución completa (este reporte) |
| 2026-11-26 | Re-ejecución tras fusionar los PR pendientes (#83 y los de cada uno) |
| 2026-11-27 | Entrega |

## 8. Cómo repetir las pruebas

Desde la raíz del repo, con Docker Desktop abierto y `pnpm install` hecho en
`backend/`, `frontend/` y `e2e/`:

```bash
# Unitarias con cobertura
pnpm --dir backend test
pnpm --dir frontend test

# BD de pruebas (puerto 5433, en memoria)
pnpm --dir e2e run db:up

# Integración contra PostgreSQL
DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test \
  pnpm --dir backend run test:integracion

# E2E (levanta backend y frontend solos)
pnpm --dir e2e test

# Postman: levantar la API contra la BD de pruebas y correr la colección
cd backend
DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test DB_SSL=false \
JWT_SECRET=jwt-solo-para-pruebas NODE_ENV=test DISABLE_SCHEDULER=true ENABLE_WHATSAPP=false \
  node src/index.js &
npx newman@6.2.1 run ../docs/pruebas/postman/FitLoyalty.postman_collection.json

# Al terminar: destruir la BD de pruebas
pnpm --dir e2e run db:down
```

En PowerShell, las variables se definen antes del comando:
`$env:DATABASE_URL='postgres://...'; $env:NODE_ENV='test'; ...`.
