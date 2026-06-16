# C2 — Recuperación de Clave con Correo Real (T-05)

**Responsable:** Santiago Salamanca Narváez  
**Criterio:** C2 — Formulario funcional con envío real de correo electrónico

---

## Qué demostrar en la sustentación

1. Ir a `/forgot-password` e ingresar un correo registrado (ej. `laura.rios@fitzone.co`)
2. Mostrar el **correo recibido** en la bandeja de entrada con el enlace de recuperación
3. Abrir el enlace → formulario de nueva contraseña → login exitoso con la nueva clave

---

## Configuración SMTP (Gmail)

1. Activar verificación en 2 pasos en la cuenta Gmail de prueba
2. Ir a **Cuenta Google → Seguridad → Contraseñas de aplicaciones**
3. Generar una contraseña para "Correo" / "Otro (FitLoyalty)"
4. Agregar en `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_FROM="FitLoyalty Soporte" <tu_correo@gmail.com>
FRONTEND_URL=http://localhost:5173
```

5. Reiniciar el backend y probar el flujo

---

## Implementación técnica

- **Librería:** Nodemailer (`backend/package.json`)
- **Endpoint:** `POST /api/auth/forgot-password`
- **Token:** JWT con `purpose: 'reset'`, expira en 1 hora
- **Plantilla:** HTML con botón naranja FitLoyalty y enlace a `/reset-password?token=...`

---

## Capturas requeridas (guardar en esta carpeta)

| # | Archivo sugerido | Contenido |
|---|------------------|-----------|
| 1 | `01_formulario_forgot.png` | Pantalla `/forgot-password` con correo ingresado |
| 2 | `02_correo_recibido.png` | Bandeja Gmail mostrando el email de FitLoyalty |
| 3 | `03_enlace_reset.png` | Formulario de nueva contraseña abierto desde el enlace |
| 4 | `04_login_nueva_clave.png` | Login exitoso con la contraseña actualizada |

---

## Modo desarrollo (sin SMTP)

Si no hay credenciales SMTP, el backend imprime el enlace en consola y la respuesta incluye `devResetUrl` (solo cuando `NODE_ENV !== 'production'`).
