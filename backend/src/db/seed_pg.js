/**
 * seed_pg.js — Actualiza hashes y fotos de perfil de usuarios de prueba
 *
 * Ejecutar con: node src/db/seed_pg.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('./db');

const USUARIOS = [
  { email: 'carlos.mendoza@fitzone.co',     password: 'admin123',   rol: 'Administrador FitZone',     foto: 'https://i.pravatar.cc/150?u=carlos.mendoza' },
  { email: 'laura.rios@fitzone.co',         password: 'recep123',   rol: 'Recepcionista',             foto: 'https://i.pravatar.cc/150?u=laura.rios' },
  { email: 'andres.gomez@fitzone.co',       password: 'recep123',   rol: 'Recepcionista',             foto: 'https://i.pravatar.cc/150?u=andres.gomez' },
  { email: 'patricia.suarez@powergym.co',   password: 'admin123',   rol: 'Administradora PowerGym',   foto: 'https://i.pravatar.cc/150?u=patricia.suarez' },
  { email: 'jorge.herrera@powergym.co',     password: 'recep123',   rol: 'Recepcionista',             foto: 'https://i.pravatar.cc/150?u=jorge.herrera' },
  { email: 'valentina.torres@powergym.co',  password: 'recep123',   rol: 'Recepcionista',             foto: 'https://i.pravatar.cc/150?u=valentina.torres' },
  { email: 'miguel.ospina@ironbody.co',     password: 'admin123',   rol: 'Administrador IronBody',    foto: 'https://i.pravatar.cc/150?u=miguel.ospina' },
  { email: 'sandra.patino@ironbody.co',     password: 'recep123',   rol: 'Recepcionista',             foto: 'https://i.pravatar.cc/150?u=sandra.patino' },
  { email: 'diego.castano@ironbody.co',     password: 'recep123',   rol: 'Recepcionista',             foto: 'https://i.pravatar.cc/150?u=diego.castano' },
  { email: 'isabel.vargas@fitzone.co',      password: 'recep123',   rol: 'Recepcionista',             foto: 'https://i.pravatar.cc/150?u=isabel.vargas' },
];

async function actualizarUsuarios() {
  console.log('🔐 Actualizando usuarios de prueba en PostgreSQL...\n');

  for (const u of USUARIOS) {
    const hash = await bcrypt.hash(u.password, 10);
    const { rowCount } = await pool.query(
      'UPDATE usuario SET password_hash = $1, foto_url = $2 WHERE email = $3',
      [hash, u.foto, u.email]
    );

    if (rowCount > 0) {
      console.log(`✅ ${u.email}  [${u.rol}]  →  contraseña: ${u.password}`);
    } else {
      console.log(`⚠️  ${u.email}  → no encontrado en BD`);
    }
  }

  console.log('\n🎉 Listo. Puedes hacer login con cualquiera de estos usuarios.');
  console.log('   Administradores: admin123 · Recepcionistas: recep123\n');
  process.exit(0);
}

actualizarUsuarios().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
