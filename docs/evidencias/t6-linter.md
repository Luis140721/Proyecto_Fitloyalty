# Linter del backend y del frontend (T6, ítem 14)

| Dato | Valor |
|---|---|
| Ítem de la lista T6 | 14: «Linter (PEP8/ESLint u otro) sin errores críticos; sin regresiones respecto a T5» |
| Responsable | Santiago (plan de pruebas, sección 7) |
| Fecha | 2026-11-25, sobre `develop` @ `483654e` |
| Herramienta | ESLint 9.39.5 (configuración plana) |
| Cómo correrlo | `pnpm --dir backend lint` y `pnpm --dir frontend lint` |
| En el CI | Paso «Linter (ESLint)» en los jobs `backend` y `frontend` de `.github/workflows/tests.yml`: un error hace fallar el PR; los avisos no |

## Resultado

| Proyecto | Antes de este cambio | Después | Configuración |
|---|---|---|---|
| Backend | No había linter. Con las reglas de abajo: 4 errores y 15 avisos | **0 errores**, 8 avisos | [`backend/eslint.config.js`](../../backend/eslint.config.js) |
| Frontend | No había linter. Con las reglas de abajo: 5 errores y 12 avisos | **0 errores**, 8 avisos | [`frontend/eslint.config.mjs`](../../frontend/eslint.config.mjs) |

Antes de T6 el proyecto no tenía linter configurado: ni dependencia, ni script, ni paso en el CI. Por eso no hay un resultado de T5 con qué comparar. Desde ahora el CI impide que entre un error nuevo.

### Reglas

- **Las dos:** las recomendadas de ESLint (`@eslint/js`), que detectan variables sin declarar, código inalcanzable, claves duplicadas, comparaciones con `NaN` y similares. Además: `eqeqeq` (comparar con `===`, salvo `== null`), `no-var` y `no-empty`, que permite el `catch` vacío.
- **Frontend:** las reglas de React (`eslint-plugin-react`) y de los hooks (`eslint-plugin-react-hooks`). Un hook dentro de un `if` o un bucle es error.
- **Avisos, no errores:** variables sin usar (`no-unused-vars`), `prefer-const` y las dependencias de `useEffect` (`exhaustive-deps`).

Decisiones de la configuración:
- **`catch` vacío permitido.** En este código es a propósito: un `ROLLBACK` de mejor esfuerzo que, si falla, no cambia nada (`auth.js`, `staff.js`). Los demás bloques vacíos sí son error.
- **`react/prop-types` apagada.** El proyecto no usa PropTypes.
- **`fetchpriority` en minúscula permitido.** React 18 no conoce la prop `fetchPriority` (llega en React 19); en minúscula pasa tal cual al `<img>` y el navegador la entiende (`LandingPage.jsx`).

### Errores corregidos

| Archivo | Error | Corrección |
|---|---|---|
| `frontend/src/components/ErrorBoundary.jsx:50` | `process` no está definido en el navegador (`no-undef`) | `import.meta.env.PROD`, la forma de Vite. Hace lo mismo: el detalle del error solo se ve fuera de producción |
| `frontend/src/pages/MiembrosPage.jsx:733` | Tres escapes innecesarios en `/[\s\-\(\)\+]/` (`no-useless-escape`) | `/[\s\-()+]/`. Se comprobó que limpia el teléfono igual |

Los 4 errores del backend eran `catch` vacíos (ver «Decisiones» arriba).

### Avisos limpiados en la zona de Santiago

`backend/src/routes/checkin.js`, `backend/src/lib/whatsapp.js` y `frontend/src/pages/CheckinPage.jsx`: variables de error sin usar en `catch`, una función muerta (`isWhatsAppModuleEnabled`), dos `let` que deben ser `const`, e importaciones y variables sin usar (`EmptyState`, `COP`, `seenIds`, `useMemo`, `idx`).

## Deuda técnica: avisos que quedan

Ninguno rompe nada; se limpian cuando el dueño toque el archivo. Están en orden de prioridad.

| Prioridad | Archivo | Aviso | Por qué importa | Zona |
|---|---|---|---|---|
| Media | `frontend/src/pages/CheckinPage.jsx:123` | Al `useEffect` le falta `handleAutoCheckIn` entre sus dependencias | Puede usar una versión vieja de la función. No se cambió porque altera cuándo se dispara el check-in automático, y hay que probarlo con el lector | Santiago |
| Media | `backend/src/routes/miembros.js:100` | `decryptQrCode` sin usar | Copia de la función de `checkin.js`: dos versiones del mismo descifrado | Luis |
| Baja | `backend/src/index.js:39` | `IS_PROD` sin usar | Código muerto | Daniel |
| Baja | `frontend/src/pages/MiembrosPage.jsx:390`, `:489` | `qrCanvasRef` y `crearRipple` sin usar | Código muerto | Luis |
| Baja | `frontend/src/pages/DashboardPage.jsx:32` | `useMemo` importado sin usar | Código muerto | Luis |
| Baja | `backend/src/routes/dashboard.js:242` | `idx` sin usar | Código muerto | Luis |
| Baja | `backend/src/index.js:145`, `backend/src/middleware/auth.js:55`, `backend/src/routes/miembros.js:111`, `backend/scripts/postinstall.js:71`, `frontend/src/components/MenuNotificaciones.jsx:45`, `frontend/src/pages/MiembrosPage.jsx:840` | Variable del `catch` sin usar | Se puede escribir `catch {` | Varios |
| Baja | `backend/src/middleware/errorHandler.js:17` | `next` sin usar en `notFound` | Express lo pasa igual; se puede llamar `_next` | Daniel |
| Baja | `frontend/src/components/ErrorBoundary.jsx:23` | Comentario `eslint-disable` que ya no hace falta | Se borra la línea | — |
| Baja | `frontend/tests/TrialContext.test.jsx:7` | `waitFor` importado sin usar | Código muerto en una prueba | Luis |

## Cómo repetirlo

```bash
pnpm --dir backend install
pnpm --dir backend lint
pnpm --dir frontend install
pnpm --dir frontend lint
```

Los dos deben terminar con `0 errors`.
