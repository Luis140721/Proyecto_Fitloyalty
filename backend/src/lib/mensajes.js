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
