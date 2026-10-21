# FitLoyalty · Kanban de Testing (sem 1 → 7)

**Plazo:** 6 oct 2026 → 22 nov 2026 (sustentación: última semana de nov)
**Equipo:** Luis · Santiago · Daniel
**Estándar de cobertura:** [bc-testing-adso](https://github.com/ergrato-dev/bc-testing-adso) · piso por semana + regla de trinquete (sube, nunca baja)

---

## Leyenda

| Símbolo | Significado |
|---|---|
| `[ ]` | Pendiente |
| `[~]` | En progreso |
| `[x]` | Hecho |
| `**owner**` | Responsable principal (rotar cada semana) |
| `[Piso: NN%]` | Umbral de cobertura a cumplir |
| `[GO/NO-GO]` | Decisión de cierre obligatorio |

**Áreas:** `DEVOPS` = CI/CVE/pnpm · `BACK` = unit + contrato · `FRONT` = componentes RTL · `BD` = integración Postgres · `E2E` = Playwright · `DOC` = docs/estrategia-pruebas.md

---

## Matriz de rotación

Cada persona debe tener commits propios en ≥ 3 áreas distintas antes de la sustentación.

| Persona | Sem 1 | Sem 2 | Sem 3 | Sem 4 | Sem 5 | Sem 6 | Sem 7 |
|---|---|---|---|---|---|---|---|
| **Luis** | DEVOPS | BACK | FRONT | BACK | BD | E2E | DOC |
| **Santiago** | BACK | DEVOPS | BACK | BD | E2E | FRONT | E2E |
| **Daniel** | FRONT | FRONT | DEVOPS | E2E | FRONT | BACK | BACK |

---

## Semana 01 · 6–12 oct · Herramientas + línea base · `[Piso: línea base]`

### DEVOPS
- [ ] **Luis** — Instalar `pnpm` global, correr `pnpm import` desde `package-lock.json` (root, backend, frontend); borrar `package-lock.json` después.
- [ ] **Santiago** — Crear `pnpm-workspace.yaml` en raíz con `packages: ['backend', 'frontend']`. Verificar que `pnpm -r install` funciona.
- [ ] **Daniel** — Crear `.npmrc` en raíz y en cada workspace con `save-exact=true`, `auto-install-peers=true`, `strict-peer-dependencies=false`.
- [ ] **Luis** — Quitar `^` y `~` de TODAS las versiones en `package.json` (root, backend, frontend). Versiones exactas.
- [ ] **Luis** — Actualizar `docker-compose.yml` y `Dockerfile` para usar `corepack enable` y `pnpm` en vez de `npm`.

### BACK
- [ ] **Santiago** — En `backend/jest.config.js`: ampliar `collectCoverageFrom` a `src/routes/**/*.js` y `src/jobs/**/*.js`. Agregar `coverageThreshold` con piso inicial (baseline; sin falla aún).
- [ ] **Santiago** — Medir cobertura actual real con `pnpm --filter backend test -- --coverage` y guardar captura en `docs/cobertura-baseline-backend.txt`.

### FRONT
- [ ] **Daniel** — Instalar `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. Crear `frontend/vitest.config.js` con `environment: 'jsdom'` y `coverage.thresholds` (baseline; sin falla aún).
- [ ] **Daniel** — Medir cobertura actual real con `pnpm --filter frontend test -- --coverage` y guardar captura en `docs/cobertura-baseline-frontend.txt`.

### E2E
- [ ] **Luis** — Instalar `@playwright/test`, correr `pnpm exec playwright install --with-deps chromium`. Crear `e2e/` con `playwright.config.ts` (baseURL `http://localhost:5173`, webServer local).
- [ ] **Luis** — Grabar **un E2E de humo** (login → ver dashboard) con `pnpm exec playwright codegen`. **Importante:** reescribir selectores con `getByRole`/`getByLabel` antes de mergear; el codegen produce selectores frágiles.

### DOC
- [ ] **Luis** — Borrador de `docs/estrategia-pruebas.md` con secciones vacías (se va llenando en cada semana).

**Acceptance criterios:**
- `pnpm -r install` exitoso en limpio
- Cero `^` o `~` en cualquier `package.json`
- Cobertura base medida y guardada (no exigida aún)

---

## Semana 02 · 13–19 oct · CI + unitarias de lógica de negocio · `[Piso: 30%]`

### DEVOPS
- [ ] **Santiago** — Crear `.github/workflows/ci.yml` con jobs: `lint`, `test-backend`, `test-frontend`, `audit`. Cada job debe instalar con `pnpm/action-setup@v2` + `pnpm install --frozen-lockfile`.
- [ ] **Santiago** — Crear `.github/dependabot.yml` para `frontend/` y `backend/`, schedule weekly, agrupar minor+patch.
- [ ] **Santiago** — Job `audit`: `pnpm audit --audit-level=high` → falla el PR si hay CVE high/critical.
- [ ] **Santiago** — Activar branch protection en `main`: requerir CI verde para mergear.

### BACK
- [ ] **Luis** — Tests AAA de `backend/src/lib/validators.js`: 8 esquemas Zod (login, signup, staff, forgot/verify/reset password, más el 8º a reconfirmar). Casos: input válido, input inválido por campo, mensajes en español.
- [ ] **Santiago** — Tests AAA de `backend/src/services/planes.js`, `trial.js`, `mensajes.js`, `invitations.js`: casos de éxito y error de cada función pública.
- [ ] **Santiago** — Subir `coverageThreshold` a 30% en `backend/jest.config.js`. **Bumpear este número cada semana.**

### FRONT
- [ ] **Daniel** — Tests de `frontend/src/utils/useApiErrors.js` y `frontend/src/utils/api.js`: al menos 3 casos por util (no solo smoke).
- [ ] **Daniel** — Subir `coverage.thresholds.lines/functions/branches/statements` a 30% en `frontend/vitest.config.js`.

**Acceptance criterios:**
- CI corre en cada PR y bloquea si coverage < 30% o si hay CVE high/critical
- Branch protection activa

---

## Semana 03 · 20–26 oct · Componentes React · `[Piso: 45%]`

### FRONT
- [ ] **Daniel** — RTL sobre formularios con validación propia:
  - `RegisterPage.jsx`: render, error visible por campo, envío válido, error backend (`USER_EMAIL_TAKEN`, `VALIDATION_ERROR`)
  - `RegisterOwnerPage.jsx`: mismos casos
  - `LoginPage.jsx`, `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx`: render + casos de error
- [ ] **Luis** — Tests de `MiembrosPage.jsx` y `StaffPage.jsx`: render de listas + alta con mock de API.
- [ ] **Santiago** — **Crear `frontend/src/utils/validation.js`** con regex única de email y teléfono. Migrar `RegisterPage` y `RegisterOwnerPage` para importarla. Agregar 2 tests de la regex (válido/inválido).

### BACK
- [ ] **Santiago** — Cubrir huecos restantes hasta 45% (probablemente `auth-helpers.js` adicional o middleware).

**Acceptance criterios:**
- Coverage frontend ≥ 45%
- DRY de regex: ambos forms usan la misma fuente

---

## Semana 04 · 27 oct–2 nov · Contrato de API · `[Piso: 55%]`

### BACK
- [ ] **Luis** — supertest contra `backend/src/routes/auth.js`: casos 200 (signup, login, forgot, verify, reset), 400 (payload malformado), 401 (token inválido), 409 (`USER_EMAIL_TAKEN`).
- [ ] **Santiago** — supertest contra `backend/src/routes/miembros.js`, `staff.js`, `checkin.js`, `config.js`: estados HTTP, forma del JSON, 400/401/403/404/409.
- [ ] **Daniel** — **Resolver admin.js** (ruta semilla con `santicosalamanca@gmail.com` hardcodeado):
  - Opción A: agregar esquema Zod + mover el email a `.env` (`SEED_ADMIN_EMAIL`) con guarda `NODE_ENV !== 'development'` → 403
  - Opción B: documentar como excluida de cobertura en `docs/estrategia-pruebas.md` por ser solo dev
- [ ] **Daniel** — Fijar defectos de contrato que aparezcan (body malformado, content-type incorrecto) en la misma semana.

### FRONT
- [ ] **Daniel** — Bajar la barra hasta 55%: tests de páginas restantes (`DashboardPage`, `ConfiguracionPage`, etc.) con mocks de API.

**Acceptance criterios:**
- Coverage backend ≥ 55%
- Decisión sobre admin.js ejecutada (código o documento)

---

## Semana 05 · 3–9 nov · Dobles de prueba · `[Piso: 65%]`

### BACK
- [ ] **Luis** — Inventario completo de dependencias externas: Brevo (`@getbrevo/brevo`), WhatsApp (`whatsapp-web.js`), `node-cron`, **Puppeteer** (PDF de contratos — no estaba en el plan original). Documentar cada uno en `docs/dependencias-externas.md`.
- [ ] **Santiago** — `vi.fn`/`jest.mock` sobre `backend/src/lib/email.js`: se llama correctamente, no se llama cuando no debe, el flujo sigue si el envío falla.
- [ ] **Santiago** — Mocks equivalentes para `whatsapp.js`, `puppeteer` (PDF), `node-cron` (jobs de expiración).
- [ ] **Daniel** — Tests de integración de `cron` (jobs de expiración de planes/trial) usando fake timers.

### E2E
- [ ] **Luis** — Ampliar E2E con `page.route` para simular caídas de red en `e2e/checkin.spec.ts`: respuesta 500, timeout, payload malformado. Validar que la UI muestra error y no crashea.

**Acceptance criterios:**
- Coverage backend ≥ 65%
- 0 llamadas reales a Brevo/WhatsApp/Puppeteer durante tests (verificar con logs)

---

## Semana 06 · 10–16 nov · Integración con Postgres real · `[Piso: 75%]`

### DEVOPS
- [ ] **Luis** — Agregar servicio `db-test` en `docker-compose.yml`: `postgres:16-alpine` en puerto **5433** (separado), volumen `pgdata-test`, mismo healthcheck. Variables `POSTGRES_USER`/`PASSWORD`/`DB` distintas o prefijadas con `_test`.
- [ ] **Santiago** — Agregar job `test-integration` en CI con `services: postgres: image: postgres:16-alpine, env: POSTGRES_DB=fitloyalty_test`. Que corra ya desde esta semana (no esperar a semana 07).

### BACK
- [ ] **Santiago** — Tests de integración de **al menos 1 repositorio** (consulta E2E del SQL real) y **2 endpoints reales**: `POST /api/miembros` y `POST /api/checkin`.
- [ ] **Daniel** — Helper `backend/tests/helpers/db.js`: cada test corre dentro de transacción con rollback al final, **o** `TRUNCATE` entre casos. **Cero estado compartido entre tests.**

### DEVOPS
- [ ] **Luis** — Documentar el procedimiento de "BD de tests aislada" en `docs/estrategia-pruebas.md`.

**`[GO/NO-GO]`** al cierre: si coverage < 70%, replanear semana 07 (el salto 75→80% es el más arriesgado).

**Acceptance criterios:**
- Coverage backend ≥ 75%
- Job `test-integration` verde en CI

---

## Semana 07 · 17–22 nov · E2E completo + cierre · `[Piso: 80%]`

### E2E
- [ ] **Santiago** — Playwright cubre los **3 flujos críticos**:
  1. **Registro de gimnasio** (signup → onboarding → dashboard)
  2. **Login + checkin de miembro** (login → seleccionar miembro → checkin QR → ver estado)
  3. **Alta de miembro con cobro** (login owner → alta miembro → ver pago → ver factura PDF)

### DEVOPS
- [ ] **Daniel** — CI ampliado con Postgres como servicio, corre unitarias + integración + E2E en cada PR.
- [ ] **Daniel** — Subir `coverageThreshold` a **80%** en backend **y** frontend. El PR falla si baja.
- [ ] **Luis** — Verificar que `pnpm audit --audit-level=high` sigue limpio.

### DOC
- [ ] **Luis** — **Redactar `docs/estrategia-pruebas.md`** (plantilla del bootcamp, máx. 2 páginas):
  - Qué prueba cada capa
  - Qué queda fuera y por qué (admin.js si se excluyó)
  - Listado explícito de archivos excluidos de cobertura (config, types, mocks, seeders)
  - Hallazgos conocidos
- [ ] **Santiago** — **Matriz de rotación final**: confirmar que cada integrante tiene commits propios en ≥ 3 áreas. Capturas en `docs/matriz-rotacion.md`.

**Acceptance criterios:**
- Coverage ≥ 80% en frontend **y** backend, exigida en CI
- 3 flujos E2E críticos pasando en CI
- `docs/estrategia-pruebas.md` completo

---

## Backlog continuo (todas las semanas)

- [ ] **Todos** — Revisar PRs de Dependabot cada lunes (hábito del equipo).
- [ ] **Todos** — Cerrar issues de flake E2E con retry policy o `test.fixme` con justificación.
- [ ] **Luis** — Mantener `docs/dependencias-externas.md` actualizado.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Flake en Playwright E2E | Alta | Alto | Retry policy (2), `page.route` para red simulada, no `waitForTimeout` arbitrarios |
| Salto 75→80% no se logra | Media | Alto | `GO/NO-GO` al cierre de sem 06; si <70%, replanear sem 07 |
| admin.js rota contrato al cambiar | Baja | Medio | Si se eligió opción A (agregar Zod), tests de la opción A en sem 04 |
| Dependabot inunda PRs | Media | Bajo | `groups.minor-and-patch`, `open-pull-requests-limit: 5` |
| Diferencias de versión entre local y CI | Baja | Alto | `pnpm install --frozen-lockfile` en CI; lockfile commiteado |
| Cobertura estancada por código legacy | Media | Medio | Excluir explícitamente en config + `docs/estrategia-pruebas.md` justifica |

---

## Excluidos de cobertura (a documentar)

Estos archivos se excluyen explícitamente del cálculo de cobertura. Justificación en `docs/estrategia-pruebas.md`.

- `backend/src/index.js` — entrypoint, lógica de bootstrap
- `backend/src/db/seed_pg.js` — solo dev/sustentación
- `backend/src/lib/email.js` — solo se testea vía mocks (sem 05)
- `backend/src/lib/whatsapp.js` — solo se testea vía mocks (sem 05)
- `frontend/src/main.jsx` — entrypoint
- `frontend/src/**/*.test.{js,jsx,ts,tsx}` — meta
- `frontend/src/**/__mocks__/**` — meta

(La lista final puede ajustarse en sem 07 al cierre.)

---

## Checklist de cierre (antes del 23 nov)

- [ ] CI verde en `main` con jobs: lint, test-backend, test-frontend, test-integration, test-e2e, audit
- [ ] Coverage ≥ 80% en frontend **y** backend, **exigida** por el comando de test (no solo medida)
- [ ] `docker-compose.yml` con `db-test` aislada de la BD de desarrollo
- [ ] 3 flujos E2E críticos cubiertos por Playwright, corriendo en CI
- [ ] `docs/estrategia-pruebas.md` escrito (máx. 2 páginas, plantilla del bootcamp)
- [ ] Cada integrante con commits de test propios en ≥ 3 áreas distintas (matriz de rotación)
- [ ] Esquema Zod agregado (o exclusión documentada) para la ruta de siembra en `admin.js`
- [ ] Cero CVE high/critical en `pnpm audit`
- [ ] Dependabot activo y revisado

---

## Referencias del plan original

- Plan generado sobre el estado del repo al 6 oct 2026
- Estándar: [github.com/ergrato-dev/bc-testing-adso](https://github.com/ergrato-dev/bc-testing-adso)