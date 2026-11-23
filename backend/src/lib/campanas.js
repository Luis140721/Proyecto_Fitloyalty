/**
 * lib/campanas.js
 *
 * Ejecucion de campanas de mensajes (RQF-10), con las reglas de la Ley 2300
 * de 2023 (RQNF-16, lib/contacto-legal.js).
 *
 * Una campana tiene un segmento (lib/segmentos.js), un mensaje (escrito a mano
 * o copiado de una plantilla_mensaje), un canal (WHATSAPP o EMAIL) y un tipo de
 * disparo: MANUAL (se ejecuta cuando el administrador la lanza) o PROGRAMADO
 * (la ejecuta el scheduler cuando llega fecha_programada).
 *
 * Una campana es un mensaje comercial: solo le llega a quien acepto los
 * mensajes comerciales por el canal de la campana, dentro del horario de la
 * ley y sin pasar la frecuencia (una vez al dia, un solo canal por semana).
 *
 * Ejecutar una campana:
 *   0. Fuera del horario (domingo, festivo, antes o despues de la franja) no
 *      se ejecuta: devuelve { fueraDeHorario, siguiente } y quien la llamo
 *      decide (la ruta la deja programada para `siguiente`; el scheduler
 *      espera).
 *   1. En una transaccion, con la fila bloqueada (FOR UPDATE) para que dos
 *      ejecuciones a la vez no la manden dos veces: calcula los miembros del
 *      segmento en ese momento y los guarda en campana_destinatario: PENDIENTE
 *      los que se pueden contactar y OMITIDO, con su motivo (NO_AUTORIZA,
 *      CANAL_NO_AUTORIZADO o FRECUENCIA), los que no (migracion 018). La
 *      campana pasa a ENVIADA con fecha_ejecucion.
 *   2. Entrega (entregarPendientes), un destinatario por transaccion: bloquea
 *      su fila (FOR UPDATE SKIP LOCKED) y al miembro (bloqueo de contacto),
 *      vuelve a revisar la ley en ese instante, envia y deja constancia:
 *      - EMAIL: un correo por miembro (Brevo). Sin correo o si Brevo falla,
 *        queda FALLIDO (SIN_CORREO o ERROR_ENVIO).
 *      - WHATSAPP: si el modulo de WhatsApp esta activo en el servidor, lo
 *        envia solo; si no (Render no tiene Chrome), el destinatario sigue
 *        PENDIENTE y el panel lo envia a mano con wa.me (registrarEnvioManual).
 *        Con modulo o sin el, quien no tiene telefono queda FALLIDO
 *        (SIN_TELEFONO): tampoco se le puede escribir a mano.
 *      - Si en medio del envio se cierra la franja, el resto queda PENDIENTE
 *        con motivo FUERA_DE_HORARIO y sale en la siguiente franja.
 *      Cada mensaje lleva al final el enlace de baja (lib/baja-mensajes.js).
 *   3. Cada entrega deja constancia en envio_mensaje (id_campana, canal, texto
 *      personalizado, estado y fecha), igual que RQF-09.
 *
 * Reintento: si el proceso se cae a mitad del envio, los destinatarios que no
 * alcanzo a procesar quedan PENDIENTE. reanudarCampana los vuelve a pasar por
 * el paso 2 (lo usan el boton "Reintentar" del panel y el scheduler). Como
 * cada destinatario se bloquea y se revisa su estado dentro de la
 * transaccion, dos reintentos a la vez no le escriben dos veces a nadie.
 *
 * El texto admite variables: {nombre}, {primer_nombre}, {gimnasio},
 * {dias_sin_venir} y {fecha_vencimiento}.
 */
const { miembrosDelSegmento, HOY, fechaLocal } = require('./segmentos');
const { telefonoWhatsapp } = require('./mensajes');
const {
  ahora, evaluarHorario, siguienteHorarioPermitido, describirInstante, TEXTO_HORARIO,
  inicioDeSemana, puedeContactar,
} = require('./contacto-legal');
const {
  comercialesDeVarios, comercialesDe, historialDeVarios, historialDeLaSemana,
  bloquearContacto, registrarEnvio,
} = require('./contacto-miembro');
const { pieBaja } = require('./baja-mensajes');

const VARIABLES = ['nombre', 'primer_nombre', 'gimnasio', 'dias_sin_venir', 'fecha_vencimiento'];

