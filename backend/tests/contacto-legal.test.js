/**
 * RQNF-16: reglas de la Ley 2300 de 2023 (lib/contacto-legal.js).
 *
 *   - festivos de Colombia calculados (fijos, Ley 51 de 1983, Pascua y, desde
 *     2026, la Virgen de Chiquinquirá de la Ley 2578), con las listas
 *     completas de 2026 y 2027 (19 cada año);
 *   - horario: bordes de lunes a viernes (7:00 a. m. a 7:00 p. m.), del sabado
 *     (8:00 a. m. a 3:00 p. m.), domingos y festivos, y el siguiente horario
 *     permitido;
 *   - frecuencia: una vez al dia y un solo canal por semana (de lunes a
 *     domingo, hora de Colombia);
 *   - puedeContactar: permiso comercial, canales y el orden de las reglas.
 *
 * Todas las horas se escriben en UTC; Colombia es UTC-5 todo el año.
 */
const legal = require('../src/lib/contacto-legal');

const {
  festivosColombia, festivo, domingoDePascua, evaluarHorario, dentroDeHorario,
  siguienteHorarioPermitido, describirInstante, enColombia, evaluarFrecuencia,
  puedeContactar, clasificarTipo, inicioDeSemana, lunesDeLaSemana,
} = legal;

/** Instante a partir de una hora de Colombia: co('2026-11-17 07:00'). */
const co = (texto) => new Date(`${texto.replace(' ', 'T')}:00-05:00`);

describe('festivos de Colombia', () => {
  test('2026: los 19 festivos (con la Virgen de Chiquinquirá, lunes 13 de julio)', () => {
    expect([...festivosColombia(2026).keys()]).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
      '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-13', '2026-07-20',
      '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08',
      '2026-12-25',
    ]);
  });

  test('2027: los 19 festivos (con la Virgen de Chiquinquirá, lunes 12 de julio)', () => {
    expect([...festivosColombia(2027).keys()]).toEqual([
      '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26', '2027-05-01',
      '2027-05-10', '2027-05-31', '2027-06-07', '2027-07-05', '2027-07-12', '2027-07-20',
      '2027-08-07', '2027-08-16', '2027-10-18', '2027-11-01', '2027-11-15', '2027-12-08',
      '2027-12-25',
    ]);
  });

  test('Virgen de Chiquinquirá (Ley 2578 de 2026): 9 de julio al lunes siguiente, solo desde 2026', () => {
    expect(festivo('2026-07-09')).toBeNull();                   // jueves
    expect(festivo('2026-07-13')).toBe('Virgen de Chiquinquirá');
    expect(festivo('2027-07-12')).toBe('Virgen de Chiquinquirá');
    expect(festivo('2030-07-15')).toBe('Virgen de Chiquinquirá'); // el 9 cae martes
    // 2029: el 9 de julio cae en lunes, asi que no se corre.
    expect(festivo('2029-07-09')).toBe('Virgen de Chiquinquirá');
    expect(festivo('2029-07-16')).toBeNull();
    expect(festivo('2029-07-10')).toBeNull();
    expect(festivo('2025-07-14')).toBeNull();                   // antes de la ley no lo era
    // 2025: sin Chiquinquirá, y San Pedro y el Sagrado Corazón cayeron el
    // mismo lunes 30 de junio, así que son 17 días festivos.
    expect(festivosColombia(2025).size).toBe(17);
    expect(festivo('2025-06-30')).not.toBeNull();
    // un lunes festivo: el martes siguiente a las 7:00 es el siguiente horario
    expect(siguienteHorarioPermitido(co('2026-07-11 16:00')).toISOString()).toBe(co('2026-07-14 07:00').toISOString());
  });

  test.each([
    [2024, '2024-03-31'], [2025, '2025-04-20'], [2026, '2026-04-05'], [2027, '2027-03-28'], [2038, '2038-04-25'],
  ])('domingo de Pascua de %i: %s', (anio, fecha) => {
    expect(domingoDePascua(anio)).toBe(fecha);
  });

  test('los que dependen de la Pascua en 2026: jueves y viernes santos sin traslado, los otros al lunes', () => {
    expect(festivo('2026-04-02')).toBe('Jueves Santo');
    expect(festivo('2026-04-03')).toBe('Viernes Santo');
    expect(festivo('2026-05-18')).toBe('Ascensión del Señor'); // Pascua + 39 = jueves 14 de mayo
    expect(festivo('2026-06-08')).toBe('Corpus Christi');      // Pascua + 60 = jueves 4 de junio
    expect(festivo('2026-06-15')).toBe('Sagrado Corazón');     // Pascua + 68 = viernes 12 de junio
    expect(festivo('2026-05-14')).toBeNull();
  });

  test('Ley 51 de 1983: se corren al lunes siguiente', () => {
    expect(festivo('2026-01-06')).toBeNull();                  // martes
    expect(festivo('2026-01-12')).toBe('Día de los Reyes Magos');
    expect(festivo('2026-11-01')).toBeNull();                  // domingo
    expect(festivo('2026-11-02')).toBe('Todos los Santos');
    expect(festivo('2027-06-29')).toBeNull();                  // martes
    expect(festivo('2027-07-05')).toBe('San Pedro y San Pablo');
  });

  test('Ley 51: el que ya cae en lunes se queda', () => {
    expect(festivo('2026-06-29')).toBe('San Pedro y San Pablo');
    expect(festivo('2026-10-12')).toBe('Día de la Raza');
    expect(festivo('2027-11-01')).toBe('Todos los Santos');
  });

  test('los fijos no se corren aunque caigan en fin de semana', () => {
    expect(festivo('2027-05-01')).toBe('Día del Trabajo');      // sabado
    expect(festivo('2027-08-07')).toBe('Batalla de Boyacá');    // sabado
    expect(festivo('2027-12-25')).toBe('Navidad');              // sabado
    expect(festivo('2027-05-03')).toBeNull();
  });

  test('un dia comun no es festivo', () => {
    expect(festivo('2026-11-17')).toBeNull();
  });
});

