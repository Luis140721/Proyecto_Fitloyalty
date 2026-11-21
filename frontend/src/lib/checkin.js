/**
 * lib/checkin.js
 *
 * RQNF-04: arma lo que la pantalla de Check-in le manda a POST /admin/checkin.
 *
 * El cursor arranca en el campo del QR (autoFocus), así que quien no conoce
 * la pantalla suele escribir ahí el documento. Antes eso se mandaba como un
 * código QR y salía «Miembro no encontrado». Un documento escrito en ese
 * campo ahora se registra por documento, como ingreso manual.
 *
 * Los códigos de FitLoyalty nunca son solo números: el QR fijo es
 * «FL-<gimnasio>-<código>» (o su versión cifrada, en hexadecimal con «:»)
 * y el QR dinámico es «FLD<id>T<código>». Por eso un valor de solo dígitos
 * (o un NIT con su dígito de verificación) se toma como documento.
 */

export const PATRON_DOCUMENTO = /^\d{4,15}(-\d)?$/;

export function pareceDocumento(valor) {
  return PATRON_DOCUMENTO.test(String(valor ?? '').trim());
}

/**
 * @param {object} datos
 * @param {string} datos.codigo        lo escrito en el campo del QR
 * @param {string} datos.documento     lo escrito en «O por documento»
 * @param {string} datos.metodo        el selector «Método» (QR, MANUAL o CODIGOBARRAS)
 * @param {boolean} datos.porDocumento true cuando se pulsó Enter en «O por documento»
 * @returns {{metodo: string, codigo?: string, documento?: string} | null}
 *          null cuando no hay nada que registrar.
 */
export function armarPayloadCheckin({ codigo = '', documento = '', metodo = 'QR', porDocumento = false } = {}) {
  const cod = String(codigo ?? '').trim();
  const doc = String(documento ?? '').trim();

  let valorDocumento = '';
  if (cod && !porDocumento) {
    if (!pareceDocumento(cod)) return { metodo, codigo: cod };
    valorDocumento = cod;
  } else if (doc) {
    valorDocumento = doc;
  }
  if (!valorDocumento) return null;

  // Escribir el documento es un ingreso manual: el selector arranca en QR y,
  // sin esto, el ingreso quedaba guardado como QR.
  return { metodo: metodo === 'QR' ? 'MANUAL' : metodo, documento: valorDocumento };
}
