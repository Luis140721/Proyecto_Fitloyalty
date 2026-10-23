# Evidencia RQNF-06: verificación entre navegadores

**Responsable:** Daniel

**Rama:** `docs/rqnf-06-navegadores`

**Base de código:** `develop` en `2698c2e` (`2026-10-20`)

**Fecha de ejecución:** 2026-10-22

## Alcance

Se inició localmente el frontend de `develop` y se comprobó en navegador real
el recorrido desde la página pública hasta el formulario de inicio de sesión.
El alcance de esta ejecución es la carga de la interfaz, la navegación y el
ajuste visual del formulario en escritorio. No se enviaron credenciales ni se
validó la autenticación.

## Criterios y resultados

| Navegador | Versión | Portada y acceso a login | Encabezado y campo de correo | Sin desbordamiento horizontal | Errores JavaScript | Captura |
|---|---|---|---|---|---|---|
| Chrome | 155.0.8059.85 | Pasa | Pasa | Pasa (1366 px) | Ninguno | [chrome-login.png](./capturas/chrome-login.png) |
| Firefox | 157.0 | Pasa | Pasa | Pasa (1366 px) | Ninguno | [firefox-login.png](./capturas/firefox-login.png) |
| Edge | 155.0.4283.62 | Pasa | Pasa | Pasa (1366 px) | Ninguno | [edge-login.png](./capturas/edge-login.png) |

En los tres navegadores se abrió `/`, se seleccionó el enlace de inicio de
sesión y se comprobó que aparecieran el encabezado “Bienvenido de vuelta” y
el campo de correo. El formulario quedó dentro del ancho de la ventana
(1366 × 768), sin desbordamiento horizontal.

## Limitaciones

- El backend local no estaba iniciado. Las consultas del frontend a
  `http://localhost:3001/api/billing/trial-status` fallaron por conexión
  rechazada. Por tanto, estas capturas no demuestran el funcionamiento de la
  API, la sesión, el inicio de sesión ni el backend de producción.
- La prueba es un recorrido automatizado de interfaz en Chrome, Firefox y
  Edge sobre el código de `develop`; no reemplaza pruebas manuales de todos
  los formularios ni una aprobación de release.
- No se usaron cuentas ni datos de usuarios.

## Veredicto

**Parcial: verificación visual y de navegación completada en los tres
navegadores; integración con backend y autenticación no verificadas.**
