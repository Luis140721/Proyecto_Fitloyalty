# Reporte de ejecución de pruebas — 2026-11-22, con re-ejecución el 2026-11-23

**Responsable:** Daniel · **Plan:** [plan-de-pruebas.md](plan-de-pruebas.md)

**Código probado:**

- 2026-11-22: `develop` @ `f3a1a71`, más la prueba nueva `alta-miembro-atomica.test.js` de esta rama.
- 2026-11-23: `develop` @ `9fb3f7b`, ya con el #83, fusionado en esta rama. La rama solo agrega documentos y esa prueba.

**Ambiente:** el de pruebas del plan (sección 4):

- PostgreSQL 16.15 en Docker (`127.0.0.1:5433`, BD `fitloyalty_test`, datos en memoria).
- Backend con `NODE_ENV=test`, sin correo, WhatsApp ni scheduler.
- Windows 11, Node.js 24.14.1, pnpm 12.15.0 y Chromium de Playwright.

## Resumen

**Cómo se cuenta:** cada prueba una sola vez. Dos detalles cambian la suma de
las filas:

- **71 pruebas aparecen en dos filas.** `backend/tests/integracion/guardia-bd.test.js`
  no usa la BD, así que corre en `pnpm --dir backend test` y otra vez en
  `test:integracion`. Se restan una vez.
- **51 pruebas no corren en ninguna fila.** Son `retos-campanas-real.test.js`
  (41) y `bandeja-mensajes-real.test.js` (10). Necesitan `TEST_DATABASE_URL` con
  el esquema de ConsultasDB; no están en `test:integracion`, y el CI tampoco las
  corre. Se listan aparte y no suman al total.

| Nivel | Herramienta | 2026-11-22: ejecutadas / pasan | 2026-11-23: ejecutadas / pasan |
|---|---|---:|---:|
| Unitarias backend (sin BD) | Jest | 1.093 / 1.093 | 1.343 / 1.343 |
| Integración con BD real (`test:integracion`) | Jest + PostgreSQL | 236 / 236 | 272 / 272 |
| ↳ ya contadas en la fila anterior (`guardia-bd.test.js`) | | −71 / −71 | −71 / −71 |
| Componentes y unitarias frontend | Vitest | 615 / 615 | 895 / 895 |
| End-to-end | Playwright | 44 / 44 | 44 / 44 |
| API: matriz de casos | Postman + Newman | 29 / **28** (62 / 60 aserciones) | 29 / **29** (62 / 62 aserciones) |
| **Total de pruebas distintas** | | **1.946 / 1.945** | **2.512 / 2.512** |
| *No ejecutadas: necesitan `TEST_DATABASE_URL`* | | *51* | *51* |