describe('hora de Colombia', () => {
  test('las 3:00 a. m. UTC del miercoles son las 10:00 p. m. del martes en Colombia', () => {
    expect(enColombia(new Date('2026-11-18T03:00:00Z'))).toMatchObject({
      fecha: '2026-11-17', hora: 22, minuto: 0, diaSemana: 2,
    });
  });

  test('la semana empieza el lunes a las 00:00 de Colombia', () => {
    expect(inicioDeSemana(co('2026-11-22 23:59')).toISOString()).toBe('2026-11-16T05:00:00.000Z');
    expect(inicioDeSemana(co('2026-11-23 00:00')).toISOString()).toBe('2026-11-23T05:00:00.000Z');
    expect(lunesDeLaSemana('2026-11-16')).toBe('2026-11-16');
  });
});

describe('horario permitido (art. 3)', () => {
  test.each([
    ['martes 6:59 a. m.', '2026-11-17 06:59', false, 'ANTES'],
    ['martes 7:00 a. m.', '2026-11-17 07:00', true, null],
    ['martes 6:59 p. m.', '2026-11-17 18:59', true, null],
    ['martes 7:00 p. m.', '2026-11-17 19:00', false, 'DESPUES'],
    ['viernes 7:00 p. m.', '2026-11-20 19:00', false, 'DESPUES'],
    ['sabado 7:59 a. m.', '2026-11-21 07:59', false, 'ANTES'],
    ['sabado 8:00 a. m.', '2026-11-21 08:00', true, null],
    ['sabado 2:59 p. m.', '2026-11-21 14:59', true, null],
    ['sabado 3:00 p. m.', '2026-11-21 15:00', false, 'DESPUES'],
    ['domingo 10:00 a. m.', '2026-11-22 10:00', false, 'DOMINGO'],
    ['festivo lunes 16 de noviembre 10:00 a. m.', '2026-11-16 10:00', false, 'FESTIVO'],
    ['jueves santo 2027 10:00 a. m.', '2027-03-25 10:00', false, 'FESTIVO'],
    ['sabado festivo (1 de mayo de 2027) 10:00 a. m.', '2027-05-01 10:00', false, 'FESTIVO'],
  ])('%s', (_, hora, permitido, razon) => {
    const r = evaluarHorario(co(hora));
    expect(r.permitido).toBe(permitido);
    if (razon) expect(r.razon).toBe(razon);
    expect(dentroDeHorario(co(hora))).toBe(permitido);
  });

  test('el festivo trae su nombre', () => {
    expect(evaluarHorario(co('2026-11-16 10:00'))).toEqual({
      permitido: false, razon: 'FESTIVO', festivo: 'Independencia de Cartagena',
    });
  });

  test.each([
    ['en horario: el mismo instante', '2026-11-17 10:30', '2026-11-17 10:30'],
    ['martes antes de abrir: a las 7:00 del mismo dia', '2026-11-17 05:00', '2026-11-17 07:00'],
    ['viernes en la noche: sabado a las 8:00', '2026-11-20 19:00', '2026-11-21 08:00'],
    ['sabado a las 3:00 p. m.: lunes a las 7:00', '2026-11-21 15:00', '2026-11-23 07:00'],
    ['sabado antes de un lunes festivo: martes a las 7:00', '2026-11-14 16:00', '2026-11-17 07:00'],
    ['miercoles santo en la noche: sabado santo a las 8:00', '2026-04-01 20:00', '2026-04-04 08:00'],
    ['nochebuena (jueves) en la noche: sabado 26 a las 8:00', '2026-12-24 19:30', '2026-12-26 08:00'],
    ['domingo: lunes a las 7:00', '2026-11-22 09:00', '2026-11-23 07:00'],
  ])('siguiente horario: %s', (_, desde, esperado) => {
    expect(siguienteHorarioPermitido(co(desde)).toISOString()).toBe(co(esperado).toISOString());
  });

  test('describe el instante en hora de Colombia', () => {
    expect(describirInstante(co('2026-11-23 07:00'))).toBe('lunes 23 de noviembre a las 7:00 a. m.');
    expect(describirInstante(co('2026-11-21 14:05'))).toBe('sábado 21 de noviembre a las 2:05 p. m.');
    expect(describirInstante(co('2026-11-21 12:00'))).toBe('sábado 21 de noviembre a las 12:00 p. m.');
  });
});

