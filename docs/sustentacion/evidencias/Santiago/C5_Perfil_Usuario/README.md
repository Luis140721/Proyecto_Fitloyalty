# C5 — Perfil de Usuario en Dashboards (T-09)

**Responsable:** Santiago Salamanca Narváez  
**Criterio:** C5 — Nombre y foto/perfil del usuario visible en ambos dashboards

---

## Qué demostrar en la sustentación

1. **Dashboard Admin:** nombre "Carlos Mendoza" + foto de avatar visible en el header
2. **Dashboard Usuario:** nombre "Laura Ríos" + foto de avatar visible en el header
3. El componente es **reutilizable** (`DashboardHeader.jsx`) en todas las páginas del dashboard

---

## Implementación

| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/DashboardHeader.jsx` | Header con nombre, rol, avatar y logout |
| `frontend/src/components/UserAvatar.jsx` | Muestra `photoUrl` o inicial como fallback |
| `backend/src/routes/auth.js` | Campo `photoUrl` en respuesta de login y `/me` |
| `backend/src/db/seed_pg.js` | Asigna `foto_url` a usuarios de prueba |

---

## Capturas requeridas (guardar en esta carpeta)

| # | Archivo sugerido | Contenido |
|---|------------------|-----------|
| 1 | `01_perfil_admin.png` | Header admin con nombre + foto de Carlos Mendoza |
| 2 | `02_perfil_recepcionista.png` | Header recepcionista con nombre + foto de Laura Ríos |
| 3 | `03_componente_reutilizado.png` | Misma barra en Reporte SP o Vista SQL |
