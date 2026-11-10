# Matriz de rotación de capas

**Grupo**: FitLoyalty · **Ficha**: _por completar_ · **Stack**: React + Express + PostgreSQL

Capas: **Front** (React) · **API** (backend) · **BD** (integración) · **E2E** (Playwright)

Reglas:

- Cada semana cambias de capa. No repites capa hasta haber pasado por las cuatro.
- En la columna escribe la capa y, al cerrar la semana, el enlace a tu PR de tests.
- Quien revisa tu PR debe haber trabajado en otra capa esa semana.
- S1 (E2E) y S3 (Front) son semanas de tema común: todo el grupo trabaja en la misma capa y no cuentan para la rotación.

> La rama de la semana que el bootcamp llama `test/semana-01` aquí se llama `chore/test-semana-01`, porque el check `rama` del CI solo acepta ramas `feat/`, `fix/`, `docs/` o `chore/`.

Propuesta pendiente de acuerdo del grupo; ver [plan-pruebas-bootcamp.md](plan-pruebas-bootcamp.md). Cada integrante debe tener commits de test propios en la capa de cada semana.

| Integrante (usuario GitHub) | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| Luis (@Luis140721) | E2E: registro de gimnasio | E2E (CI) | Front | Pendiente | Pendiente | Pendiente | E2E | Pendiente |
| Santiago (@Salamank06) | E2E: inicio de sesión | API | Front | Pendiente | Pendiente | Pendiente | E2E | Pendiente |
| Daniel (@dftv3429-eng) | E2E: alta de miembro | Front | Front: ForgotPasswordPage (y backend al 40 %) | E2E: seguridad y errores del API | API: scheduler de vencimientos con fake timers | BD: integración PostgreSQL de miembro | E2E: alta de miembro y pago | E2E: CI, artefactos y espera del backend |

## Cobertura semanal

El umbral de la semana siguiente es el mayor entre el piso del plan y la cobertura real, redondeado hacia abajo.

**Línea base al cerrar la semana 1 (2026-10-26).** Se midió de nuevo al fusionar develop en `chore/test-semana-01`, y estos son los umbrales vigentes:

- Backend: 41,22 % líneas · 39,81 % sentencias · 35,67 % ramas · 43,98 % funciones. Umbral en `backend/jest.config.js`: líneas 41, sentencias 39, ramas 35, funciones 43.
- Frontend: 1,09 % líneas · 1,09 % sentencias · 9,8 % ramas · 6 % funciones. Umbral en `frontend/vite.config.js`: líneas 1, sentencias 1, ramas 9, funciones 6.
- Reportes completos en `docs/cobertura-baseline-backend.txt` y `docs/cobertura-baseline-frontend.txt`.

| Semana | Frontend (%) | Backend (%) | Umbral configurado |
|---|---|---|---|
| S1 (línea base) | 1,11 líneas · 1,11 sentencias · 10 ramas · 6,12 funciones | 18,08 líneas · 17,16 sentencias · 16,88 ramas · 21,69 funciones | Backend: líneas 18, sentencias 17, ramas 16, funciones 21 · Frontend: líneas 1, sentencias 1, ramas 10, funciones 6 |
| S3 (medición local en Windows; pendiente validar en CI/main) | 40,46 líneas y sentencias · 76,03 ramas · 62,01 funciones | 46,91 líneas · 45,38 sentencias · 41,55 ramas · 55,66 funciones | Frontend y backend: 40 en líneas, sentencias, ramas y funciones |
| S6 (medición local en Windows, sin `DATABASE_URL`; antes de integrar PR grupales) | 40,40 líneas y sentencias · 75,88 ramas · 62,01 funciones | 46,84 líneas · 45,31 sentencias · 41,55 ramas · 55,39 funciones | Actual: frontend y backend 40 en todas las métricas · objetivo S6: 70%, actualizar tras integrar los PR grupales |
| S8 (medición local previa al CI) | 3,59 líneas · 3,59 sentencias · 44,18 ramas · 21,05 funciones | 45,87 líneas · 44,58 sentencias · 39,42 ramas · 48,57 funciones | No se elevó: el piso de 80% haría fallar las suites actuales; requiere más pruebas |

## Registro de vocero aleatorio

El vocero escribe su respuesta **antes** de que el instructor llegue a la mesa; el instructor la verifica con una pregunta corta y anota el resultado.

| Semana | Vocero | Capa preguntada | Respuesta escrita | Resultado (Alto / Medio / Bajo) |
|---|---|---|---|---|
| S1 | | | | |
