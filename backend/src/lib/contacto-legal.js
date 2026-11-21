/**
 * lib/contacto-legal.js
 *
 * RQNF-16: reglas de la Ley 2300 de 2023 para los mensajes que el gimnasio le
 * manda a un miembro (retencion, campañas y avisos de vencimiento).
 *
 *   art. 2  solo por los canales que el miembro autorizo.
 *   art. 3  de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sabados de
 *           8:00 a. m. a 3:00 p. m.; nunca los domingos ni los festivos. Tras
 *           un contacto, no mas de una vez al dia ni por varios canales en la
 *           misma semana.
 *   art. 5  a los mensajes comerciales y de publicidad: el miembro tiene que
 *           haberlos aceptado y puede cancelarlos en cualquier momento.
 *
 * Aqui solo hay funciones puras (sin base de datos), para poder probar los
 * bordes con fechas fijas. La lectura del historial y de la autorizacion de
 * mensajes comerciales del miembro (autorizacion_miembro, tipo
 * MENSAJES_COMERCIALES) esta en lib/contacto-miembro.js.
 *
 * Dos clases de mensaje:
 *   COMERCIAL  campañas (RQF-10), mensajes de retencion (RQF-09, "en riesgo")
 *              y cualquier otro que no sea un aviso. Piden la aceptacion
 *              explicita del miembro y un canal que el haya autorizado, ademas
 *              del horario y la frecuencia.
 *   AVISO      avisos del contrato sobre el plan (vencido, por vencer, acceso
 *              bloqueado). No piden el permiso comercial: el contrato
 *              (clausula 5) dice que el aviso llega por WhatsApp, asi que ese
 *              es su unico canal. Si cumplen el horario y la frecuencia.
 *
 * Hora de Colombia: America/Bogota. Colombia no tiene horario de verano desde
 * 1993, asi que la diferencia con UTC es siempre -05:00; las partes de una
 * fecha se leen con Intl en esa zona y las fechas que se construyen a partir
 * de una hora local usan el desfase fijo.
 *
 * Festivos: se calculan cada año, sin lista fija:
 *   - fijos: 1 de enero, 1 de mayo, 20 de julio, 7 de agosto, 8 y 25 de diciembre;
 *   - los que la Ley 51 de 1983 traslada al lunes siguiente: 6 de enero,
 *     19 de marzo, 29 de junio, 15 de agosto, 12 de octubre, 1 y 11 de noviembre;
 *   - los que dependen de la Pascua: jueves y viernes santos (sin traslado),
 *     Ascension (+39 dias), Corpus Christi (+60) y Sagrado Corazon (+68), los
 *     tres trasladados al lunes;
 *   - desde 2026, la Virgen de Chiquinquira: 9 de julio, con el descanso de
 *     la Ley 51 de 1983 (al lunes siguiente si no cae en lunes). Ley 2578 del
 *     1 de junio de 2026, art. 6; rige desde su promulgacion (art. 7), en el
 *     Diario Oficial 53.510 del 2 de junio de 2026 (texto en SUIN-Juriscol).
 *     El primero es el lunes 13 de julio de 2026.
 */

const ZONA = 'America/Bogota';
const DESFASE = '-05:00';

// Tipos de mensaje (el campo `tipo` que manda el panel) que son aviso
// contractual sobre el plan: les aplica el horario y la frecuencia, pero no
// el permiso comercial. Cualquier otro tipo (o ninguno: "riesgo",
// "reto-completado", una campaña) se trata como comercial, que es lo mas
// estricto.
const TIPOS_AVISO = new Set(['vencida', 'por-vencer', 'acceso-bloqueado', 'vencimiento']);

const CANALES = ['WHATSAPP', 'EMAIL'];
// El aviso del plan va por WhatsApp: es lo que informa el contrato.
const CANALES_AVISO = ['WHATSAPP'];

// Un plan vencido solo se avisa como aviso del contrato durante los primeros
// DIAS_AVISO_VENCIDA dias: en ese plazo el mensaje es "tu plan vencio,
// renuevalo", parte de la relacion vigente. Despues ya es un mensaje para
// recuperar al cliente, o sea comercial, y exige su aceptacion.
const DIAS_AVISO_VENCIDA = 30;
const NOMBRE_CANAL = { WHATSAPP: 'WhatsApp', EMAIL: 'correo' };

// Minutos desde la medianoche: [inicio, fin). A la hora de cierre en punto ya
// no se contacta (a las 7:00 p. m. en punto, o a las 3:00 p. m. el sabado).
const HORARIO = {
  1: [7 * 60, 19 * 60],
  2: [7 * 60, 19 * 60],
  3: [7 * 60, 19 * 60],
  4: [7 * 60, 19 * 60],
  5: [7 * 60, 19 * 60],
  6: [8 * 60, 15 * 60],
};

