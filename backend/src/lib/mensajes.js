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
};
