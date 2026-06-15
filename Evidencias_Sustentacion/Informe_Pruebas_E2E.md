# 📋 Informe de Pruebas End-to-End — FitLoyalty (T-15)

**Responsable:** Luis Fernando Sánchez Loaiza
**Fecha de ejecución:** 15 de junio de 2026
**Entorno:** Local (`http://localhost:5173` frontend · `http://localhost:3001` API · PostgreSQL)
**Criterios verificados:** C1, C2, C4, C6
**Resultado global:** ✅ 9/9 pruebas APROBADAS

> Las pruebas se ejecutaron recorriendo la aplicación de extremo a extremo en el
> navegador. Cada prueba indica los pasos, el resultado esperado y el resultado
> obtenido.

---

## Resumen

| # | Criterio | Prueba | Resultado |
|:--:|:--------:|--------|:---------:|
| TC-1.1 | C1 | Login exitoso | ✅ PASS |
| TC-1.2 | C1 | Login con credenciales incorrectas | ✅ PASS |
| TC-1.3 | C1 | Registro de nuevo usuario | ✅ PASS |
| TC-2.1 | C2 | Solicitar enlace de recuperación | ✅ PASS |
| TC-2.2 | C2 | Restablecer contraseña con el enlace | ✅ PASS |
| TC-2.3 | C2 | Login con la nueva contraseña | ✅ PASS |
| TC-4.1 | C4 | Acceso al dashboard de usuario estándar | ✅ PASS |
| TC-4.2 | C4 | Ruta protegida (acceso sin sesión) | ✅ PASS |
| TC-6.1 | C6 | Listado de miembros desde la Vista SQL | ✅ PASS |

---

## C1 — Login y Registro

### TC-1.1 · Login exitoso
- **Pasos:** Ir a `/login`, ingresar `laura.rios@fitzone.co` con contraseña válida y dar **Ingresar**.
- **Esperado:** El sistema autentica y redirige al dashboard según el rol.
- **Obtenido:** ✅ Ingresa y redirige a `/dashboard/receptionist` mostrando el nombre y rol del usuario.

### TC-1.2 · Login con credenciales incorrectas
- **Pasos:** En `/login`, ingresar un correo válido con una contraseña incorrecta.
- **Esperado:** Mensaje de error genérico sin revelar qué campo falló.
- **Obtenido:** ✅ Muestra "Credenciales incorrectas" y no concede acceso.

### TC-1.3 · Registro de nuevo usuario
- **Pasos:** En `/register`, completar nombre, correo nuevo, teléfono y contraseña, y dar **Crear cuenta**.
- **Esperado:** Crea el usuario en la BD e inicia sesión automáticamente.
- **Obtenido:** ✅ Cuenta "Demo QA Prueba" creada; redirige al dashboard con la sesión iniciada.

---

## C2 — Recuperación de Clave

### TC-2.1 · Solicitar enlace de recuperación
- **Pasos:** En `/login` → "¿Olvidaste tu contraseña?", ingresar `laura.rios@fitzone.co` y enviar.
- **Esperado:** Confirmación de envío y generación del enlace de recuperación.
- **Obtenido:** ✅ Mensaje verde de confirmación + enlace de recuperación (modo prueba).

### TC-2.2 · Restablecer contraseña
- **Pasos:** Abrir el enlace, escribir y confirmar la nueva contraseña, guardar.
- **Esperado:** La contraseña se actualiza y redirige al login.
- **Obtenido:** ✅ "Contraseña actualizada. Ya puedes iniciar sesión..." y redirección automática.

### TC-2.3 · Login con la nueva contraseña
- **Pasos:** Iniciar sesión con el correo y la **nueva** contraseña.
- **Esperado:** Acceso exitoso.
- **Obtenido:** ✅ Ingresa correctamente con la nueva contraseña (flujo C2 completo de punta a punta).

> **Nota:** el envío del correo real corresponde a la tarea T-05 (Santiago). En estas
> pruebas el enlace se genera y se valida correctamente; falta integrar el envío por
> correo (Nodemailer/SendGrid) para cerrar C2 al 100%.

---

## C4 — Dashboard Usuario Estándar

### TC-4.1 · Acceso al dashboard de usuario estándar
- **Pasos:** Iniciar sesión como recepcionista.
- **Esperado:** Dashboard con nombre/rol en el header, tarjetas de resumen y tabla de historial de asistencia.
- **Obtenido:** ✅ Header con "Laura Ríos · Recepcionista", tarjetas (20 asistencias totales · 0 hoy) y tabla de asistencia con miembro, documento, fecha, hora y método.

### TC-4.2 · Ruta protegida (acceso sin sesión)
- **Pasos:** Cerrar sesión y navegar directamente a `/dashboard/receptionist`.
- **Esperado:** Redirección al login (no permite acceso sin autenticación).
- **Obtenido:** ✅ Redirige automáticamente a `/login`.

---

## C6 — Listado vía Vista SQL

### TC-6.1 · Listado de miembros activos desde la Vista SQL
- **Pasos:** Logueado, abrir la pestaña "Miembros activos (Vista SQL)".
- **Esperado:** Tabla con todos los campos **excepto el ID**, indicando que proviene de una vista SQL.
- **Obtenido:** ✅ Tabla de 27 miembros (nombre, documento, teléfono, email, código QR, estado, fechas, plan), sin columna ID. El subtítulo indica que el listado se genera desde `vista_miembros_activos`.
- **Refuerzo sugerido (pendiente):** mostrar en pgAdmin `SELECT * FROM vista_miembros_activos;` para evidenciar que es una vista real.

---

## Datos de prueba generados durante la ejecución
- **Usuario nuevo creado:** `demo.qa.0615@fitloyalty.com` (nombre "Demo QA Prueba"). Es un registro de prueba; puede eliminarse de la BD si se desea dejarla limpia.
- **Contraseña de `laura.rios@fitzone.co` actualizada a:** `Recep2026` (por la prueba de recuperación). Tenerlo presente para la demo.

## Pendiente (depende de Santiago)
- **C3** Dashboard Administrador · **C5** Perfil con foto en header · **C7** Página del Procedimiento Almacenado.
- Estas pruebas se agregarán a este informe cuando esas funcionalidades estén listas.
