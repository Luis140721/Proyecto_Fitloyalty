# FitLoyalty Cliente — App móvil del miembro

App Flutter para que los **miembros** del gimnasio usen FitLoyalty desde el celular.
No es la app del dueño/recepcionista (eso sigue siendo la web React en `Proyecto_Fitloyalty/frontend`).

---

## Que hace

- Login con **codigo del gimnasio + documento + PIN de 4 digitos**
- Pantalla **Inicio**: KPIs rapidos (visitas hoy, este mes, puntos, total)
- Pantalla **Mi QR**: el codigo QR del miembro para escanear en recepcion (con vista en pantalla completa + zoom)
- Pantalla **Mi plan**: membresia vigente con fechas, estado de pago, valor, dias restantes
- Pestana **Mas**:
  - **Mi asistencia**: ultimos ingresos con fecha, hora y metodo
  - **Mis logros y retos**: gamificacion (puntos, hitos, % completado) y retos activos
  - **Mi perfil**: ver datos + **editar telefono / email / direccion / contacto emergencia / salud / objetivo / nivel**
  - **Cerrar sesion**

---

## Stack y patron

Igual que el `Store_Pro_Ss` de la profe para que el codigo sea consistente:

- **Flutter 3.47 / Dart 3.13**
- HTTP con `http`
- JWT guardado en `flutter_secure_storage`
- Estado global con `provider` + `ChangeNotifier`
- Variables de entorno con `flutter_dotenv` (`assets/.env`)
- Estructura por capas: `config/` → `models/` → `services/` → `providers/` → `screens/` + `widgets/` + `theme/`

---

## Estructura

```
FitLoyalty_Cliente/
├── assets/.env                       # API_URL, APP_NAME
├── lib/
│   ├── main.dart                     # entry + MultiProvider + SplashGate
│   └── cliente/
│       ├── config/environment.dart   # lee API_URL
│       ├── theme/app_theme.dart      # dark theme naranja
│       ├── models/                   # Miembro, Membresia, Asistencia, Gamificacion
│       ├── services/                 # api_client, auth, perfil, asistencia, gamificacion
│       ├── providers/                # auth_provider, perfil_provider
│       ├── widgets/common.dart       # KpiCard, EmptyState, ErrorBanner, ShimmerBox, StatusChip, InitialsAvatar
│       └── screens/                  # login, splash, home, dashboard, qr, qr_fullscreen,
│                                     # plan, more, asistencia, gamificacion, perfil, editar_perfil
└── tool/migrate_withopacity.py       # util para limpiar deprecations de Flutter
```

---

## Como correrlo en local (celular por USB)

### 1. Backend arriba

Desde `Proyecto_Fitloyalty/`:

```powershell
cd "C:\Users\Santiago\Documents\Estudios\Sena\FitLoyalty\FitLoyalty_\Proyecto_Fitloyalty\backend"
npm install
npm run dev
```

La API escucha en `http://localhost:3001` y aplica las migraciones al arrancar.
La nueva migración `004_cliente_pin.sql` agrega `pin_hash`, `pin_set_at`, `app_acceso` y un indice a la tabla `miembro` — corre sola, no hay que hacer nada.

Verifica con:
```powershell
curl http://localhost:3001/api/health
```

### 2. Conectar el celular por USB

Con el celular en **Depuracion USB** (ya lo tienes, lo usa Store_Pro_Ss):

```powershell
adb devices
adb reverse tcp:3001 tcp:3001
```

Esto hace que cuando la app en el celular pida `http://localhost:3001`, llegue a tu PC.

### 3. Crear un miembro con PIN desde el panel web

El admin asigna el PIN al miembro desde el panel React:

1. Panel web FitLoyalty → Miembros → Nuevo / Editar
2. En el campo nuevo **PIN (4 digitos)** escribe el PIN que le vas a dar al miembro
3. Guarda

> Si ya tienes miembros creados sin PIN, editalos y agregaselo. Mientras `pin_hash` sea NULL no podran entrar a la app.

### 4. Correr la app Flutter

```powershell
cd "C:\Users\Santiago\Documents\Estudios\Sena\FitLoyalty\FitLoyalty_\FitLoyalty_Cliente"
flutter pub get
flutter run
```

### 5. Probar el flujo