describe('frecuencia (art. 3)', () => {
  const martes = co('2026-11-17 10:00');

  test('sin contactos: se puede', () => {
    expect(evaluarFrecuencia('WHATSAPP', martes, [])).toBeNull();
  });

  test('ya hubo un contacto hoy (por cualquier canal): no', () => {
    expect(evaluarFrecuencia('WHATSAPP', martes, [{ canal: 'WHATSAPP', fecha: co('2026-11-17 07:05') }]))
      .toEqual({ detalle: 'MISMO_DIA', canal: 'WHATSAPP' });
    expect(evaluarFrecuencia('WHATSAPP', martes, [{ canal: 'EMAIL', fecha: co('2026-11-17 07:05') }]))
      .toEqual({ detalle: 'MISMO_DIA', canal: 'EMAIL' });
  });

  test('el dia se corta a la medianoche de Colombia, no de UTC', () => {
    // 11:00 p. m. del lunes en Colombia son las 4:00 a. m. UTC del martes.
    expect(evaluarFrecuencia('WHATSAPP', martes, [{ canal: 'WHATSAPP', fecha: new Date('2026-11-17T04:00:00Z') }]))
      .toBeNull();
  });

  test('otro dia de la semana por el mismo canal: si', () => {
    expect(evaluarFrecuencia('WHATSAPP', martes, [{ canal: 'WHATSAPP', fecha: co('2026-11-16 18:00') }])).toBeNull();
  });

  test('otro canal en la misma semana: no', () => {
    expect(evaluarFrecuencia('WHATSAPP', martes, [{ canal: 'EMAIL', fecha: co('2026-11-16 18:00') }]))
      .toEqual({ detalle: 'OTRO_CANAL', canal: 'EMAIL' });
  });

  test('otro canal la semana pasada (el domingo antes): si', () => {
    expect(evaluarFrecuencia('WHATSAPP', martes, [{ canal: 'EMAIL', fecha: co('2026-11-15 23:59') }])).toBeNull();
  });
});

