const {
  emailSchema,
  formatZodError,
  forgotPasswordSchema,
  loginSchema,
  passwordSchema,
  phoneCoSchema,
  registerStaffSchema,
  resetPasswordSchema,
  signupSchema,
  verifyResetCodeSchema,
} = require('../src/lib/validators');

describe('formatZodError', () => {
  test('devuelve el primer mensaje de validación o el mensaje por defecto', () => {
    expect(formatZodError({ issues: [{ message: 'Email inválido' }] })).toBe('Email inválido');
    expect(formatZodError({ issues: [] })).toBe('Entrada inválida');
    expect(formatZodError(null)).toBe('Entrada inválida');
  });
});

describe('emailSchema', () => {
  test('valida y normaliza correos', () => {
    expect(emailSchema.parse('  Ana@Example.COM  ')).toBe('ana@example.com');
  });

  test('rechaza formatos de correo inválidos', () => {
    expect(emailSchema.safeParse('ana@').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  test.each([
    ['límite mínimo de seis caracteres con número', 'abcde1', true],
    ['menos de seis caracteres', 'abcd1', false],
    ['sin número', 'abcdef', false],
    ['con espacios', 'abc 12', false],
  ])('aplica la política: %s', (_description, password, valid) => {
    expect(passwordSchema.safeParse(password).success).toBe(valid);
  });
});

describe('phoneCoSchema', () => {
  test('acepta teléfono colombiano con diez dígitos', () => {
    expect(phoneCoSchema.safeParse('3101234567').success).toBe(true);
  });

  test('rechaza teléfono que no empieza en 3', () => {
    expect(phoneCoSchema.safeParse('2101234567').success).toBe(false);
  });
});

describe('request schemas', () => {
  test('valida login y convierte gymId del registro de personal', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'pass' }).success).toBe(true);
    expect(registerStaffSchema.parse({
      name: 'Ana',
      email: 'a@b.co',
      password: 'secret1',
      gymId: '7',
    }).gymId).toBe(7);
  });

  test('acepta correo de gimnasio vacío y lo normaliza como opcional en el registro', () => {
    const result = signupSchema.safeParse({
      gymName: 'Fit Gym',
      gymPhone: '3101234567',
      gymEmail: '',
      ownerName: 'Ana',
      ownerEmail: 'ANA@EXAMPLE.COM',
      password: 'secret1',
    });

    expect(result.success).toBe(true);
    expect(result.data.gymEmail).toBeUndefined();
    expect(result.data.ownerEmail).toBe('ana@example.com');
  });

  test('valida solicitud y código de recuperación de seis dígitos', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(verifyResetCodeSchema.safeParse({ email: 'a@b.co', code: '123456' }).success).toBe(true);
    expect(verifyResetCodeSchema.safeParse({ email: 'a@b.co', code: '12345' }).success).toBe(false);
  });

  test('requiere token de recuperación o correo junto con código', () => {
    expect(resetPasswordSchema.safeParse({ password: 'secret1' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({
      email: 'a@b.co',
      code: '123456',
      password: 'secret1',
    }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({
      resetToken: 'token',
      password: 'secret1',
    }).success).toBe(true);
  });
});
