/**
 * lib/autorizaciones.js
 *
 * RQNF-17: textos de las autorizaciones que se le muestran al miembro en el
 * alta y en la edicion, y el calculo de la edad para saber si es menor.
 *
 * Los textos son los de la version v1 de backend/src/lib/autorizaciones.js:
 * el backend guarda esa version como prueba de lo que se le mostro al
 * titular. Si se cambia una palabra aqui, hay que cambiarla alla y subir la
 * version.
 */

export const VERSION_AUTORIZACIONES = 'v1';

export const TEXTOS_AUTORIZACION = {
  TERMINOS:
    'Acepto el contrato de membresía del gimnasio, que me informa el precio total, la forma de pago, la vigencia, '
    + 'las condiciones de renovación, congelamiento y terminación, y el canal de peticiones, quejas y reclamos. '
    + 'Recibo una copia por WhatsApp y la puedo ver en la app.',
  TRATAMIENTO_DATOS:
    'Autorizo al gimnasio, como responsable, a tratar mis datos personales (identificación, contacto, plan, pagos '
    + 'e ingresos) para gestionar mi membresía, controlar el acceso y avisarme sobre mi plan, según su política de '
    + 'tratamiento de datos. Puedo conocer, actualizar, rectificar y suprimir mis datos y revocar esta autorización '
    + '(Ley 1581 de 2012).',
  DATOS_SENSIBLES:
    'Autorizo de forma expresa al gimnasio a tratar mis datos de salud (condiciones médicas, lesiones y alergias) '
    + 'solo para cuidar mi seguridad durante el entrenamiento. Sé que son datos sensibles, que no estoy obligado(a) '
    + 'a autorizar su tratamiento ni a entregarlos y que mi membresía no depende de ello. Puedo revocar esta '
    + 'autorización en cualquier momento desde la app o en recepción, y entonces esos datos se borran.',
  REPRESENTANTE_MENOR:
    'Como representante legal del menor, autorizo el tratamiento de sus datos personales y acepto el contrato en '
    + 'su nombre, respetando su interés superior y sus derechos fundamentales. Si se marca la autorización de datos '
    + 'sensibles, la doy también como su representante.',
};

export const NOMBRES_AUTORIZACION = {
  TERMINOS: 'Contrato y términos',
  TRATAMIENTO_DATOS: 'Tratamiento de datos',
  DATOS_SENSIBLES: 'Datos sensibles (salud)',
  REPRESENTANTE_MENOR: 'Representante legal',
  MENSAJES_COMERCIALES: 'Mensajes comerciales',
};

export const TIPOS_DOC_REPRESENTANTE = ['CC', 'CE', 'PP'];
export const PARENTESCOS = ['Madre', 'Padre', 'Tutor(a) legal', 'Otro familiar a cargo'];

/** Edad cumplida a hoy (null si la fecha no sirve). */
export function edadEnAnios(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const m = hoy.getMonth() - fecha.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return edad;
}

/**
 * Menor de edad: menos de 18 segun la fecha de nacimiento; sin fecha, la
 * tarjeta de identidad (TI) solo la tienen los menores. Es la misma regla del
 * backend (esMenorDeEdad).
 */
export function esMenor(fecha, tipoDocumento) {
  const edad = edadEnAnios(fecha);
  if (edad !== null) return edad < 18;
  return tipoDocumento === 'TI';
}

/** 'AAAA-MM-DD' (de un <input type="date">) a Date local. */
export function isoADate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Errores del representante (mismas reglas que representanteSchema del backend). */
export function erroresRepresentante(f) {
  const e = {};
  if ((f.representante_nombre || '').trim().length < 3) e.representante_nombre = 'Escribe el nombre completo del representante legal.';
  if (!TIPOS_DOC_REPRESENTANTE.includes(f.representante_tipo_documento)) e.representante_tipo_documento = 'Elige el tipo de documento.';
  if ((f.representante_documento || '').trim().length < 4) e.representante_documento = 'Escribe el documento del representante.';
  if ((f.representante_parentesco || '').trim().length < 3) e.representante_parentesco = 'Indica el parentesco con el menor.';
  if (!/^\d{7,15}$/.test((f.representante_telefono || '').replace(/\D/g, ''))) {
    e.representante_telefono = 'Debe tener entre 7 y 15 dígitos.';
  }
  return e;
}
