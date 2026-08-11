/**
 * db/migrate.js
 *
 * Aplica todos los archivos `backend/migrations/*.sql` en orden alfabetico.
 * Es idempotente: registra cada migracion aplicada en la tabla
 * `schema_migrations` y solo corre las pendientes.
 *
 * Uso: `node src/db/migrate.js`
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id_migration SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getApplied() {
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map(r => r.filename));
}

async function applyMigrations() {
  await ensureMigrationsTable();
  const applied = await getApplied();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`[migrate] No existe carpeta migrations (${MIGRATIONS_DIR}).`);
    return;
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] ${file} — ya aplicada, omitida.`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] ${file} — aplicada.`);
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ${file} — FALLO: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  if (ran === 0) console.log('[migrate] Nada pendiente. Esquema al dia.');
  else console.log(`[migrate] ${ran} migracion(es) aplicada(s).`);
}

if (require.main === module) {
  applyMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { applyMigrations };
