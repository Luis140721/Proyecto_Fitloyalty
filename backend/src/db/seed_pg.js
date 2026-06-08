/**
 * seed_pg.js — Actualiza los password_hash de los usuarios de prueba en PostgreSQL
 *
 * El archivo Poblar_Tablas.sql tiene hashes FALSOS (como '$2b$12$KIX1abc001')
 * que no son hashes bcrypt reales. Este script los reemplaza por hashes válidos.
 *
 * Ejecutar con: node src/db/seed_pg.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('./db');

const USUARIOS = [
  { email: 'carlos.mendoza@fitzone.co',     password: 'admin123',   rol: 'Administrador FitZone' },
  { email: 'laura.rios@fitzone.co',         password: 'recep123',   rol: 'Recepcionista' },
  { email: 'andres.gomez@fitzone.co',       password: 'recep123',   rol: 'Recepcionista' },
  { email: 'patricia.suarez@powergym.co',   password: 'admin123',   rol: 'Administradora PowerGym' },
  { email: 'jorge.herrera@powergym.co',     password: 'recep123',   rol: 'Recepcionista' },
  { email: 'valentina.torres@powergym.co',  password: 'recep123',   rol: 'Recepcionista' },
  { email: 'miguel.ospina@ironbody.co',     password: 'admin123',   rol: 'Administrador IronBody' },
  { email: 'sandra.patino@ironbody.co',     password: 'recep123',   rol: 'Recepcionista' },
  { email: 'diego.castano@ironbody.co',     password: 'recep123',   rol: 'Recepcionista' },
  { email: 'isabel.vargas@fitzone.co',      password: 'recep123',   rol: 'Recepcionista' },
];

async function actualizarHashes() {
  console.log('🔐 Actualizando hashes de contraseñas en PostgreSQL...\n');

  for (const u of USUARIOS) {
    const hash = await bcrypt.hash(u.password, 10);
    const { rowCount } = await pool.query(
      'UPDATE usuario SET password_hash = $1 WHERE email = $2',
      [hash, u.email]
    );

    if (rowCount > 0) {
      console.log(`✅ ${u.email}  [${u.rol}]  →  contraseña: ${u.password}`);
    } else {
      console.log(`⚠️  ${u.email}  → no encontrado en BD`);
    }
  }

  console.log('\n🎉 Listo. Puedes hacer login con cualquiera de estos usuarios.');
  console.log('   Los administradores usan "admin123", los recepcionistas "recep123".\n');
  process.exit(0);
}

actualizarHashes().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
