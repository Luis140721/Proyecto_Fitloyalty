/**
 * lib/mensajes.js
 *
 * Texto y telefono para contactar a un miembro por WhatsApp.
 *
 * Vive aparte porque lo usan dos pantallas: la campana de avisos y la lista
 * de miembros. Si cada una armara su propio mensaje, tarde o temprano dirian
 * cosas distintas sobre la misma persona.
 */

/**
 * Deja el telefono como lo espera WhatsApp: solo digitos y con indicativo de
 * pais. Devuelve null si el numero no sirve, para que la interfaz muestre
 * "sin telefono" en vez de un enlace roto.
 */
function telefonoWhatsapp(telefono, indicativo) {
  const limpio = String(telefono || '').replace(/\D/g, '');
  if (limpio.length < 7) return null;
  if (limpio.length > 10) return limpio;              // ya trae indicativo
  const pais = String(indicativo || '57').replace(/\D/g, '') || '57';
  return `${pais}${limpio}`;
}

/**
 * Redacta el mensaje segun el motivo. `dato` es el trozo variable ya escrito
 * en palabras ("hace 8 dias", "en 3 dias"), que cada pantalla calcula porque
 * tiene los numeros a la mano.
 */
function mensajeParaMiembro(tipo, gym, nombre, dato) {
  const primerNombre = String(nombre || '').split(' ')[0];
  const saludo = `Hola ${primerNombre}, te saludamos de ${gym}.`;

  if (tipo === 'acceso-bloqueado') {
    return `${saludo} Hoy intentaste ingresar y no pudimos dejarte pasar porque ${dato}. Pasa por recepcion y lo resolvemos para que sigas entrenando.`;
  }
  if (tipo === 'vencida') {
    return `${saludo} Tu plan vencio ${dato}. Pasa cuando quieras y lo renovamos para que no pierdas el ritmo.`;
  }
  if (tipo === 'por-vencer') {
    return `${saludo} Te recordamos que tu plan vence ${dato}. Puedes renovarlo en recepcion o escribirnos por aqui.`;
  }
  return `${saludo} Notamos que llevas ${dato} sin venir y queremos saber como estas. Te esperamos cuando quieras retomar.`;
}

/**
 * Convierte un numero de dias en la frase que va dentro del mensaje.
 *
 *   'pasado'  -> "hace 8 dias"   (el plan vencio ...)
 *   'futuro'  -> "en 3 dias"     (tu plan vence ...)
 *   'plano'   -> "31 dias"       (llevas ... sin venir)
 *
 * El modo importa: cada plantilla ya trae su propia preposicion, y mezclarlas
 * produce frases como "llevas hace 31 dias sin venir".
 */
function enPalabras(dias, modo = 'pasado') {
  if (dias === null || dias === undefined) return 'un buen tiempo';
  if (dias === 0 && modo !== 'plano') return 'hoy';
  const unidad = dias === 1 ? 'dia' : 'dias';
  if (modo === 'futuro') return `en ${dias} ${unidad}`;
  if (modo === 'plano') return `${dias} ${unidad}`;
  return `hace ${dias} ${unidad}`;
}

module.exports = { telefonoWhatsapp, mensajeParaMiembro, enPalabras };

// ---------------------------------------------------------------------------
// Plantillas usadas por el job automatico de avisos de vencimiento
// (jobs/expiracion.js). Aqui centralizadas para mantener el texto facil
// de editar y consistente entre el job y cualquier otro envio futuro.
// ---------------------------------------------------------------------------

const G = (s) => String(s == null ? '' : s);

/**
 * Mensaje de bienvenida con QR que recibe un miembro cuando se le asigna
 * plan y se crea su acceso a la app. Lo usa `miembros.js` justo despues
 * de crear el socio (Daniel lo metio asi).
 */
