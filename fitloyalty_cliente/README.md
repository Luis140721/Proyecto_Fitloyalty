# FitLoyalty Cliente — App móvil del miembro

App Flutter para que los **miembros** del gimnasio usen FitLoyalty desde el celular.
No es la app del dueño/recepcionista (eso sigue siendo la web React en `Proyecto_Fitloyalty/frontend`).

---

## Que hace

- Login con **teléfono + contraseña** (10 dígitos que empiezan por 3, y la contraseña que el gimnasio le asigna desde el panel). La pantalla también pide el código o NIT del gimnasio, que hoy el backend no usa.
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
Las migraciones `004_cliente_pin.sql` (agrega `app_acceso` y el antiguo `pin_hash`) y `005_cliente_password.sql` (agrega `password_hash` y `password_set_at`) preparan la tabla `miembro` para la app — corren solas, no hay que hacer nada.

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

### 3. Asignar la contraseña de la app desde el panel web

El miembro entra a la app con su **teléfono** y una **contraseña** que le asigna el gimnasio desde el panel React:

1. Panel web FitLoyalty → Miembros → **Nuevo miembro** (paso 1, «Datos personales») o la **ficha** del miembro (clic en su fila)
2. En **Contraseña de la app** escribe la contraseña que le vas a dar (mínimo 6 caracteres)
3. Guarda

> La ficha dice si el miembro ya tiene contraseña («Ya tiene contraseña para la app» o «Aún no tiene contraseña»). Si se deja el campo vacío, no se cambia. El teléfono debe tener 10 dígitos y empezar por 3, porque es lo que pide el login de la app; si no, la ficha lo advierte. Mientras `password_hash` sea NULL, el miembro no puede entrar a la app.

### 4. Correr la app Flutter

```powershell
cd "C:\Users\Santiago\Documents\Estudios\Sena\FitLoyalty\FitLoyalty_\FitLoyalty_Cliente"
flutter pub get
flutter run
```

### 5. Probar el flujo

1. La app abre el splash y valida si ya hay sesion guardada
2. Si no, te manda al login:
   - **Código o NIT del gimnasio**: la app lo pide (`login_screen.dart`), pero hoy el backend no lo usa: busca al miembro solo por el teléfono. Escribe el NIT o el nombre del gimnasio.
   - **Teléfono**: el celular del miembro, 10 dígitos que empiezan por 3 (sin el +57)
   - **Contraseña**: la que le asignaste en el panel (paso 3)
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
| POST   | `/login`         | telefono + contrasena → JWT de cliente (30 dias)           |
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
| `backend/migrations/005_cliente_password.sql`                        | **NUEVO** — agrega `password_hash` y `password_set_at`: el login pasa de PIN a contraseña |
| `backend/src/middleware/auth.js`                                     | agrega `requireClient` para validar JWT de miembro                       |
| `backend/src/lib/auth-helpers.js`                                    | agrega `generarTokenCliente` y `miembroSeguro`                          |
| `backend/src/routes/cliente.js`                                      | **NUEVO** — los 9 endpoints de arriba                                  |
| `backend/src/routes/miembros.js`                                     | schemas `create` y `update` aceptan `password` (mínimo 6) + `app_acceso`; INSERT y UPDATE la guardan con bcrypt en `password_hash`; la ficha (`GET /admin/miembros/:id`) solo dice `password_asignada` |
| `frontend/src/pages/MiembrosPage.jsx`                                | campo **Contraseña de la app** en el alta y en la ficha (reglas en `frontend/src/lib/contrasenaApp.js`) |
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
- Pantalla de "Recuperar contraseña" via OTP al email del miembro (hoy solo el panel la puede cambiar)
- Asignar contraseñas a los miembros existentes que todavía no tienen (hoy se hace uno por uno desde su ficha)
