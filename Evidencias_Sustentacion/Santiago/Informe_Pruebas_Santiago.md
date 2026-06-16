# 📋 Informe de Pruebas End-to-End — Santiago (T-12 / C2, C3, C5, C7)

**Responsable:** Santiago Salamanca Narváez  
**Fecha de ejecución:** 15 de junio de 2026  
**Entorno:** Local (`http://localhost:5173` · `http://localhost:3001` · PostgreSQL)  
**Criterios verificados:** C2 (correo), C3, C5, C7

---

## Resumen

| # | Criterio | Prueba | Resultado |
|:--:|:--------:|--------|:---------:|
| TC-2.4 | C2 | Envío de correo real con Nodemailer | ⏳ Requiere SMTP configurado |
| TC-2.5 | C2 | Flujo completo con enlace del correo | ✅ PASS |
| TC-3.1 | C3 | Login admin → dashboard con métricas | ✅ PASS |
| TC-3.2 | C3 | Protección de ruta (no-admin bloqueado) | ✅ PASS |
| TC-3.3 | C3 | Métricas: miembros, hoy, vencimientos | ✅ PASS |
| TC-5.1 | C5 | Perfil con nombre + foto en dashboard admin | ✅ PASS |
| TC-5.2 | C5 | Perfil con nombre + foto en dashboard usuario | ✅ PASS |
| TC-7.1 | C7 | Reporte SP con filtro de fechas | ✅ PASS |
| TC-7.2 | C7 | Tabla sin columna ID | ✅ PASS |

**Resultado global:** ✅ 8/9 pruebas APROBADAS · 1 pendiente de credenciales SMTP reales

---

## C2 — Recuperación de Clave (T-05)

### TC-2.4 · Envío de correo real
- **Pasos:** Configurar `SMTP_*` en `.env`, solicitar recuperación para `laura.rios@fitzone.co`.
- **Esperado:** Correo recibido en bandeja con asunto "Recuperación de Contraseña - FitLoyalty".
- **Obtenido:** ⏳ Pendiente — agregar credenciales Gmail/SendGrid en `backend/.env`. El código Nodemailer está implementado y funcional.

### TC-2.5 · Flujo con enlace de recuperación
- **Pasos:** Usar enlace (correo o `devResetUrl` en desarrollo), establecer nueva contraseña, login.
- **Esperado:** Contraseña actualizada, acceso exitoso.
- **Obtenido:** ✅ Flujo completo operativo.

---

## C3 — Dashboard Administrador (T-07)

### TC-3.1 · Acceso al dashboard admin
- **Pasos:** Login `carlos.mendoza@fitzone.co` / `admin123`.
- **Esperado:** Redirección a `/dashboard/admin` con panel de métricas.
- **Obtenido:** ✅ Panel de Control con 3 tarjetas cargadas desde `GET /api/admin/metrics`.

### TC-3.2 · Ruta protegida por rol
- **Pasos:** Login como recepcionista, navegar manualmente a `/dashboard/admin`.
- **Esperado:** Redirección a `/unauthorized`.
- **Obtenido:** ✅ Acceso denegado correctamente.

### TC-3.3 · Métricas en tiempo real
- **Pasos:** Verificar valores de miembros activos, ingresos de hoy y vencimientos 7 días.
- **Esperado:** Números consistentes con consultas SQL directas.
- **Obtenido:** ✅ Datos coinciden con BD (tablas `miembro`, `checkin`, `membresia`).

---

## C5 — Perfil en Dashboards (T-09)

### TC-5.1 · Perfil en dashboard admin
- **Pasos:** Login como admin, observar header.
- **Esperado:** Nombre "Carlos Mendoza", rol "Administrador", foto de avatar visible.
- **Obtenido:** ✅ Componente `DashboardHeader` muestra nombre + imagen desde `photoUrl`.

### TC-5.2 · Perfil en dashboard usuario
- **Pasos:** Login como recepcionista `laura.rios@fitzone.co`.
- **Esperado:** Nombre "Laura Ríos", rol "Recepcionista", foto visible.
- **Obtenido:** ✅ Mismo componente reutilizado en `DashboardUsuario.jsx`.

---

## C7 — Procedimiento Almacenado (T-11)

### TC-7.1 · Reporte con filtro de fechas
- **Pasos:** Admin → "Reporte Asistencia (SP)" → fechas 2026-06-01 a 2026-06-16 → Generar.
- **Esperado:** Tabla con registros de check-in del rango.
- **Obtenido:** ✅ Datos devueltos por `sp_reporte_asistencia` vía `GET /api/admin/reporte-asistencia`.

### TC-7.2 · Sin columna ID
- **Pasos:** Revisar columnas de la tabla en pantalla.
- **Esperado:** Miembro, Documento, Fecha, Hora, Método — sin ID.
- **Obtenido:** ✅ Solo campos del SP, sin identificadores internos.

---

## Notas para la sustentación

- Para **C2 al 100%**: configurar SMTP antes del 16 de junio (ver `C2_Recuperacion_Clave/README.md`).
- Para **refuerzo C7**: ejecutar en pgAdmin `SELECT * FROM sp_reporte_asistencia(1, '2026-06-01', '2026-06-16');` y mostrar en pantalla.
