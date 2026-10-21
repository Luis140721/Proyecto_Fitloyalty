const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ==========================================
// D1 (RQNF-15): Configuración segura de CORS
// ==========================================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173', // Puerto por defecto de Vite / React local
  'http://localhost:3000'
].filter(Boolean); // Elimina valores undefined si FRONTEND_URL no está definida

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como Postman, herramientas móviles o cURL)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por política CORS: Origen no permitido.'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// ==========================================
// D2 (RQNF-09): Limitadores de tasa (Rate Limiters)
// ==========================================
// 1. Limitador general estricto para rutas de autenticación críticas
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Máximo 5 intentos por IP
  message: {
    error: 'Demasiados intentos desde esta IP, por favor intente nuevamente después de 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Aplicar limitador específico a verify-reset-code y reset-password (D2)
app.use('/api/auth/verify-reset-code', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// 3. Aplicar limitador a la ruta de eliminación de cuentas (según requerimiento de Luis)
app.use('/api/auth/account', authLimiter);

// ==========================================
// D3 (RQNF-02): Endpoint de Health Check
// ==========================================
app.get('/api/healthz', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});