La única falla del 22 fue CP-12, el defecto D-10 (#117). El 23 pasa, porque el
#83 entró a `develop`.

Entre las dos fechas crecieron las pruebas de `develop` (#108, #116 y #119
traen nuevas pruebas de backend, de integración y de frontend). El 23 también
se corrió el bloque completo del [plan, sección 8](plan-de-pruebas.md#8-cómo-repetir-las-pruebas),
tanto en Bash como en PowerShell, con los mismos números.

**Conclusión (2026-11-23):** el sistema cumple los criterios de salida del plan:

- Todo el CI está en verde.
- La cobertura está por encima del umbral, y el módulo crítico pasa del 97 %.
- La colección pasa 29 de 29.
- No hay defectos de severidad crítica abiertos.

**Siguen abiertos 6 defectos**, todos registrados y sin bloquear la entrega:

| Severidad | Defecto |
|---|---|
| Alta | D-03 (#87): dos altas simultáneas con el mismo documento |
| Media | D-05 (#89): textos largos en la app del miembro |
| Media | D-06 (#98): corte de red al comprobar la sesión |
| Media | D-07 (#99): todo error de BD sale como 503 |
| Media | D-08 (#111): constancia de WhatsApp de campaña |
| Baja | D-09 (#88): mensajes de los hitos |

## Cobertura (ítem 9: ≥ 50 % en el módulo crítico)

| Alcance | Sentencias | Ramas | Funciones | Líneas | Umbral del CI |
|---|---:|---:|---:|---:|---|
| Backend, global (2026-11-22) | 90,62 % | 84,68 % | 89,83 % | 91,34 % | 90 / 84 / 89 / 91 |
| Backend, global (2026-11-23) | 92,44 % | 86,11 % | 91,88 % | 93,29 % | 90 / 84 / 89 / 91 |
| **Backend, `routes/checkin.js` (módulo crítico)**, las dos fechas | **97,60 %** | **93,84 %** | **87,50 %** | **97,45 %** | ≥ 50 % |
| Frontend, global (2026-11-22) | 85,96 % | 92,63 % | 93,51 % | 85,96 % | 85 / 92 / 93 / 85 |
| Frontend, global (2026-11-23) | 87,29 % | 93,98 % | 96,03 % | 87,29 % | 85 / 92 / 93 / 85 |
| **Frontend, `CheckinPage.jsx` (módulo crítico)**, las dos fechas | **97,69 %** | **88,65 %** | **94,11 %** | **97,69 %** | ≥ 50 % |

Tablas completas:

- 2026-11-22: [backend](evidencias/cobertura-backend-2026-11-22.txt) · [frontend](evidencias/cobertura-frontend-2026-11-22.txt)
- 2026-11-23: [backend](evidencias/cobertura-backend-2026-11-23.txt) · [frontend](evidencias/cobertura-frontend-2026-11-23.txt)

## Detalle por nivel

### Postman (matriz de casos)

Salidas completas de Newman:

- 2026-11-22: [evidencias/newman-develop-2026-11-22.txt](evidencias/newman-develop-2026-11-22.txt)
- 2026-11-23: [evidencias/newman-develop-2026-11-23.txt](evidencias/newman-develop-2026-11-23.txt)

| Carpeta | Casos | 2026-11-22 | 2026-11-23 |
|---|---:|---|---|
| 0 · Salud | 1 | 1 pasa | 1 pasa |
| 1 · Registro y sesión | 7 | 7 pasan | 7 pasan |
| 2 · Miembros | 6 | 5 pasan, **falla CP-12** (503) | 6 pasan (CP-12 → 400) |
| 3 · Check-in | 7 | 7 pasan | 7 pasan |
| 4 · Aislamiento entre gimnasios | 2 | 2 pasan | 2 pasan |
| 5 · Configuración, retos y dashboard | 4 | 4 pasan | 4 pasan |
| 6 · App del miembro | 2 | 2 pasan | 2 pasan |

Tiempo de respuesta promedio:

- 2026-11-22: 81 ms (mínimo 6 ms, máximo 383 ms).
- 2026-11-23: 47 ms (mínimo 5 ms, máximo 213 ms).

El check-in por documento (CP-15) respondió en 76 ms y 67 ms, dentro del
objetivo de RQNF-01 (< 2 s).

### Integración con PostgreSQL

`pnpm --dir backend run test:integracion` el 2026-11-23: 12 suites, 272 pruebas.
Cubren:

- migraciones;
- restricciones de gimnasio, usuario y miembro;
- vista de miembros activos;
- accesos y gamificación;
- cobros y congelamiento;
- `plan_cobro`, que llegó con el #83;
- check-in concurrente (#80);
- registro de envíos (#24);
- autorizaciones legales (RQNF-17 y 18) y Ley 2300;
- la guardia de la BD;
- la prueba nueva de alta atómica (#95).

### End-to-end

`pnpm --dir e2e test`: 44 pruebas en Chromium. Cubren:

- inicio de sesión;
- registro de gimnasio;
- rutas protegidas;
- alta de miembro, incluido el doble clic durante un POST lento;
- check-in, incluidos los tiempos del doble Enter.

## Defectos

Estado al 2026-11-23, también en GitHub con etiquetas de severidad y estado:

| Severidad | Abiertos | En corrección | Corregidos (por cerrar) | Verificados y cerrados |
|---|---:|---:|---:|---:|
| Crítica | 0 | 0 | 0 | 0 |
| Alta | 1 | 0 | 0 | 3 |
| Media | 4 | 0 | 0 | 1 |
| Baja | 1 | 0 | 0 | 0 |

Detalle, severidad de cada uno, los dos ciclos detectar → corregir → verificar
y las verificaciones de los arreglos del #83 y del #102: [defectos.md](defectos.md).

**Hallazgos de estas ejecuciones:**

1. **D-10 (#117):** el 2026-11-22, CP-12 encontró en `develop` que un nombre de
   101 caracteres responde 503 en vez de 400.
   - El arreglo ya existía: Santiago lo hizo el 2026-11-19 en el PR #83, que aún no estaba fusionado.
   - Se probó contra esa rama y pasó.
   - El #83 entró a `develop` el 2026-11-23 y la re-ejecución dio 29 de 29.
   - #117 cerrado.
2. **D-04 (#95):** ya estaba corregido en `develop` desde el PR #102, aunque el
   issue seguía abierto.
   - Se verificó con la prueba de integración nueva.
   - #95 cerrado.

## Pendientes antes de la entrega (2026-11-26)

- Si entra otro PR a `develop` antes del 26, volver a correr el bloque de la
  sección 8 del plan y actualizar este reporte.
- ~~Correr `registrar-defectos.ps1`~~: hecho el 2026-11-22. Dejó etiquetas en
  9 issues, creó D-10 como #117 y comentó la verificación en #95. Se corrió otra
  vez el 2026-11-23 para pasar #95 y #117 a `estado: verificado`.