const TEXTO_HORARIO = 'de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------------------------------------------------------------------------
// Reloj. Las rutas y los jobs piden la hora aqui, para que las pruebas puedan
// fijarla (la regla de horario depende de ella).
// ---------------------------------------------------------------------------
const relojDelSistema = () => new Date();
let reloj = relojDelSistema;

/** La hora actual segun el reloj vigente. */
function ahora() {
  return reloj();
}

/** Solo para pruebas: fija el reloj. Sin argumento vuelve al del sistema. */
function establecerReloj(fn) {
  reloj = fn || relojDelSistema;
}

// ---------------------------------------------------------------------------
// Hora y fechas de Colombia
// ---------------------------------------------------------------------------
const formatoColombia = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

const dos = (n) => String(n).padStart(2, '0');

/**
 * Partes de un instante en hora de Colombia:
 * { anio, mes, dia, hora, minuto, segundo, diaSemana (0 = domingo), fecha: 'AAAA-MM-DD' }.
 */
function enColombia(instante) {
  const f = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(f.getTime())) throw new TypeError('Fecha invalida');
  const p = {};
  for (const { type, value } of formatoColombia.formatToParts(f)) p[type] = value;
  const anio = Number(p.year);
  const mes = Number(p.month);
  const dia = Number(p.day);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return {
    anio, mes, dia,
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
    diaSemana,
    fecha: `${anio}-${dos(mes)}-${dos(dia)}`,
  };
}

/** Instante que corresponde a una fecha (AAAA-MM-DD) y una hora de Colombia. */
function instanteColombia(fecha, minutos = 0) {
  return new Date(`${fecha}T${dos(Math.floor(minutos / 60))}:${dos(minutos % 60)}:00${DESFASE}`);
}

/** Suma dias a una fecha AAAA-MM-DD (calendario, sin horas). */
function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

const diaSemanaDe = (fecha) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** Lunes de la semana (de lunes a domingo) a la que pertenece la fecha. */
function lunesDeLaSemana(fecha) {
  const dow = diaSemanaDe(fecha);
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}

/** Instante en que empieza (lunes 00:00 de Colombia) la semana del instante. */
function inicioDeSemana(instante) {
  return instanteColombia(lunesDeLaSemana(enColombia(instante).fecha), 0);
}

// ---------------------------------------------------------------------------
// Festivos de Colombia
// ---------------------------------------------------------------------------

/** Domingo de Pascua (algoritmo de Meeus, Jones y Butcher), como AAAA-MM-DD. */
function domingoDePascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/** Ley 51 de 1983: si no cae en lunes, se corre al lunes siguiente. */
function alLunesSiguiente(fecha) {
  const dow = diaSemanaDe(fecha);
  return dow === 1 ? fecha : sumarDias(fecha, (8 - dow) % 7);
}

const cacheFestivos = new Map();

/**
 * Festivos de un año: Map de AAAA-MM-DD al nombre del festivo, ordenado por
 * fecha.
 */
function festivosColombia(anio) {
  if (cacheFestivos.has(anio)) return cacheFestivos.get(anio);
  const f = (mes, dia) => `${anio}-${dos(mes)}-${dos(dia)}`;
  const pascua = domingoDePascua(anio);
  const lista = [
    [f(1, 1), 'Año Nuevo'],
    [alLunesSiguiente(f(1, 6)), 'Día de los Reyes Magos'],
    [alLunesSiguiente(f(3, 19)), 'Día de San José'],
    [sumarDias(pascua, -3), 'Jueves Santo'],
    [sumarDias(pascua, -2), 'Viernes Santo'],
    [f(5, 1), 'Día del Trabajo'],
    [alLunesSiguiente(sumarDias(pascua, 39)), 'Ascensión del Señor'],
    [alLunesSiguiente(sumarDias(pascua, 60)), 'Corpus Christi'],
    [alLunesSiguiente(sumarDias(pascua, 68)), 'Sagrado Corazón'],
    [alLunesSiguiente(f(6, 29)), 'San Pedro y San Pablo'],
    [f(7, 20), 'Día de la Independencia'],
    [f(8, 7), 'Batalla de Boyacá'],
    [alLunesSiguiente(f(8, 15)), 'La Asunción de la Virgen'],
    [alLunesSiguiente(f(10, 12)), 'Día de la Raza'],
    [alLunesSiguiente(f(11, 1)), 'Todos los Santos'],
    [alLunesSiguiente(f(11, 11)), 'Independencia de Cartagena'],
    [f(12, 8), 'Día de la Inmaculada Concepción'],
    [f(12, 25), 'Navidad'],
  ];
  // Ley 2578 de 2026, art. 6: el 9 de julio, con el descanso de la Ley 51 de 1983;
  // rige desde su promulgacion (art. 7, Diario Oficial 53.510 del 2 de junio de 2026).
  if (anio >= 2026) lista.push([alLunesSiguiente(f(7, 9)), 'Virgen de Chiquinquirá']);
  lista.sort(([a], [b]) => a.localeCompare(b));
  const mapa = new Map(lista);
  cacheFestivos.set(anio, mapa);
  return mapa;
}

