/**
 * Arranca el backend de FitLoyalty contra la base AISLADA de las sesiones de
 * RQNF-04 (Postgres en Docker, puerto 5434). Nunca toca produccion.
 *
 * Las variables se fijan aqui antes de cargar el backend: dotenv no pisa las
 * que ya existen, asi que backend/.env no puede cambiar la base, ni activar
 * correos, WhatsApp o el scheduler.
 */
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');

Object.assign(process.env, {
  DATABASE_URL: 'postgres://rqnf04:rqnf04_local@127.0.0.1:5434/fitloyalty_rqnf04',
  DB_SSL: 'false',
  JWT_SECRET: 'solo-sesiones-rqnf04-local',
  NODE_ENV: 'development',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:5173,http://127.0.0.1:5173',
  DISABLE_SCHEDULER: 'true',
  ENABLE_WHATSAPP: 'false',
  BREVO_API_KEY: '',
  RESEND_API_KEY: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
});

process.chdir(path.join(REPO, 'backend'));
// index.js solo arranca solo si se ejecuta directo; aqui se llama a iniciar(),
// que conecta, aplica las migraciones y escucha en el puerto.
require(path.join(REPO, 'backend', 'src', 'index.js')).iniciar();
