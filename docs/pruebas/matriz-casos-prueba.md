# Matriz de casos de prueba — FitLoyalty (T6)

**Responsable:** Daniel · **Ejecución:** 2026-11-22, `develop` @ `f3a1a71` ·
**Ambiente:** de pruebas (PostgreSQL 16 en `127.0.0.1:5433`, ver [plan](plan-de-pruebas.md#4-ambiente-de-prueba-separado-del-de-desarrollo))

Cada caso está automatizado en la [colección Postman](postman/FitLoyalty.postman_collection.json)
con el mismo identificador; el «resultado obtenido» es el de la ejecución con
Newman del [reporte](reporte-ejecucion-2026-11-22.md). Los datos llevan un
sufijo único por corrida (`{run}` = marca de tiempo), así que la matriz se
puede repetir sin limpiar la base.

**Resumen:** 29 casos (10 positivos, 19 negativos) · **28 pasan, 1 falla** (CP-12, defecto D-10).

Leyenda: **P** = positivo (camino feliz), **N** = negativo (entrada inválida,
acceso indebido o regla de negocio que debe bloquear). Precondición común
desde CP-05: el gimnasio A de CP-02 existe y su token está guardado.

## Registro y sesión

| ID | Req. | Tipo | Precondición | Datos de entrada | Pasos | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|---|---|---|
| CP-01 | RQNF-02 | P | API levantada | — | `GET /api/healthz` | 200 y `{"status":"ok"}` | 200 `status: ok` (67 ms) | ✅ Pasa |
| CP-02 | RQF-19 | P | Correo no registrado | gymName `Gimnasio QA {run}`, ownerEmail `qa.a.{run}@example.test`, password `Clave2026` | `POST /api/auth/signup` | 201 y un token JWT (tres partes) | 201 con JWT (312 ms) | ✅ Pasa |
| CP-03 | RQF-19 | N | CP-02 hecho | El mismo ownerEmail de CP-02 | `POST /api/auth/signup` | 409 `USER_EMAIL_TAKEN` o `GYM_EMAIL_TAKEN`; no crea otro gimnasio | 409 (19 ms) | ✅ Pasa |
| CP-04 | RQNF-03 | N | — | password `abcdefgh` (sin números) | `POST /api/auth/signup` | 400 `VALIDATION_ERROR` | 400 `VALIDATION_ERROR` (10 ms) | ✅ Pasa |
| CP-05 | RQF-02 | P | CP-02 hecho | email de CP-02, password `Clave2026` | `POST /api/auth/login` | 200 y token | 200 con token (253 ms) | ✅ Pasa |
| CP-06 | RQF-02 | N | CP-02 hecho | email de CP-02, password `Incorrecta99` | `POST /api/auth/login` | 401 y sin token | 401 sin token (218 ms) | ✅ Pasa |
| CP-07 | RQNF-03 | N | — | Sin cabecera `Authorization` | `GET /api/auth/me` | 401 `AUTH_REQUIRED` | 401 `AUTH_REQUIRED` (6 ms) | ✅ Pasa |
| CP-08 | RQNF-03 | N | Token de CP-02 | Token con un carácter extra al final | `GET /api/auth/me` | 401 `TOKEN_INVALID` | 401 `TOKEN_INVALID` (11 ms) | ✅ Pasa |

## Miembros

| ID | Req. | Tipo | Precondición | Datos de entrada | Pasos | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|---|---|---|
| CP-09 | RQF-03, RQF-04 | P | Token del gimnasio A | nombre `Ana Prueba QA`, documento `QA{run}`, teléfono `3` + 9 dígitos, plan MENSUAL de hoy a +30 días, 100000 pagado, términos y datos aceptados, clave de app `ClaveApp1` | `POST /api/admin/miembros` | 201, devuelve `id_miembro` y el plan con `estado_pago: PAGADO` | 201 con id y plan PAGADO (383 ms) | ✅ Pasa |
| CP-10 | RQF-03 | N | Token A | nombre y documento, **sin teléfono** | `POST /api/admin/miembros` | 400 `VALIDATION_ERROR`; no guarda nada | 400 `VALIDATION_ERROR` (18 ms) | ✅ Pasa |
| CP-11 | RQF-03 | N | CP-09 hecho | Documento de CP-09, otro nombre y teléfono | `POST /api/admin/miembros` | 409 `MEMBER_DOC_TAKEN` | 409 `MEMBER_DOC_TAKEN` (22 ms) | ✅ Pasa |
| CP-12 | RQF-03 | N | Token A | nombre de **101** caracteres (`miembro.nombre` es `VARCHAR(100)`) | `POST /api/admin/miembros` | 400 `VALIDATION_ERROR`, validado antes de llegar a la BD | **503 `DB_UNREACHABLE`** (38 ms) | ❌ Falla → [D-10](defectos.md#registro-de-defectos) |
| CP-13 | RQF-03 | P | CP-09 hecho | documento de CP-09 | `GET /api/admin/miembros/lookup?documento=…` | 200 con el miembro de ese documento | 200, mismo documento (25 ms) | ✅ Pasa |
| CP-14 | RQF-03 | N | Token A | documento `NOEXISTE{run}` | `GET /api/admin/miembros/lookup?documento=…` | 404 | 404 (16 ms) | ✅ Pasa |

## Check-in (módulo crítico)

| ID | Req. | Tipo | Precondición | Datos de entrada | Pasos | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|---|---|---|
| CP-15 | RQF-05, RQNF-01 | P | CP-09 hecho (plan vigente) | `{ "documento": "QA{run}" }` | `POST /api/admin/checkin` | 201, «Ingreso registrado.», método `MANUAL`, `duplicado: false`, en < 2 s | 201 MANUAL, no duplicado (76 ms) | ✅ Pasa |
| CP-16 | RQF-05 | N | CP-15 hace menos de 90 s | El mismo documento | `POST /api/admin/checkin` | 200 con `duplicado: true`; no crea un segundo ingreso | 200 `duplicado: true` (30 ms) | ✅ Pasa |
| CP-17 | RQF-05 | N | Token A | documento `NOEXISTE{run}` | `POST /api/admin/checkin` | 404 `MEMBER_NOT_FOUND` | 404 `MEMBER_NOT_FOUND` (16 ms) | ✅ Pasa |
| CP-18 | RQF-05 | N | Token A | `{}` (sin código ni documento) | `POST /api/admin/checkin` | 400 `VALIDATION_ERROR` | 400 `VALIDATION_ERROR` (19 ms) | ✅ Pasa |
| CP-19 | RQF-06 | N | Miembro `QV{run}` con plan de −60 a −30 días (paso de preparación) | `{ "documento": "QV{run}" }` | 1. `POST /api/admin/miembros` (preparación) 2. `POST /api/admin/checkin` | 200 con `miembro.estado: VENCIDO` y **sin** `checkin` | 200 VENCIDO, sin ingreso (26 ms) | ✅ Pasa |
| CP-20 | RQF-04 | P | CP-09 hecho | `{ "motivo": "Viaje de prueba QA" }` | `POST /api/admin/miembros/{id}/congelar` | 200 «Membresía congelada.» | 200 «Membresía congelada.» (35 ms) | ✅ Pasa |
| CP-21 | RQF-06 | N | CP-20 hecho | documento de CP-09 | `POST /api/admin/checkin` | 200 con `miembro.estado: CONGELADO` y **sin** `checkin` | 200 CONGELADO, sin ingreso (27 ms) | ✅ Pasa |

## Aislamiento entre gimnasios

| ID | Req. | Tipo | Precondición | Datos de entrada | Pasos | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|---|---|---|
| CP-22 | RQNF-05 | N | Gimnasio B registrado (paso de preparación) | id del miembro de CP-09, **token de B** | `GET /api/admin/miembros/{id}` | 404 `MEMBER_NOT_FOUND` (no revela que existe) | 404 `MEMBER_NOT_FOUND` (16 ms) | ✅ Pasa |
| CP-23 | RQNF-05 | N | Gimnasio B registrado | documento de CP-09, **token de B** | `POST /api/admin/checkin` | 404 `MEMBER_NOT_FOUND`; no registra ingreso en A | 404 `MEMBER_NOT_FOUND` (20 ms) | ✅ Pasa |

## Configuración, retos y dashboard

| ID | Req. | Tipo | Precondición | Datos de entrada | Pasos | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|---|---|---|
| CP-24 | RQF-08 | N | Token A | `umbral_alerta_amarilla: 15`, `umbral_alerta_roja: 10` | `PUT /api/admin/config` | 400: la roja debe ser mayor que la amarilla | 400 (17 ms) | ✅ Pasa |
| CP-25 | RQF-12 | P | Token A | `Reto QA 10 visitas`, meta 10, recompensa, segmento `TODOS`, de hoy a +30 días | `POST /api/admin/retos` | 201 | 201 (22 ms) | ✅ Pasa |
| CP-26 | RQF-12 | N | Token A | fecha_fin = ayer, fecha_inicio = hoy | `POST /api/admin/retos` | 400 `VALIDATION_ERROR` | 400 `VALIDATION_ERROR` (10 ms) | ✅ Pasa |
| CP-27 | RQF-07 | P | Token A | — | `GET /api/admin/dashboard` | 200 con un objeto de métricas no vacío | 200 con métricas (51 ms) | ✅ Pasa |

## App del miembro

| ID | Req. | Tipo | Precondición | Datos de entrada | Pasos | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|---|---|---|
| CP-28 | RQF-15 | P | CP-09 hecho (con clave de app) | teléfono de CP-09, password `ClaveApp1` | `POST /api/cliente/login` | 200 y token | 200 con token (213 ms) | ✅ Pasa |
| CP-29 | RQF-15 | N | CP-09 hecho | teléfono de CP-09, password `Otra12345` | `POST /api/cliente/login` | 401 | 401 (220 ms) | ✅ Pasa |

## Observaciones

- **CP-19 y CP-21** responden **200** al bloquear el ingreso, no 403: la pantalla
  de check-in usa `miembro.estado` para mostrar la alerta roja. El caso verifica
  lo que importa, que no se crea el ingreso (`checkin` ausente).
- **CP-12** falla en `develop` y pasa con el PR #83 (re-ejecutado el
  2026-11-22, ver [ciclo D-10](defectos.md#ciclo-3--d-10-nombre-de-101-caracteres-responde-503)).
- Los casos de la interfaz (formularios, accesibilidad, doble Enter) los cubren
  las pruebas E2E de `e2e/tests/` y las de componentes de `frontend/tests/`.
