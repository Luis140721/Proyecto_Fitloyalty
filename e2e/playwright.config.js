import { defineConfig, devices } from '@playwright/test';
import { exigirBdDePruebas } from './guardia-bd.cjs';
import { API_URL, BD_PRUEBAS_URL } from './tests/support/entorno.js';

const FRONT_PORT = process.env.FRONT_PORT ?? '5173';
const FRONT_URL = `http://localhost:${FRONT_PORT}`;

// BD de pruebas desechable: la URL esta en tests/support/entorno.js, porque
// tambien la usa tests/support/bd.js.
const DATABASE_URL = BD_PRUEBAS_URL;

// Guardia con lista permitida: los E2E crean gimnasios y usuarios de verdad, asi
// que solo se acepta la BD de pruebas local. Cualquier otra URL (la de desarrollo
// en 5432 o 5434, Neon, Render), un # o un parametro distinto de sslmode se
// rechazan antes de levantar nada. Es la misma guardia de los tests de
// integracion del backend (guardia-bd.cjs; sus tests estan en
// backend/tests/integracion/guardia-bd.test.js).
exigirBdDePruebas(DATABASE_URL, 'E2E_DATABASE_URL');

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: FRONT_URL,
    // Guarda la traza solo cuando un test falla y se reintenta: se abre con "pnpm report"
    trace: 'on-first-retry',
  },
  // Lista en la terminal + reporte HTML que abres cuando quieras con "pnpm report"
  reporter: [['list'], ['html', { open: 'never' }]],
  retries: process.env.CI ? 1 : 0,
  projects: [
    // Inicia sesion una sola vez por corrida y la guarda (tests/auth.setup.js). Los
    // archivos que la necesitan la cargan con test.use({ storageState: SESION }).
    { name: 'setup', testMatch: /.*\.setup\.js/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  // Levanta el backend real y el frontend. Un test puede simular el API con
  // page.route (como login.spec.js) o usar el backend real contra la BD de pruebas.
  webServer: [
    {
      // Backend contra la BD de pruebas. Al arrancar aplica las migraciones
      // (backend/migrations), asi que una BD vacia queda lista para el registro.
      command: 'node src/index.js',
      cwd: '../backend',
      // /api/health responde 503 mientras no hay BD: Playwright espera el 200.
      url: `${API_URL}/health`,
      // Nunca reutilizar un backend ya abierto: podria estar conectado a la BD de
      // desarrollo y los tests le crearian gimnasios de prueba.
      reuseExistingServer: false,
      timeout: 60_000,
      // dotenv no pisa variables ya definidas, asi que estas mandan sobre backend/.env.
      env: {
        PORT: '3001',
        NODE_ENV: 'test',
        DATABASE_URL,
        DB_SSL: 'false',
        JWT_SECRET: 'jwt-solo-para-e2e-no-es-secreto',
        DISABLE_SCHEDULER: 'true',
        ENABLE_WHATSAPP: 'false',
        BREVO_API_KEY: '',
        RESEND_API_KEY: '',
        FRONTEND_URL: FRONT_URL,
      },
    },
    {
      // Sin `--`: pnpm le pasa a Vite los argumentos tal cual, y con `--` Vite
      // ignoraria el puerto.
      command: `pnpm --dir ../frontend run dev --port ${FRONT_PORT} --strictPort`,
      url: FRONT_URL,
      // Tampoco se reutiliza un front ya abierto: podria estar apuntando a otro API.
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_BASE: API_URL },
    },
  ],
});
