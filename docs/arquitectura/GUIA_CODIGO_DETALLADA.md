# 🧠 FitLoyalty — Explicación detallada del código (para desarrolladores)

Recorrido archivo por archivo del código real del proyecto, con los fragmentos
y el porqué de cada decisión técnica. Pensado para que entiendas **cómo y por qué
funciona**, no solo qué hace.

**Stack:** Node.js + Express + PostgreSQL (`pg`) + JWT + bcrypt en el backend ·
React 18 + Vite + react-router-dom + axios en el frontend. Monorepo.

---

## 0. Cómo arranca todo (orden de ejecución)

En la raíz, `package.json` define:

```json
"scripts": {
  "dev": "concurrently --names \"API,WEB\" ... \"npm run dev --prefix backend\" \"npm run dev --prefix frontend\""
}
```

`concurrently` lanza **dos procesos a la vez**:
1. **Backend** → `nodemon src/index.js` (puerto 3001). `nodemon` reinicia el server al guardar cambios.
2. **Frontend** → `vite` (puerto 5173). Vite sirve React con hot-reload.

Punto de entrada de cada lado:
- Backend: `backend/src/index.js`
- Frontend: `frontend/src/main.jsx` → monta `<App />` en el `<div id="root">`.

---

## 1. BACKEND

### 1.1 `src/index.js` — el servidor Express

```js
require('dotenv').config();              // carga variables de backend/.env
const express = require('express');
const cors    = require('cors');
const pool    = require('./db/db');

const authRoutes       = require('./routes/auth');
const asistenciaRoutes = require('./routes/asistencia');
const vistaRoutes      = require('./routes/vista');

const app  = express();
const PORT = process.env.PORT || 3001;
```

Conceptos:
- `require('dotenv').config()` lee `backend/.env` y mete sus valores en `process.env` (DB_PASSWORD, JWT_SECRET, etc.). Por eso los secretos **no van en el código**.
- `express()` crea la aplicación. Una app Express es una cadena de **middlewares** (funciones que reciben `(req, res, next)`) que procesan cada petición en orden.

**Middlewares globales:**
```js
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
```
- `cors(...)` permite que el navegador (que corre en 5173) llame a la API (3001) desde otro origen. Sin esto, el navegador bloquearía las peticiones.
- `express.json()` parsea el cuerpo de las peticiones con `Content-Type: application/json` y lo deja en `req.body`. Sin esto, `req.body` sería `undefined`.

**Montaje de rutas (routers):**
```js
app.use('/api/auth', authRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/vista', vistaRoutes);
```
Cada router agrupa endpoints bajo un prefijo. Ej.: dentro de `authRoutes`, `router.post('/login')` queda accesible como `POST /api/auth/login`.

**Health check** (útil para verificar que la BD responde):
```js
app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'PostgreSQL conectado' }); }
  catch (e) { res.status(500).json({ status: 'error' }); }
});
```

