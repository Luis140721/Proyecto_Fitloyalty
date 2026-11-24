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
 *
 * Ley 2300 de 2023 (RQNF-16): el aviso de vencimiento es un aviso del
 * contrato (clausula 5: "te avisaremos por WhatsApp"), no un mensaje
 * comercial, asi que no pide la aceptacion de mensajes comerciales. Si cumple:
 *   - el horario: fuera de lunes a viernes de 7:00 a. m. a 7:00 p. m. y de
 *     los sabados de 8:00 a. m. a 3:00 p. m., o en domingo o festivo, el job
 *     no envia nada (la siguiente corrida en horario lo hace);
 *   - la frecuencia: si al miembro ya se le escribio hoy, o por otro canal
 *     esta semana (envio_mensaje y los avisos anteriores), no se le envia y
 *     queda para la siguiente corrida.
 * La revision y el envio de cada miembro van en una transaccion con el
 * bloqueo de contacto (lib/contacto-miembro.js), para no cruzarse con un
 * envio a mano del panel al mismo tiempo.
 */

const pool = require('../db/db');
const { avisoVencimiento, avisoVenceHoy } = require('../lib/mensajes');
const { puedeContactar, ahora: relojLey2300, evaluarHorario, siguienteHorarioPermitido } = require('../lib/contacto-legal');
const { historialDeLaSemana, bloquearContacto } = require('../lib/contacto-miembro');

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
       SELECT DISTINCT ON (id_miembro) id_miembro, tipo_plan, fecha_fin, activo, congelado_desde
         FROM plan_cobro
        WHERE id_miembro = m.id_miembro AND activo = TRUE
        ORDER BY id_miembro, fecha_fin DESC NULLS LAST, id_plan_cobro DESC
     ) pc ON pc.id_miembro = m.id_miembro
     WHERE m.activo = TRUE
       AND g.activo = TRUE
       AND pc.fecha_fin IS NOT NULL
       AND pc.congelado_desde IS NULL   -- congelada: su vencimiento se corre al descongelar (RQF-04)
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
async function marcarEnviado({ idMiembro, idPlanCobro, diasRestantes, fecha = relojLey2300(), db = pool }) {
  try {
    // enviado_at con el reloj de la Ley 2300, para que el historial de
    // frecuencia compare con la misma hora con que se decidio.
    await db.query(
      `INSERT INTO alerta_vencimiento_enviada (id_miembro, id_plan_cobro, dias_restantes, enviado_at)
       VALUES ($1, $2, $3, ($4::timestamptz AT TIME ZONE current_setting('TimeZone')))
       ON CONFLICT (id_plan_cobro, dias_restantes) DO NOTHING`,
      [idMiembro, idPlanCobro, diasRestantes, fecha]
    );
    return true;
  } catch (e) {
    // Si la tabla no existe todavia (migracion 007 pendiente), seguimos de largo.
    if (e.code === '42P01') return false; // undefined_table
    throw e;
  }
}

/**
 * Devuelve true si ya le mandamos el aviso de esta ETAPA a este plan_cobro.
 * Cada plan recibe como maximo dos avisos:
 *   - 'aviso': la primera vez que entra en la ventana de dias del gimnasio
 *     (queda guardado con los dias que faltaban ese dia, > 0);
 *   - 'hoy':   el dia del vencimiento (dias_restantes = 0).
 * Asi con N dias de aviso no salen N+1 mensajes, y si el servidor estuvo
 * dormido el dia exacto el aviso sale al dia siguiente en vez de perderse.
 * Si la tabla no existe, devuelve false (no filtra).
 */
async function yaEnviado({ idPlanCobro, diasRestantes }) {
  try {
    const condicion = diasRestantes === 0 ? 'dias_restantes = 0' : 'dias_restantes > 0';
    const { rows } = await pool.query(
      `SELECT 1 FROM alerta_vencimiento_enviada
        WHERE id_plan_cobro = $1 AND ${condicion} LIMIT 1`,
      [idPlanCobro]
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
 * cuantos bloqueo el gym (dias_aviso=0), cuantos omitio por duplicado y
 * cuantos dejo para despues por la frecuencia de la Ley 2300.
 */
async function runJob({ dryRun = false, whatsappClient = null } = {}) {
  const summary = {
    encontrados: 0,
    enVentana:   0,
    enviados:    0,
    omitidosDuplicado: 0,
    omitidosGymDesactivado: 0,
    omitidosSinTelefono: 0,
    omitidosLey2300: 0,
    errores: 0,
    dryRun,
    detalle: [],
  };

  // RQNF-16: fuera del horario de la Ley 2300 no se envia ningun aviso.
  const instante = relojLey2300();
  const horario = evaluarHorario(instante);
  if (!horario.permitido) {
    summary.fueraDeHorario = true;
    summary.motivo = `Fuera del horario de la Ley 2300 (${horario.razon}${horario.festivo ? `: ${horario.festivo}` : ''}).`;
    summary.siguiente = siguienteHorarioPermitido(instante).toISOString();
    return summary;
  }

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

    // RQNF-16: en una transaccion con el bloqueo de contacto del miembro, se
    // revisa la frecuencia (hoy, y otro canal esta semana) y, si se puede, se
    // envia y se marca. Si no, queda para la siguiente corrida.
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await bloquearContacto(client, m.id_miembro);
      const historial = await historialDeLaSemana(client, m.id_miembro, instante);
      const decision = puedeContactar(m, 'WHATSAPP', instante, historial, { clase: 'AVISO' });
      if (!decision.puede) {
        await client.query('ROLLBACK');
        summary.omitidosLey2300 += 1;
        summary.detalle.push({ id: m.id_miembro, motivo: decision.motivo, mensaje: decision.mensaje, diasRestantes });
        continue;
      }

      if (dryRun) {
        await client.query('ROLLBACK');
        summary.detalle.push({ id: m.id_miembro, nombre: m.nombre, tel, diasRestantes, texto });
        summary.enviados += 1; // lo contamos como enviado hipotetico
        continue;
      }

      try {
        // NO se comprueba isWhatsAppReady() antes: el cliente es perezoso y solo se
        // inicializa dentro de sendWhatsAppText, asi que tras un reinicio esa
        // comprobacion seria siempre falsa y los avisos no saldrian nunca.
        // sendWhatsAppText lanza si no esta listo o si el envio falla; solo se marca
        // como enviado cuando el mensaje realmente salio, y lo demas se reintenta
        // en la siguiente corrida del scheduler.
        await wa.sendWhatsAppText(tel, texto);
      } catch (err) {
        await client.query('ROLLBACK');
        summary.errores += 1;
        summary.detalle.push({ id: m.id_miembro, nombre: m.nombre, tel, diasRestantes, status: 'error', error: err.message });
        continue;
      }
      await marcarEnviado({ idMiembro: m.id_miembro, idPlanCobro, diasRestantes, fecha: instante, db: client });
      await client.query('COMMIT');
      summary.enviados += 1;
      summary.detalle.push({ id: m.id_miembro, nombre: m.nombre, tel, diasRestantes, status: 'enviado' });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      summary.errores += 1;
      summary.detalle.push({ id: m.id_miembro, nombre: m.nombre, tel, diasRestantes, status: 'error', error: err.message });
    } finally {
      if (client) client.release();
      client = null;
    }
  }

  return summary;
}

module.exports = { runJob, miembrosPorVencer, telParaWhatsapp };
