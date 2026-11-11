const fs = require('node:fs/promises');
const path = require('node:path');
const { request } = require('@playwright/test');

const AUTH_DIR = path.join(__dirname, '.auth');
const CLEANUP_STATE = path.join(AUTH_DIR, 'cleanup.json');
const AUTH_STATE = path.join(AUTH_DIR, 'owner.json');
const API_URL = `http://127.0.0.1:${process.env.API_PORT ?? '3001'}/api`;

async function globalTeardown() {
  let record;
  try {
    record = JSON.parse(await fs.readFile(CLEANUP_STATE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  const api = await request.newContext({ baseURL: `${API_URL}/` });
  try {
    const response = await api.delete('auth/account', {
      headers: { Authorization: `Bearer ${record.token}` },
      data: { password: record.password, reason: 'Limpieza de pruebas E2E' },
    });
    if (!response.ok()) {
      throw new Error(`No se pudo limpiar la cuenta E2E (HTTP ${response.status()}).`);
    }
    await fs.rm(CLEANUP_STATE, { force: true });
    await fs.rm(AUTH_STATE, { force: true });
  } finally {
    await api.dispose();
  }
}

module.exports = globalTeardown;
