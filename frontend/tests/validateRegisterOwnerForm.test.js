/**
 * Bootcamp semana 2 (Luis): reglas del registro del dueño, extraídas de
 * RegisterOwnerPage a src/lib/validateRegisterOwnerForm.js.
 *
 * Particiones y valores límite: teléfono de 9/10/11 dígitos y su primer dígito,
 * correo obligatorio vs opcional, contraseña de 5 vs 6 caracteres y la barra
 * de fuerza de 0 a 4. Funciones puras: sin DOM, sin red y sin fecha.
 */
import { describe, expect, it } from 'vitest';
import { passwordStrength, validateRegisterOwnerForm } from '../src/lib/validateRegisterOwnerForm';

// Un formulario que pasa todas las reglas; cada test cambia solo lo que prueba.
const formValido = (cambios = {}) => ({
  gymName: 'Power House',
  gymPhone: '3001234567',
  gymEmail: '',
  ownerName: 'Ana Pérez',
  ownerEmail: 'ana@gym.co',
  password: 'clave1',
  ...cambios,
});

describe('validateRegisterOwnerForm', () => {
  it('should return no errors when every field is valid', () => {
    // Arrange
    const form = formValido({ gymEmail: 'contacto@powerhouse.com' });

    // Act
    const errores = validateRegisterOwnerForm(form);

    // Assert
    expect(errores).toEqual({});
  });

  it('should report every required field in form order when the form is empty', () => {
    // Arrange
    const form = { gymName: '', gymPhone: '', gymEmail: '', ownerName: '', ownerEmail: '', password: '' };

    // Act
    const errores = validateRegisterOwnerForm(form);

    // Assert: un mensaje por campo y el correo del gimnasio no aparece (es opcional)
    expect(Object.entries(errores)).toEqual([
      ['gymName', 'Escribe el nombre de tu gimnasio.'],
      ['gymPhone', 'Escribe el teléfono del gimnasio.'],
      ['ownerName', 'Escribe tu nombre.'],
      ['ownerEmail', 'Escribe tu correo.'],
      ['password', 'Crea una contraseña.'],
    ]);
  });

  it.each([
    ['gymName', 'Escribe el nombre de tu gimnasio.'],
    ['ownerName', 'Escribe tu nombre.'],
  ])('should reject %s when it has only spaces', (campo, mensaje) => {
    // Arrange
    const form = formValido({ [campo]: '   ' });

    // Act
    const errores = validateRegisterOwnerForm(form);

    // Assert
    expect(errores).toEqual({ [campo]: mensaje });
  });

  it.each([
    ['empty', '', 'Escribe el teléfono del gimnasio.'],
    ['only letters', 'abc', 'Escribe el teléfono del gimnasio.'],
    ['9 digits', '300123456', 'Debe tener 10 dígitos (escribiste 9).'],
    ['9 digits with dashes', '300-123-456', 'Debe tener 10 dígitos (escribiste 9).'],
    ['11 digits', '30012345678', 'Debe tener 10 dígitos (escribiste 11).'],
    ['10 digits starting with 2', '2001234567', 'Un celular colombiano empieza por 3.'],
    ['10 digits starting with 4', '4001234567', 'Un celular colombiano empieza por 3.'],
    ['10 digits starting with 9', '9001234567', 'Un celular colombiano empieza por 3.'],
    ['10 digits starting with 3', '3001234567', undefined],
    ['10 digits with spaces', '300 123 4567', undefined],
    ['10 digits with dashes and parentheses', '(300) 123-45-67', undefined],
  ])('should validate the phone when it is %s', (_caso, gymPhone, mensaje) => {
    // Arrange
    const form = formValido({ gymPhone });

    // Act
    const errores = validateRegisterOwnerForm(form);

    // Assert
    expect(errores.gymPhone).toBe(mensaje);
  });

  it.each([
    ['is empty', '', 'Escribe tu correo.'],
    ['has only spaces', '   ', 'Escribe tu correo.'],
    ['has no domain', 'ana@gym', 'Este correo no tiene un formato válido.'],
    ['has a 1-letter extension', 'ana@gym.c', 'Este correo no tiene un formato válido.'],
    ['has a space inside', 'ana perez@gym.co', 'Este correo no tiene un formato válido.'],
    ['has a 2-letter extension', 'ana@gym.co', undefined],
    ['is valid with spaces around', '  ana@gym.co  ', undefined],
  ])('should validate the owner email when it %s', (_caso, ownerEmail, mensaje) => {
    // Arrange
    const form = formValido({ ownerEmail });

    // Act
    const errores = validateRegisterOwnerForm(form);

    // Assert
    expect(errores.ownerEmail).toBe(mensaje);
  });

  it.each([
    ['empty', '', undefined],
    ['only spaces', '   ', undefined],
    ['invalid', 'contacto@gym', 'Este correo no tiene un formato válido.'],
    ['valid', 'contacto@gym.com', undefined],
  ])('should treat the gym email as optional when it is %s', (_caso, gymEmail, mensaje) => {
    // Arrange
    const form = formValido({ gymEmail });

    // Act
    const errores = validateRegisterOwnerForm(form);

    // Assert
    expect(errores.gymEmail).toBe(mensaje);
  });

  it.each([
    ['no characters', '', 'Crea una contraseña.'],
    ['2 characters', 'a1', 'Te faltan 4 caracteres (mínimo 6).'],
    ['5 characters', 'abc12', 'Te faltan 1 caracteres (mínimo 6).'],
    ['6 characters without a number', 'abcdef', 'Debe incluir al menos un número.'],
    ['6 characters with a number', 'abc123', undefined],
    ['only numbers', '123456', undefined],
  ])('should validate the password when it has %s', (_caso, password, mensaje) => {
    // Arrange
    const form = formValido({ password });

    // Act
    const errores = validateRegisterOwnerForm(form);

    // Assert
    expect(errores.password).toBe(mensaje);
  });
});

describe('passwordStrength', () => {
  it.each([
    ['empty', 0, ''],
    ['5 lowercase letters', 0, 'abcde'],
    ['5 symbols', 1, '!!!!!'],
    ['6 lowercase letters', 1, 'abcdef'],
    ['6 numbers only', 1, '123456'],
    ['6 characters with letters and numbers', 2, 'abc123'],
    ['9 characters with letters and numbers', 2, 'abcdefgh1'],
    ['10 characters with letters and numbers', 3, 'abcdefghi1'],
    ['6 characters with uppercase and numbers', 3, 'Abc123'],
    ['10 characters with uppercase and numbers', 4, 'Abcdefgh12'],
    ['12 characters with every kind', 4, 'Abcdefgh123!'],
  ])('should score %s as level %i', (_caso, nivel, password) => {
    // Arrange: la contraseña viene del caso

    // Act
    const resultado = passwordStrength(password);

    // Assert
    expect(resultado).toBe(nivel);
  });
});
