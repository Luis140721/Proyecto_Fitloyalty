/**
 * src/index.js
 *
 * Servidor Express de FitLoyalty (MVP reescrito).
 *
 * Rutas MVP:
 *   /api/auth         -> signup, login, me, logout, forgot/verify/reset, accept-invite
 *   /api/billing      -> trial-status
 *   /api/admin/staff  -> invite, list, revoke
 *   /api/admin/miembros -> CRUD miembros
 *   /api/admin/checkin  -> check-in manual/QR
 *   /api/admin/dashboard -> KPIs
 *   /api/health       -> healthcheck
 */
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const pool    = require('./db/db');
const { applyMigrations } = require('./db/migrate');

const authRoutes     = require('./routes/auth');
const staffRoutes    = require('./routes/staff');
const miembrosRoutes = require('./routes/miembros');
const checkinRoutes  = require('./routes/checkin');
const billingRoutes  = require('./routes/billing');
const dashboardRoutes = require('./routes/dashboard');

const app  = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, true);
  },
  credentials: true,
}));
app.use(express.json());

// Rate limits: login 5/min, forgot 3/min
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en un minuto.' },
});
const forgotLimiter = rateLimit({
  windowMs: 60 * 1000, max: 3,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', staffRoutes);
app.use('/api', miembrosRoutes);
app.use('/api', checkinRoutes);
app.use('/api', billingRoutes);
app.use('/api', dashboardRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'PostgreSQL conectado', app: 'FitLoyalty API', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'Sin conexion a PostgreSQL' });
  }
});

app.use((req, res) => {
  if (!IS_PROD) return res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
  return res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function iniciar() {
  try {
    const { rows } = await pool.query('SELECT NOW() AS hora');
    console.log('\n[OK] PostgreSQL conectado -- ' + rows[0].hora);
  } catch (err) {
    console.error('\n[ERROR] No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  }

  try {
    await applyMigrations();
  } catch (err) {
    console.error('[migrate] Migraciones pendientes o con error:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`[OK] FitLoyalty API corriendo en http://localhost:${PORT}`);
    console.log(`[OK] Health: http://localhost:${PORT}/api/health\n`);
  });
}

if (require.main === module) {
  iniciar();
}

module.exports = { app, iniciar };
