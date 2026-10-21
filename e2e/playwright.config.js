import { defineConfig, devices } from '@playwright/test';

const FRONT_PORT = process.env.FRONT_PORT ?? '5173';
const FRONT_URL = `http://localhost:${FRONT_PORT}`;
// Puerto fijo: los mocks de login.spec.js interceptan http://localhost:3001/api/**.
const API_URL = 'http://localhost:3001/api';

// BD de pruebas desechable (servicio db-test de e2e/docker-compose.yml). Las
// credenciales son de prueba, no secretos. Se puede cambiar con E2E_DATABASE_URL.
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://fitloyalty_test:fitloyalty_test@localhost:5433/fitloyalty_test';

// Guardia: los E2E crean gimnasios y usuarios de verdad. Si la URL apunta a otro
// host (Neon, Render) o al puerto 5432 (la BD de desarrollo), no se corre nada.
// El mensaje muestra solo host y puerto, nunca la URL completa con la clave.
function exigirBdDePruebas(url) {
  let host;
  let puerto;
  try {
    const u = new URL(url);
    host = u.hostname;
    puerto = u.port || '5432';
  } catch {
    throw new Error('E2E_DATABASE_URL no es una URL valida de PostgreSQL.');
  }
  if (!['localhost', '127.0.0.1'].includes(host) || puerto === '5432') {
    throw new Error(
      'Los E2E solo corren contra la BD de pruebas local (db-test, puerto 5433). ' +
        `Recibido: ${host}:${puerto}. Levantala con "npm run db:up" y no apuntes ` +
        'E2E_DATABASE_URL a la BD de desarrollo ni a produccion.',
    );
  }
}
exigirBdDePruebas(DATABASE_URL);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONT_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
      command: `npm run dev --prefix ../frontend -- --port ${FRONT_PORT} --strictPort`,
      url: FRONT_URL,
      // Tampoco se reutiliza un front ya abierto: podria estar apuntando a otro API.
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_BASE: API_URL },
    },
  ],
});
