# 🎤 Guion de sustentación — FitLoyalty (16 jun 2026)

Guion para presentar alineado a los **10 criterios** del documento de calificación.
Está en primera persona (lo que dices) + **[ACCIÓN]** (lo que muestras).
Tus criterios son **C1 (compartido), C2, C4, C6 y C9**. Donde hay **[→ SANTIAGO]**,
le pasas la palabra.

> **Antes de empezar:** PostgreSQL prendido · `npm run dev` corriendo · ya probado el login con
> `laura.rios@fitzone.co` / `Recep2026` · GitHub abierto en la rama con todo · pgAdmin a la mano.

---

## 0. Apertura — el pitch (30–45 segundos)

> "Buenos días. Les presentamos **FitLoyalty**, un sistema de gestión y fidelización
> para **gimnasios de barrio**. El problema que resolvemos: los gimnasios pequeños
> pierden clientes sin darse cuenta porque no tienen cómo medir la asistencia ni
> detectar a quién dejó de ir.
>
> FitLoyalty registra la entrada de los miembros por **código QR o de barras**, arma
> **reportes de asistencia**, genera **alertas de abandono** cuando alguien lleva
> semanas sin venir, y permite lanzar **campañas de retención** y **retos
> gamificados**. Está construido como un sistema **multi-gimnasio**.
>
> Técnicamente es una aplicación web con **backend en Node.js + Express**, base de
> datos **PostgreSQL** y **frontend en React**, con autenticación por **JWT**. Ahora
> se los mostramos funcionando."

---

## 1. Demo por criterio

### 🟢 Criterio 1 — Login & Registro  *(compartido)*
> "Empezamos por la autenticación. El sistema tiene login y registro conectados al
> backend y a la base de datos."

**[ACCIÓN]** Abrir `/login`. Mostrar el formulario.
> "Si pongo una contraseña incorrecta, el sistema responde 'Credenciales incorrectas'
> sin decir qué campo falló, por seguridad."

**[ACCIÓN]** Escribir clave mala → mostrar el error. Luego la correcta → entra al dashboard.
> "Las contraseñas no se guardan en texto plano: usamos **bcrypt** para guardar un
> hash irreversible, y **JWT** para la sesión. Aquí el registro de un usuario nuevo…"

**[ACCIÓN]** (Opcional) Ir a `/register`, crear un usuario y mostrar que entra.

---

### 🟢 Criterio 2 — Recuperación de clave  *(TÚ)*
> "Si un usuario olvida su contraseña, tenemos el flujo de recuperación."

**[ACCIÓN]** En el login, clic en "¿Olvidaste tu contraseña?" → escribir un correo
registrado → enviar.
> "El sistema genera un **token de recuperación** con vencimiento de una hora y arma
> el enlace para restablecer la clave."

**[ACCIÓN]** Abrir el enlace → poner la nueva contraseña → guardar → iniciar sesión con ella.
> "Y entra con la nueva contraseña. El flujo está completo."

> ⚠️ **Si el correo real (Nodemailer) no quedó listo:** di la verdad con seguridad —
> "El flujo de generación y validación del token funciona de extremo a extremo; el
> envío por correo electrónico está integrado/en integración con Nodemailer."
> *(Coordina con Santiago si esta parte se demuestra o no.)*

---

### 🔵 Criterio 3 — Dashboard Administrador  *[→ SANTIAGO]*
> "El acceso a cada sección está protegido por rol. Santiago muestra el dashboard de
> administrador."

---

### 🟢 Criterio 4 — Dashboard Usuario Estándar  *(TÚ)*
> "Yo muestro el dashboard del usuario estándar. Inicio sesión como recepcionista…"

**[ACCIÓN]** Login con `laura.rios@fitzone.co`. Cae en `/dashboard/receptionist`.
> "El sistema me lleva automáticamente a **mi** dashboard según mi rol. Aquí veo el
> **historial de asistencia** del gimnasio: total de asistencias, las de hoy, y la
> tabla con miembro, documento, fecha, hora y método de ingreso."

**[ACCIÓN]** Demostrar la protección por rol: estando como recepcionista, escribir en la
URL `/dashboard/admin`.
> "Y si intento entrar a una sección que no me corresponde, el sistema me **bloquea**
> y muestra 'Sin acceso'. Las rutas están protegidas por el rol que viaja en el token."

---

### 🟢 Criterio 5 — Estilo: nombre y perfil en los dashboards  *(parte tuya + [→ SANTIAGO])*
> "En el encabezado de mi dashboard se ve el **nombre del usuario y su perfil** (avatar)."

