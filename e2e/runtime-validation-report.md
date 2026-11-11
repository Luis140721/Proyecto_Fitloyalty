# Runtime Validation Report — Semana 07

**Generated**: 2026-11-10T15:37:44-05:00
**Target**: `Proyecto_Fitloyalty` — flujo de alta de miembro y pago

## Summary

| Step | Status | Exit Code | Details |
|---|---|---:|---|
| Startup | PASS | 0 | Playwright inició API y frontend; `GET /api/health` respondió correctamente |
| Database-backed flow | PASS | 0 | Alta del miembro y lectura posterior del plan/pago persistidos |
| E2E | PASS | 0 | Suite completa repetida 5 veces: 30 aprobadas, 0 fallidas, 0 omitidas |

**Overall**: NEEDS_SIGNOFF

## Environment and per-capability results

- **Docker**: UNAVAILABLE — PowerShell no encontró el comando `docker`.
- **Node.js**: AVAILABLE — `v24.14.1`.
- **Playwright**: AVAILABLE — `1.49.1`; Chromium instalado. La descarga tuvo timeouts iniciales y completó después.
- **Infrastructure tier**: FALLBACK — PostgreSQL local real `18.4`, base aislada `fitloyalty_test`; la API rechazará una base cuyo nombre no termine en `_test`.
- **Browser tier**: PRIMARY — Playwright con Chromium; independiente de la disponibilidad de Docker.
- **Gap de infraestructura**: el reto usa PostgreSQL 16 en Compose; aquí se probó con PostgreSQL 18.4 porque Docker no está disponible.

```tex
environment:
  docker: UNAVAILABLE — PowerShell no encontró el comando docker
  node: AVAILABLE — v24.14.1
  playwright: AVAILABLE — 1.49.1; Chromium instalado
  infra-tier: FALLBACK(local PostgreSQL 18.4) — Docker no disponible
  browser-tier: PRIMARY(Playwright)
startup: PASS — Playwright inició API y frontend; el readiness URL /api/health respondió
integration: PASS — exit_code: 0, passed: 30, failed: 0, skipped: 0; el flujo E2E persistió y volvió a leer datos en PostgreSQL 18.4; PostgreSQL 16 no verificado
e2e: PASS — exit_code: 0, passed: 30, failed: 0; alta y pago, validación, doble envío, carga lenta y login; repetido cinco veces
overall: NEEDS_SIGNOFF — solo se verificó el aporte de Daniel; faltan los otros flujos, CI S8 y factura PDF
```

## Test evidence

Comando ejecutado desde `e2e` en PowerShell. El valor local de conexión se omite:

```powershell
$env:DATABASE_URL = '<URL local de PostgreSQL para fitloyalty_test>'
$env:DB_SSL = 'false'
pnpm exec playwright test --repeat-each=5
```

Resultado: exit code `0`; **30 passed**, **0 failed**, **0 skipped**. Se cubrieron:

- Alta de miembro, plan mensual, pago completo y lectura posterior del plan.
- Validaciones visibles y ausencia de `POST` con datos personales incompletos.
- Doble clic con `POST` retrasado: un solo registro.
- Lista lenta: el formulario sigue disponible y conserva lo escrito.
- Dos pruebas existentes del login.

La suite crea una cuenta temporal por API, reutiliza la sesión guardada para los
tests y la elimina al finalizar. Se verificó que no quedaran gimnasios, usuarios
ni miembros E2E en la base.

## Mutation evidence

Se quitó temporalmente `disabled={submitting}` del botón de alta. La prueba de
doble envío detectó la mutación: **esperaba 1 solicitud y recibió 2**. Después
se restauró el código de producción y la suite completa volvió a pasar con
`--repeat-each=5`.

## Known gaps and sign-off

- El repositorio no implementa generación o descarga de facturas PDF; esa parte
  del flujo de miembro y pago queda pendiente.
- Los flujos de registro de gimnasio y login/check-in del resto del grupo no se
  validaron en esta ejecución.
- La integración de E2E al CI corresponde a la semana 08.
- No se validó contra PostgreSQL 16 en contenedor ni en CI.

Por esas brechas, este resultado valida el aporte individual de Daniel, no el
cierre grupal de S7.
