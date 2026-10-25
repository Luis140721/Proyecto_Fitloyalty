# Evidencia RQNF-06: verificación entre navegadores

**Responsable:** Daniel

**Rama:** `docs/rqnf-06-navegadores`

**Base de código:** `develop` en `2698c2e` (`2026-10-20`)

**Fecha de ejecución:** 2026-10-22

## Requisito

Texto de RQNF-06 en la matriz y en el documento de requisitos:

> El sistema debe funcionar correctamente en los navegadores Chrome, Firefox y
> Edge en sus dos últimas versiones mayores, sin requerir instalación de
> software adicional en el cliente.

## Alcance

Se inició localmente el frontend de `develop` y se comprobó en navegador real
el recorrido desde la página pública hasta el formulario de inicio de sesión.
El alcance de esta ejecución es la carga de la interfaz, la navegación y el
ajuste visual del formulario en escritorio. No se enviaron credenciales ni se
validó la autenticación.

## Criterios y resultados

| Navegador | Versión | Portada y acceso a login | Encabezado y campo de correo | Sin desbordamiento horizontal | Errores JavaScript | Captura |
|---|---|---|---|---|---|---|
| Chrome | 155.0.8059.85 | Pasa | Pasa | Pasa (1503 px) | Ninguno | [chrome-login.png](./capturas/chrome-login.png) |
| Firefox | 157.0 | Pasa | Pasa | Pasa (1503 px) | Ninguno | [firefox-login.png](./capturas/firefox-login.png) |
| Edge | 155.0.4283.62 | Pasa | Pasa | Pasa (1503 px) | Ninguno | [edge-login.png](./capturas/edge-login.png) |

En los tres navegadores se abrió `/`, se seleccionó el enlace de inicio de
sesión y se comprobó que aparecieran el encabezado “Bienvenido de vuelta” y
el campo de correo. El formulario quedó dentro del ancho de la ventana, sin
desbordamiento horizontal. Las capturas miden 1503 × 768 píxeles.

**Diferencia visual menor.** A ese ancho, la página de inicio de sesión no
ocupa toda la ventana: a la derecha queda una franja vacía de unos 137 px,
blanca en Firefox y oscura en Chrome y Edge. No tapa el formulario ni afecta
la navegación, pero es una diferencia de presentación entre navegadores.

## Versiones

El requisito pide las dos últimas versiones mayores de cada navegador. Esta
ejecución probó solo la última de cada uno (la tabla de arriba). La versión
anterior queda cubierta por el código que genera el build:

- `frontend/vite.config.js` no fija `build.target`, así que Vite 5
  (`frontend/package.json`: `vite` `^5.3.1`) usa su objetivo por defecto,
  `modules`: Chrome 87, Firefox 78 y Edge 88 (y Safari 14).
- Las dos últimas versiones mayores (Chrome 154 y 155, Firefox 156 y 157,
  Edge 154 y 155) están muy por encima de ese mínimo, así que el JavaScript y
  el CSS generados no usan nada que esas versiones no soporten.

Esto justifica la compatibilidad de la versión anterior, pero no reemplaza
probarla.

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

La matriz pide una lista de verificación de las **pantallas principales** con
capturas, y esta ejecución solo cubre la portada y el formulario de inicio de
sesión. Para pasar a **Implementado** falta:

1. Repetir la prueba con el backend en marcha (local o el despliegue de
   prueba), con una cuenta de prueba.
2. Recorrer en Chrome, Firefox y Edge las pantallas principales: inicio de
   sesión, dashboard, alta y edición de un miembro, check-in (manual y por QR)
   y configuración.
3. Guardar una captura por pantalla y navegador, sin datos personales.
4. Anotar si la franja de la derecha sigue apareciendo en las demás pantallas.
