/**
 * lib/contrasenaApp.js
 *
 * Reglas de la contrasena de la app del miembro (RQF-15) para el alta y la
 * ficha de MiembrosPage. El miembro entra a la app FitLoyalty con su telefono y
 * esta contrasena (POST /api/cliente/login, backend/src/routes/cliente.js), y
 * el gimnasio se la asigna desde el panel. El backend la guarda con bcrypt y
 * nunca la devuelve: la ficha solo sabe si ya hay una (password_asignada).
 *
 * Funciones puras para probarlas sin React (frontend/tests/contrasenaApp.test.js).
 */

/** El mismo minimo que piden createSchema y updateSchema (routes/miembros.js) y el login de la app. */
export const MINIMO_CONTRASENA_APP = 6;

/**
 * Error del campo, o '' si esta bien. Vacia es valida: en el alta el miembro
 * queda sin contrasena y en la ficha no se cambia la que tenga.
 */
export function errorContrasenaApp(valor) {
  const texto = String(valor ?? '');
  if (texto === '') return '';
  if (texto.length < MINIMO_CONTRASENA_APP) {
    return `Debe tener al menos ${MINIMO_CONTRASENA_APP} caracteres (escribiste ${texto.length}).`;
  }
  return '';
}

/**
 * ¿Con este telefono puede entrar a la app? El login de la app pide 10 digitos
 * que empiecen por 3 (loginSchema de cliente.js), y el backend busca el
 * telefono guardado quitandole solo los espacios ASCII y los guiones
 * (REPLACE(..., ' ', '') y REPLACE(..., '-', '')). Un tabulador o un espacio
 * duro pegado desde otro lado no se quita, asi que aqui tampoco.
 */
export function telefonoSirveParaApp(telefono) {
  return /^3\d{9}$/.test(String(telefono ?? '').replace(/[ -]/g, ''));
}

/**
 * Aviso bajo «Contraseña de la app» en la ficha del miembro.
 *   passwordAsignada  true / false segun GET /api/admin/miembros/:id; undefined
 *                     mientras la ficha completa no ha llegado (la fila de la
 *                     lista no lo trae).
 *   appAcceso         false si el gimnasio le apago el acceso a la app.
 *   telefono          el que esta en el formulario.
 */
export function avisoContrasenaFicha({ passwordAsignada, appAcceso, telefono } = {}) {
  const partes = [];
  if (passwordAsignada === true) {
    partes.push('Ya tiene contraseña para la app. Escribe una nueva solo si quieres cambiarla.');
  } else if (passwordAsignada === false) {
    partes.push('Aún no tiene contraseña: no puede entrar a la app hasta que le asignes una.');
  } else {
    partes.push('Con su teléfono y esta contraseña el miembro entra a la app FitLoyalty.');
  }
  if (appAcceso === false) partes.push('Su acceso a la app está desactivado.');
  if (!telefonoSirveParaApp(telefono)) {
    partes.push('Con este teléfono no podrá entrar: la app pide 10 dígitos que empiecen por 3.');
  }
  return partes.join(' ');
}
