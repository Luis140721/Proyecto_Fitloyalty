/**
 * jobs/expiracion.js
 *
 * Job automatico: cada dia revisa los planes (`plan_cobro`) que estan por
 * vencer o que vencen hoy, y manda un WhatsApp al miembro para que renueve.
 *
 * Disenado para correr como cron diario dentro del mismo proceso web
 * (ver jobs/scheduler.js). Tambien expone `runJob()` para que un endpoint
 * admin pueda gatillarlo manualmente en pruebas.
 *
 * Configuracion por gimnasio (migracion 006):
 *   gimnasio.dias_aviso_vencimiento INTEGER DEFAULT 3
 *     - 3 -> avisa a los 3 dias antes y el mismo dia
 *     - 0 o NULL -> desactiva las alertas para ese gym
 *
 * Anti-spam:
 *   Para no mandarle 2 WhatsApp al mismo miembro el mismo dia, el job
 *   registra en una tabla `alerta_vencimiento_enviada` que vas a encontrar
 *   en la migracion 007. Asi, si el cron corre dos veces (Render reinicia
 *   el web service, etc.) o si el admin corre manualmente, no se duplican.
 */

const pool = require('../db/db');
const { avisoVencimiento, avisoVenceHoy } = require('../lib/mensajes');

/**
 * Normaliza un telefono colombiano al formato que whatsapp-web.js espera:
 * solo digitos, con prefijo 57 si viene de 10. Devuelve null si no sirve.
 */
function telParaWhatsapp(telefono) {
  const limpio = String(telefono || '').replace(/\D/g, '');
  if (limpio.length < 7) return null;
  if (limpio.length > 10) return limpio;
  return `57${limpio}`;
}

/**
 * Busca los miembros que tienen un plan_cobro vigente que vence en los
 * proximos `dias` dias (incluyendo hoy). La query toma el ultimo plan
 * activo de cada miembro, igual que `ULTIMO_PLAN` en lib/planes.js,
 * pero ademas excluye gyms desactivados.
 */
async function miembrosPorVencer(dias) {
  const { rows } = await pool.query(
    `SELECT
        m.id_miembro, m.nombre, m.telefono, m.id_gimnasio,
        g.nombre AS gym_nombre,
        pc.tipo_plan, pc.fecha_fin,
        (pc.fecha_fin::date - CURRENT_DATE) AS dias_restantes,
        COALESCE(g.dias_aviso_vencimiento, 3) AS dias_aviso
     FROM miembro m
     JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
     INNER JOIN LATERAL (
       SELECT DISTINCT ON (id_miembro) id_miembro, tipo_plan, fecha_fin, activo
         FROM plan_cobro
        WHERE id_miembro = m.id_miembro AND activo = TRUE
        ORDER BY id_miembro, fecha_fin DESC NULLS LAST, id_plan_cobro DESC
     ) pc ON pc.id_miembro = m.id_miembro
     WHERE m.activo = TRUE
       AND g.activo = TRUE
       AND pc.fecha_fin IS NOT NULL
       AND pc.fecha_fin::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + $1::int)
     ORDER BY pc.fecha_fin ASC, m.id_miembro`,
    [dias]
  );
  return rows;
}

/**
 * Registra que ya le mandamos el aviso a este miembro por este ciclo de
 * vencimiento. Si la fila ya existe, NO la sobreescribe (asi protegemos
 * contra duplicados si el cron se dispara dos veces el mismo dia).
 */
async function marcarEnviado({ idMiembro, idPlanCobro, diasRestantes }) {
  try {
    await pool.query(
      `INSERT INTO alerta_vencimiento_enviada (id_miembro, id_plan_cobro, dias_restantes, enviado_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id_plan_cobro, dias_restantes) DO NOTHING`,
      [idMiembro, idPlanCobro, diasRestantes]
    );
    return true;
  } catch (e) {
    // Si la tabla no existe todavia (migracion 007 pendiente), seguimos de largo.
    if (e.code === '42P01') return false; // undefined_table
    throw e;
  }
}

/**
 * Devuelve true si ya le mandamos el aviso a este plan_cobro con estos
 * dias_restantes. Si la tabla no existe, devuelve false (no filtra).
 */
