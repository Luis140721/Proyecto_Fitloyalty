const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const { exigirBdDePruebas } = require('./guardia-bd.cjs');

const FRONT_PORT = process.env.FRONT_PORT ?? '5173';
const API_PORT = process.env.API_PORT ?? '3001';
const FRONT_URL = `http://127.0.0.1:${FRONT_PORT}`;
const API_URL = `http://127.0.0.1:${API_PORT}/api`;
const AUTH_STATE = path.join(__dirname, '.auth', 'owner.json');
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test';

exigirBdDePruebas(databaseUrl, 'E2E_DATABASE_URL');

const webServers = [];
if (process.env.PLAYWRIGHT_EXTERNAL_API !== 'true') {
  webServers.push({
    command: 'npm start --prefix ../backend',
    url: `${API_URL}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      DB_SSL: 'false',
      ENABLE_WHATSAPP: 'false',
      DISABLE_SCHEDULER: 'true',
      JWT_SECRET: 'jwt-solo-para-e2e-no-es-secreto',
      NODE_ENV: 'test',
      PORT: API_PORT,
      FRONTEND_URL: FRONT_URL,
      BREVO_API_KEY: '',
      RESEND_API_KEY: '',
    },
  });
}

webServers.push({
  command: `npm run dev --prefix ../frontend -- --host 127.0.0.1 --port ${FRONT_PORT} --strictPort`,
  url: FRONT_URL,
  reuseExistingServer: false,
  timeout: 60_000,
  env: { VITE_API_BASE: API_URL },
});

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.js',
  globalTeardown: './global-teardown.js',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: FRONT_URL,
    storageState: AUTH_STATE,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium' }],
  webServer: webServers,
});
