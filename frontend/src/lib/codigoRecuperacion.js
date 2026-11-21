/**
 * Reglas del codigo de recuperacion de 6 digitos de ForgotPasswordPage.
 *
 * Son funciones puras (sin DOM ni estado de React) para poder probar sus
 * valores limite sin montar la pagina. La pagina solo las llama y se encarga
 * del foco y del estado.
 */
export const LARGO_CODIGO = 6;

/** Deja solo los digitos de lo que se pego o tecleo, hasta 6. */
export function limpiarCodigo(texto) {
  return String(texto ?? '').replace(/\D/g, '').slice(0, LARGO_CODIGO);
}

/**
 * Reparte un codigo pegado en las 6 casillas. Devuelve null si no trae
 * ningun digito. `foco` es la casilla que sigue: la primera vacia, o la
 * ultima si se llenaron todas.
 */
export function repartirCodigo(texto) {
  const limpio = limpiarCodigo(texto);
  if (!limpio) return null;
  const digitos = Array.from({ length: LARGO_CODIGO }, (_, i) => limpio[i] ?? '');
  return { digitos, foco: Math.min(limpio.length, LARGO_CODIGO - 1) };
}

/**
 * Backspace o Supr en la casilla `i`: borra su digito. Si ya estaba vacia,
 * borra el de la anterior y el foco vuelve a esa. En la primera casilla
 * vacia no hace nada.
 */
export function borrarDigito(digitos, i) {
  const siguiente = [...digitos];
  if (siguiente[i]) {
    siguiente[i] = '';
    return { digitos: siguiente, foco: i };
  }
  if (i > 0) {
    siguiente[i - 1] = '';
    return { digitos: siguiente, foco: i - 1 };
  }
  return { digitos: siguiente, foco: i };
}

/** El codigo se puede verificar solo con las 6 casillas llenas. */
export function codigoCompleto(digitos) {
  return digitos.join('').length === LARGO_CODIGO;
}