async function yaEnviado({ idPlanCobro, diasRestantes }) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM alerta_vencimiento_enviada
        WHERE id_plan_cobro = $1 AND dias_restantes = $2 LIMIT 1`,
      [idPlanCobro, diasRestantes]
    );
    return rows.length > 0;
  } catch (e) {
    if (e.code === '42P01') return false;
    throw e;
  }
}

/**
 * Logica principal. Llamable desde el cron o desde el endpoint admin.
 *
 *   { dryRun: true }  -> NO manda WhatsApp, solo cuenta candidatos.
 *   { whatsappClient } -> inyeccion para tests (si no, usa el modulo).
 *
 * Devuelve un resumen con cuantos candidatos encontro, cuantos mando,
 * cuantos bloqueo el gym (dias_aviso=0) y cuantos omitio por duplicado.
 */
async function runJob({ dryRun = false, whatsappClient = null } = {}) {
  const summary = {
    encontrados: 0,
    enVentana:   0,
    enviados:    0,
    omitidosDuplicado: 0,
    omitidosGymDesactivado: 0,
    omitidosSinTelefono: 0,
    dryRun,
    detalle: [],
  };

  // Necesitamos un maximo razonable de dias_aviso para no traer todo el año.
  // Tomamos el maximo entre todos los gyms (cap a 30 dias por seguridad).
  const cfgRows = await pool.query(
    `SELECT COALESCE(MAX(dias_aviso_vencimiento), 3) AS max_dias
       FROM gimnasio WHERE activo = TRUE`
  );
  const maxDias = Math.min(parseInt(cfgRows.rows[0].max_dias || 3, 10) || 3, 30);
  if (maxDias <= 0) {
    summary.motivo = 'Todos los gimnasios tienen dias_aviso_vencimiento = 0 (desactivado)';
    return summary;
  }

  const candidatos = await miembrosPorVencer(maxDias);
  summary.encontrados = candidatos.length;

  const wa = whatsappClient || require('../lib/whatsapp');

  for (const m of candidatos) {
    const diasAvisoGym = parseInt(m.dias_aviso || 0, 10);
    const diasRestantes = parseInt(m.dias_restantes, 10);

    // Si este gym tiene dias_aviso = 0, salta (gym desactivado el aviso).
    if (diasAvisoGym <= 0) {
      summary.omitidosGymDesactivado += 1;
      summary.detalle.push({ id: m.id_miembro, motivo: 'gym-desactivado' });
      continue;
    }

    // Si los dias restantes son mayores que la ventana del gym, no avisa.
    // Ej: gym quiere avisar a 3 dias, miembro vence en 10 -> no toca.
    if (diasRestantes > diasAvisoGym) {
      continue;
    }

    summary.enVentana += 1;

    // Telefono?
    const tel = telParaWhatsapp(m.telefono);
    if (!tel) {
      summary.omitidosSinTelefono += 1;
      summary.detalle.push({ id: m.id_miembro, motivo: 'sin-telefono' });
      continue;
    }

    // Ya le mandamos este mismo recordatorio?
    // Nota: el id_plan_cobro no viene en la query por el LATERAL, lo resolvemos:
    const planCobroRow = await pool.query(
      `SELECT id_plan_cobro FROM plan_cobro
        WHERE id_miembro = $1 AND activo = TRUE
        ORDER BY fecha_fin DESC NULLS LAST, id_plan_cobro DESC LIMIT 1`,
      [m.id_miembro]
    );
    const idPlanCobro = planCobroRow.rows[0]?.id_plan_cobro;
    if (!idPlanCobro) continue;

    if (await yaEnviado({ idPlanCobro, diasRestantes })) {
      summary.omitidosDuplicado += 1;
      summary.detalle.push({ id: m.id_miembro, motivo: 'duplicado', diasRestantes });
      continue;
    }

    // Construye el mensaje segun cuantos dias faltan.
    const texto = diasRestantes === 0
      ? avisoVenceHoy({ nombre: m.nombre, gymNombre: m.gym_nombre, tipoPlan: m.tipo_plan, fechaFin: m.fecha_fin })
      : avisoVencimiento({ nombre: m.nombre, gymNombre: m.gym_nombre, tipoPlan: m.tipo_plan, fechaFin: m.fecha_fin, diasRestantes });

    if (dryRun) {
      summary.detalle.push({ id: m.id_miembro, nombre: m.nombre, tel, diasRestantes, texto });
      summary.enviados += 1; // lo contamos como enviado hipotetico
      continue;
    }

    try {
      // sendWhatsAppQR es la unica funcion publica de whatsapp.js hoy.
      // Para mandar texto plano necesitamos otra funcion; mientras tanto,
      // usamos client.sendMessage directamente via la API interna.
      // Lo mas limpio: anadir `sendWhatsAppText` a whatsapp.js.
      await wa.sendWhatsAppText(tel, texto);
      await marcarEnviado({ idMiembro: m.id_miembro, idPlanCobro, diasRestantes });
      summary.enviados += 1;
      summary.detalle.push({ id: m.id_miembro, nombre: m.nombre, tel, diasRestantes, status: 'enviado' });
    } catch (err) {
      summary.detalle.push({ id: m.id_miembro, nombre: m.nombre, tel, diasRestantes, status: 'error', error: err.message });
    }
  }

  return summary;
}

module.exports = { runJob, miembrosPorVencer, telParaWhatsapp };
