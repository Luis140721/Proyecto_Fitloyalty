/**
 * lib/contactoWhatsapp.js
 *
 * RQNF-16 (Ley 2300 de 2023): antes de abrir WhatsApp se le pregunta al
 * servidor si se puede contactar al miembro (horario, frecuencia, permiso).
 * Solo si dice que si se abre el chat; si no, la pantalla muestra el motivo.
 *
 * El navegador solo deja abrir una pestaña nueva en respuesta directa a un
 * clic. Como la respuesta del servidor llega despues, la pestaña se abre en
 * blanco en el mismo clic y luego se lleva a wa.me (o se cierra si no se
 * puede). Antes de navegar se le quita `opener`, para que WhatsApp no tenga
 * acceso a esta pagina.
 *
 *   const r = await abrirWhatsappAutorizado(async () => {
 *     const { data } = await api.post(...);   // registra el envio
 *     return `https://wa.me/...`;              // a donde ir
 *   });
 *   if (!r.ok) mostrar(r.error.message);
 */
export async function abrirWhatsappAutorizado(autorizar) {
  let ventana = null;
  try {
    ventana = window.open('about:blank', '_blank');
  } catch (_) {
    ventana = null;
  }

  try {
    const url = await autorizar();
    if (ventana && !ventana.closed) {
      try { ventana.opener = null; } catch (_) { /* algunos navegadores no dejan */ }
      ventana.location.replace(url);
    } else {
      // Bloqueador de ventanas: se intenta igual, ya con la respuesta.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return { ok: true, url };
  } catch (error) {
    if (ventana && !ventana.closed) ventana.close();
    return { ok: false, error };
  }
}

/**
 * Texto para cada motivo por el que no se le escribe a un miembro (los de
 * campana_destinatario.motivo, migracion 018, y los del 409
 * CONTACTO_NO_PERMITIDO).
 */
export const MOTIVOS_CONTACTO = {
  NO_AUTORIZA: 'No aceptó mensajes comerciales',
  CANAL_NO_AUTORIZADO: 'No autorizó este canal',
  FUERA_DE_HORARIO: 'Fuera del horario permitido: sale en la siguiente franja',
  FRECUENCIA: 'Ya se le contactó (hoy, u otro canal esta semana)',
  SIN_TELEFONO: 'Sin teléfono válido',
  SIN_CORREO: 'Sin correo',
  ERROR_ENVIO: 'El envío falló',
};

/** El horario de la Ley 2300 de 2023, en una frase. */
export const TEXTO_HORARIO = 'de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos';
