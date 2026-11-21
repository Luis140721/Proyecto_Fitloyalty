# Matriz de rotación de capas

**Grupo**: FitLoyalty · **Ficha**: _por completar_ · **Stack**: React + Express + PostgreSQL

Capas: **Front** (React) · **API** (backend) · **BD** (integración) · **E2E** (Playwright)

Reglas:

- Cada semana cambias de capa. No repites capa hasta haber pasado por las cuatro.
- En la columna escribe la capa y, al cerrar la semana, el enlace a tu PR de tests.
- Quien revisa tu PR debe haber trabajado en otra capa esa semana.
- S1 (E2E), S3 (Front) y S7 (E2E) son semanas de tema común: todo el grupo trabaja en la misma capa y no cuentan para la rotación. Por eso Luis (E2E en S1 y S2) y Daniel (Front en S2 y S3) no rompen la regla.

> La rama de la semana que el bootcamp llama `test/semana-01` aquí se llama `chore/test-semana-01`, porque el check `rama` del CI solo acepta ramas `feat/`, `fix/`, `docs/` o `chore/`.

Propuesta pendiente de acuerdo del grupo; ver [plan-pruebas-bootcamp.md](plan-pruebas-bootcamp.md). Según el bootcamp, en la semana 1 todos hacen E2E y en la 3 todos hacen Front. Cada integrante debe tener commits de test propios en la capa de cada semana.