// Los motivos que no se arreglan esperando: el destinatario queda OMITIDO.
// FUERA_DE_HORARIO si se arregla esperando: sigue PENDIENTE.
const MOTIVO_ESPERA = 'FUERA_DE_HORARIO';

function fmtFecha(f) {
  if (!f) return '';
  const s = f instanceof Date ? f.toISOString().slice(0, 10) : String(f).slice(0, 10);
  const [a, m, d] = s.split('-');
  return a && m && d ? `${d}/${m}/${a}` : s;
}

/** Reemplaza las variables del texto con los datos del miembro. */
function personalizar(texto, { nombre, gimnasio, dias_sin_venir: dias, fecha_fin: fechaFin } = {}) {
  const valores = {
    nombre: nombre || '',
    primer_nombre: String(nombre || '').trim().split(/\s+/)[0] || '',
    gimnasio: gimnasio || 'tu gimnasio',
    dias_sin_venir: dias === null || dias === undefined ? 'varios' : String(dias),
    fecha_vencimiento: fmtFecha(fechaFin),
  };
  return String(texto || '').replace(/\{(\w+)\}/g, (todo, clave) => (
    Object.prototype.hasOwnProperty.call(valores, clave) ? valores[clave] : todo
  ));
}

/** El texto que de verdad se envia: personalizado y con el enlace de baja. */
function textoParaMiembro(campana, m, gymId) {
  return personalizar(campana.mensaje, { ...m, gimnasio: campana.gimnasio }) + pieBaja(m.id_miembro, gymId);
}

/**
 * null si `instante` esta dentro del horario de la Ley 2300; si no,
 * { siguiente, mensaje } con el primer instante permitido.
 */
function fueraDeHorario(instante) {
  if (evaluarHorario(instante).permitido) return null;
  const siguiente = siguienteHorarioPermitido(instante);
  return {
    siguiente,
    mensaje: `La Ley 2300 de 2023 solo permite enviar mensajes ${TEXTO_HORARIO}. El siguiente horario permitido es el ${describirInstante(siguiente)}`,
  };
}

// TIMESTAMP de la sesion a partir de un instante de JS (el reloj de la ley).
const A_SESION = (p) => `(${p}::timestamptz AT TIME ZONE current_setting('TimeZone'))`;

/**
 * Pasa la campana a ENVIADA y guarda sus destinatarios, PENDIENTE u OMITIDO
 * segun la ley. Devuelve null si la campana no esta lista para ejecutarse
 * (ya enviada, cancelada o inactiva).
 */
