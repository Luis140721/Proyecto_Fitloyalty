/**
 * RQNF-16 en el alta de miembros del panel: el interruptor de mensajes
 * comerciales y sus canales (src/lib/autorizaciones.js y
 * src/lib/formularioMiembro.js).
 *
 * Regresion: en «Nuevo miembro», marcar WhatsApp, encender el interruptor y
 * desmarcar WhatsApp dejaba el interruptor apagado pero WhatsApp marcado. El
 * componente hace dos cambios en el mismo evento (onCanales y onChange) y el
 * formulario los armaba sobre el `form` viejo, asi que el segundo pisaba al
 * primero. Ahora MiembrosPage usa setForm((prev) => aplicarCambio(prev, ...)).
 *
 * Corre con el runner de Node (`node --test tests/formularioMiembro.test.js`
 * desde frontend/), igual que fechas.test.js, y con Vitest cuando llegue.
 */
import assert from 'node:assert/strict';
import { aplicarCambio } from '../src/lib/formularioMiembro.js';
import { cambiarCanalComercial, puedeAceptarComerciales } from '../src/lib/autorizaciones.js';

const { describe, it } = process.env.VITEST ? await import('vitest') : await import('node:test');

/**
 * Estado como el de React: setForm con funcion encola actualizaciones y, al
 * terminar el evento, se aplican en orden sobre el estado de ese momento.
 */
function estadoReact(inicial) {
  let estado = inicial;
  let cola = [];
  return {
    get valor() { return estado; },
    setForm: (u) => { cola.push(u); },
    terminarEvento: () => {
      for (const u of cola) estado = typeof u === 'function' ? u(estado) : u;
      cola = [];
    },
  };
}

/** Lo que hace CasillaMensajesComerciales al marcar o desmarcar un canal. */
function alternarCanal(form, handleFormChange, canal, marcado) {
  const r = cambiarCanalComercial(
    { acepta: form.acepta_mensajes_comerciales, canales: form.canales_comerciales }, canal, marcado
  );
  handleFormChange('canales_comerciales', r.canales);
  if (r.acepta !== Boolean(form.acepta_mensajes_comerciales)) handleFormChange('acepta_mensajes_comerciales', r.acepta);
}

const VACIO = { acepta_mensajes_comerciales: false, canales_comerciales: [], valor_total: '', valor_pagado: '0' };
const estadoPago = (total, pagado) => (Number(pagado) >= Number(total) ? 'PAGADO' : Number(pagado) > 0 ? 'PARCIAL' : 'PENDIENTE');

describe('cambiarCanalComercial (la regla del componente)', () => {
  it('marca solo lo que se marca y en el orden de siempre', () => {
    assert.deepEqual(cambiarCanalComercial({ acepta: false, canales: [] }, 'EMAIL', true), { canales: ['EMAIL'], acepta: false });
    assert.deepEqual(cambiarCanalComercial({ acepta: true, canales: ['EMAIL'] }, 'WHATSAPP', true), { canales: ['WHATSAPP', 'EMAIL'], acepta: true });
  });

  it('quitar el ultimo canal apaga la aceptacion', () => {
    assert.deepEqual(cambiarCanalComercial({ acepta: true, canales: ['WHATSAPP'] }, 'WHATSAPP', false), { canales: [], acepta: false });
  });

  it('sin canal no se puede encender', () => {
    assert.equal(puedeAceptarComerciales([]), false);
    assert.equal(puedeAceptarComerciales(null), false);
    assert.equal(puedeAceptarComerciales(['EMAIL']), true);
  });
});

describe('alta de miembro: dos cambios en el mismo evento', () => {
  it('marcar WhatsApp, encender y desmarcar WhatsApp deja todo apagado y sin canales', () => {
    const s = estadoReact({ ...VACIO });
    const handleFormChange = (campo, valor) => s.setForm((prev) => aplicarCambio(prev, campo, valor, { estadoPago }));

    alternarCanal(s.valor, handleFormChange, 'WHATSAPP', true);
    s.terminarEvento();
    assert.deepEqual(s.valor.canales_comerciales, ['WHATSAPP']);

    handleFormChange('acepta_mensajes_comerciales', true);
    s.terminarEvento();
    assert.equal(s.valor.acepta_mensajes_comerciales, true);

    alternarCanal(s.valor, handleFormChange, 'WHATSAPP', false); // dos cambios en un evento
    s.terminarEvento();
    assert.equal(s.valor.acepta_mensajes_comerciales, false);
    assert.deepEqual(s.valor.canales_comerciales, []);
  });

  it('con la version anterior ({ ...form, campo: valor } sobre el form viejo) el segundo cambio pisaba al primero', () => {
    const s = estadoReact({ ...VACIO, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
    const viejo = (campo, valor) => s.setForm({ ...s.valor, [campo]: valor });
    alternarCanal(s.valor, viejo, 'WHATSAPP', false);
    s.terminarEvento();
    assert.equal(s.valor.acepta_mensajes_comerciales, false);
    assert.deepEqual(s.valor.canales_comerciales, ['WHATSAPP']); // el defecto que se corrigio
  });
});

describe('aplicarCambio: la logica que ya tenia el formulario sigue igual', () => {
  it('al cambiar el plan propone el precio configurado (solo si hay uno de verdad)', () => {
    const gymConfig = { plan_mensual_valor: '80000.00', plan_trimestral_valor: '0.00' };
    assert.equal(aplicarCambio({ ...VACIO, valor_total: '5' }, 'tipo_plan', 'MENSUAL', { gymConfig }).valor_total, '80000');
    assert.equal(aplicarCambio({ ...VACIO, valor_total: '5' }, 'tipo_plan', 'TRIMESTRAL', { gymConfig }).valor_total, '5');
    assert.equal(aplicarCambio({ ...VACIO, valor_total: '5' }, 'tipo_plan', 'MENSUAL', {}).valor_total, '5');
  });

  it('recalcula el estado del pago con el valor nuevo y el otro del formulario anterior', () => {
    assert.equal(aplicarCambio({ ...VACIO, valor_total: '100' }, 'valor_pagado', '100', { estadoPago }).estado_pago, 'PAGADO');
    assert.equal(aplicarCambio({ ...VACIO, valor_pagado: '50' }, 'valor_total', '100', { estadoPago }).estado_pago, 'PARCIAL');
    assert.equal(aplicarCambio({ ...VACIO }, 'nombre', 'Ana', { estadoPago }).estado_pago, undefined);
  });

  it('no modifica el formulario anterior', () => {
    const prev = { ...VACIO };
    const sig = aplicarCambio(prev, 'nombre', 'Ana');
    assert.notEqual(sig, prev);
    assert.equal(prev.nombre, undefined);
  });
});
