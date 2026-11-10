# Matriz de rotación de capas

**Grupo**: FitLoyalty · **Stack**: React + Express + PostgreSQL

Capas: **Front** (React) · **API** (backend) · **BD** (integración) · **E2E** (Playwright)

Propuesta pendiente de acuerdo del grupo; ver [plan-pruebas-bootcamp.md](plan-pruebas-bootcamp.md). Según el bootcamp, en la semana 1 todos hacen E2E y en la 3 todos hacen Front. Cada integrante debe tener commits de test propios en la capa de cada semana.

| Integrante | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| Luis | E2E | E2E (CI) | Front | Pendiente | Pendiente | Pendiente |
| Santiago | E2E | API | Front | Pendiente | Pendiente | Pendiente |
| Daniel | E2E | Front | Front: ForgotPasswordPage (y backend al 40 %) | E2E: seguridad y errores del API | API: scheduler de vencimientos con fake timers | BD: integración PostgreSQL de miembro |

## Cobertura semanal

El umbral de la semana siguiente es el mayor entre el piso del plan y la cobertura real, redondeado hacia abajo.

| Semana | Frontend (%) | Backend (%) | Umbral configurado |
|---|---|---|---|
| S1 (línea base) | 1,11 líneas · 1,11 sentencias · 10 ramas · 6,12 funciones | 18,08 líneas · 17,16 sentencias · 16,88 ramas · 21,69 funciones | Backend: líneas 18, sentencias 17, ramas 16, funciones 21 · Frontend: líneas 1, sentencias 1, ramas 10, funciones 6 |
| S3 (medición local en Windows; pendiente validar en CI/main) | 40,46 líneas y sentencias · 76,03 ramas · 62,01 funciones | 46,91 líneas · 45,38 sentencias · 41,55 ramas · 55,66 funciones | Frontend y backend: 40 en líneas, sentencias, ramas y funciones |
| S6 (medición local en Windows, sin `DATABASE_URL`; antes de integrar PR grupales) | 40,40 líneas y sentencias · 75,88 ramas · 62,01 funciones | 46,84 líneas · 45,31 sentencias · 41,55 ramas · 55,39 funciones | Actual: frontend y backend 40 en todas las métricas · objetivo S6: 70%, actualizar tras integrar los PR grupales |
