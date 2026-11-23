/**
 * lib/formularioMiembro.js
 *
 * Reglas puras del formulario de alta de miembros (MiembrosPage), para poder
 * probarlas sin React (frontend/tests/formularioMiembro.test.js).
 *
 * aplicarCambio(prev, campo, valor, opciones) devuelve el formulario nuevo a
 * partir del ANTERIOR. MiembrosPage lo usa con setForm((prev) => ...): asi dos
 * cambios en el mismo evento se suman en vez de pisarse. Antes se armaba
 * { ...form, [campo]: valor } sobre el `form` del render, y si un evento hacia
 * dos cambios (por ejemplo, quitar el ultimo canal de mensajes comerciales y
 * apagar la aceptacion, RQNF-16), el segundo borraba el primero.
 *
 *   opciones.gymConfig    configuracion del gimnasio (precios por plan)
 *   opciones.estadoPago   (valorTotal, valorPagado) -> 'PAGADO' | 'PARCIAL' | 'PENDIENTE'
 */
export function aplicarCambio(prev, campo, valor, { gymConfig = null, estadoPago = null } = {}) {
  const sig = { ...prev, [campo]: valor };

  /*
   * Al cambiar el plan se propone el precio que el gimnasio tenga
   * configurado. Solo si hay uno de verdad: el valor llega como cadena
   * ("0.00"), y una cadena vacia de contenido sigue siendo "verdadera" en
   * JavaScript, asi que un `if (valor)` a secas ponia el precio en cero y
   * borraba lo que el usuario habia escrito.
   */
  if (campo === 'tipo_plan' && gymConfig) {
    const sugerido = Number(gymConfig[`plan_${String(valor).toLowerCase()}_valor`]);
    if (Number.isFinite(sugerido) && sugerido > 0) {
      sig.valor_total = String(Math.round(sugerido));
    }
  }

  // Si cambian valores de pago, se recalcula el estado.
  if ((campo === 'valor_total' || campo === 'valor_pagado') && estadoPago) {
    sig.estado_pago = estadoPago(sig.valor_total, sig.valor_pagado);
  }

  return sig;
}
