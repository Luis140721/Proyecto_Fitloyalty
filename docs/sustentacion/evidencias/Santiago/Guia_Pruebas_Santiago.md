# 🧪 Guía de Pruebas en Vivo — Santiago (Demo sustentación 16 jun)

**Responsable:** Santiago Salamanca Narváez  
**Duración estimada demo Santiago:** ~8 minutos

---

## Pre-requisitos (hacer antes de entrar)

```bash
cd Proyecto_Fitloyalty
npm run install:all   # si es necesario
npm run seed          # actualiza contraseñas y fotos de perfil
npm run dev           # backend :3001 + frontend :5173
```

Verificar:
- [ ] PostgreSQL corriendo con datos de `Poblar_Tablas.sql`
- [ ] SMTP configurado en `backend/.env` (para demo C2 con correo real)
- [ ] Capturas guardadas en carpetas C2, C3, C5, C7

---

## Demo 1 — C3 Dashboard Administrador (~2 min)

1. Abrir `http://localhost:5173/login`
2. Ingresar: `carlos.mendoza@fitzone.co` / `admin123`
3. **Mostrar:** redirección a `/dashboard/admin`
4. **Señalar:** 3 tarjetas (miembros activos · ingresos hoy · vencimientos 7 días)
5. **Mencionar:** ruta protegida — solo rol `admin` (`ProtectedRoute` en `App.jsx`)

**Frase sugerida:** *"El dashboard administrador consume métricas en tiempo real desde PostgreSQL vía el endpoint GET /api/admin/metrics, accesible únicamente con JWT de rol administrador."*

---

## Demo 2 — C5 Perfil con foto (~1 min)

1. En el dashboard admin, **señalar el header**
2. **Mostrar:** nombre "Carlos Mendoza", rol, foto circular
3. Cerrar sesión → login como `laura.rios@fitzone.co` / `recep123`
4. **Mostrar:** mismo componente `DashboardHeader` con foto de Laura

**Frase sugerida:** *"Implementamos un componente reutilizable que muestra nombre y foto de perfil en todos los dashboards, consumiendo el campo photoUrl del JWT y la API /auth/me."*

---

## Demo 3 — C7 Reporte por Procedimiento Almacenado (~2 min)

1. Volver a login admin
2. Clic en **"Reporte Asistencia (SP)"**
3. Fechas: `2026-06-01` a `2026-06-16` → **Generar Reporte**
4. **Mostrar:** tabla sin columna ID
5. (Opcional) Abrir pgAdmin y ejecutar:
   ```sql
   SELECT * FROM sp_reporte_asistencia(1, '2026-06-01', '2026-06-16');
   ```

**Frase sugerida:** *"Este listado no consulta la tabla directamente: el backend ejecuta el procedimiento almacenado sp_reporte_asistencia con el id del gimnasio y el rango de fechas."*

---

## Demo 4 — C2 Recuperación con correo real (~3 min)

> Luis puede mostrar el formulario; Santiago demuestra el **envío real del correo**.

1. Ir a `/forgot-password`
2. Ingresar correo registrado (ej. `laura.rios@fitzone.co`)
3. **Abrir Gmail** → mostrar correo recibido de FitLoyalty
4. Clic en **"Restablecer Contraseña"** → nueva clave → login

**Frase sugerida:** *"Usamos Nodemailer con transporte SMTP configurable. El token de recuperación es un JWT con propósito reset que expira en una hora."*

---

## Demo 5 — C8 Fases y C10 Herramientas (~2 min)

1. Abrir carpeta `Evidencias_Sustentacion/Santiago/T12_Fases_Desarrollo/`
2. Recorrer las 5 fases: análisis → diseño → implementación → pruebas → despliegue
3. Mostrar slide de `T14_Herramientas/Stack_Tecnico.md`

---

## Checklist día de sustentación

| Criterio | Demo | ✓ |
|:--------:|------|:-:|
| C2 | Correo recibido + reset funcional | ☐ |
| C3 | Dashboard admin con métricas | ☐ |
| C5 | Nombre + foto en ambos dashboards | ☐ |
| C7 | Tabla SP sin ID | ☐ |
| C8 | Carpeta 5 fases | ☐ |
| C10 | Slide herramientas | ☐ |
