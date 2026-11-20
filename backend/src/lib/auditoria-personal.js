/**
 * lib/auditoria-personal.js
 *
 * Auditoria de los cambios a las cuentas del personal (HU-04, criterio 4).
 *
 * cambiosDeCuenta compara la cuenta antes y despues de un PATCH, con la forma
 * { activo, rol } (rol por nombre: 'ADMINISTRADOR', 'RECEPCIONISTA'), y devuelve
 * el detalle que se guarda en auditoria, o null si no hay nada que registrar.
 */
function cambiosDeCuenta(antes, despues) {
  if (antes.activo && despues.activo === false) {
    return { eventos: ['DESACTIVADA'], antes: { activo: true }, despues: { activo: false } };
  }
  if (!antes.activo && despues.activo === true) {
    return { eventos: ['REACTIVADA'], antes: { activo: false }, despues: { activo: true } };
  }
  if (despues.rol !== antes.rol) {
    return { eventos: ['ROL_CAMBIADO'], antes: { rol: antes.rol }, despues: { rol: despues.rol } };
  }
  return null;
}

module.exports = { cambiosDeCuenta };