/** Nombre del festivo si la fecha (AAAA-MM-DD) lo es; si no, null. */
function festivo(fecha) {
  return festivosColombia(Number(fecha.slice(0, 4))).get(fecha) || null;
}

// ---------------------------------------------------------------------------
// Horario permitido (art. 3)
// ---------------------------------------------------------------------------

/** Ventana [inicio, fin) en minutos de un dia, o null si ese dia no se contacta. */
function ventanaDelDia(fecha) {
  if (festivo(fecha)) return null;
  return HORARIO[diaSemanaDe(fecha)] || null;
}

/**
 * ¿Se puede contactar en este instante? Devuelve
 * { permitido, razon?: 'DOMINGO' | 'FESTIVO' | 'ANTES' | 'DESPUES', festivo? }.
 */
function evaluarHorario(instante) {
  const c = enColombia(instante);
  const nombreFestivo = festivo(c.fecha);
  if (nombreFestivo) return { permitido: false, razon: 'FESTIVO', festivo: nombreFestivo };
  const ventana = HORARIO[c.diaSemana];
  if (!ventana) return { permitido: false, razon: 'DOMINGO' };
  const minutos = c.hora * 60 + c.minuto;
  if (minutos < ventana[0]) return { permitido: false, razon: 'ANTES' };
  if (minutos >= ventana[1]) return { permitido: false, razon: 'DESPUES' };
  return { permitido: true };
}

const dentroDeHorario = (instante) => evaluarHorario(instante).permitido;

/**
 * Primer instante desde `instante` (incluido) en que se puede contactar. Si ya
 * se puede, devuelve el mismo instante.
 */
function siguienteHorarioPermitido(instante) {
  const desde = instante instanceof Date ? instante : new Date(instante);
  if (dentroDeHorario(desde)) return desde;
  const c = enColombia(desde);
  const minutos = c.hora * 60 + c.minuto;
  // Con 19 festivos al año y dos domingos, nunca hacen falta mas de unos dias.
  for (let i = 0; i < 15; i += 1) {
    const fecha = sumarDias(c.fecha, i);
    const ventana = ventanaDelDia(fecha);
    if (!ventana) continue;
    if (i === 0 && minutos >= ventana[0]) continue; // hoy ya cerro
    return instanteColombia(fecha, ventana[0]);
  }
  throw new Error('No se encontro un horario permitido en dos semanas');
}

