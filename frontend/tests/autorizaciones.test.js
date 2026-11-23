/**
 * src/lib/autorizaciones.js: las reglas que deciden quien puede aceptar los
 * mensajes comerciales (RQNF-16, Ley 2300 de 2023) y las demas autorizaciones
 * (RQNF-17): si el miembro es menor de edad decide su representante legal, y
 * sin ningun canal marcado no hay aceptacion.
 *
 * La regla de los canales en el alta (dos cambios en el mismo evento) esta en
 * formularioMiembro.test.js; aqui van la edad, las fechas y los datos del
 * representante.
 *
 * La edad depende de la fecha de hoy: se fija el 22 de noviembre de 2026 a las
 * 10:00 de la zona del equipo donde corra (solo Date; no hay timers).
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  cambiarCanalComercial, edadEnAnios, erroresRepresentante, esMenor, isoADate, puedeAceptarComerciales,
} from '../src/lib/autorizaciones';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 22, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('edadEnAnios y esMenor', () => {
  test.each([
    ['the birthday is today', new Date(2008, 10, 22), 18, false],
    ['the birthday is tomorrow', new Date(2008, 10, 23), 17, true],
    ['the birthday was last month', new Date(2008, 9, 30), 18, false],
    ['the birthday is next month', new Date(2008, 11, 1), 17, true],
    ['the member is a child', new Date(2015, 0, 10), 11, true],
  ])('should count the completed years when %s', (_caso, nacimiento, edad, menor) => {
    // Act y Assert
    expect(edadEnAnios(nacimiento)).toBe(edad);
    expect(esMenor(nacimiento, 'CC')).toBe(menor);
  });

  test.each([
    ['there is no date', null],
    ['the date does not exist', new Date('no es una fecha')],
    ['the date is still text', '2008-11-23'],
  ])('should not guess an age when %s', (_caso, nacimiento) => {
    // Act y Assert
    expect(edadEnAnios(nacimiento)).toBeNull();
  });

  test('should take the identity card as a minor and any other document as an adult when there is no birth date', () => {
    // Act y Assert: sin fecha, la tarjeta de identidad (TI) solo la tienen los menores
    expect(esMenor(null, 'TI')).toBe(true);
    expect(esMenor(null, 'CC')).toBe(false);
  });

  test('should believe the birth date and not the document when both are known', () => {
    // Act y Assert: un adulto que se quedo con la TI, y un menor con otro documento
    expect(esMenor(new Date(2000, 4, 17), 'TI')).toBe(false);
    expect(esMenor(new Date(2012, 4, 17), 'PP')).toBe(true);
  });
});

describe('isoADate', () => {
  test.each([
    ['a date of a date input', '2010-03-15'],
    ['the midnight UTC that the API sends', '2010-03-15T00:00:00.000Z'],
  ])('should read the same day in any time zone when it gets %s', (_caso, iso) => {
    // Act
    const fecha = isoADate(iso);

    // Assert: new Date(iso) daria el 14 de marzo en Colombia
    expect([fecha.getFullYear(), fecha.getMonth(), fecha.getDate()]).toEqual([2010, 2, 15]);
  });

  test.each([[''], [null], [undefined], ['15/03/2010'], ['sin fecha']])('should return null when it gets %j', (texto) => {
    // Act y Assert
    expect(isoADate(texto)).toBeNull();
  });
});

describe('cambiarCanalComercial y puedeAceptarComerciales', () => {
  test('should mark only the chosen channel when the member had no list of channels', () => {
    // Act y Assert
    expect(cambiarCanalComercial({ acepta: true, canales: null }, 'EMAIL', true)).toEqual({ canales: ['EMAIL'], acepta: true });
    expect(cambiarCanalComercial({ acepta: false, canales: undefined }, 'WHATSAPP', true)).toEqual({ canales: ['WHATSAPP'], acepta: false });
  });

  test('should ignore a channel that is not WhatsApp nor email when it is marked', () => {
    // Act y Assert
    expect(cambiarCanalComercial({ acepta: true, canales: ['WHATSAPP'] }, 'SMS', true)).toEqual({ canales: ['WHATSAPP'], acepta: true });
  });

  test.each([
    [['WHATSAPP'], true],
    [['WHATSAPP', 'EMAIL'], true],
    [[], false],
    [null, false],
    [undefined, false],
    ['WHATSAPP', false],
  ])('should say whether the acceptance can be turned on when the channels are %j', (canales, puede) => {
    // Act y Assert
    expect(puedeAceptarComerciales(canales)).toBe(puede);
  });
});

describe('erroresRepresentante', () => {
  const MARTA = {
    representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52111222',
    representante_parentesco: 'Madre', representante_telefono: '310 444-5566',
  };

  test('should accept the representative when every piece of data is complete, with the phone written with spaces', () => {
    // Act y Assert
    expect(erroresRepresentante(MARTA)).toEqual({});
  });

  test('should explain what is missing in each field when the representative is empty', () => {
    // Act y Assert
    expect(erroresRepresentante({})).toEqual({
      representante_nombre: 'Escribe el nombre completo del representante legal.',
      representante_tipo_documento: 'Elige el tipo de documento.',
      representante_documento: 'Escribe el documento del representante.',
      representante_parentesco: 'Indica el parentesco con el menor.',
      representante_telefono: 'Debe tener entre 7 y 15 dígitos.',
    });
  });

  test.each([
    ['a phone of 6 digits', { representante_telefono: '310444' }, { representante_telefono: 'Debe tener entre 7 y 15 dígitos.' }],
    ['a phone of 16 digits', { representante_telefono: '3104445566778899' }, { representante_telefono: 'Debe tener entre 7 y 15 dígitos.' }],
    ['the identity card of a minor as the document', { representante_tipo_documento: 'TI' }, { representante_tipo_documento: 'Elige el tipo de documento.' }],
    ['a name of two letters', { representante_nombre: ' Al ' }, { representante_nombre: 'Escribe el nombre completo del representante legal.' }],
    ['a document of three characters', { representante_documento: '123' }, { representante_documento: 'Escribe el documento del representante.' }],
  ])('should reject only that field when the representative has %s', (_caso, cambio, errores) => {
    // Act y Assert
    expect(erroresRepresentante({ ...MARTA, ...cambio })).toEqual(errores);
  });
});