describe('puedeContactar', () => {
  const martes = co('2026-11-17 10:00');
  const acepta = { nombre: 'Ana Prueba', acepta_mensajes_comerciales: true, canales_autorizados: ['WHATSAPP'] };
  const sinDeclarar = { nombre: 'Beto', acepta_mensajes_comerciales: false, canales_autorizados: null };

  test('comercial a quien acepto por ese canal, en horario y sin contactos: si', () => {
    expect(puedeContactar(acepta, 'WHATSAPP', martes, [])).toEqual({ puede: true, clase: 'COMERCIAL' });
  });

  test('por defecto la clase es COMERCIAL (lo mas estricto)', () => {
    expect(puedeContactar(sinDeclarar, 'WHATSAPP', martes, [])).toMatchObject({ puede: false, motivo: 'NO_AUTORIZA' });
  });

  test('comercial a quien no acepto: NO_AUTORIZA, con el primer nombre', () => {
    const r = puedeContactar(sinDeclarar, 'WHATSAPP', martes, [], { clase: 'COMERCIAL' });
    expect(r).toMatchObject({ puede: false, clase: 'COMERCIAL', motivo: 'NO_AUTORIZA' });
    expect(r.mensaje).toBe('Beto no ha aceptado recibir mensajes comerciales del gimnasio.');
  });

  test('comercial por un canal que no autorizo: CANAL_NO_AUTORIZADO', () => {
    const r = puedeContactar(acepta, 'EMAIL', martes, []);
    expect(r.motivo).toBe('CANAL_NO_AUTORIZADO');
    expect(r.mensaje).toBe('Ana no autorizó que le envíen mensajes comerciales por correo.');
  });

  test('comercial aceptado pero sin canales: CANAL_NO_AUTORIZADO', () => {
    expect(puedeContactar({ ...acepta, canales_autorizados: null }, 'WHATSAPP', martes, []).motivo).toBe('CANAL_NO_AUTORIZADO');
    expect(puedeContactar({ ...acepta, canales_autorizados: [] }, 'WHATSAPP', martes, []).motivo).toBe('CANAL_NO_AUTORIZADO');
  });

  test('aviso del plan sin permiso comercial: si, por WhatsApp (el canal del contrato)', () => {
    expect(puedeContactar(sinDeclarar, 'WHATSAPP', martes, [], { clase: 'AVISO' })).toEqual({ puede: true, clase: 'AVISO' });
  });

  test('aviso del plan por correo: CANAL_NO_AUTORIZADO, aunque acepte comerciales por correo', () => {
    const r = puedeContactar({ ...acepta, canales_autorizados: ['EMAIL'] }, 'EMAIL', martes, [], { clase: 'AVISO' });
    expect(r).toMatchObject({ puede: false, clase: 'AVISO', motivo: 'CANAL_NO_AUTORIZADO' });
  });

  test('aviso del plan: tambien respeta el horario y la frecuencia', () => {
    expect(puedeContactar(sinDeclarar, 'WHATSAPP', co('2026-11-22 10:00'), [], { clase: 'AVISO' }).motivo).toBe('FUERA_DE_HORARIO');
    expect(puedeContactar(sinDeclarar, 'WHATSAPP', martes, [{ canal: 'WHATSAPP', fecha: co('2026-11-17 07:30') }], { clase: 'AVISO' }).motivo)
      .toBe('FRECUENCIA');
  });

  test('un canal que no existe: no', () => {
    expect(puedeContactar(acepta, 'SMS', martes, []).motivo).toBe('CANAL_NO_AUTORIZADO');
  });

  test('fuera de horario: FUERA_DE_HORARIO con el siguiente horario', () => {
    const r = puedeContactar(acepta, 'WHATSAPP', co('2026-11-22 10:00'), []);
    expect(r).toMatchObject({ puede: false, motivo: 'FUERA_DE_HORARIO' });
    expect(r.siguiente.toISOString()).toBe(co('2026-11-23 07:00').toISOString());
    expect(r.mensaje).toMatch(/^Hoy es domingo\. La Ley 2300 de 2023 solo permite contactar de lunes a viernes/);
    expect(r.mensaje).toContain('desde el lunes 23 de noviembre a las 7:00 a. m.');
  });

  test('frecuencia: FRECUENCIA con el detalle', () => {
    const r = puedeContactar(acepta, 'WHATSAPP', martes, [{ canal: 'WHATSAPP', fecha: co('2026-11-17 08:00') }]);
    expect(r).toMatchObject({ puede: false, motivo: 'FRECUENCIA', detalle: 'MISMO_DIA' });
    expect(r.mensaje).toMatch(/ya se le contactó hoy/);
  });

  test('el permiso se revisa antes que el horario y la frecuencia', () => {
    expect(puedeContactar(sinDeclarar, 'WHATSAPP', co('2026-11-22 10:00'), [{ canal: 'WHATSAPP', fecha: co('2026-11-22 08:00') }]).motivo)
      .toBe('NO_AUTORIZA');
    expect(puedeContactar(acepta, 'WHATSAPP', co('2026-11-22 10:00'), [{ canal: 'WHATSAPP', fecha: co('2026-11-22 08:00') }]).motivo)
      .toBe('FUERA_DE_HORARIO');
  });

  test('acepta el miembro de la API (camelCase)', () => {
    expect(puedeContactar({ nombre: 'Ana', aceptaComerciales: true, canalesAutorizados: ['EMAIL'] }, 'EMAIL', martes, []).puede)
      .toBe(true);
  });

  test('sin instante usa el reloj, que las pruebas pueden fijar', () => {
    legal.establecerReloj(() => co('2026-11-22 10:00'));
    try {
      expect(legal.ahora().toISOString()).toBe(co('2026-11-22 10:00').toISOString());
      expect(puedeContactar(acepta, 'WHATSAPP').motivo).toBe('FUERA_DE_HORARIO');
    } finally {
      legal.establecerReloj(null);
    }
    expect(Math.abs(legal.ahora().getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe('clasificarTipo', () => {
  test.each([
    ['vencida', 'AVISO'], ['por-vencer', 'AVISO'], ['acceso-bloqueado', 'AVISO'], ['vencimiento', 'AVISO'],
    ['riesgo', 'COMERCIAL'], ['reto-completado', 'COMERCIAL'], ['campana', 'COMERCIAL'], [undefined, 'COMERCIAL'], ['', 'COMERCIAL'],
  ])('%s -> %s', (tipo, clase) => {
    expect(clasificarTipo(tipo)).toBe(clase);
  });
});
