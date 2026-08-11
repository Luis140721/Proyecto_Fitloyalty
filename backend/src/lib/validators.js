/**
 * lib/validators.js
 *
 * Esquemas Zod centralizados para validar la entrada de los Route Handlers.
 * Reflejan la política actual de cada endpoint (mensajes en español, límites
 * idénticos a la validación manual previa). Esto cubre la recomendación
 * ADR-006 del Arquitecto: "validación con Zod en cada Route Handler".
 *
 * Cada esquema expone un método `safeParse` que, ante fallo, devuelve un
 * `{ success: false, error }` con `error.issues[].message` ya en español.
 */

const { z } = require('zod');
const { normEmail, validarEmail, validarContrasena, validarTelefonoColombiano } = require('./auth-helpers');

/** Mensaje de error único por esquema (compatible con el front actual). */
function formatZodError(error) {
  if (!error || !Array.isArray(error.issues) || error.issues.length === 0) return 'Entrada inválida';
  return error.issues[0].message;
}

/** Refinador de email que usa la misma regex del backend. */
const emailSchema = z
  .string({ required_error: 'El email es requerido' })
  .min(1, 'El email es requerido')
  .refine((v) => validarEmail(v), { message: 'El email no tiene un formato válido' })
  .transform((v) => normEmail(v));

/**
 * Política de contraseña:
 *  - mínimo 6 caracteres
 *  - al menos un dígito
 *  - sin espacios (trim === original)
 */
const passwordSchema = z
  .string({ required_error: 'La contraseña es requerida' })
  .min(1, 'La contraseña es requerida')
  .refine((v) => validarContrasena(v), {
    message: 'La contraseña debe tener al menos 6 caracteres, contener al menos un número y no incluir espacios',
  });

/** Teléfono colombiano: 10 dígitos empezando con 3. */
const phoneCoSchema = z
  .string({ required_error: 'El teléfono es requerido' })
  .min(1, 'El teléfono es requerido')
  .refine((v) => validarTelefonoColombiano(v), {
    message: 'El teléfono debe tener 10 dígitos colombianos y comenzar con 3',
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'La contraseña es requerida' }).min(1, 'La contraseña es requerida'),
});

const registerStaffSchema = z.object({
  name: z.string({ required_error: 'El nombre es requerido' }).min(1, 'El nombre es requerido'),
  email: emailSchema,
  password: passwordSchema,
  gymId: z.coerce.number().int().positive().optional(),
});

const signupSchema = z.object({
  gymName:  z.string({ required_error: 'El nombre del gimnasio es requerido' }).min(1, 'El nombre del gimnasio es requerido'),
  gymPhone: phoneCoSchema,
  gymEmail: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  ownerName: z.string({ required_error: 'El nombre del propietario es requerido' }).min(1, 'El nombre del propietario es requerido'),
  ownerEmail: emailSchema,
  password: passwordSchema,
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const verifyResetCodeSchema = z.object({
  email: emailSchema,
  code: z
    .string({ required_error: 'El código es requerido' })
    .regex(/^\d{6}$/, { message: 'Código inválido. Debe tener 6 dígitos.' }),
});

const resetPasswordSchema = z
  .object({
    email: z.string().optional(),
    code: z.string().optional(),
    resetToken: z.string().optional(),
    password: passwordSchema,
  })
  .refine(
    (data) => Boolean(data.resetToken) || Boolean(data.email && data.code),
    { message: 'Email y código, o resetToken, son requeridos', path: ['resetToken'] }
  );

module.exports = {
  formatZodError,
  emailSchema,
  passwordSchema,
  phoneCoSchema,
  loginSchema,
  registerStaffSchema,
  signupSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
};