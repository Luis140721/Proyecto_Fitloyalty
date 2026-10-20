# T-14 — Herramientas Utilizadas (C10)

**Responsables:** Santiago Salamanca Narváez + Luis Fernando Sánchez Loaiza  
**Criterio:** C10 — Uso adecuado de herramientas del stack

---

## Stack tecnológico FitLoyalty

| Herramienta | Uso en el proyecto | Criterios que cubre |
|-------------|-------------------|---------------------|
| **PostgreSQL** | BD relacional: tablas, vista SQL, procedimiento almacenado | C6, C7, C10 |
| **Node.js + Express** | API REST: auth, admin, asistencia, vista | C1, C2, C3, C7, C10 |
| **React + Vite** | Frontend SPA: login, dashboards, reportes | C1–C5, C7, C10 |
| **JWT + bcrypt** | Autenticación stateless y hash de contraseñas | C1, C2, C3, C4 |
| **Nodemailer** | Envío real de correo SMTP (recuperación de clave) | C2, C10 |
| **Git + GitHub** | Control de versiones, colaboración en equipo | C8, C10 |
| **Postman** | Pruebas de endpoints REST documentadas | C8, C10 |
| **Figma / Draw.io** | Diagramas ER, casos de uso, arquitectura | C8, C10 |

---

## Detalle por herramienta

### PostgreSQL
- Scripts: `ConsultasDB/Query_Inicial_Crear_Tablas.sql`
- Vista: `vista_miembros_activos` (C6 — Luis)
- SP: `sp_reporte_asistencia` (C7 — Santiago)
- Cliente: librería `pg` (node-postgres)

### Node.js + Express
- Puerto: 3001 (configurable en `.env`)
- Rutas: `/api/auth`, `/api/admin`, `/api/asistencia`, `/api/vista`
- Middleware: CORS, JSON, JWT authenticate/authorize

### React + HTML/CSS
- Router: React Router v6 con rutas protegidas por rol
- Estado global: AuthContext (JWT en localStorage)
- Estilos: CSS modular (`login.css`, `dashboard.css`)

### Nodemailer (Santiago — T-05)
- Transporte SMTP configurable vía variables de entorno
- Plantilla HTML para correo de recuperación de contraseña

### Git + GitHub
- Ramas por feature/sprint
- Commits descriptivos alineados con tareas T-01 a T-16

### Postman
- Colección de endpoints: login, register, forgot-password, admin/metrics, reporte-asistencia
- Evidencia: capturas de respuestas 200/401/403

### Figma / Draw.io
- Diagrama entidad-relación del gimnasio
- Diagrama de arquitectura cliente-servidor
- Mockups de login y dashboards

---

## Slide sugerida para sustentación (copiar a PowerPoint/Canva)

```
🏋️ FitLoyalty — Herramientas (C10)

Backend:     Node.js · Express · JWT · bcrypt · Nodemailer
Frontend:    React · Vite · React Router · CSS
Base datos:  PostgreSQL · Vista SQL · Procedimiento Almacenado
DevOps:      Git · GitHub · Postman · Render/Vercel
Diseño:      Figma · Draw.io

Equipo: Santiago Salamanca · Luis Fernando Sánchez
SENA ADSO · Bogotá 2026
```

---

## Evidencia visual

Guardar en esta carpeta:
- `01_stack_diagrama.png` — diagrama de arquitectura
- `02_postman_coleccion.png` — Postman con endpoints probados
- `03_github_repo.png` — repositorio con commits del sprint
- `04_pgadmin_vista_sp.png` — pgAdmin mostrando vista y SP
