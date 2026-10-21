<!-- Flujo de trabajo y convención de ramas: CONTRIBUTING.md -->

## Qué cambia
<!-- Resumen corto del cambio y por qué -->

## Cómo probarlo
<!-- Pasos o comandos para verificarlo -->

## Requisito y evidencia
<!-- Código del requisito (RQF-xx / RQNF-xx) y evidencia: archivo:línea, prueba o captura -->

## Checklist
- [ ] El PR va hacia `develop` (o es una release `develop` → `main`). Si es un PR de pruebas del bootcamp, va hacia la rama de la semana (`chore/test-semana-NN`), que luego entra a `develop` con su propio PR
- [ ] La rama sale de `develop` actualizado (o de la rama de la semana, si es un PR de pruebas) y tiene un nombre descriptivo (`feat/…`, `fix/…`, `docs/…`, `chore/…`)
- [ ] Solo toqué archivos de mi zona, o avisé al dueño y lo menciono aquí
- [ ] El CI pasa
- [ ] No incluye secretos, `.env` ni cachés (`.wwebjs_auth`, `node_modules`)
- [ ] Actualicé la documentación si aplica

<!-- ===================================================================
     Pruebas (bootcamp de testing): llena esta parte cuando el PR incluye
     tests. Si no incluye tests, bórrala.
     =================================================================== -->

## ¿Qué prueba este PR?
<!-- Describe el comportamiento que verifican los tests, no el código. -->

## Capas
- **Capa del autor esta semana**: <!-- Front / API / BD / E2E -->
- **Capa del revisor esta semana**: <!-- debe ser distinta a la del autor; en la semana 1 todos están en E2E, así que revisa alguien que probó otro flujo -->

## Checklist de pruebas
- [ ] Los tests siguen el patrón AAA (Arrange, Act, Assert)
- [ ] Los nombres de los tests describen el comportamiento esperado
- [ ] Hice fallar cada test al menos una vez para comprobar que detecta el error
- [ ] Los tests pasan en local
- [ ] No hay credenciales ni datos reales en los tests

## ¿Cómo lo ejecuto?

```bash
# comando para correr estos tests
```
