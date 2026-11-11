const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium, request } = require('@playwright/test');

const E2E_DIR = __dirname;
const AUTH_DIR = path.join(E2E_DIR, '.auth');
const AUTH_STATE = path.join(AUTH_DIR, 'owner.json');
const CLEANUP_STATE = path.join(AUTH_DIR, 'cleanup.json');
const API_URL = `http://127.0.0.1:${process.env.API_PORT ?? '3001'}/api`;
const FRONT_URL = `http://127.0.0.1:${process.env.FRONT_PORT ?? '5173'}`;

async function removeTestAccount(record) {
  const api = await request.newContext({ baseURL: `${API_URL}/` });
  try {
    const response = await api.delete('auth/account', {
      headers: { Authorization: `Bearer ${record.token}` },
      data: { password: record.password, reason: 'Limpieza de pruebas E2E' },
    });
    if (!response.ok()) {
      throw new Error(`No se pudo limpiar la cuenta E2E (HTTP ${response.status()}).`);
    }
  } finally {
    await api.dispose();
  }
}

async function globalSetup() {
  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test';

  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida.');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('La preparación E2E solo se permite en una base terminada en _test.');
  }

  await fs.mkdir(AUTH_DIR, { recursive: true });

  try {
    await fs.access(CLEANUP_STATE);
    const previousRecord = JSON.parse(await fs.readFile(CLEANUP_STATE, 'utf8'));
    await removeTestAccount(previousRecord);
    await fs.rm(CLEANUP_STATE, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const ownerEmail = `e2e.${randomUUID()}@example.test`;
  const password = 'E2Efit2026';
  const api = await request.newContext({ baseURL: `${API_URL}/` });
  let cleanupRecord;
  let browser;
  let browserContext;

  try {
    const response = await api.post('auth/signup', {
      data: {
        gymName: `Gimnasio E2E ${randomUUID().slice(0, 8)}`,
        gymPhone: '3001234567',
        gymEmail: '',
        ownerName: 'Propietario E2E',
        ownerEmail,
        password,
      },
    });

    if (!response.ok()) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`No se pudo preparar el usuario E2E (HTTP ${response.status()}: ${body.message || body.error || 'sin detalle'}).`);
    }

    const account = await response.json();
    cleanupRecord = { token: account.token, password };
    await fs.writeFile(CLEANUP_STATE, JSON.stringify(cleanupRecord), { mode: 0o600 });

    browser = await chromium.launch();
    browserContext = await browser.newContext();
    await browserContext.addInitScript((token) => {
      localStorage.setItem('fitloyalty_token', token);
      localStorage.setItem('fitloyalty_ultima_actividad', String(Date.now()));
    }, account.token);

    const page = await browserContext.newPage();
    const authResponse = page.waitForResponse((candidate) =>
      candidate.url().includes('/auth/me') && candidate.status() === 200
    );
    await page.goto(`${FRONT_URL}/admin/dashboard`);
    await authResponse;
    await browserContext.storageState({ path: AUTH_STATE });
  } catch (error) {
    if (cleanupRecord) {
      await removeTestAccount(cleanupRecord);
      await fs.rm(CLEANUP_STATE, { force: true });
    }
    throw error;
  } finally {
    await browserContext?.close();
    await browser?.close();
    await api.dispose();
  }
}

module.exports = globalSetup;
