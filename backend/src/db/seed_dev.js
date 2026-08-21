/**
 * seed_dev.js
 *
 * Crea (o resetea) una cuenta de desarrollo con acceso ilimitado.
 * Uso:  node src/db/seed_dev.js [email] [password] [gymName]
 *
 * Por defecto:
 *   email:    dev@fitloyalty.local
 *   password: dev123456
 *   gym:      Gimnasio Dev
 *
 * - El gimnasio se crea con `trial_ends_at = NULL` (modo suscrito, sin expiracion).
 * - El owner se crea como ADMINISTRADOR (id_rol=1) y se asocia al gimnasio.
 * - Si el email ya existe, se actualiza el password y se asegura que el gimnasio
 *   del usuario no tenga trial.
 * - Es idempotente: corre el script 2 veces y queda igual.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

const EMAIL = (process.argv[2] || 'dev@fitloyalty.local').toLowerCase().trim();
const PASSWORD = process.argv[3] || 'dev123456';
const GYM_NAME = process.argv[4] || 'Gimnasio Dev';

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
  console.log(`[seed_dev] Creando cuenta dev: ${EMAIL} en "${GYM_NAME}"`);

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
      console.log(`[seed_dev] Gimnasio existente reutilizado id=${gymId} (trial desactivado).`);
    } else {
      const { rows: gymRows } = await client.query(
        `INSERT INTO gimnasio (nombre, telefono, email, trial_ends_at, activo)
         VALUES ($1, '3000000000', $2, NULL, TRUE)
         RETURNING id_gimnasio`,
        [GYM_NAME, EMAIL]
      );
      gymId = gymRows[0].id_gimnasio;
      console.log(`[seed_dev] Gimnasio creado id=${gymId} (trial=NULL).`);
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
      console.log(`[seed_dev] Usuario existente actualizado id=${userId}.`);
    } else {
      const { rows: userRows } = await client.query(
        `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol, activo)
         VALUES ($1, 'Dev Admin', $2, $3, $4, TRUE)
         RETURNING id_usuario`,
        [gymId, EMAIL, hash, adminRol]
      );
      userId = userRows[0].id_usuario;
      console.log(`[seed_dev] Usuario creado id=${userId}.`);
    }

    // 3. Configuracion por defecto del gimnasio
    await client.query(
      `INSERT INTO configuracion_gimnasio (id_gimnasio, actualizado_por)
       VALUES ($1, $2)
       ON CONFLICT (id_gimnasio) DO NOTHING`,
      [gymId, userId]
    );

    await client.query('COMMIT');

    console.log('\n[seed_dev] OK. Credenciales listas:');
    console.log(`   Email:    ${EMAIL}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log(`   Gym ID:   ${gymId}`);
    console.log(`   Trial:    NULL (ilimitado)`);
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed_dev] ERROR:', err.code, err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

run().catch(err => {
  console.error('[seed_dev] Fatal:', err);
  process.exit(1);
});
