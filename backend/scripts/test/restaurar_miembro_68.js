/**
 * restaurar_miembro_68.js
 *
 * Pone la fecha_fin del plan_cobro del miembro 68 a 30 dias en el futuro,
 * para "des-vencerlo" despues de tus pruebas. Tambien limpia cualquier
 * registro de alerta_vencimiento_enviada para que pueda recibir WhatsApp
 * de nuevo.
 *
 * USO:
 *   cd backend
 *   node restaurar_miembro_68.js
 */

const DIAS_FUTURO = 30;  // la membresia volvera a vencer en 30 dias

const { Client } = require('pg');
require('dotenv').config();

const c = new Client({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL !== 'false' ? { rejectUnauthorized: false } : false,
});

(async () => {
  await c.connect();

  // 1) Limpiar alertas enviadas para que el cron no lo bloquee por duplicado
  const alerta = await c.query(
    "DELETE FROM alerta_vencimiento_enviada WHERE id_miembro = 68 RETURNING *"
  );
  console.log(`Alertas eliminadas: ${alerta.rowCount}`);

  // 2) Restaurar fecha_fin a futuro
  const upd = await c.query(`
    UPDATE plan_cobro
       SET fecha_fin = CURRENT_DATE + $1::int
     WHERE id_miembro = 68 AND activo = TRUE
     RETURNING id_plan_cobro, fecha_fin::text,
               (fecha_fin::date - CURRENT_DATE) AS dias_restantes
  `, [DIAS_FUTURO]);
  console.log('\n=== Membresia restaurada ===');
  console.table(upd.rows);
  console.log(`\nAhora vence en ${DIAS_FUTURO} dias. Check-in debe pasar normalmente.`);

  await c.end();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
