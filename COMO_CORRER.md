# 🏋️ FitLoyalty — Cómo correr el proyecto en local

## Requisitos previos
- Node.js 18+ instalado
- **Una sola terminal** (todo se maneja desde la raíz)

---

## Arranque rápido (primera vez)

```bash
# 1. Instalar dependencias de todo el proyecto
npm run install:all

# 2. Crear la base de datos y usuarios de prueba (solo la primera vez)
npm run seed

# 3. Correr backend + frontend al mismo tiempo
npm run dev
```

Abre **http://localhost:5173** en tu navegador. ¡Listo!

> El backend corre en `http://localhost:3001` y el frontend en `http://localhost:5173`.  
> Verás los logs de ambos en la misma terminal con colores distintos: 🟡 API y 🔵 WEB.

---

## Usuarios de prueba
| Email                      | Contraseña  | Rol           |
|----------------------------|-------------|---------------|
| admin@fitloyalty.com       | admin123    | Administrador |
| recepcion@fitloyalty.com   | recep123    | Recepcionista |
| carlos@gmail.com           | miembro123  | Miembro       |

---

## Estructura del proyecto

```
Proyecto_FitLoyalty/
├── backend/
│   ├── src/
│   │   ├── db/         → base de datos SQLite + seed
│   │   ├── middleware/ → autenticación JWT
│   │   ├── routes/     → auth.js (login, register, me, logout)
│   │   └── index.js    → servidor Express
│   ├── data/           → fitloyalty.db (se crea al correr seed)
│   ├── .env            → variables de entorno
│   └── package.json
└── frontend/
    ├── src/
    │   ├── context/    → AuthContext (JWT + estado global)
    │   ├── components/ → ProtectedRoute
    │   ├── pages/      → LoginPage, RegisterPage
    │   ├── styles/     → global.css, login.css
    │   └── App.jsx     → rutas
    └── vite.config.js
```
