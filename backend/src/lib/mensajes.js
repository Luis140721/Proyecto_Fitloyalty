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

module.exports = {
  telefonoWhatsapp, mensajeParaMiembro, enPalabras,
  bienvenidaConQr, avisoVencimiento, avisoVenceHoy,
  contratoMembresia,
};

// ---------------------------------------------------------------------------
// Contrato de membresia - texto prod-ready para enviar al miembro
// ---------------------------------------------------------------------------
// Por que existe:
//   El profe (Luis) pidio un contrato que "blinde" a los gimnasios. Este
//   template es una propuesta de terminos y condiciones completa para que
//   cada gimnasio la envie por WhatsApp al miembro nuevo. NO requiere
//   firma del miembro (queda como constancia de envio + aceptacion al
//   usar el QR), pero incluye todas las clausulas que un gimnasio en
//   Colombia normalmente quiere tener:
//
//     - Identificacion de las partes
//     - Objeto y duracion
//     - Precio y forma de pago
//     - Acceso por QR personal e intransferible
//     - Bloqueo automatico por vencimiento (clave para FitLoyalty)
//     - Politica de cancelacion y no reembolso
//     - Declaracion de salud
//     - Limitacion de responsabilidad del gimnasio (esto blinda al gym)
//     - Tratamiento de datos personales (Ley 1581 de 2012 Colombia)
//     - Autorizacion de uso de imagen (opcional)
//     - Aceptacion expresa
//
// Como WhatsApp corta mucho los mensajes muy largos, el template usa
// asteriscos para negrita (markdown ligero que WhatsApp renderiza).
//
function fmtFecha(d) {
    if (!d) return 'la fecha acordada';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return 'la fecha acordada';
    return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtMonto(v) {
    if (v == null) return 'el valor acordado';
    const n = Number(v);
    if (!Number.isFinite(n)) return 'el valor acordado';
    return `$${n.toLocaleString('es-CO')} COP`;
}

function contratoMembresia({
    nombre, gymNombre, planTipo,
    fechaInicio, fechaFin,
    valorPagado, metodoPago,
    telefono,
}) {
    return [
        `*TERMINOS Y CONDICIONES DE MEMBRESIA*`,
        `*${G(gymNombre)}*`,
        ``,
        `Hola *${G(nombre)}*. Bienvenido/a a ${G(gymNombre)}.`,
        `Por favor lee estos terminos, que aplican a tu membresia:`,
        ``,
        `*1. Objeto.* El gimnasio te entrega acceso a sus instalaciones,`,
        `maquinas y servicios contratados, mediante un codigo QR personal`,
        `e intransferible que deberas presentar en cada ingreso.`,
        ``,
        `*2. Plan y duracion.* ${G(planTipo) || 'Plan contratado'}, vigente`,
        `del ${fmtFecha(fechaInicio)} al ${fmtFecha(fechaFin)}. Al vencer`,
        `podras renovar por periodos iguales.`,
        ``,
        `*3. Precio y pago.* Valor: ${fmtMonto(valorPagado)},`,
        `pago por ${G(metodoPago) || 'el medio acordado'}. El pago cubre`,
        `el periodo contratado; no es transferible ni reembolsable, salvo`,
        `lo previsto en la clausula de cancelacion.`,
        ``,
        `*4. Codigo QR.* Es personal e intransferible. Esta prohibido`,
        `prestarlo, fotografiarlo para terceros o reproducirlo. Su uso`,
        `indebido es responsabilidad del miembro y puede generar suspension`,
        `de la membresia sin devolucion.`,
        ``,
        `*5. Bloqueo por vencimiento.* Si tu membresia vence y no es`,
        `renovada, el codigo QR dejara de permitir el ingreso de forma`,
        `automatica. No se permite el acceso con membresia vencida.`,
        ``,
        `*6. Cancelacion y devoluciones.* Puedes cancelar tu membresia`,
        `en cualquier momento avisando a recepcion o por este mismo medio.`,
        `*NO* hay devolucion de dinero por periodos ya pagados ni por dias`,
        `no usados. Si cancelas antes del primer uso, se aplicara el`,
        `reembolso conforme a la ley del consumidor (Estatuto del`,
        `Consumidor, Ley 1480 de 2011).`,
        ``,
        `*7. Condiciones de salud.* Declaras estar en condiciones fisicas`,
        `aptas para la actividad deportiva. Si tienes lesiones,`,
        `condiciones medicas o estas en embarazo, debes informar al`,
        `entrenador antes de entrenar y presentar certificado medico`,
        `cuando el gimnasio lo requiera. Realizas las actividades bajo tu`,
        `propia responsabilidad.`,
        ``,
        `*8. Limitacion de responsabilidad del gimnasio.* El gimnasio no`,
        `se hace responsable por lesiones, accidentes o danos derivados`,
        `de la practica deportiva, del uso inadecuado de equipos, del`,
        `incumplimiento de las normas internas o de la ingestion de`,
        `sustancias no recomendadas por personal medico. Tampoco responde`,
        `por objetos personales dejados en las instalaciones.`,
        ``,
        `*9. Reglas de uso.* Debes respetar los horarios, las normas de`,
        `convivencia, el cuidado del equipo, las indicaciones del`,
        `personal y la capacidad maxima de las zonas. El gimnasio puede`,
        `suspender el acceso a quien incumpla.`,
        ``,
        `*10. Datos personales (Ley 1581 de 2012).* Autorizas al gimnasio`,
        `a recolectar y tratar tus datos personales (nombre, documento,`,
        `telefono, correo, foto y datos biomedicos que voluntariamente`,
        `compartas) para:`,
        `   - Gestion de tu membresia, pagos y renovaciones`,
        `   - Avisos de vencimiento, promociones y comunicaciones`,
        `   - Cumplimiento de obligaciones legales y contables`,
        `   - Seguridad dentro de las instalaciones (videovigilancia)`,
        `Tus derechos como titular: conocer, actualizar, rectificar y`,
        `suprimir tus datos. Para ejercerlos escribe a la administracion`,
        `del gimnasio.`,
        ``,
        `*11. Uso de imagen.* Salvo que indiques lo contrario por escrito,`,
        `autorizas al gimnasio a usar fotos y videos tomados dentro de`,
        `las instalaciones (en los que aparezcas de manera accesoria,`,
        `grupal o de fondo) en sus canales informativos y comerciales.`,
        `Esta autorizacion es revocable en cualquier momento.`,
        ``,
        `*12. Aceptacion.* La recepcion, uso del codigo QR para ingresar,`,
        `o responder a este mensaje con "ACEPTO", constituye tu`,
        `aceptacion expresa de todos los terminos aqui descritos.`,
        ``,
        `Cualquier duda, escribenos por este medio o pasate por`,
        `recepcion. ¡Bienvenido/a!`,
        ``,
        `Atte. La administracion de ${G(gymNombre)}`,
    ].join('\n');
}
