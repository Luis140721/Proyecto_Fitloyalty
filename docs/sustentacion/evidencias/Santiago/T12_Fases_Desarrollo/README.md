# T-12 — Evidencias de las 5 Fases del Desarrollo (C8)

**Responsable:** Santiago Salamanca Narváez  
**Criterio:** C8 — Análisis, diseño, implementación, pruebas y despliegue

---

## Índice de fases

| Fase | Descripción | Evidencia en el proyecto |
|:----:|-------------|--------------------------|
| 1 | **Análisis** | Casos de uso, requisitos, backlog de sustentación |
| 2 | **Diseño** | Diagrama ER, arquitectura, scripts SQL |
| 3 | **Implementación** | Código fuente en GitHub / carpetas backend y frontend |
| 4 | **Pruebas** | Informes E2E, capturas Postman y pantallas |
| 5 | **Despliegue** | Configuración Render/Railway, URL pública |

---

## Fase 1 — Análisis

**Entregables:**
- Backlog de sustentación con 10 criterios (C1–C10) y división de tareas T-01 a T-16
- Matriz de responsabilidades Santiago / Luis
- Sprints 1–4 (7–15 junio 2026)

**Ubicación:** Documento de backlog compartido con el equipo (sustentación cuarto trimestre).

**Casos de uso cubiertos por Santiago:**
- UC-03: Recuperar contraseña (C2)
- UC-05: Consultar métricas del gimnasio (C3)
- UC-07: Generar reporte de asistencia por fechas (C7)

---

## Fase 2 — Diseño

**Entregables:**
- Modelo entidad-relación PostgreSQL (tablas `usuario`, `sesion`, `miembro`, `checkin`, `membresia`)
- Vista SQL `vista_miembros_activos`
- Función `sp_reporte_asistencia(p_id_gimnasio, p_fecha_inicio, p_fecha_fin)`
- Arquitectura cliente-servidor: React (Vite) + Express + PostgreSQL

**Ubicación:**
- `ConsultasDB/Query_Inicial_Crear_Tablas.sql` — DDL completo
- `ConsultasDB/Poblar_Tablas.sql` — datos de prueba

**Diagrama de flujo — Recuperación de contraseña (C2):**

```
Usuario → /forgot-password → POST /api/auth/forgot-password
         → JWT reset (1h) → Nodemailer SMTP → Email con enlace
         → /reset-password?token=... → POST /api/auth/reset-password → Login
```

---

## Fase 3 — Implementación

**Stack:** Node.js + Express · React + Vite · PostgreSQL · JWT · bcrypt · Nodemailer

**Módulos implementados por Santiago:**

| Módulo | Archivos |
|--------|----------|
| Auth + correo | `backend/src/routes/auth.js` |
| Admin API | `backend/src/routes/admin.js` |
| Dashboard admin | `frontend/src/pages/DashboardAdmin.jsx` |
| Reporte SP | `frontend/src/pages/ReporteAsistencia.jsx` |
| Perfil header | `frontend/src/components/DashboardHeader.jsx` |
| Rutas protegidas | `frontend/src/App.jsx` |

**Control de versiones:** Git + GitHub (historial de commits por sprint).

---

## Fase 4 — Pruebas

**Entregables:**
- `Evidencias_Sustentacion/Santiago/Informe_Pruebas_Santiago.md`
- `Evidencias_Sustentacion/Santiago/Guia_Pruebas_Santiago.md`
- Capturas por criterio en carpetas C2, C3, C5, C7
- Pruebas de API con Postman (endpoints `/auth/forgot-password`, `/admin/metrics`, `/admin/reporte-asistencia`)

**Casos de prueba Santiago:** TC-2.4 (correo real), TC-3.x (dashboard admin), TC-5.x (perfil), TC-7.x (reporte SP).

---

## Fase 5 — Despliegue

**Entregables:**
- Backend desplegado en Render / Railway (Node.js)
- Frontend desplegado en Vercel / Render (build estático Vite)
- Base de datos PostgreSQL en Supabase / Neon
- Variables de entorno: `JWT_SECRET`, `DATABASE_URL`, `SMTP_*`, `FRONTEND_URL`

**Checklist de despliegue:**
- [ ] `npm run build` en frontend sin errores
- [ ] Health check: `GET /api/health`
- [ ] URL pública accesible para demo en sustentación
- [ ] SMTP configurado en producción para C2

---

## Carpeta de capturas por fase

Guardar evidencias visuales en las subcarpetas:

```
T12_Fases_Desarrollo/
├── 01_Analisis/       → captura del backlog / casos de uso
├── 02_Diseno/         → captura ER en pgAdmin o Draw.io
├── 03_Implementacion/ → captura del repositorio GitHub / VS Code
├── 04_Pruebas/        → capturas de informes E2E y Postman
└── 05_Despliegue/     → captura de URL pública + panel de hosting
```
