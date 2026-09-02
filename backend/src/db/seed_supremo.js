/**
 * seed_supremo.js
 *
 * Crea (o resetea) una cuenta SUPREMA con acceso ilimitado a todos los gimnasios.
 *
 * - email:    santicosalamanca@gmail.com (parametrizable)
 * - password: SantiagoSupremo2026!
 * - gym:      FitLoyalty Supremo (trial = NULL)
 * - El usuario se crea como ADMINISTRADOR con gimnasio sin trial.
 * - Es idempotente: corre el script 2 veces y queda igual.
 *
 * Uso:
 *   node src/db/seed_supremo.js
 *   node src/db/seed_supremo.js correo@gmail.com miPassword "Gimnasio X"
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

const EMAIL = (process.argv[2] || 'santicosalamanca@gmail.com').toLowerCase().trim();
const PASSWORD = process.argv[3] || 'SantiagoSupremo2026!';
const GYM_NAME = process.argv[4] || 'FitLoyalty Supremo';

async function ensureRole(client, name) {
  const { rows } = await client.query(
    'SELECT id_rol FROM rol WHERE LOWER(nombre) = $1 LIMIT 1',
    [name.toLowerCase()]
  );
  if (rows[0]) return rows[0].id_rol;
  const { rows: inserted } = await client.query(
    'INSERT INTO rol (nombre, descripcion) VALUES ($1, $2) RETURNING id_rol',
    [name.toUpperCase(), `Rol ${name}`]
  );
  return inserted[0].id_rol;
}

async function run() {
  console.log(`[seed_supremo] Creando cuenta suprema: ${EMAIL} en "${GYM_NAME}"`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const adminRol = await ensureRole(client, 'ADMINISTRADOR');

    // 1. Asegurar gimnasio sin trial (NULL = suscrito)
    const { rows: existingGym } = await client.query(
      'SELECT id_gimnasio FROM gimnasio WHERE LOWER(nombre) = $1 ORDER BY id_gimnasio ASC LIMIT 1',
      [GYM_NAME.toLowerCase()]
    );

    let gymId;
    if (existingGym.length > 0) {
      gymId = existingGym[0].id_gimnasio;
      await client.query(
        `UPDATE gimnasio SET trial_ends_at = NULL, activo = TRUE WHERE id_gimnasio = $1`,
        [gymId]
      );
      console.log(`[seed_supremo] Gimnasio existente reutilizado id=${gymId} (trial desactivado).`);
    } else {
      const { rows: gymRows } = await client.query(
        `INSERT INTO gimnasio (nombre, telefono, email, trial_ends_at, activo)
         VALUES ($1, '3000000000', $2, NULL, TRUE)
         RETURNING id_gimnasio`,
        [GYM_NAME, EMAIL]
      );
      gymId = gymRows[0].id_gimnasio;
      console.log(`[seed_supremo] Gimnasio creado id=${gymId} (trial=NULL).`);
    }

    // 2. Crear o actualizar usuario admin
    const hash = await bcrypt.hash(PASSWORD, 10);
    const { rows: existingUser } = await client.query(
      'SELECT id_usuario FROM usuario WHERE LOWER(email) = $1',
      [EMAIL]
    );

    let userId;
    if (existingUser.length > 0) {
      userId = existingUser[0].id_usuario;
      await client.query(
        `UPDATE usuario
         SET password_hash = $1, id_gimnasio = $2, id_rol = $3, activo = TRUE
         WHERE id_usuario = $4`,
        [hash, gymId, adminRol, userId]
      );
      console.log(`[seed_supremo] Usuario existente actualizado id=${userId}.`);
    } else {
      const { rows: userRows } = await client.query(
        `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol, activo, rol)
         VALUES ($1, 'Santiago Salamanca', $2, $3, $4, TRUE, 'ADMINISTRADOR')
         RETURNING id_usuario`,
        [gymId, EMAIL, hash, adminRol]
      );
      userId = userRows[0].id_usuario;
      console.log(`[seed_supremo] Usuario creado id=${userId}.`);
    }

    // 3. Configuracion por defecto del gimnasio
    await client.query(
      `INSERT INTO configuracion_gimnasio (id_gimnasio, actualizado_por)
       VALUES ($1, $2)
       ON CONFLICT (id_gimnasio) DO NOTHING`,
      [gymId, userId]
    );

    await client.query('COMMIT');

    console.log('\n[seed_supremo] OK. Credenciales del admin supremo:');
    console.log(`   Email:    ${EMAIL}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log(`   Gym ID:   ${gymId}`);
    console.log(`   Trial:    NULL (ilimitado, sin suscripcion)`);
    console.log(`   Rol:      ADMINISTRADOR (id_rol=1)`);
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed_supremo] ERROR:', err.code, err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

run().catch(err => {
  console.error('[seed_supremo] Fatal:', err);
  process.exit(1);
});
