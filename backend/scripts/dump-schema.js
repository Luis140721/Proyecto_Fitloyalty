/**
 * scripts/dump-schema.js  (one-shot, NO se commitea)
 *
 * Conecta a la BD que indique DATABASE_URL (o las vars sueltas DB_*) y
 * vuelca tablas + columnas del schema public. Solo se usa para mapear
 * columnas reales; se borra despues de generar SCHEMA_MAP.md.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('sslmode=no-verify') || process.env.DATABASE_URL.includes('ssl=true')
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'FitLoyalty',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
      }
);

(async () => {
  try {
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log('=== TABLAS ===');
    for (const t of tables.rows) console.log(t.table_name);

    const cols = await pool.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('usuario','miembro','checkin','membresia','plan_membresia','gimnasio','rol','roles','invitacion_staff','password_reset','sesion','configuracion_gimnasio')
       ORDER BY table_name, ordinal_position`
    );
    console.log('\n=== COLUMNAS ===');
    const grouped = {};
    for (const c of cols.rows) {
      grouped[c.table_name] = grouped[c.table_name] || [];
      grouped[c.table_name].push(`${c.column_name} (${c.data_type}${c.is_nullable === 'NO' ? ', NOT NULL' : ''})`);
    }
    for (const [t, list] of Object.entries(grouped)) {
      console.log(`\n[${t}]`);
      for (const l of list) console.log('  -', l);
    }
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();