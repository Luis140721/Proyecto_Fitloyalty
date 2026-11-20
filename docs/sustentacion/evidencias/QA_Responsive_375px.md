# QA Responsive — 375px (iPhone SE)

**Fecha:** 30 de agosto de 2026
**Responsable:** Luis (rama `luis-frontend`)
**Release:** v0.4.0-uv
**Viewport auditado:** 375 × 667 (iPhone SE) — el más angosto de los objetivos del sprint.

## Método

1. Auditoría estática de todos los stylesheets (`global.css`, `admin.css`, `landing.css`, `login.css`, `cardglass.css`, `badgeestado.css`, `emptystate.css`): anchos fijos, grillas sin colapso, media queries y fuentes de overflow horizontal.
2. Análisis estático del JSX de las páginas del panel (Dashboard, Miembros, Checkin, Staff) y públicas (Landing, Login, Registro).
3. `npm run build` de verificación final: **en verde** (117 módulos transformados, sin errores ni warnings de compilación).

## Resultados por área

| Área | Resultado | Detalle |
|---|---|---|
| Meta viewport | ✅ | `width=device-width, initial-scale=1.0` presente en `index.html`. |
| Grillas del panel | ✅ | `.kpi-grid`, `.admin-cols`, `.admin-cols-3` colapsan a 1 columna ≤600px. |
| Tabla de miembros | ✅ | Bajo 900px se oculta y se muestra la grilla de tarjetas `CardGlass` (1 columna a 375px). En escritorio conserva `overflow-x: auto`. |
| Estados vacíos | ✅ | `EmptyState` es flex centrado con `max-width: 360px` en la descripción; sin overflow a 375px. |
| Badges de estado | ✅ | `BadgeEstado` reduce padding y fuente ≤600px; `white-space: nowrap` sin desbordar la tarjeta. |
| Login / Registro | ✅ | Los halos decorativos de 700px/600px son absolutos, `pointer-events: none`, y `html { overflow-x: hidden }` impide scroll lateral. Formulario fluido ≤460px. |
| Landing | ✅ | Media queries a 720/760/900/960px; hero y mosaico en 1 columna en móvil. |

## Hallazgos

- **Bloqueantes a 375px: ninguno.** No se abre issue.
- Deuda técnica (no visual, no bloqueante): 14 avisos de lint `react/no-array-index-key` en listas estáticas (skeletons y bullets decorativos), la mayoría en páginas de la rama `santiago`. No generan warnings en la consola del navegador; se dejan documentados para una limpieza conjunta post-release.

## Limpieza de warnings realizada en este sprint (tarea del 27)

Se eliminó todo el código muerto detectado por ESLint (0 errores, 0 unused vars, 0 keys faltantes, 0 problemas de hooks): imports `React` legacy (AuthPanel, Landing, Login), `COP` y `Avatar` sin uso en Checkin, `Sparkline`, `max` y `totalMes` sin uso en Dashboard (y su `useMemo` huérfano), `useLocation`/`from` sin uso en Login, y `initialToken` sin uso en AuthContext.

## Veredicto

**APROBADO** para el cierre de v0.4.0-uv a 375px.