| Integrante (usuario GitHub) | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| Luis (@Luis140721) | E2E: registro de gimnasio ([#38](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/38)) | E2E (CI): CI con umbral y pnpm ([#61](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/61)); unitarias de `email.js` y de la validación del registro ([#59](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/59)) | Front: `RegisterOwnerPage` ([#60](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/60)) | Front: contrato del API que consume el front, `MiembrosPage` y `AcceptInvitePage` ([#57](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/57)) | API: invitación del personal con el correo y el reloj simulados ([#65](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/65)) | BD: BD de pruebas ([#68](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/68)) y restricciones contra la BD real ([#69](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/69)) | E2E: check-in de un miembro ([#79](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/79)) | E2E: CI completo y rutas protegidas ([#78](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/78)) |
| Santiago (@Salamank06) | E2E: inicio de sesión ([#48](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/48)) | API: reglas de login y recuperación de clave ([#49](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/49)) | Front: `LoginPage` ([#50](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/50)) | E2E: seguridad y contrato de errores del API ([#51](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/51)) | Front: cliente HTTP `api.js` con MSW ([#82](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/82)) | BD: `plan_cobro` y `ULTIMO_PLAN` contra la BD real; largos de miembro sin 500 ([#83](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/83)) | E2E: inicio de sesión con el backend real y defectos de tiempos ([#84](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/84)) | Front: ramas sin cubrir de `ProtectedRoute`, `LoginPage` y `BadgeEstado` ([#85](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/85)) |
| Daniel (@dftv3429-eng) | E2E: alta de miembro. Su test entra con su autoría y Luis lo arregla en [#91](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/91) | Front: reglas del código de recuperación. No entregó; la cubre Luis en [#93](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/93) | Front: `ForgotPasswordPage`. No entregó; la cubre Luis en [#93](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/93) | API: CRUD y contrato del API de miembros. No entregó; la cubre Luis en [#96](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/96) | E2E: alta de miembro con la red simulada. No entregó; la cubre Luis en [#91](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/91) | BD: `plan_cobro`, congelaciones y notificaciones contra la BD real. No entregó; la cubre Luis en [#96](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/96) | E2E: alta de miembro y defectos de tiempos. No entregó; la cubre Luis en [#91](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/91) | Front: ramas sin cubrir de `ForgotPasswordPage`. No entregó; la cubre Luis en [#93](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/93) |

## Cobertura semanal

El umbral de la semana siguiente es el mayor entre el piso del plan y la cobertura real, redondeado hacia abajo.

La cobertura que se anota es la del CI (Linux), no la de Windows. Con el mismo código, en Windows git deja los archivos con saltos de línea CRLF y la cobertura sale más alta: en la semana 1, el frontend dio 1,09 % en Windows y 0,89 % en el CI ([#61](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/61)).

**Línea base al cerrar la semana 1 (2026-10-26).** Se midió de nuevo al fusionar develop en `chore/test-semana-01`, y estos son los umbrales vigentes:

- Backend: 41,22 % líneas · 39,81 % sentencias · 35,67 % ramas · 43,98 % funciones. Umbral en `backend/jest.config.js`: líneas 41, sentencias 39, ramas 35, funciones 43. Subió porque develop trajo las pruebas de los PR #33 y #41.
- Frontend: 1,09 % líneas · 1,09 % sentencias · 9,8 % ramas · 6 % funciones. Umbral en `frontend/vite.config.js`: líneas 1, sentencias 1, ramas 9, funciones 6. Las ramas bajaron de 10 % a 9,8 % porque develop trajo código sin pruebas (`HitosConfig.jsx`, `ConfigPage.jsx`, `CheckinPage.jsx`).
- Reportes completos en `docs/cobertura-baseline-backend.txt` y `docs/cobertura-baseline-frontend.txt`. La fila S1 de la tabla es la medición inicial del 2026-10-20.

| Semana | Frontend (%) | Backend (%) | Umbral configurado |
|---|---|---|---|
| S1 (línea base) | 1,11 líneas · 1,11 sentencias · 10 ramas · 6,12 funciones | 18,08 líneas · 17,16 sentencias · 16,88 ramas · 21,69 funciones | Backend: líneas 18, sentencias 17, ramas 16, funciones 21 · Frontend: líneas 1, sentencias 1, ramas 10, funciones 6 |
| S2 (cierre conjunto con el #77, 2026-11-19, CI) | 56,89 líneas · 56,89 sentencias · 77,98 ramas · 56,96 funciones | 62,36 líneas · 61,28 sentencias · 54,96 ramas · 66,93 funciones | Backend: líneas 61, sentencias 60, ramas 54, funciones 66 (Windows da 61,88 y 60,89) · Frontend: líneas 56, sentencias 56, ramas 77, funciones 56 |
| S3 (cierre conjunto con el #77, 2026-11-19, CI) | 56,89 líneas · 56,89 sentencias · 77,98 ramas · 56,96 funciones | 62,36 líneas · 61,28 sentencias · 54,96 ramas · 66,93 funciones | Backend: líneas 61, sentencias 60, ramas 54, funciones 66 (Windows da 61,88 y 60,89) · Frontend: líneas 56, sentencias 56, ramas 77, funciones 56 |
| S4 (cierre conjunto con el #77, 2026-11-19, CI) | 56,89 líneas · 56,89 sentencias · 77,98 ramas · 56,96 funciones | 62,36 líneas · 61,28 sentencias · 54,96 ramas · 66,93 funciones | Backend: líneas 61, sentencias 60, ramas 54, funciones 66 (Windows da 61,88 y 60,89) · Frontend: líneas 56, sentencias 56, ramas 77, funciones 56 |
| S5 (cierre conjunto con el #106, 2026-11-21, CI) | 84,32 líneas · 84,32 sentencias · 91,96 ramas · 93,20 funciones | 90,73 líneas · 89,94 sentencias · 83,94 ramas · 89,28 funciones | Backend: líneas 90, sentencias 89, ramas 83, funciones 89 (la menor entre el CI y Windows, que da 90,32, 89,61, 83,76 y 89,28) · Frontend: líneas 84, sentencias 84, ramas 91, funciones 93 |
| S6 (cierre conjunto con el #106, 2026-11-21, CI) | 84,32 líneas · 84,32 sentencias · 91,96 ramas · 93,20 funciones | 90,73 líneas · 89,94 sentencias · 83,94 ramas · 89,28 funciones | Backend: líneas 90, sentencias 89, ramas 83, funciones 89 (la menor entre el CI y Windows, que da 90,32, 89,61, 83,76 y 89,28) · Frontend: líneas 84, sentencias 84, ramas 91, funciones 93 |
| S7 (cierre conjunto con el #106, 2026-11-21, CI) | 84,32 líneas · 84,32 sentencias · 91,96 ramas · 93,20 funciones | 90,73 líneas · 89,94 sentencias · 83,94 ramas · 89,28 funciones | Backend: líneas 90, sentencias 89, ramas 83, funciones 89 (la menor entre el CI y Windows, que da 90,32, 89,61, 83,76 y 89,28) · Frontend: líneas 84, sentencias 84, ramas 91, funciones 93 |
| S8 (cierre conjunto con el #106 y la sincronización con develop del #110, 2026-11-21, CI) | 85,73 líneas · 85,73 sentencias · 92,59 ramas · 93,51 funciones | 91,66 líneas · 90,88 sentencias · 84,83 ramas · 89,83 funciones | Backend: líneas 91, sentencias 90, ramas 84, funciones 89 (la menor entre el CI y Windows, que da 91,34, 90,62, 84,68 y 89,83) · Frontend: líneas 85, sentencias 85, ramas 92, funciones 93 |

## Registro de vocero aleatorio

El vocero escribe su respuesta **antes** de que el instructor llegue a la mesa; el instructor la verifica con una pregunta corta y anota el resultado.

| Semana | Vocero | Capa preguntada | Respuesta escrita | Resultado (Alto / Medio / Bajo) |
|---|---|---|---|---|
| S1 | | | | |
| S2 | | | | |
| S3 | | | | |
| S4 | | | | |
| S5 | | | | |
| S6 | | | | |
| S7 | | | | |
| S8 | | | | |