function bienvenidaConQr({ nombre, gymNombre, diasParaVencer }) {
  const dias = Number.isFinite(diasParaVencer) ? Math.max(0, diasParaVencer) : 30;
  return [
    `¡Hola *${G(nombre)}*! 👋 Bienvenido a *${G(gymNombre)}*.`,
    `Tu registro ha sido exitoso. Tu plan esta vigente por ${dias} dias y tu codigo QR de acceso es el siguiente:`,
  ].join(' ');
}

/**
 * Mensaje que se manda N dias antes de que se venza el plan. Cada gym
 * decide su propio N (columna gimnasio.dias_aviso_vencimiento).
 */
function avisoVencimiento({ nombre, gymNombre, tipoPlan, fechaFin, diasRestantes }) {
  const fecha = fechaFin
    ? new Date(fechaFin).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'proximamente';
  const d = Number(diasRestantes);
  const cuando = d === 0
    ? 'Tu plan vence *hoy*'
    : d === 1
      ? 'Tu plan vence *mañana*'
      : `Tu plan vence en *${d} dias*`;
  return [
    `¡Hola *${G(nombre)}*! 👋 Te escribimos desde *${G(gymNombre)}*.`,
    `${cuando} (${fecha}). Tu plan *${G(tipoPlan) || 'actual'}* se vence pronto.`,
    `Renueva tu membresia antes de la fecha para no perder el acceso.`,
  ].join('\n');
}

/**
 * Mensaje que se manda el mismo dia del vencimiento. Es un segundo aviso
 * para los gimnasios que quieren recordatorio el dia D.
 */