**Manejo de errores (orden importa):**
```js
app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ...` })); // 404
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: '...' }); }); // 500
```
- El de **4 parámetros** `(err, req, res, next)` es el *error handler* de Express: captura cualquier error que se lance en los middlewares anteriores.
- Van **al final** porque Express evalúa middlewares en orden: si nada respondió antes, cae al 404; si algo lanzó error, cae al handler de error.

**Arranque con verificación de BD:**
```js
async function iniciar() {
  try { const { rows } = await pool.query('SELECT NOW() AS hora'); console.log('[OK] PostgreSQL...'); }
  catch (err) { console.error('[ERROR] No se pudo conectar...'); process.exit(1); }
  app.listen(PORT, () => console.log('[OK] API en http://localhost:' + PORT));
}
iniciar();
```
Decisión de diseño: si la BD no responde, el server **no arranca** (`process.exit(1)`). Prefiere fallar rápido y claro que arrancar "a medias".

### 1.2 `src/db/db.js` — conexión a PostgreSQL (Pool)

```js
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'fitloyalty',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});
pool.on('error', (err) => console.error('[DB] Error en el pool:', err.message));
module.exports = pool;
```

**¿Por qué un Pool y no una conexión?** Abrir una conexión a Postgres es costoso. Un *pool* mantiene varias conexiones abiertas y las **reutiliza** entre consultas. `pool.query(...)` toma una conexión libre, ejecuta y la devuelve al pool. Para una API con muchas peticiones concurrentes, es la práctica estándar.

Se exporta una **única instancia** (módulo singleton): todos los archivos que hacen `require('./db/db')` comparten el mismo pool.

### 1.3 `src/middleware/auth.js` — autenticación y autorización

```js
const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.split(' ')[1];        // "Bearer xxx" -> "xxx"
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET); // valida firma + expiración
    req.user = payload;                            // adjunta {id, name, email, role, gymId}
    next();                                         // deja pasar al siguiente handler
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
```

Claves:
- Es un **middleware**: si todo va bien llama `next()` para continuar; si no, responde 401 y **corta** la cadena.
- `jwt.verify` hace dos cosas: comprueba que la **firma** sea válida (que el token lo emitió nuestro server con `JWT_SECRET`) y que **no haya expirado**. Si algo falla, lanza y caemos al `catch`.
- Tras verificar, `req.user` queda disponible para los handlers siguientes. Así cada endpoint sabe quién hace la petición sin volver a la BD.

```js
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Acceso denegado...' });
    next();
  };
}
```
- Es una **función que devuelve un middleware** (closure). Uso: `authorize('admin')` o `authorize('admin','receptionist')`.
- Diferencia 401 vs 403: 401 = no estás autenticado; 403 = estás autenticado pero **no tienes permiso**.

### 1.4 `src/routes/auth.js` — autenticación (el archivo más importante)

**Helpers:**
```js
function mapRol(rol) {                              // BD usa 'ADMINISTRADOR'/'RECEPCIONISTA'
  const mapa = { ADMINISTRADOR: 'admin', RECEPCIONISTA: 'receptionist' };
  return mapa[rol] || rol.toLowerCase();           // el frontend usa 'admin'/'receptionist'
}

function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id_usuario, name: usuario.nombre, email: usuario.email,
      role: mapRol(usuario.rol), gymId: usuario.id_gimnasio },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function usuarioSeguro(u) {                          // objeto SIN password_hash
  return { id: u.id_usuario, name: u.nombre, email: u.email, role: mapRol(u.rol), gymId: u.id_gimnasio };
}
```
- `jwt.sign(payload, secret, opciones)` crea el token. El payload viaja **firmado pero legible** (no se cifra): por eso **nunca** se mete el `password_hash` ahí.
- `usuarioSeguro` existe para no filtrar nunca el hash al frontend.
- `mapRol` traduce el vocabulario de la BD al del frontend. Es una capa de adaptación típica.

**POST /login:**
```js
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  try {
    const resultado = await pool.query(
      'SELECT * FROM usuario WHERE email = $1 AND activo = TRUE',
      [email.toLowerCase().trim()]
    );
    const usuario = resultado.rows[0];
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const esValida = await bcrypt.compare(password, usuario.password_hash);
    if (!esValida) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = generarToken(usuario);
    res.json({ message: 'Login exitoso', token, user: usuarioSeguro(usuario) });
  } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});
