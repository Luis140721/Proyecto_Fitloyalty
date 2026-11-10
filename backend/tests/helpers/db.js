const { spawnSync } = require('child_process');
const path = require('path');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..', '..');

function getTestDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  let databaseName;
  try {
    databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida para la base de pruebas.');
  }

  if (!databaseName.endsWith('_test')) {
    throw new Error('Las pruebas de integración solo se ejecutan contra una base cuyo nombre termina en _test.');
  }

  return databaseUrl;
}

const testDatabaseUrl = getTestDatabaseUrl();

function createTestClient() {
  if (!testDatabaseUrl) {
    throw new Error('DATABASE_URL no está definida para la base de pruebas.');
  }

  const ssl = String(process.env.DB_SSL ?? 'true').toLowerCase() !== 'false'
    ? { rejectUnauthorized: false }
    : false;

  return new Client({ connectionString: testDatabaseUrl, ssl });
}

function applyMigrations() {
  if (!testDatabaseUrl) {
    throw new Error('DATABASE_URL no está definida para la base de pruebas.');
  }

  const result = spawnSync(process.execPath, ['src/db/migrate.js'], {
    cwd: backendRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`No se pudo ejecutar el migrador de la base de pruebas: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Fallaron las migraciones de la base de pruebas (código ${result.status}).`);
  }
}

async function beginTransaction(client) {
  await client.query('BEGIN');
}

async function rollbackTransaction(client) {
  await client.query('ROLLBACK');
}

module.exports = {
  applyMigrations,
  beginTransaction,
  createTestClient,
  integrationEnabled: Boolean(testDatabaseUrl),
  rollbackTransaction,
};
