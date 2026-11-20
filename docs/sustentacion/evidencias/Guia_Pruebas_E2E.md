# 🧪 Guía de Pruebas End-to-End y Evidencias — FitLoyalty (T-15)

**Responsable:** Luis Fernando Sánchez Loaiza
**Criterios cubiertos por Luis:** C1 (parcial), C2, C4, C6
**Sustentación:** 16 de junio de 2026

Esta guía lista cada prueba a realizar, los pasos, el resultado esperado y dónde
guardar la captura. Marca con `[x]` cada prueba cuando la confirmes.

> **Antes de empezar:** ten el proyecto corriendo con `npm run dev` y la base de
> datos PostgreSQL activa. Toma cada captura con la tecla **Win + Shift + S**
> (recorte de pantalla) y guárdala en la carpeta indicada.

---

## ✅ Resumen de avance

| Criterio | Flujo | Estado | Captura guardada |
|:--------:|-------|:------:|:----------------:|
| C1 | Login exitoso | ☐ | ☐ |
| C1 | Login con error | ☐ | ☐ |
| C1 | Registro de usuario | ☐ | ☐ |
| C2 | Solicitar recuperación | ☐ | ☐ |
| C2 | Restablecer contraseña | ☐ | ☐ |
| C2 | Login con nueva clave | ☐ | ☐ |
| C4 | Dashboard usuario (recepcionista) | ☐ | ☐ |
| C4 | Ruta protegida sin sesión | ☐ | ☐ |
| C6 | Listado desde Vista SQL | ☐ | ☐ |

---

## C1 — Login y Registro
📁 Carpeta: `C1_Login_Registro/`

- [ ] **TC-1.1 · Login exitoso**
  1. Ir a `http://localhost:5173/login`.
  2. Ingresar `carlos.mendoza@fitzone.co` y su contraseña.
  3. Dar clic en **Ingresar**.
  - *Esperado:* entra y redirige al dashboard según el rol.
  - 📸 Guardar como `C1_login_exitoso.png`

- [ ] **TC-1.2 · Login con credenciales incorrectas**
  1. En el login, escribir un correo válido con una contraseña incorrecta.
  - *Esperado:* mensaje de error "Credenciales incorrectas" (sin revelar qué campo falló).
  - 📸 Guardar como `C1_login_error.png`

- [ ] **TC-1.3 · Registro de nuevo usuario**
  1. En el login, clic en **Crear cuenta de socio**.
  2. Llenar nombre, correo nuevo y contraseña, y enviar.
  - *Esperado:* crea la cuenta y entra al sistema.
  - 📸 Guardar como `C1_registro.png`

---

## C2 — Recuperación de Clave
📁 Carpeta: `C2_Recuperacion_Clave/`

- [ ] **TC-2.1 · Solicitar enlace de recuperación**
  1. En el login, clic en **¿Olvidaste tu contraseña?**.
  2. Ingresar un correo registrado (ej: `laura.rios@fitzone.co`) y enviar.
  - *Esperado:* mensaje verde de confirmación + enlace "modo prueba".
  - 📸 Guardar como `C2_solicitar_enlace.png`

- [ ] **TC-2.2 · Restablecer contraseña**
  1. Hacer clic en el enlace de recuperación.
  2. Escribir y confirmar la nueva contraseña, guardar.
  - *Esperado:* mensaje de éxito y redirección al login.
  - 📸 Guardar como `C2_restablecer.png`

- [ ] **TC-2.3 · Login con la nueva contraseña**
  1. Iniciar sesión con el correo y la **nueva** contraseña.
  - *Esperado:* entra correctamente.
  - 📸 Guardar como `C2_login_nueva_clave.png`

---

## C4 — Dashboard Usuario Estándar
📁 Carpeta: `C4_Dashboard_Usuario/`

- [ ] **TC-4.1 · Acceso al dashboard de usuario estándar**
  1. Iniciar sesión como recepcionista (`laura.rios@fitzone.co`).
  - *Esperado:* cae en `/dashboard/receptionist` con su nombre y rol en el header,
    tarjetas de resumen (asistencias totales y de hoy) y tabla de historial.
  - 📸 Guardar como `C4_dashboard_usuario.png`

- [ ] **TC-4.2 · Ruta protegida por rol (sin sesión)**
  1. Cerrar sesión.
  2. Escribir directamente `http://localhost:5173/dashboard/receptionist` en la URL.
  - *Esperado:* el sistema redirige al login (no deja entrar sin autenticación).
  - 📸 Guardar como `C4_ruta_protegida.png`

---

## C6 — Listado vía Vista SQL
📁 Carpeta: `C6_Vista_SQL/`

- [ ] **TC-6.1 · Listado de miembros activos desde la Vista SQL**
  1. Logueado, abrir la pestaña **Miembros activos (Vista SQL)**.
  - *Esperado:* tabla con nombre, documento, teléfono, email, código QR, estado,
    fechas y plan — **sin columna ID**. El subtítulo indica que sale de
    `vista_miembros_activos`.
  - 📸 Guardar como `C6_vista_sql_app.png`

- [ ] **TC-6.2 · (Refuerzo) Vista en pgAdmin**
  1. En pgAdmin, ejecutar: `SELECT * FROM vista_miembros_activos;`
  - *Esperado:* el mismo resultado que muestra la app, comprobando que es una
    vista SQL real.
  - 📸 Guardar como `C6_vista_sql_pgadmin.png`

---

## Notas
- Las pruebas de **C3 (dashboard admin)**, **C5 (perfil con foto)** y
  **C7 (procedimiento almacenado)** dependen de las tareas de Santiago; se
  agregarán a este pack cuando estén listas.
- Cuando tengas todas las capturas, este pack de evidencias queda listo para el
  criterio C8 (fases del desarrollo · pruebas).