```
Detalles importantes:
- **Consulta parametrizada** (`$1` + array `[...]`): el valor nunca se concatena en el string SQL. Esto **previene SQL Injection**. Nunca hagas `... WHERE email = '${email}'`.
- `bcrypt.compare(plano, hash)` devuelve `true/false` sin "des-encriptar" nada (los hashes no se revierten; bcrypt re-hashea y compara).
- **Mismo mensaje** "Credenciales incorrectas" si el email no existe O si la clave está mal: así no se revela qué emails están registrados (buena práctica de seguridad).

**POST /register:**
```js
router.post('/register', async (req, res) => {
  const { name, email, password, gymId } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: '...' });
  if (password.length < 6) return res.status(400).json({ error: '... 6 caracteres' });
  const idGimnasio = gymId || 1;
  try {
    const { rows: existente } = await pool.query('SELECT id_usuario FROM usuario WHERE email = $1', [email...]);
    if (existente.length > 0) return res.status(409).json({ error: 'El email ya esta registrado' });

    const password_hash = await bcrypt.hash(password, 10);   // 10 = rondas de sal
    const { rows } = await pool.query(
      `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, rol)
       VALUES ($1,$2,$3,$4,'RECEPCIONISTA') RETURNING *`,
      [idGimnasio, name.trim(), email.toLowerCase().trim(), password_hash]
    );
    const token = generarToken(rows[0]);
    res.status(201).json({ message: 'Registro exitoso', token, user: usuarioSeguro(rows[0]) });
  } catch (err) { ... }
});
```
- `bcrypt.hash(password, 10)`: el **10** es el "cost factor" (2¹⁰ iteraciones). Más alto = más seguro pero más lento. 10 es un balance típico.
- `INSERT ... RETURNING *` devuelve la fila recién creada en la misma consulta (evita un segundo SELECT).
- Códigos HTTP: **201** (creado), **409** (conflicto: email duplicado).

**POST /forgot-password (C2):**
```js
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const respuestaGenerica = { message: 'Si el correo esta registrado, te enviamos un enlace...' };
  const { rows } = await pool.query('SELECT id_usuario, nombre, email FROM usuario WHERE email=$1 AND activo=TRUE', [email...]);
  const usuario = rows[0];
  if (!usuario) return res.json(respuestaGenerica);                 // misma respuesta si no existe

  const resetToken = jwt.sign({ id: usuario.id_usuario, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
  console.log('[RECUPERACION] Enlace:', resetUrl);                  // TODO: enviar por correo real (Santiago)
  return res.json({ ...respuestaGenerica, devResetUrl: resetUrl, devToken: resetToken }); // dev
});
```
- Reutilizamos JWT para el **token de recuperación**, pero con `purpose: 'reset'` y vencimiento corto (1h). Así no hay que crear una tabla de tokens.
- Responde **siempre el mismo mensaje** (exista o no el email) por privacidad.
- En producción, ese `resetUrl` se enviaría por correo (Nodemailer). Ahora se loguea/devuelve para poder probar.

**POST /reset-password (C2):**
```js
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(400).json({ error: 'El enlace es invalido o ya expiro...' }); }
  if (payload.purpose !== 'reset') return res.status(400).json({ error: 'Token invalido' }); // no aceptar un token de sesión normal
  const password_hash = await bcrypt.hash(password, 10);
  const { rowCount } = await pool.query('UPDATE usuario SET password_hash=$1 WHERE id_usuario=$2 AND activo=TRUE', [password_hash, payload.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ message: 'Contrasena actualizada...' });
});
```
- Verifica firma + expiración + que `purpose === 'reset'` (para que un token de login no sirva para resetear).
- `rowCount` indica cuántas filas se actualizaron; si es 0, el usuario no existía.

### 1.5 `src/routes/asistencia.js` (C4) — datos del dashboard

```js
router.use(authenticate);   // TODAS las rutas de este router requieren login