**[ACCIÓN]** Señalar el header (Laura Ríos · Recepcionista · avatar).
> "Santiago muestra lo mismo en el dashboard de administrador." **[→ SANTIAGO]**

---

### 🟢 Criterio 6 — Listado vía Vista SQL  *(TÚ)*
> "Este criterio pide mostrar datos desde una **vista SQL**, con todos los campos
> excepto el id. Voy a la sección 'Miembros activos'."

**[ACCIÓN]** Clic en la pestaña "Miembros activos (Vista SQL)".
> "Esta tabla **no sale de una tabla directa, sale de la vista** `vista_miembros_activos`,
> como dice el subtítulo. Muestra nombre, documento, teléfono, email, código QR, estado
> de membresía, fechas y plan — **sin la columna id**."

**[ACCIÓN — refuerzo opcional]** Abrir pgAdmin y ejecutar `SELECT * FROM vista_miembros_activos;`
> "Y aquí en PostgreSQL se ve la vista real devolviendo exactamente lo mismo."

---

### 🔵 Criterio 7 — Listado vía Procedimiento  *[→ SANTIAGO]*
> "El listado por procedimiento almacenado lo muestra Santiago: usa la función
> `sp_reporte_asistencia` que ya está creada en la base de datos."

---

### 🟢 Criterio 8 — Fases del desarrollo  *(compartido)*
> "Aplicamos las 5 fases:"
> - **Análisis:** casos de uso e historias de usuario (HU-01 a HU-53).
> - **Diseño:** el diagrama de la base de datos (más de 20 tablas).
> - **Implementación:** el código, versionado en **GitHub**.
> - **Pruebas:** ejecutamos pruebas end-to-end y dejamos un informe con evidencias.
> - **Despliegue:** *(mostrar la URL pública si quedó desplegado — coordinar con Santiago)*.

**[ACCIÓN]** Mostrar el repo en GitHub y la carpeta de evidencias.

---

### 🟢 Criterio 9 — Metodología  *(TÚ)*
> "Trabajamos con metodología **ágil**. Tenemos un **backlog** de historias priorizadas
> en una matriz, lo dividimos en **4 sprints** cortos del 7 al 15 de junio, cada uno con
> entregables verificables, y llevamos el avance en un **tablero Kanban**."

**[ACCIÓN]** Mostrar el backlog / la matriz de priorización / el tablero.

---

### 🟢 Criterio 10 — Herramientas  *(compartido)*
> "Las herramientas que usamos: **PostgreSQL** como base de datos, **Node.js con
> Express** en el backend, **React** en el frontend, **JWT y bcrypt** para seguridad,
> **Git y GitHub** para control de versiones, **Postman** para probar la API y
> **Figma/Draw.io** para el diseño."

---

## 2. Cierre (20 segundos)

> "En resumen, FitLoyalty es un CRM funcional para gimnasios de barrio: gestiona el
> acceso por roles, registra asistencias, consume datos mediante vistas y
> procedimientos SQL, y sienta la base para las funciones de fidelización —alertas de
> abandono, campañas y retos—. Gracias, quedamos atentos a sus preguntas."

---

## 3. Tips para exponer
- **Habla pausado** y mira al instructor, no solo a la pantalla.
- Antes de cada demo, di **qué vas a mostrar**; durante, **narra lo que pasa**; al final, **conecta con el criterio**.
- Si algo falla en vivo: respira, di "lo intento de nuevo" y reintenta. Ten el login ya probado.
- Usa el vocabulario técnico con naturalidad: *JWT, hash con bcrypt, ruta protegida por rol, vista SQL, procedimiento almacenado, API REST*.
- Si no sabes algo, no inventes: "esa parte la implementó mi compañero, pero la lógica es…".

## 4. Frases gancho para preguntas (memoriza 3-4)
- "Las contraseñas se guardan **hasheadas con bcrypt**, nunca en texto plano."
- "La sesión se maneja con **JWT**: un token firmado que el servidor verifica en cada petición."
- "Cada consulta filtra por el **gimnasio del token**, así un gimnasio nunca ve datos de otro."
- "El listado del criterio 6 **sale de una vista SQL**, no de una tabla directa."
- "Usamos **consultas parametrizadas** para evitar inyección SQL."

---

¡Tú dominas tu parte! Practícalo una vez en voz alta haciendo clic de verdad. 💪
