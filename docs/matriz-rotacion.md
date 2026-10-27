# Matriz de rotación de capas

**Grupo**: FitLoyalty · **Stack**: React + Express + PostgreSQL

Capas: **Front** (React) · **API** (backend) · **BD** (integración) · **E2E** (Playwright)

Propuesta pendiente de acuerdo del grupo; ver [plan-pruebas-bootcamp.md](plan-pruebas-bootcamp.md). Según el bootcamp, en la semana 1 todos hacen E2E y en la 3 todos hacen Front. Cada integrante debe tener commits de test propios en la capa de cada semana.

| Integrante | S1 | S2 | S3 |
|---|---|---|---|
| Luis | E2E | E2E (CI) | Front |
| Santiago | E2E | API | Front |
| Daniel | E2E | Front | Front (y backend al 40 %) |

## Cobertura semanal

El umbral de la semana siguiente es el mayor entre el piso del plan y la cobertura real, redondeado hacia abajo.

**Línea base al cerrar la semana 1 (2026-10-26).** Se midió de nuevo al fusionar develop en `chore/test-semana-01`, y estos son los umbrales vigentes:

- Backend: 41,22 % líneas · 39,81 % sentencias · 35,67 % ramas · 43,98 % funciones. Umbral en `backend/jest.config.js`: líneas 41, sentencias 39, ramas 35, funciones 43. Subió porque develop trajo las pruebas de los PR #33 y #41.
- Frontend: 1,09 % líneas · 1,09 % sentencias · 9,8 % ramas · 6 % funciones. Umbral en `frontend/vite.config.js`: líneas 1, sentencias 1, ramas 9, funciones 6. Las ramas bajaron de 10 % a 9,8 % porque develop trajo código sin pruebas (`HitosConfig.jsx`, `ConfigPage.jsx`, `CheckinPage.jsx`).
- Reportes completos en `docs/cobertura-baseline-backend.txt` y `docs/cobertura-baseline-frontend.txt`. La fila S1 de la tabla es la medición inicial del 2026-10-20.

| Semana | Frontend (%) | Backend (%) | Umbral configurado |
|---|---|---|---|
| S1 (línea base) | 1,11 líneas · 1,11 sentencias · 10 ramas · 6,12 funciones | 18,08 líneas · 17,16 sentencias · 16,88 ramas · 21,69 funciones | Backend: líneas 18, sentencias 17, ramas 16, funciones 21 · Frontend: líneas 1, sentencias 1, ramas 10, funciones 6 |
