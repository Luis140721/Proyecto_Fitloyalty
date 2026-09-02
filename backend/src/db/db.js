/**
 * db.js — Conexión a PostgreSQL usando un Pool de conexiones
 *
 * ¿Qué es un Pool?
 * En lugar de abrir y cerrar una conexión por cada consulta (lento),
 * el pool mantiene varias conexiones abiertas y las reutiliza.
 * Es como tener varios meseros listos en lugar de contratar uno por pedido.
 */
const { Pool } = require('pg');

// Soporta dos modos:
//  - DATABASE_URL completa (Neon, Supabase, Render Postgres, Railway)
//  - DB_HOST/DB_PORT/... individuales (legacy / local)
function buildConnectionConfig() {
  // DB_SSL=false desactiva SSL (Postgres local en Docker). Default: activado (Neon).
  const wantSsl = String(process.env.DB_SSL ?? 'true').toLowerCase() !== 'false';
  const ssl = wantSsl ? { rejectUnauthorized: false } : false;

  if (process.env.DATABASE_URL) {
    let url = process.env.DATABASE_URL;
    // Si SSL esta desactivado, aseguramos que la URL no lleva sslmode.
    if (!wantSsl && /[?&]sslmode=/i.test(url)) {
      url = url.replace(/([?&])sslmode=[^&]*/i, (m, sep) => (sep === '?' ? '?' : ''));
    }
    return {
      connectionString: url,
      ssl,
    };
  }

  return {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'fitloyalty',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl,
  };
}

const pool = new Pool(buildConnectionConfig());

// Si hay un error inesperado en el pool, lo registramos (no rompe la app)
pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool de conexiones:', err.message);
});

module.exports = pool;