async function congelarDestinatarios(pool, { idCampana, gymId, instante }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT c.id_campana, c.id_gimnasio, c.nombre, c.segmento, c.mensaje, c.canal,
              c.dias_inactividad, c.estado, c.activa, c.id_plantilla, g.nombre AS gimnasio
         FROM campana c
         JOIN gimnasio g ON g.id_gimnasio = c.id_gimnasio
        WHERE c.id_campana = $1 AND c.id_gimnasio = $2
        FOR UPDATE OF c`,
      [idCampana, gymId]
    );
    const campana = rows[0];
    if (!campana || campana.estado !== 'PROGRAMADA' || !campana.activa) {
      await client.query('ROLLBACK');
      return null;
    }

    const miembros = await miembrosDelSegmento(client, gymId, campana.segmento, { dias: campana.dias_inactividad });
    const ids = miembros.map((m) => m.id_miembro);
    const comerciales = await comercialesDeVarios(client, ids, gymId);
    const historial = await historialDeVarios(client, ids, inicioDeSemana(instante));

    for (const m of miembros) {
      const decision = puedeContactar(
        { ...m, ...(comerciales.get(Number(m.id_miembro)) || {}) },
        campana.canal, instante, historial.get(Number(m.id_miembro)) || [], { clase: 'COMERCIAL' }
      );
      const omitido = !decision.puede && decision.motivo !== MOTIVO_ESPERA;
      await client.query(
        `INSERT INTO campana_destinatario (id_campana, id_miembro, estado_envio, motivo)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_campana, id_miembro) DO NOTHING`,
        [idCampana, m.id_miembro, omitido ? 'OMITIDO' : 'PENDIENTE', decision.puede ? null : decision.motivo]
      );
    }
    await client.query(
      `UPDATE campana SET estado = 'ENVIADA', fecha_ejecucion = ${A_SESION('$2')} WHERE id_campana = $1`,
      [idCampana, instante]
    );
    await client.query('COMMIT');
    return { campana, miembros };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Lo que se lee de cada destinatario para personalizar su mensaje: el
// vencimiento del plan vigente y los dias sin venir (hora de Colombia). La
// lista (destinatariosDeCampana) y la constancia del envio a mano
// (registrarEnvioManual) usan estos mismos trozos: si cada una leyera a su
// manera, el texto registrado dejaria de ser el que el panel mostro.
const DATOS_DEL_MENSAJE = `pc.fecha_fin,
            (SELECT (${HOY} - ${fechaLocal('MAX(c.fecha_hora)')})::int
               FROM checkin c WHERE c.id_miembro = m.id_miembro AND c.valido = TRUE) AS dias_sin_venir`;
const PLAN_VIGENTE = `LEFT JOIN (
         SELECT DISTINCT ON (id_miembro) id_miembro, fecha_fin FROM plan_cobro
          WHERE activo = TRUE ORDER BY id_miembro, fecha_fin DESC NULLS LAST, id_plan_cobro DESC
       ) pc ON pc.id_miembro = m.id_miembro`;

/**
 * Destinatarios de una campana con los datos para personalizar el mensaje
 * (hora de Colombia para los dias sin venir). Con `soloPendientes`, solo los
 * PENDIENTE, en orden de llegada.
 */
async function destinatariosDeCampana(db, idCampana, gymId, { soloPendientes = false } = {}) {
  const { rows } = await db.query(
    `SELECT d.id_campana_destinatario, d.estado_envio, d.motivo, d.fecha_envio,
            m.id_miembro, m.nombre, m.telefono, m.codigo_pais_telefono, m.email,
            ${DATOS_DEL_MENSAJE}
       FROM campana_destinatario d
       JOIN miembro m ON m.id_miembro = d.id_miembro AND m.id_gimnasio = $2
       ${PLAN_VIGENTE}
      WHERE d.id_campana = $1 ${soloPendientes ? "AND d.estado_envio = 'PENDIENTE'" : ''}
      ORDER BY ${soloPendientes ? 'd.id_campana_destinatario' : "(d.estado_envio = 'PENDIENTE') DESC, m.nombre"}`,
    [idCampana, gymId]
  );
  return rows;
}

/** Actualiza un destinatario dentro de la transaccion de `client`. */
async function marcarDestinatario(client, idDestinatario, { estado, motivo = null, fecha = null }) {
  const { rows } = await client.query(
    `UPDATE campana_destinatario
        SET estado_envio = $2, motivo = $3,
            fecha_envio = CASE WHEN $4::timestamptz IS NULL THEN fecha_envio ELSE ${A_SESION('$4')} END
      WHERE id_campana_destinatario = $1
      RETURNING id_campana_destinatario, estado_envio, motivo, fecha_envio`,
    [idDestinatario, estado, motivo, fecha]
  );
  return rows[0] || null;
}

/** Constancia de una entrega en envio_mensaje y en el destinatario. */
async function registrarEntrega(client, { campana, gymId, destinatario, estado, motivo = null, mensaje, usuarioId, instante, deps }) {
  const idCanal = await deps.canalDelGimnasio(client, gymId, campana.canal);
  await registrarEnvio(client, {
    gymId, idMiembro: destinatario.id_miembro, idCanal, idCampana: campana.id_campana,
    idPlantilla: campana.id_plantilla || null, mensaje, estado, enviadoPor: usuarioId || null, fecha: instante,
  });
  return marcarDestinatario(client, destinatario.id_campana_destinatario, { estado, motivo, fecha: instante });
}

/**
 * Procesa los destinatarios PENDIENTE de una campana ya ejecutada (paso 2).
 * `deps`: { canalDelGimnasio, enviarCorreo(to, asunto, texto) -> {delivered},
 *           enviarWhatsapp(telefono, texto), whatsappActivo() -> bool }.
 * Devuelve { procesados, enviados, fallidos, omitidos, cerroFranja }.
 */
async function entregarPendientes(pool, { campana, gymId, usuarioId }, deps) {
  const r = { procesados: 0, enviados: 0, fallidos: 0, omitidos: 0, cerroFranja: false };
  let whatsappDisponible = campana.canal === 'WHATSAPP' && deps.whatsappActivo();

  const pendientes = await destinatariosDeCampana(pool, campana.id_campana, gymId, { soloPendientes: true });
  for (const d of pendientes) {
    // Sin el modulo de WhatsApp (o si el cliente dejo de estar listo) no se
    // intenta ninguna entrega: quien tiene telefono queda PENDIENTE para
    // enviarle a mano. A quien no tiene telefono tampoco se le puede escribir
    // a mano: sigue por el camino de siempre y queda FALLIDO (SIN_TELEFONO),
    // para que no figure como pendiente para siempre.
    if (campana.canal === 'WHATSAPP' && !whatsappDisponible
        && telefonoWhatsapp(d.telefono, d.codigo_pais_telefono)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Otro proceso ya lo tiene, o ya no esta pendiente: se salta.
      const { rows: bloqueada } = await client.query(
        `SELECT estado_envio FROM campana_destinatario
          WHERE id_campana_destinatario = $1 FOR UPDATE SKIP LOCKED`,
        [d.id_campana_destinatario]
      );
      if (bloqueada.length === 0 || bloqueada[0].estado_envio !== 'PENDIENTE') {
        await client.query('COMMIT');
        continue;
      }
      r.procesados += 1;

      await bloquearContacto(client, d.id_miembro);
      const instante = ahora();
      const comerciales = await comercialesDe(client, d.id_miembro, gymId);
      const historial = await historialDeLaSemana(client, d.id_miembro, instante);
      const decision = puedeContactar({ ...d, ...comerciales }, campana.canal, instante, historial, { clase: 'COMERCIAL' });
      if (!decision.puede) {
        if (decision.motivo === MOTIVO_ESPERA) {
          await marcarDestinatario(client, d.id_campana_destinatario, { estado: 'PENDIENTE', motivo: MOTIVO_ESPERA });
          await client.query('COMMIT');
          r.cerroFranja = true;
          break;
        }
        await marcarDestinatario(client, d.id_campana_destinatario, { estado: 'OMITIDO', motivo: decision.motivo });
        await client.query('COMMIT');
        r.omitidos += 1;
        continue;
      }

      const texto = textoParaMiembro(campana, d, gymId);
      const base = { campana, gymId, destinatario: d, mensaje: texto, usuarioId, instante, deps };

      if (campana.canal === 'EMAIL') {
        let ok = false;
        if (d.email) {
          try {
            const envio = await deps.enviarCorreo(d.email, campana.nombre, texto);
            ok = !!(envio && envio.delivered);
          } catch (_) { ok = false; }
        }
        await registrarEntrega(client, {
          ...base, estado: ok ? 'ENVIADO' : 'FALLIDO', motivo: ok ? null : (d.email ? 'ERROR_ENVIO' : 'SIN_CORREO'),
        });
        await client.query('COMMIT');
        if (ok) r.enviados += 1; else r.fallidos += 1;
        continue;
      }

      // WHATSAPP desde el servidor
      const telefono = telefonoWhatsapp(d.telefono, d.codigo_pais_telefono);
      if (!telefono) {
        await registrarEntrega(client, { ...base, estado: 'FALLIDO', motivo: 'SIN_TELEFONO' });
        await client.query('COMMIT');
        r.fallidos += 1;
        continue;
      }
      try {
        await deps.enviarWhatsapp(telefono, texto);
        await registrarEntrega(client, { ...base, estado: 'ENVIADO' });
        await client.query('COMMIT');
        r.enviados += 1;
      } catch (err) {
        // Si el cliente no esta listo no tiene sentido seguir intentando: el
        // resto queda PENDIENTE para enviarlo a mano desde el panel.
        if (err && (err.code === 'WHATSAPP_NO_LISTO' || err.code === 'WHATSAPP_DESHABILITADO')) {
          await client.query('ROLLBACK');
          r.procesados -= 1;
          whatsappDisponible = false;
        } else {
          await registrarEntrega(client, { ...base, estado: 'FALLIDO', motivo: 'ERROR_ENVIO' });
          await client.query('COMMIT');
          r.fallidos += 1;
        }
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  return r;
}

/** Conteo de destinatarios por estado y de omitidos por motivo. */
async function resumenCampana(db, idCampana, canal) {
  const { rows } = await db.query(
    `SELECT estado_envio, motivo, COUNT(*)::int AS n
       FROM campana_destinatario WHERE id_campana = $1
      GROUP BY estado_envio, motivo`,
    [idCampana]
  );
  const resumen = { destinatarios: 0, enviados: 0, fallidos: 0, pendientes: 0, omitidos: 0, omitidosPorMotivo: {}, canal };
  for (const f of rows) {
    resumen.destinatarios += f.n;
    if (f.estado_envio === 'ENVIADO') resumen.enviados += f.n;
    else if (f.estado_envio === 'FALLIDO') resumen.fallidos += f.n;
    else if (f.estado_envio === 'PENDIENTE') resumen.pendientes += f.n;
    else if (f.estado_envio === 'OMITIDO') {
      resumen.omitidos += f.n;
      resumen.omitidosPorMotivo[f.motivo] = (resumen.omitidosPorMotivo[f.motivo] || 0) + f.n;
    }
  }
  return resumen;
}

/**
 * Ejecuta una campana. Devuelve el resumen, null si la campana no estaba
 * lista, o { fueraDeHorario: true, siguiente, mensaje } si ahora no se puede
 * enviar (no cambia nada).
 */
async function ejecutarCampana(pool, { idCampana, gymId, usuarioId }, deps) {
  const instante = ahora();
  const fuera = fueraDeHorario(instante);
  if (fuera) return { fueraDeHorario: true, ...fuera };

  const congelada = await congelarDestinatarios(pool, { idCampana, gymId, instante });
  if (!congelada) return null;
  const { campana } = congelada;
  const entrega = await entregarPendientes(pool, { campana, gymId, usuarioId }, deps);
  return { ...(await resumenCampana(pool, idCampana, campana.canal)), cerroFranja: entrega.cerroFranja };
}

/**
 * Vuelve a procesar los PENDIENTE de una campana ya enviada (el proceso se
 * cayo, o se cerro la franja). Devuelve el resumen, null si la campana no
 * esta ENVIADA o { fueraDeHorario } si ahora no se puede.
 */
async function reanudarCampana(pool, { idCampana, gymId, usuarioId }, deps) {
  const fuera = fueraDeHorario(ahora());
  if (fuera) return { fueraDeHorario: true, ...fuera };
  const { rows } = await pool.query(
    `SELECT c.id_campana, c.id_gimnasio, c.nombre, c.mensaje, c.canal, c.estado, c.id_plantilla,
            g.nombre AS gimnasio
       FROM campana c JOIN gimnasio g ON g.id_gimnasio = c.id_gimnasio
      WHERE c.id_campana = $1 AND c.id_gimnasio = $2`,
    [idCampana, gymId]
  );
  const campana = rows[0];
  if (!campana || campana.estado !== 'ENVIADA') return null;
  const entrega = await entregarPendientes(pool, { campana, gymId, usuarioId }, deps);
  return { ...(await resumenCampana(pool, idCampana, campana.canal)), cerroFranja: entrega.cerroFranja, procesados: entrega.procesados };
}

/**
 * Constancia de un envio hecho a mano por WhatsApp (wa.me). El panel la pide
 * ANTES de abrir el chat y lo abre con el `mensaje` que devuelve (con el
 * enlace de baja). Todo pasa en una transaccion con la fila del destinatario
 * bloqueada:
 *   - si ya estaba ENVIADO (doble clic), no agrega otra fila: devuelve
 *     { duplicado: true } con el texto que se registro;
 *   - si la ley no deja contactarlo ahora, devuelve { error } con el motivo:
 *     fuera de horario sigue PENDIENTE; por permiso, canal o frecuencia queda
 *     OMITIDO.
 * Devuelve null si el miembro no es destinatario de la campana.
 */
async function registrarEnvioManual(pool, { campana, gymId, idMiembro, usuarioId }, deps) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      // Los mismos datos que destinatariosDeCampana (DATOS_DEL_MENSAJE): sin
      // fecha_fin ni dias_sin_venir el texto perdia {fecha_vencimiento} y
      // {dias_sin_venir} y no era el que el panel habia mostrado.
      `SELECT d.id_campana_destinatario, d.estado_envio, d.motivo, d.fecha_envio,
              m.id_miembro, m.nombre, m.telefono, m.codigo_pais_telefono, m.email,
              ${DATOS_DEL_MENSAJE}
         FROM campana_destinatario d
         JOIN miembro m ON m.id_miembro = d.id_miembro AND m.id_gimnasio = $3
         ${PLAN_VIGENTE}
        WHERE d.id_campana = $1 AND d.id_miembro = $2
        FOR UPDATE OF d`,
      [campana.id_campana, idMiembro, gymId]
    );
    const d = rows[0];
    if (!d) {
      await client.query('ROLLBACK');
      return null;
    }

    if (d.estado_envio === 'ENVIADO') {
      const { rows: previo } = await client.query(
        `SELECT mensaje_copiado FROM envio_mensaje
          WHERE id_campana = $1 AND id_miembro = $2 AND estado = 'ENVIADO'
          ORDER BY id_envio DESC LIMIT 1`,
        [campana.id_campana, idMiembro]
      );
      await client.query('COMMIT');
      return {
        duplicado: true,
        destinatario: { id_campana_destinatario: d.id_campana_destinatario, estado_envio: d.estado_envio, fecha_envio: d.fecha_envio },
        mensaje: previo[0] ? previo[0].mensaje_copiado : null,
      };
    }
    if (d.estado_envio === 'OMITIDO') {
      await client.query('COMMIT');
      return { error: { motivo: d.motivo, mensaje: `A ${String(d.nombre).split(/\s+/)[0]} no se le puede enviar esta campaña (${d.motivo}).` } };
    }

    await bloquearContacto(client, idMiembro);
    const instante = ahora();
    const comerciales = await comercialesDe(client, idMiembro, gymId);
    const historial = await historialDeLaSemana(client, idMiembro, instante);
    const decision = puedeContactar({ ...d, ...comerciales }, 'WHATSAPP', instante, historial, { clase: 'COMERCIAL' });
    if (!decision.puede) {
      const espera = decision.motivo === MOTIVO_ESPERA;
      await marcarDestinatario(client, d.id_campana_destinatario, {
        estado: espera ? 'PENDIENTE' : 'OMITIDO', motivo: decision.motivo,
      });
      await client.query('COMMIT');
      return { error: { motivo: decision.motivo, mensaje: decision.mensaje, siguiente: decision.siguiente || null } };
    }

    const telefono = telefonoWhatsapp(d.telefono, d.codigo_pais_telefono);
    if (!telefono) {
      await client.query('ROLLBACK');
      return { error: { motivo: 'SIN_TELEFONO', mensaje: 'El miembro no tiene un teléfono válido para WhatsApp.' } };
    }
    const texto = textoParaMiembro(campana, d, gymId);
    const destinatario = await registrarEntrega(client, {
      campana, gymId, destinatario: d, estado: 'ENVIADO', mensaje: texto, usuarioId, instante, deps,
    });
    await client.query('COMMIT');
    return { duplicado: false, destinatario, mensaje: texto, telefono };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Campanas programadas cuya hora ya llego. Con `gymId`, solo las de ese
 * gimnasio; sin el (el scheduler), las de todos, hasta 50 por corrida.
 */
async function campanasVencidas(pool, gymId = null) {
  const { rows } = await pool.query(
    `SELECT id_campana, id_gimnasio, creada_por FROM campana
      WHERE activa = TRUE AND estado = 'PROGRAMADA' AND tipo_disparo = 'PROGRAMADO'
        AND fecha_programada IS NOT NULL AND fecha_programada <= NOW()
        AND ($1::int IS NULL OR id_gimnasio = $1::int)
      ORDER BY fecha_programada
      LIMIT 50`,
    [gymId]
  );
  return rows;
}

/**
 * Campanas ya enviadas con destinatarios PENDIENTE que el servidor puede
 * enviar solo (correo, o WhatsApp si el modulo esta activo) y que llevan mas
 * de 10 minutos asi: el proceso se cayo o se cerro la franja. Las recien
 * ejecutadas no se tocan para no competir con el envio en curso.
 */
async function campanasConPendientes(pool, { gymId = null, conWhatsapp = false } = {}) {
  const { rows } = await pool.query(
    `SELECT c.id_campana, c.id_gimnasio, c.creada_por FROM campana c
      WHERE c.estado = 'ENVIADA'
        AND ($1::int IS NULL OR c.id_gimnasio = $1::int)
        AND (c.canal = 'EMAIL' OR $2::boolean)
        AND c.fecha_ejecucion < NOW() - INTERVAL '10 minutes'
        AND EXISTS (SELECT 1 FROM campana_destinatario d
                     WHERE d.id_campana = c.id_campana AND d.estado_envio = 'PENDIENTE')
      ORDER BY c.fecha_ejecucion
      LIMIT 20`,
    [gymId, conWhatsapp]
  );
  return rows;
}

module.exports = {
  VARIABLES,
  personalizar,
  textoParaMiembro,
  fueraDeHorario,
  congelarDestinatarios,
  destinatariosDeCampana,
  entregarPendientes,
  resumenCampana,
  ejecutarCampana,
  reanudarCampana,
  registrarEnvioManual,
  campanasVencidas,
  campanasConPendientes,
};