function avisoVenceHoy({ nombre, gymNombre, tipoPlan, fechaFin }) {
  const fecha = fechaFin
    ? new Date(fechaFin).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'hoy';
  return [
    `¡Hola *${G(nombre)}*! 👋 Desde *${G(gymNombre)}* te recordamos:`,
    `Tu plan *${G(tipoPlan) || 'actual'}* se vence *hoy* (${fecha}).`,
    `Te invitamos a renovarlo para seguir entrenando con nosotros. 💪`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Contrato de membresia (RQNF-18, Ley 1480 de 2011, arts. 23, 37, 42 y 43)
// ---------------------------------------------------------------------------
// El texto sale de los datos reales de la base (lib/contrato.js los lee):
// precio total y forma de pago del plan vigente, fechas de inicio y fin,
// renovacion (nunca automatica), congelamiento (RQF-04), terminacion, datos
// del gimnasio y canal de peticiones, quejas y reclamos (PQR).
//
// La version v1 (hasta noviembre de 2026) tenia clausulas que el art. 43 de la
// Ley 1480 deja sin efecto o que el art. 42 considera abusivas: no devolver
// nunca el dinero, exonerar al gimnasio de toda lesion u objeto, suspender sin
// aviso, presumir la aceptacion por usar el QR o por "recibir" el mensaje, el
// uso de imagen por defecto y la autorizacion de datos de salud y publicidad
// metida dentro del contrato. Esta version (v2) las reemplaza; el detalle
// esta en docs/evidencias/rqnf-18-contrato-consumidor.md.
//
// Es una implementacion tecnica: conviene que la revise un abogado antes de
// usarla con miembros reales.
//
// Se arma por secciones (la app las muestra una por una) y se une en un solo
// texto para WhatsApp, con asteriscos para la negrita.

const CONTRATO_VERSION = 'v2';

const PLANES = {
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  CLASES_SUELTAS: 'Clases sueltas',
  ILIMITADO: 'Ilimitado',
  OTRO: 'Otro',
};

const METODOS_PAGO = {
  EFECTIVO: 'efectivo',
  TRANSFERENCIA: 'transferencia bancaria',
  TARJETA: 'tarjeta',
  PSE: 'PSE',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  OTRO: 'otro medio acordado con el gimnasio',
};

const ESTADOS_PAGO = {
  PAGADO: 'pagado en su totalidad',
  PARCIAL: 'pago parcial',
  PENDIENTE: 'pendiente de pago',
};

/**
 * Fecha como 'AAAA-MM-DD'. pg entrega DATE como Date a la medianoche local:
 * se leen sus partes locales; un texto se toma tal cual.
 */
function fechaIso(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${p(valor.getMonth() + 1)}-${p(valor.getDate())}`;
  }
  const t = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** "01 de octubre de 2026". Se formatea en UTC para no correr el dia. */
function fmtFechaLarga(valor) {
  const f = fechaIso(valor);
  if (!f) return null;
  return new Date(`${f}T00:00:00Z`).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function fmtPesos(v) {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString('es-CO')} COP`;
}

function diasEntre(inicio, fin) {
  const a = fechaIso(inicio);
  const b = fechaIso(fin);
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

const limpio = (s) => (s === null || s === undefined ? '' : String(s).trim());

/**
 * Pasa la fila que lee lib/contrato.js (miembro + gimnasio + plan vigente +
 * autorizaciones vigentes) a los datos del contrato, ya con los calculos.
 */
function datosContrato(fila, vigentes = {}) {
  const total = fila.valor_total === null || fila.valor_total === undefined ? null : Number(fila.valor_total);
  const pagado = fila.valor_pagado === null || fila.valor_pagado === undefined ? 0 : Number(fila.valor_pagado);
  const hayPlan = Boolean(fila.tipo_plan);
  const aceptacion = vigentes.TERMINOS && vigentes.TERMINOS.otorgada ? vigentes.TERMINOS : null;
  return {
    version: CONTRATO_VERSION,
    gimnasio: {
      nombre: limpio(fila.gym_nombre),
      nit: limpio(fila.gym_nit),
      direccion: limpio(fila.gym_direccion),
      telefono: limpio(fila.gym_telefono),
      email: limpio(fila.gym_email),
      dias_aviso: fila.gym_dias_aviso === null || fila.gym_dias_aviso === undefined ? null : Number(fila.gym_dias_aviso),
    },
    miembro: {
      nombre: limpio(fila.nombre),
      tipo_documento: limpio(fila.tipo_documento) || 'CC',
      documento: limpio(fila.documento),
      fecha_registro: fila.fecha_registro || null,
      acepto_terminos: fila.acepto_terminos === true,
    },
    // Solo mientras el miembro sea menor de edad (fila.es_menor lo calcula
    // lib/contrato.js con la fecha de nacimiento).
    representante: fila.es_menor && limpio(fila.representante_nombre)
      ? {
        nombre: limpio(fila.representante_nombre),
        tipo_documento: limpio(fila.representante_tipo_documento),
        documento: limpio(fila.representante_documento),
        parentesco: limpio(fila.representante_parentesco),
        telefono: limpio(fila.representante_telefono),
      }
      : null,
    plan: hayPlan
      ? {
        tipo: fila.tipo_plan,
        nombre: PLANES[fila.tipo_plan] || limpio(fila.tipo_plan),
        fecha_inicio: fechaIso(fila.fecha_inicio),
        fecha_fin: fechaIso(fila.fecha_fin),
        dias: diasEntre(fila.fecha_inicio, fila.fecha_fin),
        valor_total: Number.isFinite(total) ? total : null,
        valor_pagado: Number.isFinite(pagado) ? pagado : 0,
        saldo: Number.isFinite(total) ? Math.max(0, total - (Number.isFinite(pagado) ? pagado : 0)) : null,
        metodo_pago: fila.metodo_pago || null,
        estado_pago: fila.estado_pago || null,
        congelado_desde: fechaIso(fila.congelado_desde),
        renovacion_automatica: false,
      }
      : null,
    aceptacion: aceptacion ? { fecha: aceptacion.fecha, canal: aceptacion.canal, version: aceptacion.version_texto } : null,
    autorizaciones: {
      tratamiento_datos: vigentes.TRATAMIENTO_DATOS ? vigentes.TRATAMIENTO_DATOS.otorgada : null,
      datos_sensibles: vigentes.DATOS_SENSIBLES ? vigentes.DATOS_SENSIBLES.otorgada : false,
    },
  };
}

/**
 * Lo que el contrato tiene que informar y falta en la base (Ley 1480, art.
 * 23: informacion clara y completa). Sin plan, precio, forma de pago o
 * fechas, el contrato no se puede entregar.
 */
function faltantesContrato(d) {
  const f = [];
  if (!d.gimnasio.nombre) f.push('nombre del gimnasio');
  if (!d.gimnasio.telefono && !d.gimnasio.email) f.push('teléfono o correo del gimnasio para PQR');
  if (!d.plan) {
    f.push('plan vigente');
    return f;
  }
  if (d.plan.valor_total === null) f.push('precio total del plan');
  if (!d.plan.metodo_pago) f.push('forma de pago');
  if (!d.plan.fecha_inicio) f.push('fecha de inicio');
  if (!d.plan.fecha_fin) f.push('fecha de fin');
  return f;
}

/** Canales de PQR del gimnasio, en una frase. */
function canalesPqr(g) {
  const partes = [`en la recepción del gimnasio${g.direccion ? ` (${g.direccion})` : ''}`];
  if (g.telefono) partes.push(`al teléfono o WhatsApp ${g.telefono}`);
  if (g.email) partes.push(`al correo ${g.email}`);
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} o ${partes[partes.length - 1]}`;
}

const siNo = (v) => (v === true ? 'sí' : v === false ? 'no' : 'sin registro');

/** Las clausulas del contrato: [{ numero, titulo, texto }]. */
function seccionesContrato(d) {
  const g = d.gimnasio;
  const m = d.miembro;
  const p = d.plan;
  const s = [];
  const add = (titulo, texto) => s.push({ numero: s.length + 1, titulo, texto });

  // 1. Partes
  const datosGym = [
    `El gimnasio: ${g.nombre}`,
    g.nit ? `, NIT ${g.nit}` : '',
    g.direccion ? `, dirección ${g.direccion}` : '',
    g.telefono ? `, teléfono ${g.telefono}` : '',
    g.email ? `, correo ${g.email}` : '',
    '.',
  ].join('');
  let partes = `${datosGym} El miembro: ${m.nombre}, ${m.tipo_documento} ${m.documento}.`;
  if (d.representante) {
    const r = d.representante;
    partes += ` Representante legal del miembro, que es menor de edad: ${r.nombre}, ${r.tipo_documento} ${r.documento}, ${r.parentesco}, teléfono ${r.telefono}.`;
  }
  add('Partes', partes);

  // 2. Objeto
  add('Objeto', 'El gimnasio presta al miembro el servicio de acceso a sus instalaciones, máquinas y servicios '
    + 'incluidos en el plan contratado. El ingreso se hace con un código QR personal e intransferible.');

  // 3. Plan y vigencia
  if (p) {
    let vig = `Plan ${p.nombre}, del ${fmtFechaLarga(p.fecha_inicio) || 'sin fecha'} al ${fmtFechaLarga(p.fecha_fin) || 'sin fecha'}`;
    vig += p.dias !== null ? ` (${p.dias} ${p.dias === 1 ? 'día' : 'días'}).` : '.';
    if (p.congelado_desde) {
      vig += ` La membresía está congelada desde el ${fmtFechaLarga(p.congelado_desde)}: al descongelarla, el vencimiento se corre los días que estuvo congelada (cláusula 6).`;
    }
    add('Plan y vigencia', vig);

    // 4. Precio total y forma de pago
    let precio = `Precio total del plan: ${fmtPesos(p.valor_total) || 'sin registrar'}. Es el valor completo del periodo: `
      + 'no hay cobros adicionales que no estén en este contrato. '
      + `Pagado: ${fmtPesos(p.valor_pagado)}. Saldo pendiente: ${fmtPesos(p.saldo) || 'sin calcular'}`;
    precio += p.estado_pago && ESTADOS_PAGO[p.estado_pago] ? ` (${ESTADOS_PAGO[p.estado_pago]}).` : '.';
    precio += ` Forma de pago: ${METODOS_PAGO[p.metodo_pago] || limpio(p.metodo_pago) || 'sin registrar'}.`;
    add('Precio total y forma de pago', precio);
  } else {
    add('Plan y vigencia', 'El miembro todavía no tiene un plan registrado. Este contrato no tiene efecto hasta que el gimnasio le registre uno.');
  }

  // 5. Renovacion
  let renov = 'Este plan NO se renueva automáticamente. Al vencer, solo se renueva si tú lo pides y pagas el nuevo '
    + 'periodo: nunca se te cobrará un periodo nuevo sin tu aceptación.';
  if (g.dias_aviso && g.dias_aviso > 0) {
    renov += ` Te avisaremos por WhatsApp ${g.dias_aviso} ${g.dias_aviso === 1 ? 'día' : 'días'} antes del vencimiento.`;
  } else {
    renov += ' Puedes consultar la fecha de vencimiento en la app en cualquier momento.';
  }
  renov += ' Si el precio o las condiciones cambian para una renovación, te lo informaremos antes de que renueves y puedes no aceptarlo.';
  add('Renovación', renov);

  // 6. Congelamiento (RQF-04)
  add('Congelamiento', 'Puedes pedir que se congele tu membresía (por ejemplo, por viaje o incapacidad) en recepción o '
    + 'por los canales de la cláusula 11; la congela el administrador del gimnasio, sin costo. Mientras esté congelada '
    + 'no puedes ingresar y no cuenta como vencida. Al descongelarla, la fecha de vencimiento se corre tantos días como '
    + 'estuvo congelada. Cada congelamiento queda registrado con su fecha y quién lo hizo.');

  // 7. Acceso y vencimiento
  add('Acceso y vencimiento', 'El código QR es personal e intransferible. Si al vencer el plan no lo has renovado, el QR '
    + 'deja de permitir el ingreso desde el día siguiente al vencimiento. Mientras el plan esté vigente o congelado, '
    + 'tus días pagados no se pierden.');

  // 8. Terminacion por el miembro
  add('Terminación por el miembro', 'Puedes terminar este contrato cuando quieras, por el mismo medio por el que te '
    + 'inscribiste o por cualquiera de los canales de la cláusula 11, sin multas ni requisitos adicionales. Si lo '
    + 'terminas antes del vencimiento, el gimnasio te devuelve la parte de lo pagado que corresponda a los días '
    + 'completos que falten desde tu solicitud, dentro de los 30 días calendario siguientes y por el medio que '
    + 'acuerden. Si prefieres, en lugar de terminarlo puedes congelarlo (cláusula 6).');

  // 9. Terminacion o suspension por el gimnasio
  add('Terminación o suspensión por el gimnasio', 'El gimnasio solo puede suspender tu acceso o terminar el contrato '
    + 'por un incumplimiento grave de las reglas de uso (por ejemplo, prestar tu QR, agredir a otra persona o dañar '
    + 'los equipos a propósito). Antes te avisa por escrito y te da la oportunidad de explicar lo sucedido, salvo que '
    + 'haya un riesgo inmediato para la seguridad de las personas. Si el gimnasio termina el contrato, te devuelve la '
    + 'parte de lo pagado por los días que falten. Si el gimnasio cierra o deja de prestar el servicio contratado, te '
    + 'devuelve esa misma parte o, si lo prefieres, extiende tu plan por los días sin servicio.');

  // 10. Salud, seguridad y objetos personales
  add('Salud, seguridad y objetos personales', 'El gimnasio responde por mantener sus instalaciones y equipos en '
    + 'condiciones seguras y por las indicaciones de su personal. Tú te comprometes a seguir esas indicaciones y las '
    + 'reglas de uso, y a avisar al entrenador si tienes una lesión o condición que afecte tu entrenamiento. Te '
    + 'recomendamos no traer objetos de valor; el gimnasio responde, según la ley, por lo que dejes bajo su custodia '
    + '(por ejemplo, en sus casilleros).');

  // 11. PQR
  add('Peticiones, quejas y reclamos (PQR)', `Puedes presentar peticiones, quejas o reclamos ${canalesPqr(g)}. `
    + 'El gimnasio te responde en un máximo de 15 días hábiles. Si no recibes respuesta o no estás de acuerdo con '
    + 'ella, puedes acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co).');

  // 12. Datos personales
  add('Datos personales', 'Tus datos se tratan según la política de tratamiento de datos del gimnasio (Ley 1581 de '
    + '2012) y solo con las autorizaciones que diste por separado: tratamiento de datos, '
    + `${siNo(d.autorizaciones.tratamiento_datos)}; datos de salud (opcional), ${siNo(d.autorizaciones.datos_sensibles)}. `
    + 'Puedes ver tus autorizaciones y revocar la de datos de salud en la app FitLoyalty. Solo recibirás mensajes '
    + 'publicitarios si los autorizas, en los horarios permitidos, y puedes pedir que no te escriban más en cualquier '
    + 'momento (Ley 2300 de 2023).');

  // 13. Uso de imagen
  add('Uso de imagen', 'El gimnasio no usará en su publicidad fotos ni videos en los que aparezcas sin tu '
    + 'autorización expresa, dada por separado. Negarte no afecta tu membresía.');

  // 14. Cambios
  add('Cambios al contrato', 'Las condiciones de este plan no cambian mientras esté vigente. Un cambio solo se '
    + 'aplica a una renovación futura, se te informa antes y puedes no aceptarlo. Si una condición de este texto es '
    + 'distinta de la que aceptaste al inscribirte, se aplica la que te sea más favorable.');

  // 15. Entrega y aceptacion
  let acepta;
  if (d.aceptacion) {
    const canal = d.aceptacion.canal === 'APP' ? 'la app' : 'el registro del gimnasio';
    acepta = `Aceptaste las condiciones del gimnasio el ${fmtFechaLarga(d.aceptacion.fecha)} (constancia en ${canal}).`;
  } else if (m.acepto_terminos) {
    acepta = `Aceptaste las condiciones del gimnasio al inscribirte${m.fecha_registro ? `, el ${fmtFechaLarga(m.fecha_registro)}` : ''}.`;
  } else {
    acepta = 'No hay constancia de que hayas aceptado las condiciones del gimnasio: confírmalas en recepción.';
  }
  add('Entrega y aceptación', `${acepta} Esta es tu copia del contrato; también la puedes consultar en la app `
    + 'FitLoyalty, en «Mi contrato». Si no estás de acuerdo con algo, puedes terminarlo en las condiciones de la '
    + 'cláusula 8.');

  return s;
}

/** Texto completo para WhatsApp (negrita con asteriscos). */
function contratoMembresia(d) {
  const lineas = [
    '*CONTRATO DE MEMBRESÍA*',
    `*${G(d.gimnasio.nombre)}*`,
    '',
    `Hola *${G(d.miembro.nombre)}*. Esta es tu copia del contrato de membresía. Léela con calma:`,
    '',
  ];
  for (const sec of seccionesContrato(d)) {
    lineas.push(`*${sec.numero}. ${sec.titulo}.* ${sec.texto}`, '');
  }
  lineas.push(`Contrato de membresía, versión ${d.version}. Atentamente, ${G(d.gimnasio.nombre)}.`);
  return lineas.join('\n');
}

module.exports = {
  telefonoWhatsapp, mensajeParaMiembro, enPalabras,
  bienvenidaConQr, avisoVencimiento, avisoVenceHoy,
  CONTRATO_VERSION, datosContrato, faltantesContrato, seccionesContrato, contratoMembresia,
};
