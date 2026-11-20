/**
 * Reglas del formulario de registro del dueño (RegisterOwnerPage).
 *
 * Funciones puras: reciben los valores del formulario y devuelven el resultado,
 * sin React ni DOM. La pantalla solo decide dónde mostrar cada mensaje.
 */

const PHONE_RE = /^[3]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Nivel de 0 a 4 para la barra de fuerza de la contraseña. */
export function passwordStrength(pwd) {
  let s = 0;
  if (pwd.length >= 6) s++;
  if (pwd.length >= 10) s++;
  if (/[A-Z]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) s++;
  if (/\d/.test(pwd) && /[A-Za-z]/.test(pwd)) s++;
  return Math.min(s, 4);
}

// Valida todo el formulario de una pasada y devuelve un mensaje por campo,
// en vez de detenerse en el primer problema. Sin errores devuelve {}.
export function validateRegisterOwnerForm(form) {
  const e = {};
  if (!form.gymName.trim()) e.gymName = 'Escribe el nombre de tu gimnasio.';

  const phoneDigits = form.gymPhone.replace(/\D/g, '');
  if (!phoneDigits) e.gymPhone = 'Escribe el teléfono del gimnasio.';
  else if (phoneDigits.length !== 10) e.gymPhone = `Debe tener 10 dígitos (escribiste ${phoneDigits.length}).`;
  else if (!PHONE_RE.test(phoneDigits)) e.gymPhone = 'Un celular colombiano empieza por 3.';

  if (form.gymEmail.trim() && !EMAIL_RE.test(form.gymEmail.trim())) {
    e.gymEmail = 'Este correo no tiene un formato válido.';
  }

  if (!form.ownerName.trim()) e.ownerName = 'Escribe tu nombre.';

  if (!form.ownerEmail.trim()) e.ownerEmail = 'Escribe tu correo.';
  else if (!EMAIL_RE.test(form.ownerEmail.trim())) e.ownerEmail = 'Este correo no tiene un formato válido.';

  if (!form.password) e.password = 'Crea una contraseña.';
  else if (form.password.length < 6) e.password = `Te faltan ${6 - form.password.length} caracteres (mínimo 6).`;
  else if (!/\d/.test(form.password)) e.password = 'Debe incluir al menos un número.';

  return e;
}
