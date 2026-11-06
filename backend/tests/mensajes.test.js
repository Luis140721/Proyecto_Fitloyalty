const {
  avisoVenceHoy,
  avisoVencimiento,
  bienvenidaConQr,
  contratoMembresia,
  enPalabras,
  mensajeParaMiembro,
  telefonoWhatsapp,
} = require('../src/lib/mensajes');

describe('telefonoWhatsapp', () => {
  test.each([
    ['rechaza teléfonos demasiado cortos', '123-456', undefined, null],
    ['agrega el indicativo colombiano por defecto', '300 123 4567', undefined, '573001234567'],
    ['usa el indicativo proporcionado', '3001234567', '+1', '13001234567'],
    ['conserva un número que ya incluye indicativo', '+573001234567', undefined, '573001234567'],
  ])('%s', (_description, phone, prefix, expected) => {
    expect(telefonoWhatsapp(phone, prefix)).toBe(expected);
  });
});

describe('mensajeParaMiembro', () => {
  test.each([
    ['acceso-bloqueado', 'no pudimos dejarte pasar', 'membresía vencida'],
    ['vencida', 'Tu plan vencio', 'hace 2 dias'],
    ['por-vencer', 'tu plan vence', 'en 2 dias'],
    ['abandono', 'sin venir', '30 dias'],
  ])('genera un mensaje para el tipo %s', (type, expected, detail) => {
    const message = mensajeParaMiembro(type, 'Fit Gym', 'Ana María', detail);

    expect(message).toContain(expected);
    expect(message).toContain(detail);
    expect(message).toContain('Hola Ana,');
  });

  test('tolera datos opcionales vacíos', () => {
    expect(mensajeParaMiembro('otro', '', '', '')).toContain('Hola , te saludamos de .');
  });
});

describe('enPalabras', () => {
  test.each([
    [null, 'pasado', 'un buen tiempo'],
    [undefined, 'futuro', 'un buen tiempo'],
    [0, 'pasado', 'hoy'],
    [0, 'futuro', 'hoy'],
    [1, 'pasado', 'hace 1 dia'],
    [2, 'pasado', 'hace 2 dias'],
    [1, 'futuro', 'en 1 dia'],
    [3, 'futuro', 'en 3 dias'],
    [1, 'plano', '1 dia'],
    [31, 'plano', '31 dias'],
  ])('formatea %s en modo %s', (days, mode, expected) => {
    expect(enPalabras(days, mode)).toBe(expected);
  });
});

describe('plantillas de WhatsApp', () => {
  test('bienvenida limita días negativos y usa treinta ante valores inválidos', () => {
    expect(bienvenidaConQr({ nombre: 'Ana', gymNombre: 'Fit Gym', diasParaVencer: -2 }))
      .toContain('vigente por 0 dias');
    expect(bienvenidaConQr({ nombre: 'Ana', gymNombre: 'Fit Gym', diasParaVencer: NaN }))
      .toContain('vigente por 30 dias');
  });

  test('aviso de vencimiento diferencia hoy, mañana y próximos días', () => {
    const details = { nombre: 'Ana', gymNombre: 'Fit Gym', tipoPlan: '', fechaFin: null };

    expect(avisoVencimiento({ ...details, diasRestantes: 0 })).toContain('vence *hoy* (proximamente)');
    expect(avisoVencimiento({ ...details, diasRestantes: 1 })).toContain('vence *mañana* (proximamente)');
    expect(avisoVencimiento({ ...details, diasRestantes: 8 })).toContain('vence en *8 dias*');
    expect(avisoVencimiento({ ...details, diasRestantes: 2, fechaFin: 'fecha-inválida' }))
      .toContain('Invalid Date');
  });

  test('el aviso del día de vencimiento admite tipo de plan por defecto', () => {
    expect(avisoVenceHoy({
      nombre: 'Ana',
      gymNombre: 'Fit Gym',
      tipoPlan: null,
      fechaFin: null,
    })).toContain('Tu plan *actual* se vence *hoy* (hoy).');
  });

  test('el contrato completa valores por defecto cuando no se proporcionan datos de pago', () => {
    const contract = contratoMembresia({
      nombre: 'Ana',
      gymNombre: 'Fit Gym',
      fechaInicio: 'fecha-inválida',
      fechaFin: null,
      valorPagado: 'no numérico',
      telefono: '3001234567',
    });

    expect(contract).toContain('Plan contratado');
    expect(contract).toContain('la fecha acordada');
    expect(contract).toContain('el valor acordado');
    expect(contract).toContain('el medio acordado');
    expect(contract).toContain('Ley 1581 de 2012');
  });

  test('formatea plan, fechas válidas y pago en el contrato', () => {
    const contract = contratoMembresia({
      nombre: 'Ana',
      gymNombre: 'Fit Gym',
      planTipo: 'Mensual',
      fechaInicio: '2026-11-01T00:00:00.000Z',
      fechaFin: '2026-12-01T00:00:00.000Z',
      valorPagado: 125000,
      metodoPago: 'transferencia',
    });

    expect(contract).toContain('Mensual');
    expect(contract).toContain('transferencia');
    expect(contract).toContain('$125.000 COP');
    expect(contract).not.toContain('la fecha acordada');
  });
});
