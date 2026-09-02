# 🎓 Guía de estudio — Sustentación FitLoyalty (16 jun 2026)

Esta guía tiene 3 partes:
1. **Qué falta** según el documento de calificación (los 10 criterios).
2. **Cómo entender** el código y la base de datos (explicado desde cero).
3. **Plan de estudio** para hoy/mañana + preguntas probables del instructor.

---

## PARTE 1 · Estado de los 10 criterios (qué falta)

El instructor evalúa **Cumple / No Cumple** en 10 criterios. Este es el estado real hoy:

| # | Criterio | Estado | Qué falta y de quién |
|:-:|----------|:------:|----------------------|
| 1 | Login & Registro | ✅ Cumple | Listo y probado. |
| 2 | Recuperación de clave | ⚠️ Parcial | El flujo funciona, pero el criterio pide **envío REAL de correo**. Falta integrar Nodemailer/SendGrid → **Santiago (T-05)**. |
| 3 | Dashboard Administrador | ❌ Falta | Es un placeholder. Hay que construirlo → **Santiago (T-07)**. |
| 4 | Dashboard Usuario Estándar | ✅ Cumple | Listo y probado (tú lo hiciste). |
| 5 | Estilo: nombre + perfil en ambos dashboards | ⚠️ Parcial | En el dashboard de usuario ya sale nombre + avatar. Falta el dashboard admin (depende de C3) → **Santiago (T-09)**. |
| 6 | Listado vía **Vista SQL** | ✅ Cumple | Listo y probado (tú lo hiciste). |
| 7 | Listado vía **Procedimiento** | ⚠️ Parcial | El procedimiento `sp_reporte_asistencia` **ya existe en la BD**, pero falta el **endpoint + la página** que lo muestre → **Santiago (T-11)**. |
| 8 | Fases del desarrollo | ⚠️ Parcial | Tienen análisis, diseño, implementación y pruebas. **Falta el DESPLIEGUE** (subir la app a una URL pública). |
| 9 | Metodología | ⚠️ Falta documento | Tienen backlog, matriz (HU-01 a 53) y sprints. Falta **consolidarlo en un documento/diapositiva (T-13)**. |
| 10 | Herramientas | ✅ Casi | Usan PostgreSQL, Node, React, Git/GitHub, Postman, Figma. Falta una **diapositiva** que lo liste. |

### 🔴 Lo más urgente (coordínalo con Santiago HOY)
Lo tuyo (C1 compartido, C4, C6 y las pruebas) está **listo**. Los riesgos que pueden costar "No Cumple" mañana dependen casi todos de Santiago:
- **C2** → envío real de correo.
- **C3** → dashboard de administrador.
- **C5** → perfil en el dashboard admin.
- **C7** → página que muestre el procedimiento almacenado.
- **C8** → desplegar la app (Render/Railway/Vercel + Supabase/Neon para la BD).
- **C9** → documento de metodología (esto te toca a ti, lo armamos rápido).

> **Mensaje clave:** habla con Santiago esta noche. Si C3, C5, C7 y el correo de C2 no están, son 4 criterios en riesgo.

---

## PARTE 2 · Entendiendo el proyecto

### 2.1 ¿Qué es FitLoyalty? (tu frase de apertura)
> "FitLoyalty es un CRM para gimnasios de barrio. Permite registrar la entrada de los miembros por código QR o de barras, llevar reportes de asistencia, detectar quién deja de ir (alertas de abandono), lanzar campañas de retención y retos gamificados. Está pensado como sistema multi-gimnasio."

### 2.2 Arquitectura general
El proyecto es un **monorepo** (un solo repositorio con dos partes):

```
Proyecto_FitLoyalty/
├── backend/     → la API (Node.js + Express). Habla con PostgreSQL.
├── frontend/    → la interfaz (React + Vite). Lo que ve el usuario.
└── package.json → arranca los dos a la vez con: npm run dev
```

**El flujo en una frase:** el navegador (React) hace peticiones HTTP → la API (Express) las recibe, consulta PostgreSQL y responde en JSON → React pinta el resultado.

- El **frontend** corre en `http://localhost:5173` (Vite).
- El **backend** corre en `http://localhost:3001` (Express).
- Vite tiene un **proxy**: cuando el frontend pide `/api/...`, Vite lo reenvía al backend en el 3001 (así se evita el problema de CORS en desarrollo).

### 2.3 El backend (carpeta `backend/`)
Tecnologías: **Node.js + Express** (servidor web), **pg** (conector a PostgreSQL), **jsonwebtoken** (JWT) y **bcryptjs** (encriptar contraseñas).

