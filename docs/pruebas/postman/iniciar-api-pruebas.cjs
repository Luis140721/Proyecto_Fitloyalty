/**
 * Levanta la API de FitLoyalty contra la BD de pruebas (db-test, 127.0.0.1:5433)
 * para correr la colección Postman. Uso, desde la raíz del repo:
 *
 *   pnpm --dir e2e run db:up
 *   node docs/pruebas/postman/iniciar-api-pruebas.cjs
 *
 * Las variables se fijan aquí antes de cargar el backend, como en el webServer
 * de e2e/playwright.config.js: dotenv no pisa las que ya existen, así que
 * backend/.env no puede cambiar la base ni activar correo, WhatsApp o el
 * scheduler. Se hace en un archivo y no en la terminal porque PowerShell 5.1
 * no puede dejar una variable vacía (BREVO_API_KEY=''): la borra, y dotenv
 * volvería a leer la clave del .env.
 */
const path = require('node:path');
const { exigirBdDePruebas } = require('../../../e2e/guardia-bd.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..');
const DATABASE_URL = 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test';
exigirBdDePruebas(DATABASE_URL, 'DATABASE_URL');

Object.assign(process.env, {
  PORT: '3001',
  NODE_ENV: 'test',
  DATABASE_URL,
  DB_SSL: 'false',
  JWT_SECRET: 'jwt-solo-para-pruebas',
  DISABLE_SCHEDULER: 'true',
  ENABLE_WHATSAPP: 'false',
  BREVO_API_KEY: '',
  RESEND_API_KEY: '',
});

process.chdir(path.join(REPO, 'backend'));
// index.js solo escucha si se ejecuta directo; iniciar() conecta, aplica las
// migraciones y escucha en el puerto.
require(path.join(REPO, 'backend', 'src', 'index.js')).iniciar();
