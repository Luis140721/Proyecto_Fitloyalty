/**
 * Semana 6, hallazgo de la capa BD: POST /api/auth/signup respondia 500 cuando
 * un nombre o un correo no cabia en su columna (gimnasio.nombre y usuario.nombre
 * VARCHAR(100), gimnasio.email y usuario.email VARCHAR(150)). Ahora signupSchema
 * lo rechaza con 400. Aqui va el valor limite de cada regla; las columnas las
 * cubre tests/integracion/restricciones-miembro.test.js contra la BD real.
 */
const { signupSchema, formatZodError } = require('../src/lib/validators');

const REGISTRO = {
  gymName: 'Gimnasio Central',
  gymPhone: '3001234567',
  ownerName: 'Ana Pérez',
  ownerEmail: 'ana@fitloyalty.test',
  password: 'clave123',
};

const DOMINIO = '@fitloyalty.test';
const emailDeLargo = (n) => `${'a'.repeat(n - DOMINIO.length)}${DOMINIO}`;

/** Mensaje de error del registro con esos cambios, o null si es valido. */
function errorCon(cambios) {
  const resultado = signupSchema.safeParse({ ...REGISTRO, ...cambios });
  return resultado.success ? null : formatZodError(resultado.error);
}

describe('signupSchema: lo que no cabe en la BD se rechaza antes', () => {
  test.each([
    ['gymName', 'gimnasio'],
    ['ownerName', 'propietario'],
  ])('%s admite 100 caracteres y rechaza 101', (campo, quien) => {
    expect(errorCon({ [campo]: 'x'.repeat(100) })).toBeNull();
    expect(errorCon({ [campo]: 'x'.repeat(101) })).toBe(`El nombre del ${quien} no puede tener más de 100 caracteres`);
  });

  // PostgreSQL cuenta caracteres: 99 letras y un emoji son 100, aunque en
  // JavaScript .length diga 101.
  test('el nombre se mide en caracteres, como PostgreSQL: un emoji cuenta uno', () => {
    expect(errorCon({ gymName: `${'x'.repeat(99)}💪` })).toBeNull();
    expect(errorCon({ ownerName: `${'x'.repeat(100)}💪` })).toBe('El nombre del propietario no puede tener más de 100 caracteres');
  });

  test('el nombre se mide sin los espacios de los extremos, porque se guarda recortado', () => {
    expect(errorCon({ gymName: `  ${'x'.repeat(100)}  ` })).toBeNull();
  });

  test.each(['ownerEmail', 'gymEmail'])('%s admite 150 caracteres y rechaza 151', (campo) => {
    expect(errorCon({ [campo]: emailDeLargo(150) })).toBeNull();
    expect(errorCon({ [campo]: emailDeLargo(151) })).toBe('El email no puede tener más de 150 caracteres');
  });

  test('el email se mide normalizado: los espacios de los extremos no cuentan', () => {
    expect(errorCon({ ownerEmail: ` ${emailDeLargo(150)} ` })).toBeNull();
  });

  test('un nombre vacio sigue siendo "requerido"', () => {
    expect(errorCon({ gymName: '' })).toBe('El nombre del gimnasio es requerido');
  });
});