Archivos clave:
- `src/db/db.js` → crea un **Pool** de conexiones a PostgreSQL. Un pool es como tener varios "meseros" (conexiones) listos para atender consultas sin abrir y cerrar una conexión cada vez.
- `src/middleware/auth.js` →
  - `authenticate`: revisa que la petición traiga un token JWT válido en el header `Authorization: Bearer <token>`. Si es válido, deja pasar y adjunta los datos del usuario en `req.user`.
  - `authorize(...roles)`: revisa que el usuario tenga el rol permitido.
- `src/routes/auth.js` → endpoints de autenticación:
  - `POST /api/auth/login` → recibe email+contraseña, compara con bcrypt, y si está bien devuelve un **JWT**.
  - `POST /api/auth/register` → crea un usuario (staff) nuevo.
  - `GET /api/auth/me` → devuelve el perfil del usuario logueado (usa el token).
  - `POST /api/auth/forgot-password` → genera un token de recuperación (JWT con `purpose: 'reset'`, vence en 1h).
  - `POST /api/auth/reset-password` → valida ese token y guarda la nueva contraseña.
- `src/routes/asistencia.js` → `GET /api/asistencia`: devuelve el historial de check-ins del gimnasio (para el dashboard de usuario, C4).
- `src/routes/vista.js` → `GET /api/vista/miembros-activos`: hace `SELECT * FROM vista_miembros_activos` (C6).
- `src/index.js` → "enchufa" todas las rutas, configura CORS y arranca el servidor verificando primero que PostgreSQL responda.

### 2.4 Conceptos de seguridad que DEBES poder explicar
- **bcrypt (hash de contraseñas):** nunca se guarda la contraseña tal cual. Se guarda un "hash" (un texto irreversible). Al hacer login, bcrypt compara la contraseña escrita con el hash. Así, aunque roben la base de datos, no ven las contraseñas.
- **JWT (JSON Web Token):** al hacer login, el servidor entrega un "token" firmado que dice quién eres (id, nombre, rol, gimnasio). El navegador lo guarda y lo manda en cada petición. El servidor lo verifica con su clave secreta (`JWT_SECRET`). Es "stateless": el servidor no guarda sesiones, todo va en el token.
- **Multi-gimnasio (multi-tenant):** cada consulta filtra por el `id_gimnasio` que viene en el token. Así, un recepcionista de un gimnasio nunca ve datos de otro.

### 2.5 La base de datos (PostgreSQL)
El script está en `ConsultasDB/Query_Inicial_Crear_Tablas.sql`. Tiene ~24 tablas. No necesitas memorizarlas todas; entiende las **principales** y cómo se relacionan:

**Tablas núcleo:**
- `gimnasio` → cada gimnasio (el sistema es multi-gimnasio).
- `usuario` → el **personal** (staff): ADMINISTRADOR o RECEPCIONISTA. Son los que usan el sistema.
- `miembro` → los **clientes** del gimnasio (los que entrenan). Tienen `codigo_qr`.
- `plan_membresia` → los planes (mensual, trimestral...) con duración y precio.
- `membresia` → la membresía concreta de un miembro (fecha inicio/fin, estado: ACTIVA/VENCIDA/CONGELADA).
- `pago` → los pagos de las membresías.
- `checkin` → cada entrada al gimnasio (por QR, código de barras o manual). Esto alimenta los reportes de asistencia.

**Tablas de las funciones avanzadas (CRM):**
- `alerta_abandono` → marca miembros inactivos (amarilla a los 7 días, roja a los 15).
- `campana`, `plantilla_mensaje`, `envio_mensaje` → campañas de retención y mensajes.
- `reto`, `reto_miembro`, `hito_gamificacion` → retos y gamificación.
- `auditoria` → registro de quién hizo qué.

**Diferencia clave que te pueden preguntar:** `usuario` = staff que opera el sistema; `miembro` = cliente que va a entrenar. Son tablas distintas.

**La Vista (C6) — `vista_miembros_activos`:**
Una **vista** es una "consulta guardada" que se comporta como si fuera una tabla. Esta junta cada miembro con su última membresía y su plan, y muestra nombre, documento, teléfono, email, código QR, estado, fechas y plan — **sin la columna id**. Por eso cumple el criterio "todos los campos excepto el id".

**El Procedimiento (C7) — `sp_reporte_asistencia`:**
Un **procedimiento/función almacenada** es código guardado dentro de la base de datos que se puede ejecutar con parámetros. Este recibe un gimnasio y un rango de fechas, y devuelve las asistencias (miembro, documento, fecha, hora, método). *(Falta la página que lo muestre — tarea de Santiago.)*

### 2.6 El frontend (carpeta `frontend/`)
Tecnologías: **React 18 + Vite + react-router-dom + axios**.

