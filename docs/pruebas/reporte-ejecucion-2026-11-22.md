# Reporte de ejecución de pruebas — 2026-11-22

**Responsable:** Daniel · **Código probado:** `develop` @ `f3a1a71`, más la
prueba nueva `alta-miembro-atomica.test.js` de esta rama · **Plan:** [plan-de-pruebas.md](plan-de-pruebas.md)

**Ambiente:** el de pruebas del plan (sección 4): PostgreSQL 16.15 en Docker
(`127.0.0.1:5433`, BD `fitloyalty_test`, datos en memoria), backend con
`NODE_ENV=test`, sin correo, WhatsApp ni scheduler. Windows 11, Node.js 24.14.1,
pnpm 12.15.0, Chromium de Playwright.

## Resumen

| Nivel | Herramienta | Ejecutadas | Pasan | Fallan | Resultado |
|---|---|---:|---:|---:|---|
| Unitarias backend | Jest | 1.093 | 1.093 | 0 | ✅ (216 de integración se omiten aquí y corren en la fila siguiente) |
| Integración con BD real | Jest + PostgreSQL | 236 | 236 | 0 | ✅ |
| Componentes y unitarias frontend | Vitest | 615 | 615 | 0 | ✅ |
| End-to-end | Playwright | 44 | 44 | 0 | ✅ |
| API: matriz de casos | Postman + Newman | 29 casos (62 aserciones) | 28 (60) | 1 (2) | ⚠️ CP-12 → defecto D-10 |
| **Total** | | **2.017** | **2.016** | **1** | |

**Conclusión:** el sistema cumple los criterios de salida del plan salvo un
defecto de severidad media (D-10), que ya tiene corrección en el PR #83 y está
verificada contra esa rama. No hay defectos de severidad crítica abiertos.

## Cobertura (ítem 9: ≥ 50 % en el módulo crítico)

| Alcance | Sentencias | Ramas | Funciones | Líneas | Umbral del CI |
|---|---:|---:|---:|---:|---|
| Backend, global | 90,62 % | 84,68 % | 89,83 % | 91,34 % | 90 / 84 / 89 / 91 |
| **Backend, `routes/checkin.js` (módulo crítico)** | **97,60 %** | **93,84 %** | **87,50 %** | **97,45 %** | ≥ 50 % |
| Frontend, global | 85,96 % | 92,63 % | 93,51 % | 85,96 % | `vite.config.js` |
| **Frontend, `CheckinPage.jsx` (módulo crítico)** | **97,69 %** | **88,65 %** | **94,11 %** | **97,69 %** | ≥ 50 % |

Tablas completas: [backend](evidencias/cobertura-backend-2026-11-22.txt) ·
[frontend](evidencias/cobertura-frontend-2026-11-22.txt).

## Detalle por nivel

### Postman (matriz de casos)

Salida completa de Newman: [evidencias/newman-develop-2026-11-22.txt](evidencias/newman-develop-2026-11-22.txt).

| Carpeta | Casos | Pasan | Fallan |
|---|---:|---:|---:|
| 0 · Salud | 1 | 1 | 0 |
| 1 · Registro y sesión | 7 | 7 | 0 |
| 2 · Miembros | 6 | 5 | **1 (CP-12)** |
| 3 · Check-in | 7 | 7 | 0 |
| 4 · Aislamiento entre gimnasios | 2 | 2 | 0 |
| 5 · Configuración, retos y dashboard | 4 | 4 | 0 |
| 6 · App del miembro | 2 | 2 | 0 |

Tiempo de respuesta promedio: 81 ms (mínimo 6 ms, máximo 383 ms). El check-in
por documento (CP-15) respondió en 76 ms, dentro del objetivo de RQNF-01 (< 2 s).

### Integración con PostgreSQL

`pnpm --dir backend run test:integracion`: 10 suites, 236 pruebas: migraciones,
restricciones de gimnasio, usuario y miembro, vista de miembros activos,
accesos y gamificación, cobros y congelamiento, check-in concurrente (#80),
registro de envíos (#24), autorizaciones legales (RQNF-17 y 18) y la prueba
nueva de alta atómica (#95).

### End-to-end

`pnpm --dir e2e test`: 44 pruebas en Chromium: inicio de sesión, registro de
gimnasio, rutas protegidas, alta de miembro (incluido el doble clic durante un
POST lento) y check-in (incluidos los tiempos del doble Enter).

## Defectos

| Severidad | Abiertos | En corrección | Corregidos (por cerrar) | Verificados |
|---|---:|---:|---:|---:|
| Crítica | 0 | 0 | 0 | 0 |
| Alta | 1 | 0 | 1 | 2 |
| Media | 4 | 1 | 0 | 0 |
| Baja | 1 | 0 | 0 | 0 |

Detalle, severidad de cada uno y los tres ciclos detectar → corregir →
verificar: [defectos.md](defectos.md).

**Hallazgos de esta ejecución:**

1. **D-10 (nuevo):** CP-12 detectó que un nombre de 101 caracteres responde
   503 en vez de 400. Corrección en el PR #83, verificada contra su rama.
2. **D-04 (#95) ya está corregido** en `develop` desde el PR #102, aunque el
   issue seguía abierto. Se verificó con una prueba de integración nueva; se
   propone cerrarlo.

## Pendientes antes de la entrega (2026-11-26)

- Fusionar el PR #83 y volver a correr la colección: CP-12 debe pasar.
- Correr `docs/pruebas/registrar-defectos.ps1` para dejar la severidad y el
  estado en GitHub, y crear el issue de D-10.
- Cerrar #95 cuando se fusione la rama de este reporte.
