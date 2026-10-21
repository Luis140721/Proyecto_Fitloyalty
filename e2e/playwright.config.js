import { defineConfig, devices } from '@playwright/test';

const FRONT_PORT = process.env.FRONT_PORT ?? '5173';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${FRONT_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Levanta solo el frontend. El API se simula con page.route en cada test, asi
  // que no toca ninguna base de datos (ni la de desarrollo ni la de produccion).
  webServer: {
    command: `npm run dev --prefix ../frontend -- --port ${FRONT_PORT} --strictPort`,
    url: `http://localhost:${FRONT_PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