- `src/context/AuthContext.jsx` → el "cerebro" de la sesión. Guarda el token en `localStorage` (clave `fitloyalty_token`), y con un **interceptor de axios** le pega el token a cada petición automáticamente. Expone `login`, `register`, `logout` y el usuario actual.
- `src/components/ProtectedRoute.jsx` → envuelve las páginas privadas. Si no hay sesión → manda al login. Si el rol no alcanza → manda a "Sin acceso". **Esto es lo que hace cumplir C3 y C4 (rutas protegidas por rol).**
- `src/pages/` → las pantallas:
  - `LoginPage.jsx`, `RegisterPage.jsx` (C1)
  - `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx` (C2)
  - `DashboardUsuario.jsx` (C4) — header con nombre+avatar, tarjetas de resumen y tabla de asistencia.
  - `VistaMiembrosActivos.jsx` (C6) — la tabla de la vista SQL.
- `src/App.jsx` → define todas las rutas (URLs) y cuáles están protegidas.

---

## PARTE 3 · Plan de estudio para mañana

### Bloque 1 — Coordinar con Santiago (lo primero, hoy)
Pregúntale el estado de: correo real (C2), dashboard admin (C3 + C5), página del procedimiento (C7) y si van a desplegar (C8). Sin esto, son criterios en riesgo. Repártanse quién muestra qué en la demo.

### Bloque 2 — Repasar TUS criterios (los que sí dominas: C1, C2, C4, C6)
Para cada uno, practica decir en voz alta: **qué es, dónde está el código y cómo lo demuestro**. Abre cada pantalla y nárrate a ti mismo el flujo. Repite el recorrido de pruebas (usa la `Guia_Pruebas_E2E.md`).

Datos para la demo (¡no los olvides!):
- Recepcionista: **laura.rios@fitzone.co** / **Recep2026**
- Para correr todo: `npm run dev` desde la raíz (necesitas PostgreSQL prendido).

### Bloque 3 — Repasar los conceptos teóricos (1 hora)
Asegúrate de poder explicar con tus palabras: qué es una **API REST**, qué es **JWT**, qué es **bcrypt/hash**, qué es una **vista SQL**, qué es un **procedimiento almacenado**, y la diferencia entre **frontend y backend**. (Todo está explicado en la Parte 2.)

### Bloque 4 — Metodología (C9) y Fases (C8)
Ten a la mano: el **backlog**, la **matriz de priorización (HU-01 a HU-53)**, los **4 sprints** (7–15 jun) y un **tablero Kanban**. Para las 5 fases: análisis (casos de uso/HU), diseño (diagrama de BD), implementación (código en GitHub), pruebas (el informe y capturas que hicimos) y despliegue (la URL pública, si la logran).

---

## 🎤 Preguntas que probablemente te haga el instructor (y cómo responder)

- **"¿Cómo guardan las contraseñas?"** → "No las guardamos en texto plano. Usamos bcrypt para guardar un hash irreversible; al hacer login comparamos con bcrypt."
- **"¿Cómo protegen las rutas?"** → "Con JWT. Al loguearse, el servidor entrega un token firmado con el rol. El componente ProtectedRoute revisa el token y el rol antes de dejar entrar; si no, redirige."
- **"Muéstreme una vista y un procedimiento."** → Abrir la sección de Vista SQL (miembros activos) y la del procedimiento (reporte de asistencia). Opcional: mostrarlos también en pgAdmin con `SELECT * FROM vista_miembros_activos;`.
- **"¿Por qué la tabla no muestra el id?"** → "Porque la vista/el procedimiento seleccionan todos los campos menos el id, tal como pide el requisito."
- **"¿Qué base de datos usan y por qué?"** → "PostgreSQL, porque el proyecto necesita vistas y procedimientos almacenados, y es robusta y gratuita."
- **"¿Cómo se comunican el frontend y el backend?"** → "El frontend (React) hace peticiones HTTP a la API REST (Express) y recibe JSON. En desarrollo, Vite hace de proxy hacia el backend."
- **"¿Qué metodología usaron?"** → "Ágil: backlog de historias de usuario priorizadas, 4 sprints cortos con entregables verificables y tablero Kanban."

---

## ✅ Checklist del día de la sustentación
- [ ] PostgreSQL prendido y BD poblada.
- [ ] `npm run dev` corriendo (API 🟡 + WEB 🔵).
- [ ] Probar login con laura.rios@fitzone.co / Recep2026 antes de entrar.
- [ ] Tener abierto: la app, GitHub (rama con todo), pgAdmin, el backlog/matriz, las evidencias.
- [ ] Repartido con Santiago quién demuestra cada criterio.
- [ ] Objetivo: 10/10 → **CUMPLE**.

¡Tú dominas tu parte. Respira y nárralo con seguridad! 💪
