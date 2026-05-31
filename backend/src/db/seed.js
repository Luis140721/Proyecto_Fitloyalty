/**
 * Seed inicial — crea usuarios de prueba para FitLoyalty
 * Ejecutar con: npm run seed
 */
const bcrypt = require('bcryptjs');
const db = require('./database');

console.log('🌱 Iniciando seed de FitLoyalty...\n');

// Limpiar datos previos (solo para desarrollo)
db.exec(`DELETE FROM users; DELETE FROM gyms;`);

// Crear gimnasio de prueba
const gymStmt = db.prepare(`
  INSERT INTO gyms (name, address, phone) VALUES (?, ?, ?)
`);
const gym = gymStmt.run('Gym Barrio Norte', 'Calle 80 # 45-12, Bogotá', '+57 300 123 4567');
const gymId = gym.lastInsertRowid;

// Usuarios de prueba
const users = [
  {
    name: 'Admin FitLoyalty',
    email: 'admin@fitloyalty.com',
    password: 'admin123',
    role: 'admin',
    phone: '+57 310 000 0001',
  },
  {
    name: 'Laura Recepción',
    email: 'recepcion@fitloyalty.com',
    password: 'recep123',
    role: 'receptionist',
    phone: '+57 310 000 0002',
  },
  {
    name: 'Carlos Pérez',
    email: 'carlos@gmail.com',
    password: 'miembro123',
    role: 'member',
    phone: '+57 310 000 0003',
  },
];

const insertUser = db.prepare(`
  INSERT INTO users (name, email, password, role, phone, gym_id)
  VALUES (@name, @email, @password, @role, @phone, @gymId)
`);

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 10);
  insertUser.run({ ...u, password: hash, gymId });
  console.log(`✅ Usuario creado: ${u.email} / ${u.password}  [rol: ${u.role}]`);
}

console.log('\n🎉 Seed completado. Puedes hacer login con cualquiera de los usuarios de arriba.');
