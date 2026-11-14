# Evidencias de Sustentación — Santiago Salamanca Narváez

**Proyecto:** FitLoyalty · SENA ADSO · Sustentación 16 de junio de 2026

Este directorio consolida las evidencias de las tareas asignadas a Santiago (T-05, T-07, T-09, T-11, T-12, T-14).

---

## Criterios cubiertos por Santiago

| Criterio | Tarea | Evidencia | Estado |
|:--------:|:-----:|-----------|:------:|
| C2 | T-05 | `C2_Recuperacion_Clave/` + Nodemailer en `backend/src/routes/auth.js` | ✅ Implementado |
| C3 | T-07 | `C3_Dashboard_Admin/` + `DashboardAdmin.jsx` | ✅ Implementado |
| C5 | T-09 | `C5_Perfil_Usuario/` + `DashboardHeader.jsx` | ✅ Implementado |
| C7 | T-11 | `C7_Procedimiento_Almacenado/` + `ReporteAsistencia.jsx` | ✅ Implementado |
| C8 | T-12 | `T12_Fases_Desarrollo/` | ✅ Documentado |
| C10 | T-14 | `T14_Herramientas/Stack_Tecnico.md` | ✅ Documentado |

---

## Cómo generar las capturas de pantalla

1. Ejecutar el proyecto: `npm run dev` (desde `Proyecto_Fitloyalty/`)
2. Ejecutar seed si es primera vez: `npm run seed`
3. Guardar capturas PNG en la carpeta correspondiente de cada criterio
4. Nombrar archivos descriptivamente: `01_login_admin.png`, `02_metricas.png`, etc.

### Usuarios de prueba

| Email | Contraseña | Rol |
|-------|------------|-----|
| carlos.mendoza@fitzone.co | admin123 | Administrador |
| laura.rios@fitzone.co | recep123 | Recepcionista |

---

## Archivos clave del código (implementación)

| Componente | Ruta |
|------------|------|
| Envío de correo (C2) | `backend/src/routes/auth.js` → POST `/forgot-password` |
| Métricas admin (C3) | `backend/src/routes/admin.js` → GET `/metrics` |
| Reporte SP (C7) | `backend/src/routes/admin.js` → GET `/reporte-asistencia` |
| SP en PostgreSQL | `ConsultasDB/Query_Inicial_Crear_Tablas.sql` → `sp_reporte_asistencia` |
| Dashboard admin | `frontend/src/pages/DashboardAdmin.jsx` |
| Reporte asistencia | `frontend/src/pages/ReporteAsistencia.jsx` |
| Perfil en header | `frontend/src/components/DashboardHeader.jsx` |

---

## Informes de prueba

- [Informe de pruebas E2E — Santiago](Informe_Pruebas_Santiago.md)
- [Guía paso a paso para demo en vivo](Guia_Pruebas_Santiago.md)
