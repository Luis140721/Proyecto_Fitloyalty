/**
 * Bootcamp semana 2 (Front): reglas del codigo de recuperacion de 6 digitos,
 * sacadas de ForgotPasswordPage a src/lib/codigoRecuperacion.js.
 *
 * Valores limite: 5, 6 y 7 digitos, texto vacio o sin digitos, la primera y la
 * ultima casilla, y un hueco en medio del codigo. Funciones puras: sin DOM,
 * sin red y sin fecha.
 */
import { describe, expect, test } from 'vitest';
import {
  LARGO_CODIGO, borrarDigito, codigoCompleto, limpiarCodigo, repartirCodigo,
} from '../src/lib/codigoRecuperacion';

const casillas = (texto) => Array.from({ length: LARGO_CODIGO }, (_, i) => texto[i] ?? '');

describe('limpiarCodigo', () => {
  test.each([
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['abc', ''],
    ['12 34-56', '123456'],
    ['12345', '12345'],
    ['123456', '123456'],
    ['1234567', '123456'],
  ])('should leave %j as "%s" when it is cleaned', (texto, esperado) => {
    // Act
    const limpio = limpiarCodigo(texto);

    // Assert
    expect(limpio).toBe(esperado);
  });
});

describe('repartirCodigo', () => {
  test.each([
    [1, '1'],
    [5, '12345'],
    [5, '123456'],
    [5, '1234567'],
  ])('should fill the boxes and focus the box with index %i when "%s" is pasted', (foco, texto) => {
    // Act
    const repartido = repartirCodigo(texto);

    // Assert: el foco va a la primera casilla vacia, o a la ultima si se llenaron
    expect(repartido).toEqual({ digitos: casillas(limpiarCodigo(texto)), foco });
  });

  test.each([[''], ['sin numeros'], [null]])('should give null when the pasted text %j has no digits', (texto) => {
    // Act
    const repartido = repartirCodigo(texto);

    // Assert
    expect(repartido).toBeNull();
  });
});

describe('borrarDigito', () => {
  test('should erase the digit of the box and keep the focus when the box has a digit', () => {
    // Arrange
    const digitos = casillas('123');

    // Act
    const borrado = borrarDigito(digitos, 2);

    // Assert
    expect(borrado).toEqual({ digitos: casillas('12'), foco: 2 });
    expect(digitos).toEqual(casillas('123'));
  });

  test('should erase the previous digit and move the focus back when the box is empty', () => {
    // Act
    const borrado = borrarDigito(casillas('123'), 3);

    // Assert
    expect(borrado).toEqual({ digitos: casillas('12'), foco: 2 });
  });

  test('should do nothing when the first box is already empty', () => {
    // Act
    const borrado = borrarDigito(casillas(''), 0);

    // Assert
    expect(borrado).toEqual({ digitos: casillas(''), foco: 0 });
  });

  test('should erase the last digit when the last box has one', () => {
    // Act
    const borrado = borrarDigito(casillas('123456'), 5);

    // Assert
    expect(borrado).toEqual({ digitos: casillas('12345'), foco: 5 });
  });
});

describe('codigoCompleto', () => {
  test.each([
    [false, '5 digits', casillas('12345')],
    [true, '6 digits', casillas('123456')],
    [false, 'a gap in the middle', ['1', '2', '', '4', '5', '6']],
    [false, 'no digits', casillas('')],
  ])('should answer %s when the code has %s', (completo, _caso, digitos) => {
    // Act
    const resultado = codigoCompleto(digitos);

    // Assert
    expect(resultado).toBe(completo);
  });
});
