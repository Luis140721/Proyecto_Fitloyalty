/**
 * Entornos donde se puede mostrar informacion de prueba: el codigo de
 * recuperacion en pantalla (modo demo) o el asunto completo de un correo en el
 * log. Es una lista blanca: si NODE_ENV falta o trae otro valor (por ejemplo
 * staging), se trata como produccion y no se muestra nada.
 */
const ENTORNOS_DE_DESARROLLO = ['development', 'test'];

function esEntornoDeDesarrollo() {
  return ENTORNOS_DE_DESARROLLO.includes(process.env.NODE_ENV);
}

module.exports = { esEntornoDeDesarrollo, ENTORNOS_DE_DESARROLLO };
