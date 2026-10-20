# C3 — Dashboard Administrador (T-07)

**Responsable:** Santiago Salamanca Narváez  
**Criterio:** C3 — Acceso correcto al dashboard del administrador (ruta protegida por rol)

---

## Qué demostrar en la sustentación

1. Login como administrador: `carlos.mendoza@fitzone.co` / `admin123`
2. Redirección automática a `/dashboard/admin`
3. Panel con **3 métricas en tiempo real**:
   - Miembros activos (total)
   - Ingresos de hoy (check-ins válidos)
   - Vencimientos en 7 días (membresías activas por vencer)
4. Intentar acceder como recepcionista → debe redirigir a `/unauthorized`

---

## Rutas y protección

| Ruta | Componente | Roles permitidos |
|------|------------|------------------|
| `/dashboard/admin` | `DashboardAdmin.jsx` | `admin` |

Middleware: `ProtectedRoute roles={['admin']}` en `App.jsx`

---

## API

```
GET /api/admin/metrics
Authorization: Bearer <token_admin>

Respuesta:
{
  "totalMiembros": 12,
  "asistenciasHoy": 3,
  "membresiasPorVencer": 2
}
```

---

## Capturas requeridas (guardar en esta carpeta)

| # | Archivo sugerido | Contenido |
|---|------------------|-----------|
| 1 | `01_login_admin.png` | Login con credenciales de administrador |
| 2 | `02_dashboard_metricas.png` | Panel con las 3 tarjetas de métricas |
| 3 | `03_navegacion_admin.png` | Tabs: Resumen, Reporte SP, Vista SQL |
| 4 | `04_acceso_denegado.png` | Recepcionista intentando `/dashboard/admin` |
