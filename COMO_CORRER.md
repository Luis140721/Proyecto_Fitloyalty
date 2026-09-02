# 🏋️ FitLoyalty — Cómo correr el proyecto en local

## Requisitos previos
- Node.js 18+ instalado
- PostgreSQL instalado y corriendo (configura la conexión en `backend/.env`)
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
| carlos.mendoza@fitzone.co  | admin123    | Admin (Neon)  |

---

## Despliegue en producción (Neon + Render + Vercel)

> Actualizado: 20 de agosto de 2026 · por Santiago Salamanca

### Arquitectura

```
Internet
   │
   ├─► Vercel   → fitloyalty-zeta.vercel.app   (Frontend React/Vite)
   │
   └─► Render   → fitloyalty-api.onrender.com   (Backend Express)
                       │
                       └─► Neon Postgres
                              ep-restless-mud-axomahp3-pooler.c-4.us-east-2.aws.neon.tech
```

### Variables de entorno en Render (backend)

```
PORT=3001
NODE_ENV=production
JWT_SECRET=fitloyalty_prod_jwt_secret_2026_8f3a9b2c7d4e1f5g
JWT_EXPIRES_IN=8h
FRONTEND_URL=https://fitloyalty-zeta.vercel.app
DATABASE_URL=postgresql://neondb_owner:npg_b7ZJzsMgl5ay@ep-restless-mud-axomahp3-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=santicossalamanca@gmail.com
SMTP_PASSWORD=cvyuoeuanojjvefd
SMTP_FROM="FitLoyalty Soporte" <santicossalamanca@gmail.com>
```

### Variable de entorno en Vercel (frontend)

```
VITE_API_BASE=https://fitloyalty-api.onrender.com/api
```

### Cómo re-desplegar backend

```bash
# En Render → fitloyalty-api → Manual Deploy → Deploy latest commit
# o vía API:
curl -X POST "https://api.render.com/v1/services/srv-XXXX/deploys" \
  -H "Authorization: Bearer rnd_XXXX" \
  -H "Content-Type: application/json" \
  -d "{\"clearCache\":\"clear\"}"
```

### Cómo re-desplegar frontend

```bash
git checkout santiago
git push origin santiago   # Vercel redespliega automáticamente
```

---

## Estructura del proyecto

```
Proyecto_FitLoyalty/
├── backend/
│   ├── src/
│   │   ├── db/         → conexión PostgreSQL + seed
│   │   ├── middleware/ → autenticación JWT
│   │   ├── routes/     → auth.js (login, register, me, logout)
│   │   └── index.js    → servidor Express
│   ├── .env            → variables de entorno (conexión a PostgreSQL)
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
