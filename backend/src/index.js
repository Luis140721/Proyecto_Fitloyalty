require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const pool    = require('./db/db');

const authRoutes       = require('./routes/auth');
const asistenciaRoutes = require('./routes/asistencia');

const app  = express();
const PORT = process.env.PORT || 3001;

// Middlewares globales
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/asistencia', asistenciaRoutes);

// Health check: verifica que la BD responde
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'PostgreSQL conectado', app: 'FitLoyalty API', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'Sin conexion a PostgreSQL' });
  }
});

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Inicia el servidor verificando primero la conexion a PostgreSQL
async function iniciar() {
  try {
    const { rows } = await pool.query('SELECT NOW() AS hora');
    console.log('\n[OK] PostgreSQL conectado -- ' + rows[0].hora);
  } catch (err) {
    console.error('\n[ERROR] No se pudo conectar a PostgreSQL:', err.message);
    console.error('  >> Revisa DB_PASSWORD en backend/.env\n');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('[OK] FitLoyalty API corriendo en http://localhost:' + PORT);
    console.log('[OK] Health check: http://localhost:' + PORT + '/api/health\n');
  });
}

iniciar();
