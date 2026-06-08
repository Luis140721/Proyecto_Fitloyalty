/**
 * db.js — Conexión a PostgreSQL usando un Pool de conexiones
 *
 * ¿Qué es un Pool?
 * En lugar de abrir y cerrar una conexión por cada consulta (lento),
 * el pool mantiene varias conexiones abiertas y las reutiliza.
 * Es como tener varios meseros listos en lugar de contratar uno por pedido.
 */
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'fitloyalty',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

// Si hay un error inesperado en el pool, lo registramos (no rompe la app)
pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool de conexiones:', err.message);
});

module.exports = pool;