/** "lunes 16 de noviembre a las 7:00 a. m." en hora de Colombia. */
function describirInstante(instante) {
  const c = enColombia(instante);
  const h12 = c.hora % 12 === 0 ? 12 : c.hora % 12;
  const ampm = c.hora < 12 ? 'a. m.' : 'p. m.';
  return `${DIAS[c.diaSemana]} ${c.dia} de ${MESES[c.mes - 1]} a las ${h12}:${dos(c.minuto)} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Frecuencia (art. 3)
// ---------------------------------------------------------------------------

/**
 * Revisa el historial de contactos del miembro. `historial` es una lista de
 * { canal, fecha } con los contactos ya hechos (solo los que salieron).
 * Devuelve null si se puede, o { detalle: 'MISMO_DIA' | 'OTRO_CANAL', canal }.
 */
function evaluarFrecuencia(canal, instante, historial = []) {
  const hoy = enColombia(instante);
  const lunes = lunesDeLaSemana(hoy.fecha);
  for (const h of historial) {
    if (!h || !h.fecha) continue;
    const c = enColombia(h.fecha);
    if (c.fecha === hoy.fecha) return { detalle: 'MISMO_DIA', canal: h.canal };
  }
  for (const h of historial) {
    if (!h || !h.fecha) continue;
    const c = enColombia(h.fecha);
    if (lunesDeLaSemana(c.fecha) === lunes && h.canal && h.canal !== canal) {
      return { detalle: 'OTRO_CANAL', canal: h.canal };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/** 'AVISO' para los avisos de vencimiento o de acceso; 'COMERCIAL' para todo lo demas. */
function clasificarTipo(tipo) {
  return TIPOS_AVISO.has(String(tipo || '').toLowerCase()) ? 'AVISO' : 'COMERCIAL';
}

/**
 * Lee la autorizacion comercial venga el miembro de la base (snake_case, ver
 * lib/contacto-miembro.js) o de la API (camelCase).
 */
function preferenciasDe(miembro = {}) {
  const acepta = miembro.aceptaComerciales ?? miembro.acepta_mensajes_comerciales;
  const canales = miembro.canalesAutorizados !== undefined
    ? miembro.canalesAutorizados
    : miembro.canales_autorizados;
  return {
    aceptaComerciales: acepta === true,
    canalesAutorizados: Array.isArray(canales) ? canales.filter((c) => CANALES.includes(c)) : [],
  };
}

const primerNombre = (miembro) => String(miembro?.nombre || 'El miembro').trim().split(/\s+/)[0];

/**
 * ¿Se le puede escribir a este miembro por este canal, ahora?
 *
 *   miembro    { nombre, acepta_mensajes_comerciales | aceptaComerciales,
 *                canales_autorizados | canalesAutorizados }
 *   canal      'WHATSAPP' | 'EMAIL'
 *   instante   Date (la hora del contacto)
 *   historial  [{ canal, fecha }] contactos ya hechos esta semana
 *   opciones   { clase: 'COMERCIAL' (por defecto) | 'AVISO' }
 *
 * Devuelve { puede: true, clase } o
 * { puede: false, clase, motivo, mensaje, siguiente? } con motivo:
 *   NO_AUTORIZA          no acepto mensajes comerciales (solo COMERCIAL)
 *   CANAL_NO_AUTORIZADO  ese canal no esta entre los que autorizo (o, para
 *                        un aviso, no es WhatsApp)
 *   FUERA_DE_HORARIO     domingo, festivo o fuera de la franja; trae `siguiente`
 *   FRECUENCIA           ya se le contacto hoy, u otro canal esta semana
 *
 * El orden importa: primero el permiso y el canal (no cambian esperando),
 * luego el horario (cambia con la hora) y al final la frecuencia.
 */
function puedeContactar(miembro, canal, instante = ahora(), historial = [], opciones = {}) {
  const clase = opciones.clase === 'AVISO' ? 'AVISO' : 'COMERCIAL';
  const nombre = primerNombre(miembro);
  const no = (motivo, mensaje, extra = {}) => ({ puede: false, clase, motivo, mensaje, ...extra });

  if (!CANALES.includes(canal)) {
    return no('CANAL_NO_AUTORIZADO', `El canal ${canal} no está permitido.`);
  }

  if (clase === 'COMERCIAL') {
    const pref = preferenciasDe(miembro);
    if (!pref.aceptaComerciales) {
      return no('NO_AUTORIZA', `${nombre} no ha aceptado recibir mensajes comerciales del gimnasio.`);
    }
    if (!pref.canalesAutorizados.includes(canal)) {
      return no('CANAL_NO_AUTORIZADO', `${nombre} no autorizó que le envíen mensajes comerciales por ${NOMBRE_CANAL[canal]}.`);
    }
  } else if (!CANALES_AVISO.includes(canal)) {
    return no('CANAL_NO_AUTORIZADO', `Los avisos del plan van por WhatsApp, como dice el contrato; no por ${NOMBRE_CANAL[canal]}.`);
  }

  const horario = evaluarHorario(instante);
  if (!horario.permitido) {
    const siguiente = siguienteHorarioPermitido(instante);
    const porque = horario.razon === 'FESTIVO' ? `Hoy es festivo (${horario.festivo}). `
      : horario.razon === 'DOMINGO' ? 'Hoy es domingo. '
      : '';
    return no('FUERA_DE_HORARIO',
      `${porque}La Ley 2300 de 2023 solo permite contactar ${TEXTO_HORARIO}. Podrás hacerlo desde el ${describirInstante(siguiente)}`,
      { siguiente });
  }

  const frecuencia = evaluarFrecuencia(canal, instante, historial);
  if (frecuencia) {
    const mensaje = frecuencia.detalle === 'MISMO_DIA'
      ? `A ${nombre} ya se le contactó hoy. La Ley 2300 de 2023 permite un solo contacto al día.`
      : `A ${nombre} ya se le contactó esta semana por ${NOMBRE_CANAL[frecuencia.canal] || frecuencia.canal}. La Ley 2300 de 2023 no permite contactarlo por otro canal en la misma semana.`;
    return no('FRECUENCIA', mensaje, { detalle: frecuencia.detalle });
  }

  return { puede: true, clase };
}

module.exports = {
  ZONA,
  CANALES,
  CANALES_AVISO,
  DIAS_AVISO_VENCIDA,
  NOMBRE_CANAL,
  TIPOS_AVISO,
  TEXTO_HORARIO,
  ahora,
  establecerReloj,
  enColombia,
  instanteColombia,
  sumarDias,
  lunesDeLaSemana,
  inicioDeSemana,
  domingoDePascua,
  festivosColombia,
  festivo,
  evaluarHorario,
  dentroDeHorario,
  siguienteHorarioPermitido,
  describirInstante,
  evaluarFrecuencia,
  clasificarTipo,
  preferenciasDe,
  puedeContactar,
};
