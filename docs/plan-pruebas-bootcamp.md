# Plan de pruebas: ponerse al día con el bootcamp

**Propuesta para acordar entre Luis, Santiago y Daniel.** Nada de esto está decidido hasta que los tres lo confirmen.

Fuente: [bc-testing-adso](https://github.com/ergrato-dev/bc-testing-adso) (semanas 1, 2 y 3). Los pisos de cobertura salen de su [plan de estudios](https://github.com/ergrato-dev/bc-testing-adso/blob/main/docs/plan-estudios.md#umbral-de-cobertura).

## Situación

Vamos 3 semanas atrasados. El bootcamp pide en cada semana lo mismo para todo el grupo, y la cobertura **no puede bajar** de una semana a otra. Por eso conviene hacer las semanas 1, 2 y 3 en orden, aunque se hagan seguidas.

| Semana | Piso de cobertura | Lo que pide el reto |
|---|---|---|
| 1 | Línea base | Carpeta `e2e/` con Playwright. Un test E2E por integrante, cada uno de un flujo distinto, con aserción y estructura AAA. Matriz de rotación llena. Cobertura configurada en frontend y backend, con la línea base como umbral. |
| 2 | 30 % en frontend y backend | Al menos 3 tests unitarios por integrante sobre reglas reales, con valores límite y un mutante documentado en el PR. CI en GitHub Actions que falla si baja el umbral. Regla de rama activa. |
| 3 | 40 % en frontend y backend | Todo el grupo en Front. Cada integrante prueba un componente distinto (al menos 3 tests, uno con `user-event` y uno de un estado no feliz). Una persona lleva el backend al 40 %. |

## Reglas del bootcamp que aplican a todos

- Cada integrante hace **commits propios** de test cada semana, con su usuario de Git.
- Las capas rotan: Front, API, BD y E2E. En la semana 1 todos hacen E2E y en la 3 todos hacen Front.
- Los PR los revisa otra persona, que debe **correr** los tests.
- En la revisión semanal el instructor escoge a alguien al azar para explicar cualquier test. Todos deben entender todo.

## Reparto propuesto

| Integrante | Semana 1 | Semana 2 | Semana 3 |
|---|---|---|---|
| Luis | E2E | E2E (monta el CI y la regla de rama) | Front |
| Santiago | E2E | API | Front |
| Daniel | E2E | Front | Front, y lleva el backend al 40 % |

En la semana 3 el backend lo lleva quien tuvo Front en la semana 2, según el reto.

Flujos E2E propuestos para la semana 1 (uno por persona): inicio de sesión, registro, y alta de un miembro.

## Orden para ponerse al día

1. **Semana 1.** Configurar cobertura en frontend (hoy no tiene herramienta de tests) y backend. Registrar la línea base. Cada quien su E2E.
2. **Semana 2.** Tests unitarios por persona, CI y umbral al 30 %.
3. **Semana 3.** Tests de componentes y umbral al 40 %.

Cada paso se fusiona antes de empezar el siguiente, porque el CI de la semana 2 bloquea los PR de la 3.

## Por decidir entre los tres

1. ¿El reparto de la tabla de arriba, o se cambia?
2. ¿Seguimos con `npm` (lo que usa hoy el CI) o migramos a `pnpm`?
3. ¿Quién monta el CI y activa la regla de rama? Propuesto: Luis.
4. ¿Qué archivos se excluyen de la cobertura y por qué? Cada exclusión se justifica por escrito.
5. ¿Cómo repartimos los flujos E2E?

## Estado actual del backend (medido el 2026-10-20)

Cobertura: 18,08 % de líneas, 17,16 % de sentencias, 16,88 % de ramas y 21,69 % de funciones. Está en [cobertura-baseline-backend.txt](cobertura-baseline-backend.txt). El umbral de `backend/jest.config.js` ya impide que baje.