router.get('/', async (req, res) => {
  const gymId = req.user.gymId;        // viene del token, no del cliente
  const historial = await pool.query(
    `SELECT m.nombre AS miembro, m.documento, c.fecha_hora, c.metodo
     FROM checkin c INNER JOIN miembro m ON m.id_miembro = c.id_miembro
     WHERE c.id_gimnasio = $1 AND c.valido = TRUE
     ORDER BY c.fecha_hora DESC LIMIT 50`, [gymId]);
  const resumen = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.fecha_hora::date = CURRENT_DATE)::int AS hoy
     FROM checkin c WHERE c.id_gimnasio = $1 AND c.valido = TRUE`, [gymId]);
  res.json({ asistencias: historial.rows, total: resumen.rows[0].total, hoy: resumen.rows[0].hoy });
});
```
- `router.use(authenticate)` protege **todo** el router de una sola línea.
- **Seguridad multi-gimnasio:** `gymId` sale del **token** (`req.user.gymId`), no de un parámetro que el cliente pueda manipular. Así nadie pide datos de otro gimnasio.
- `INNER JOIN` une cada check-in con su miembro para traer el nombre.
- `COUNT(*) FILTER (WHERE ...)` es sintaxis de Postgres para contar condicionalmente en la misma consulta (las asistencias de hoy).
- `::int` y `::date` son **casts** de Postgres (convierten tipos).

### 1.6 `src/routes/vista.js` (C6) — consumir la Vista SQL

```js
router.use(authenticate);
router.get('/miembros-activos', async (req, res) => {
  const resultado = await pool.query(
    `SELECT nombre, documento, telefono, email, codigo_qr,
            estado_membresia, fecha_inicio, fecha_fin, plan
     FROM vista_miembros_activos ORDER BY nombre ASC`);
  res.json({ miembros: resultado.rows, total: resultado.rowCount });
});
```
- Lo importante para el criterio: el `SELECT` es **`FROM vista_miembros_activos`** (una vista), no de una tabla directa, y **no incluye ninguna columna id**.

---

## 2. FRONTEND

### 2.1 `src/main.jsx` — punto de entrada
```js
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
```
Monta el árbol de React dentro del `<div id="root">` del `index.html`. `StrictMode` activa chequeos extra en desarrollo (por eso a veces los efectos corren dos veces en dev).

### 2.2 `src/context/AuthContext.jsx` — el estado global de sesión

```js
const api = axios.create({ baseURL: '/api' });           // todas las llamadas van a /api/...

api.interceptors.request.use((config) => {               // INTERCEPTOR
  const token = localStorage.getItem('fitloyalty_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```
- `axios.create({ baseURL: '/api' })`: una instancia de axios con prefijo. `api.post('/auth/login')` llama a `/api/auth/login`, que Vite redirige al backend (proxy).
- El **interceptor** se ejecuta antes de cada petición y le **pega el token automáticamente**. Así no hay que poner el header en cada llamada.

```js
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {                                       // al cargar la app: restaurar sesión
    const token = localStorage.getItem('fitloyalty_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem('fitloyalty_token'))  // token inválido -> fuera
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('fitloyalty_token', data.token);  // persistir token
    setUser(data.user);
    return data.user;                                       // para redirigir según rol
  }, []);
  // register y logout son análogos
  return <AuthContext.Provider value={{ user, loading, login, register, logout, api }}>{children}</AuthContext.Provider>;
}
```
Conceptos de React:
- **Context** = estado compartido sin pasar props manualmente por todos los niveles. Cualquier componente hijo usa `useAuth()` para acceder a `user`, `login`, etc.
- `useState` = estado local reactivo (al cambiarlo, React re-renderiza).
- `useEffect(..., [])` = corre **una vez** al montar. Aquí intenta restaurar la sesión llamando a `/auth/me` con el token guardado.
- `loading` evita parpadeos: mientras se verifica el token, no se decide aún si mostrar login o dashboard.
- `useCallback` memoriza las funciones para que no se recreen en cada render.
- **Persistencia:** el token vive en `localStorage`, así la sesión sobrevive a recargar la página.

### 2.3 `src/App.jsx` — el enrutador

```js
function RootRedirect() {                                 // a dónde mando al entrar a "/"
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  switch (user.role) {
    case 'admin':        return <Navigate to="/dashboard/admin" replace />;
    case 'receptionist': return <Navigate to="/dashboard/receptionist" replace />;
    default:             return <Navigate to="/dashboard/member" replace />;
  }
}

<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
  <Route path="/reset-password"  element={<ResetPasswordPage />} />
  <Route path="/dashboard/receptionist" element={
    <ProtectedRoute roles={['admin','receptionist']}><DashboardUsuario /></ProtectedRoute>
  }/>
  <Route path="/dashboard/vista-miembros" element={
    <ProtectedRoute roles={['admin','receptionist','member']}><VistaMiembrosActivos /></ProtectedRoute>
  }/>
  ...
</Routes>
```
- `react-router-dom` maneja las URLs **sin recargar la página** (SPA, Single Page Application).
- Cada `<Route>` mapea una URL a un componente. Las privadas se envuelven en `<ProtectedRoute>`.
- `RootRedirect` decide a qué dashboard mandar según el rol del token.

### 2.4 `src/components/ProtectedRoute.jsx` — guardia de rutas (C3/C4)

```js
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="spinner" />;                       // esperando verificación
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;   // sin sesión
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />; // sin permiso
  return children;                                                        // ok, renderiza la página
}
```
Esta es la pieza que hace cumplir "rutas protegidas por rol":
1. Si aún está verificando el token → muestra spinner.
2. Si no hay usuario → al login (y recuerda a dónde quería ir con `state.from`).
3. Si hay usuario pero su rol no está en `roles` → a "Sin acceso".
4. Si todo bien → muestra la página hija.

### 2.5 Patrón de las páginas con formulario (Login, Register, Forgot, Reset)

Todas siguen el mismo patrón de **componente controlado**:
```js
const [form, setForm] = useState({ email: '', password: '' });
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);

function handleChange(e) { setForm(prev => ({ ...prev, [e.target.name]: e.target.value })); }

async function handleSubmit(e) {
  e.preventDefault();                       // evita que el navegador recargue
  setLoading(true);
  try {
    const user = await login(form.email, form.password);
    navigate(getDashboardPath(user.role), { replace: true });
  } catch (err) {
    setError(err.response?.data?.error || 'Error...');   // muestra el mensaje del backend
  } finally { setLoading(false); }
}
```
- **Controlado** = el valor del input vive en el estado de React (`value={form.email}` + `onChange`). React es la "fuente de la verdad".
- `e.preventDefault()` evita el submit nativo del HTML (que recargaría la página).
- `loading` deshabilita el botón mientras se procesa (evita doble envío).
- El `error` se toma de `err.response.data.error` → **el backend manda el mensaje y el frontend lo muestra**. Por eso login, registro, etc. enseñan errores claros.

### 2.6 `src/pages/DashboardUsuario.jsx` (C4) — carga de datos

```js
const [data, setData] = useState({ asistencias: [], total: 0, hoy: 0 });
const [loading, setLoading] = useState(true);

useEffect(() => {
  let activo = true;                                  // bandera anti "memory leak"
  api.get('/asistencia')
    .then(({ data }) => { if (activo) setData(data); })
    .catch((err) => { if (activo) setError(...); })
    .finally(() => { if (activo) setLoading(false); });
  return () => { activo = false; };                   // cleanup: si el componente se desmonta, ignora la respuesta
}, []);
```
- `useEffect(..., [])` dispara la carga de datos **una vez** al montar.
- La bandera `activo` + el `return () => { activo = false }` es un patrón para **no actualizar el estado si el componente ya se desmontó** (evita warnings y bugs).
- Mientras `loading` es `true`, se muestra un spinner; luego, la tabla o un "no hay datos".

El render usa `data.asistencias.map(...)` para pintar las filas, y un helper `formatFechaHora` con `toLocaleDateString('es-CO', ...)` para mostrar fechas en formato colombiano.

---

## 3. El flujo de autenticación completo (de punta a punta)

1. Usuario escribe email+clave y envía el form de `LoginPage`.
2. `login()` del `AuthContext` hace `POST /api/auth/login`.
3. Vite (proxy) reenvía a `http://localhost:3001/api/auth/login`.
4. El backend busca el usuario, valida con `bcrypt.compare`, y si es correcto crea un **JWT** con `{id, name, email, role, gymId}` firmado con `JWT_SECRET`.
5. Responde `{ token, user }`. El frontend guarda el token en `localStorage` y el `user` en el estado.
6. `LoginPage` redirige al dashboard según `user.role`.
7. En la siguiente petición (ej. `GET /api/asistencia`), el **interceptor** de axios añade `Authorization: Bearer <token>`.
8. El middleware `authenticate` del backend hace `jwt.verify`, recupera `req.user` y deja pasar.
9. El endpoint usa `req.user.gymId` para filtrar datos del gimnasio correcto.
10. Al recargar la página, `useEffect` del AuthContext llama `/auth/me` con el token guardado y restaura la sesión.

---

## 4. La base de datos (PostgreSQL)

Script: `ConsultasDB/Query_Inicial_Crear_Tablas.sql`. Todo va dentro de `BEGIN; ... COMMIT;` (transacción: o se crea todo, o nada).

### 4.1 Patrones del esquema
- **Claves primarias** `SERIAL PRIMARY KEY` (autoincremental).
- **Claves foráneas** `FOREIGN KEY (...) REFERENCES ...` mantienen integridad referencial (no puedes tener una membresía de un miembro inexistente).
- **CHECK constraints** validan a nivel de BD: ej. `CHECK (rol IN ('ADMINISTRADOR','RECEPCIONISTA'))`, `CHECK (precio >= 0)`, `CHECK (fecha_fin >= fecha_inicio)`.
- **UNIQUE compuestos** para multi-gimnasio: `UNIQUE (id_gimnasio, documento)` → un documento es único *dentro de un gimnasio*, no globalmente.
- **Baja lógica:** se usa `activo BOOLEAN` en vez de borrar filas (así se conserva el historial).
- **Índices** en columnas de búsqueda frecuente: `CREATE INDEX idx_checkin_miembro_fecha ON checkin(id_miembro, fecha_hora DESC)` acelera los reportes.

### 4.2 La Vista (C6)
```sql
CREATE OR REPLACE VIEW vista_miembros_activos AS
SELECT m.nombre, m.documento, m.telefono, m.email, m.codigo_qr,
       me.estado AS estado_membresia, me.fecha_inicio, me.fecha_fin, p.nombre AS plan
FROM miembro m
LEFT JOIN LATERAL (
    SELECT * FROM membresia me2 WHERE me2.id_miembro = m.id_miembro
    ORDER BY me2.fecha_fin DESC LIMIT 1
) me ON TRUE
LEFT JOIN plan_membresia p ON p.id_plan = me.id_plan
WHERE m.activo = TRUE;
```
- Una **vista** es una consulta guardada que se usa como tabla.
- El `LEFT JOIN LATERAL (... LIMIT 1)` trae **la última membresía** de cada miembro (la de mayor `fecha_fin`). `LATERAL` permite que la subconsulta referencie `m.id_miembro` de la consulta externa.
- No selecciona ninguna columna `id_*` → cumple "todos los campos excepto el id".

### 4.3 El Procedimiento / función (C7)
```sql
CREATE OR REPLACE FUNCTION sp_reporte_asistencia(
    p_id_gimnasio INTEGER, p_fecha_inicio DATE, p_fecha_fin DATE)
RETURNS TABLE (miembro VARCHAR, documento VARCHAR, fecha DATE, hora TIME, metodo VARCHAR)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
    SELECT m.nombre, m.documento, c.fecha_hora::DATE, c.fecha_hora::TIME, c.metodo
    FROM checkin c INNER JOIN miembro m ON m.id_miembro = c.id_miembro
    WHERE c.id_gimnasio = p_id_gimnasio
      AND c.fecha_hora::DATE BETWEEN p_fecha_inicio AND p_fecha_fin
    ORDER BY c.fecha_hora DESC;
END; $$;
```
- Función en **PL/pgSQL** (el lenguaje procedural de Postgres) que **recibe parámetros** y `RETURNS TABLE` (devuelve filas).
- Se llamaría desde el backend con `SELECT * FROM sp_reporte_asistencia(1, '2026-06-01', '2026-06-30');`.
- *(Falta el endpoint + la página que lo consuma — tarea de Santiago, C7.)*

---

## 5. Glosario rápido
- **API REST:** interfaz HTTP donde cada URL+método (GET/POST/PUT/DELETE) representa una operación; intercambia JSON.
- **Middleware:** función que procesa la petición antes del handler final (auth, json, cors, errores).
- **JWT:** token firmado que transporta la identidad del usuario; el server lo verifica sin guardar sesión.
- **bcrypt:** algoritmo de hash lento (a propósito) para contraseñas.
- **Pool de conexiones:** conjunto reutilizable de conexiones a la BD.
- **Consulta parametrizada:** `$1, $2...` con valores aparte; evita SQL Injection.
- **Context (React):** estado global accesible por cualquier componente.
- **Hook:** función `use...` de React (`useState`, `useEffect`, `useContext`, `useCallback`).
- **Componente controlado:** input cuyo valor lo maneja el estado de React.
- **SPA:** la app cambia de "página" sin recargar; el router lo gestiona en el cliente.
- **Vista SQL:** consulta guardada que se usa como tabla.
- **Procedimiento/función almacenada:** código ejecutable guardado en la BD.

---

¿Dudas sobre algún archivo o concepto puntual? Pídeme que profundice en cualquiera (por ejemplo el ciclo de vida de los hooks, el manejo de errores de Express, o cómo extender el patrón para crear un módulo nuevo).
