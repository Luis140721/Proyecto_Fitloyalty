import { defineConfig, devices } from '@playwright/test';

const FRONT_PORT = process.env.FRONT_PORT ?? '5173';
const FRONT_URL = `http://localhost:${FRONT_PORT}`;
// Puerto fijo: los mocks de login.spec.js interceptan http://localhost:3001/api/**.
const API_URL = 'http://localhost:3001/api';

// BD de pruebas desechable (servicio db-test de e2e/docker-compose.yml). Las
// credenciales son de prueba, no secretos. Se puede cambiar con E2E_DATABASE_URL.
// 127.0.0.1 y no localhost: el contenedor solo escucha en IPv4 y en Windows Node
// puede resolver localhost a ::1.
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test';

// Guardia con lista permitida: los E2E crean gimnasios y usuarios de verdad, asi
// que solo se acepta la BD de pruebas local. Cualquier otra URL (la de desarrollo
// en 5432 o 5434, Neon, Render) se rechaza antes de levantar nada.
// pg obedece ?host=, ?port= y ?hostaddr= por encima del host y el puerto de la
// URL, por eso esos parametros tambien se rechazan.
// El mensaje muestra solo host:puerto/BD, nunca el usuario ni la clave.
function exigirBdDePruebas(url) {
  let u;
  let bd;
  // new URL recorta los espacios de los extremos y pg no: con ellos, los dos
  // leerian destinos distintos.
  if (/\s/.test(url)) throw new Error('E2E_DATABASE_URL no puede tener espacios.');
  try {
    u = new URL(url);
    bd = decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('E2E_DATABASE_URL no es una URL valida de PostgreSQL.');
  }
  const motivos = [];
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) motivos.push('el protocolo no es postgres:// ni postgresql://');
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) motivos.push('el host no es 127.0.0.1 ni localhost');
  if (u.port !== '5433') motivos.push('el puerto no es 5433');
  if (!bd.endsWith('_test')) motivos.push('el nombre de la BD no termina en _test');
  const redirigen = [...u.searchParams.keys()].filter((k) => ['host', 'port', 'hostaddr'].includes(k.toLowerCase()));
  if (redirigen.length > 0) motivos.push(`trae parametros que cambian el destino (${redirigen.join(', ')})`);
  if (motivos.length > 0) {
    throw new Error(
      'Los E2E solo corren contra la BD de pruebas local (db-test, 127.0.0.1:5433, BD terminada en _test). ' +
        `Recibido: ${u.hostname || '?'}:${u.port || '(sin puerto)'}/${bd || '?'}. Motivo: ${motivos.join('; ')}. ` +
        'Levantala con "pnpm run db:up" y no apuntes E2E_DATABASE_URL a otra BD.',
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