1. La app abre el splash y valida si ya hay sesion guardada
2. Si no, te manda al login:
   - **Codigo del gimnasio**: el NIT o el nombre exacto del gimnasio (probalos ambos si uno no anda)
   - **Documento**: la cedula del miembro SIN puntos
   - **PIN**: los 4 digitos que le asignaste
3. Si todo esta bien, llegas a la pantalla **Inicio** con tus KPIs

---

## Como se ve la app

- Tema dark (mismo lenguaje visual que el panel web)
- BottomNavigationBar con 4 tabs: Inicio, Mi QR, Mi plan, Mas
- Pantallas con `RefreshIndicator` (jalas hacia abajo para recargar)
- Estados: `loading` (shimmer), `error` (banner con Reintentar), `empty` (icon + mensaje)
- Los QRs se muestran grandes sobre fondo blanco para que el staff los pueda escanear

---

## Endpoints nuevos en el backend

Todos bajo `/api/cliente`:

| Metodo | Ruta             | Que hace                                                   |
|--------|------------------|------------------------------------------------------------|
| POST   | `/login`         | documento + PIN → JWT de cliente (30 dias)                 |
| GET    | `/me`            | perfil del miembro autenticado                             |
| PUT    | `/me`            | actualizar telefono, email, direccion, emergencia, salud   |
| GET    | `/qr`            | codigo + imagen base64 del QR                              |
| GET    | `/membresia`     | plan vigente (plan_cobro activo)                           |
| GET    | `/asistencia`    | ultimos check-ins del miembro + resumen (hoy/mes/total)    |
| GET    | `/gamificacion`  | resumen de puntos + lista de hitos (logrados / no)         |
| GET    | `/retos`         | retos activos en el gimnasio                               |
| POST   | `/logout`        | confirmacion de logout (JWT es stateless)                  |

**Seguridad:** todas las rutas (excepto `/login`) requieren JWT con `role: 'cliente'`. El middleware `requireClient` rechaza tokens de staff con 403, y cada query filtra por `req.user.idMiembro` — un miembro nunca ve datos de otro.

Rate limit: 10 intentos de login por minuto por IP (mas permisivo que el panel admin, porque es el cliente final el que puede equivocarse).

---

## Donde se cambiaron cosas del backend

| Archivo                                                              | Cambio                                                                  |
|----------------------------------------------------------------------|-------------------------------------------------------------------------|
| `backend/migrations/004_cliente_pin.sql`                             | **NUEVO** — agrega `pin_hash`, `pin_set_at`, `app_acceso` a `miembro`   |
| `backend/src/middleware/auth.js`                                     | agrega `requireClient` para validar JWT de miembro                       |
| `backend/src/lib/auth-helpers.js`                                    | agrega `generarTokenCliente` y `miembroSeguro`                          |
| `backend/src/routes/cliente.js`                                      | **NUEVO** — los 9 endpoints de arriba                                  |
| `backend/src/routes/miembros.js`                                     | schemas `create` y `update` aceptan `pin` + `app_acceso`; INSERT y UPDATE hashean el PIN con bcrypt |
| `backend/src/index.js`                                               | monta `/api/cliente` + rate limit de login del cliente                  |

Ninguna ruta existente cambio de firma: lo que ya tenias (panel admin, check-ins, dashboard) sigue funcionando igual.

---

## Verificacion

```powershell
flutter analyze        # -> No issues found!
flutter test           # -> smoke test pasa
```

Para validar el backend:

```powershell
node -c backend/src/routes/cliente.js
node -c backend/src/middleware/auth.js
node -c backend/src/index.js
node -c backend/src/lib/auth-helpers.js
node -c backend/src/routes/miembros.js
```

(sin salida = sin errores de sintaxis)

---

## Pendientes para produccion (cuando salgas de sustentacion)

- HTTPS obligatorio (Flutter permite HTTP en dev; para Play Store hay que migrar a HTTPS)
- Implementar `refresh token` (hoy el JWT vence a los 30 dias y hay que volver a loguearse)
- Notificaciones push (FCM) para avisar al miembro cuando su plan vence
- Pantalla de "Recuperar PIN" via OTP al email del miembro (hoy solo el admin lo puede resetear)
- Versionar la migracion 004 con datos seed de PIN por defecto para miembros existentes si asi lo decides
