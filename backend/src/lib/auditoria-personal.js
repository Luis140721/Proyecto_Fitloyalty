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
  const detalle = { eventos: [], antes: {}, despues: {} };
  if (despues.activo !== antes.activo) {
    detalle.eventos.push(despues.activo ? 'REACTIVADA' : 'DESACTIVADA');
    detalle.antes.activo = antes.activo;
    detalle.despues.activo = despues.activo;
  }
  if (despues.rol !== antes.rol) {
    detalle.eventos.push('ROL_CAMBIADO');
    detalle.antes.rol = antes.rol;
    detalle.despues.rol = despues.rol;
  }
  return detalle.eventos.length ? detalle : null;
}

module.exports = { cambiosDeCuenta };
