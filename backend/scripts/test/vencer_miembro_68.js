/**
 * vencer_miembro_68.js
 *
 * Cambia la fecha_fin del plan_cobro del miembro id=68 a una fecha YA VENCIDA,
 * para que puedas probar el bloqueo de check-in de Daniel.
 *
 * Antes: la membresia tiene fecha_fin en algun momento del futuro
 * Despues: la membresia vence hace N dias (parametrizable abajo)
 *
 * USO:
 *   cd backend
 *   node vencer_miembro_68.js
 *
 * Para volver a la fecha original, corre restaurar_miembro_68.js
 */

// ---------- CONFIGURA AQUI LOS DIAS DE VENCIMIENTO ----------
const DIAS_VENCIDO = 7;  // hace cuantos dias "vencio" (default: 7)
// ---------------------------------------------------------

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

  // 1) Mostrar estado actual del miembro
  console.log('=== ESTADO ACTUAL del miembro 68 ===');
  const antes = await c.query(`
    SELECT m.id_miembro, m.nombre, m.telefono, m.documento,
           pc.id_plan_cobro, pc.fecha_inicio::text, pc.fecha_fin::text,
           pc.tipo_plan, pc.estado_pago, pc.activo,
           (pc.fecha_fin::date - CURRENT_DATE) AS dias_restantes
      FROM miembro m
      LEFT JOIN plan_cobro pc ON pc.id_miembro = m.id_miembro AND pc.activo = TRUE
     WHERE m.id_miembro = 68
  `);
  console.table(antes.rows);

  if (antes.rows.length === 0 || !antes.rows[0].id_plan_cobro) {
    console.error('No hay plan_cobro activo para este miembro. Crea uno primero.');
    await c.end();
    process.exit(1);
  }

  // 2) Backup automatico: guardamos la fecha original en una variable
  const fechaOriginal = antes.rows[0].fecha_fin;
  console.log(`\nBackup fecha_fin original: ${fechaOriginal}`);

  // 3) Calcular nueva fecha (hoy - DIAS_VENCIDO)
  const nueva = await c.query(
    `UPDATE plan_cobro
        SET fecha_fin = CURRENT_DATE - $1::int
      WHERE id_miembro = 68 AND activo = TRUE
      RETURNING id_plan_cobro, fecha_fin::text,
                (fecha_fin::date - CURRENT_DATE) AS dias_restantes`,
    [DIAS_VENCIDO]
  );
  console.log('\n=== NUEVO ESTADO ===');
  console.table(nueva.rows);
  console.log(`\nMembresia VENCIDA hace ${DIAS_VENCIDO} dias.`);
  console.log('Ahora al hacer check-in a este miembro, el endpoint debe responder:');
  console.log('  { miembro: { ..., estado: "VENCIDO" } }');
  console.log('y NO insertar el check-in (eso es lo que valida el bloqueo de Daniel).');

  await c.end();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
