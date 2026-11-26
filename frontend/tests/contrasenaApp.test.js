/**
 * RQF-15: reglas de la contrasena de la app del miembro (src/lib/contrasenaApp.js),
 * que usa MiembrosPage en el alta y en la ficha. El miembro entra a la app con su
 * telefono y esta contrasena (POST /api/cliente/login).
 */
import { describe, expect, test } from 'vitest';
import {
  MINIMO_CONTRASENA_APP, avisoContrasenaFicha, errorContrasenaApp, telefonoSirveParaApp,
} from '../src/lib/contrasenaApp';

describe('errorContrasenaApp: la contrasena que se escribe en el panel', () => {
  test('should ask for six characters when it is compared with the rules of the API and the login of the app', () => {
    // Arrange / Act / Assert: createSchema, updateSchema y loginSchema piden min(6)
    expect(MINIMO_CONTRASENA_APP).toBe(6);
  });

  test.each([
    ['an empty text', ''],
    ['a missing value', undefined],
    ['a null value', null],
  ])('should accept the password when it is %s, because the field is optional', (_caso, valor) => {
    // Arrange: vacia, el alta no la asigna y la ficha no cambia la que haya

    // Act
    const error = errorContrasenaApp(valor);

    // Assert
    expect(error).toBe('');
  });

  test.each([
    ['a', 1],
    ['abc', 3],
    ['clave', 5],
  ])('should say how many characters there are when "%s" is shorter than six', (valor, largo) => {
    // Arrange: lo que escribio la persona de recepcion

    // Act
    const error = errorContrasenaApp(valor);

    // Assert
    expect(error).toBe(`Debe tener al menos 6 caracteres (escribiste ${largo}).`);
  });

  test.each(['claves', 'gimnasio 2026', '123456'])('should accept "%s" when it has six characters or more', (valor) => {
    // Arrange: el minimo justo y algunas mas largas

    // Act
    const error = errorContrasenaApp(valor);

    // Assert
    expect(error).toBe('');
  });
});

describe('telefonoSirveParaApp: el telefono con el que el miembro entra a la app', () => {
  test.each([
    ['ten digits that start with 3', '3001234567'],
    ['spaces between the digits', '300 123 4567'],
    ['dashes between the digits', '300-123-4567'],
  ])('should accept the phone when it has %s', (_caso, telefono) => {
    // Arrange: el backend le quita espacios y guiones antes de compararlo

    // Act
    const sirve = telefonoSirveParaApp(telefono);

    // Assert
    expect(sirve).toBe(true);
  });

  test.each([
    ['a landline that starts with 6', '6012345678'],
    ['nine digits', '300123456'],
    ['eleven digits', '30012345678'],
    ['the country code', '+573001234567'],
    ['parentheses', '(300)1234567'],
    ['a tab between the digits', '300\t1234567'],
    ['a non-breaking space between the digits', '300 1234567'],
    ['nothing written', ''],
    ['no value at all', null],
  ])('should reject the phone when it has %s', (_caso, telefono) => {
    // Arrange: la app pide 10 digitos que empiecen por 3, y el backend solo quita espacios ASCII y guiones

    // Act
    const sirve = telefonoSirveParaApp(telefono);

    // Assert
    expect(sirve).toBe(false);
  });
});

describe('avisoContrasenaFicha: el aviso bajo el campo en la ficha', () => {
  test('should say the member already has a password when the API says it has one', () => {
    // Arrange
    const datos = { passwordAsignada: true, appAcceso: true, telefono: '3001234567' };

    // Act
    const aviso = avisoContrasenaFicha(datos);

    // Assert
    expect(aviso).toBe('Ya tiene contraseña para la app. Escribe una nueva solo si quieres cambiarla.');
  });

  test('should say the member cannot enter the app yet when the API says it has no password', () => {
    // Arrange
    const datos = { passwordAsignada: false, appAcceso: true, telefono: '3001234567' };

    // Act
    const aviso = avisoContrasenaFicha(datos);

    // Assert
    expect(aviso).toBe('Aún no tiene contraseña: no puede entrar a la app hasta que le asignes una.');
  });

  test('should explain what the password is for when the full file has not arrived yet', () => {
    // Arrange: la fila de la lista no trae password_asignada
    const datos = { telefono: '3001234567' };

    // Act
    const aviso = avisoContrasenaFicha(datos);

    // Assert
    expect(aviso).toBe('Con su teléfono y esta contraseña el miembro entra a la app FitLoyalty.');
  });

  test('should add that the access is off and that the phone does not work when both happen', () => {
    // Arrange
    const datos = { passwordAsignada: true, appAcceso: false, telefono: '6012345678' };

    // Act
    const aviso = avisoContrasenaFicha(datos);

    // Assert
    expect(aviso).toBe(
      'Ya tiene contraseña para la app. Escribe una nueva solo si quieres cambiarla. '
      + 'Su acceso a la app está desactivado. '
      + 'Con este teléfono no podrá entrar: la app pide 10 dígitos que empiecen por 3.',
    );
  });
});
