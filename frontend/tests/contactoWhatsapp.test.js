/**
 * RQNF-16 (Ley 2300 de 2023, #108): abrirWhatsappAutorizado, de
 * src/lib/contactoWhatsapp.js. Es lo que usan la campana, la lista de miembros
 * y las campañas para escribir por WhatsApp: el chat solo se abre si el
 * servidor lo permite (permiso, horario y frecuencia).
 *
 * El navegador solo deja abrir una pestaña en respuesta directa a un clic, y
 * la respuesta del servidor llega despues. Por eso la pestaña se abre en
 * blanco con el clic y luego se lleva a wa.me, o se cierra si no se puede.
 *
 * window.open es un espia que devuelve una pestaña falsa. No hay reloj ni red.
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { abrirWhatsappAutorizado } from '../src/lib/contactoWhatsapp';

const URL_CHAT = `https://wa.me/573001234567?text=${encodeURIComponent('Hola Ana, te esperamos.')}`;
const NO_ACEPTO = { status: 409, code: 'CONTACTO_NO_PERMITIDO', message: 'Ana no ha aceptado recibir mensajes comerciales del gimnasio.' };

/** La pestaña en blanco que devuelve window.open('about:blank', '_blank'). */
const pestanaEnBlanco = (extra = {}) => ({ closed: false, opener: window, location: { replace: vi.fn() }, close: vi.fn(), ...extra });
const navegadorQueAbre = (pestana) => vi.spyOn(window, 'open').mockImplementation(() => pestana);

afterEach(() => vi.restoreAllMocks());

describe('abrirWhatsappAutorizado: el servidor lo permite', () => {
  test('should open a blank tab with the click, ask the server and only then take the tab to WhatsApp when the contact is allowed', async () => {
    // Arrange: mientras el servidor contesta, la pestaña sigue en blanco
    const pestana = pestanaEnBlanco();
    const abrir = navegadorQueAbre(pestana);
    let responder;
    const autorizar = vi.fn(() => new Promise((resolve) => { responder = resolve; }));

    // Act
    const resultado = abrirWhatsappAutorizado(autorizar);

    // Assert: el clic ya abrio la pestaña en blanco y ya se le pregunto al servidor
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(autorizar).toHaveBeenCalledTimes(1);
    expect(pestana.location.replace).not.toHaveBeenCalled();

    // Act: el servidor contesta que si
    responder(URL_CHAT);

    // Assert
    await expect(resultado).resolves.toEqual({ ok: true, url: URL_CHAT });
    expect(pestana.location.replace).toHaveBeenCalledTimes(1);
    expect(pestana.location.replace).toHaveBeenCalledWith(URL_CHAT);
    expect(pestana.close).not.toHaveBeenCalled();
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  test('should cut the link between WhatsApp and the panel when the tab goes to the chat', async () => {
    // Arrange
    const pestana = pestanaEnBlanco();
    navegadorQueAbre(pestana);

    // Act
    await abrirWhatsappAutorizado(async () => URL_CHAT);

    // Assert: sin opener, la pagina de WhatsApp no puede tocar la del panel
    expect(pestana.opener).toBeNull();
  });

  test('should still take the tab to WhatsApp when the browser does not let the opener be removed', async () => {
    // Arrange: un navegador donde asignar opener lanza un error
    const pestana = pestanaEnBlanco();
    Object.defineProperty(pestana, 'opener', { get: () => window, set: () => { throw new Error('opener es de solo lectura'); } });
    navegadorQueAbre(pestana);

    // Act
    const resultado = await abrirWhatsappAutorizado(async () => URL_CHAT);

    // Assert
    expect(resultado).toEqual({ ok: true, url: URL_CHAT });
    expect(pestana.location.replace).toHaveBeenCalledWith(URL_CHAT);
  });
});

describe('abrirWhatsappAutorizado: el servidor no lo permite', () => {
  test('should close the blank tab, open nothing else and return the error of the server when the contact is not allowed', async () => {
    // Arrange
    const pestana = pestanaEnBlanco();
    const abrir = navegadorQueAbre(pestana);

    // Act
    const resultado = await abrirWhatsappAutorizado(async () => { throw NO_ACEPTO; });

    // Assert
    expect(resultado).toEqual({ ok: false, error: NO_ACEPTO });
    expect(pestana.close).toHaveBeenCalledTimes(1);
    expect(pestana.location.replace).not.toHaveBeenCalled();
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
  });

  test('should not try to close the tab when the person already closed it and the contact is not allowed', async () => {
    // Arrange
    const pestana = pestanaEnBlanco({ closed: true });
    const abrir = navegadorQueAbre(pestana);

    // Act
    const resultado = await abrirWhatsappAutorizado(async () => { throw NO_ACEPTO; });

    // Assert
    expect(resultado).toEqual({ ok: false, error: NO_ACEPTO });
    expect(pestana.close).not.toHaveBeenCalled();
    expect(abrir).toHaveBeenCalledTimes(1);
  });
});

describe('abrirWhatsappAutorizado: el navegador no deja la pestaña en blanco', () => {
  test.each([
    ['the pop-up blocker returns no tab', () => null],
    ['opening the blank tab throws', () => { throw new Error('Bloqueado'); }],
    ['the person closed the blank tab while waiting', () => pestanaEnBlanco({ closed: true })],
  ])('should open WhatsApp in a new tab once the server allows it when %s', async (_caso, primeraPestana) => {
    // Arrange: solo la primera llamada (la pestaña en blanco) falla
    const abrir = vi.spyOn(window, 'open').mockImplementationOnce(primeraPestana).mockImplementation(() => null);
    const autorizar = vi.fn(async () => URL_CHAT);

    // Act
    const resultado = await abrirWhatsappAutorizado(autorizar);

    // Assert: se le pregunta al servidor igual, y el chat se abre ya con su respuesta
    expect(resultado).toEqual({ ok: true, url: URL_CHAT });
    expect(autorizar).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir).toHaveBeenNthCalledWith(1, 'about:blank', '_blank');
    expect(abrir).toHaveBeenNthCalledWith(2, URL_CHAT, '_blank', 'noopener,noreferrer');
  });

  test('should open nothing at all when the blank tab was blocked and the contact is not allowed', async () => {
    // Arrange
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);

    // Act
    const resultado = await abrirWhatsappAutorizado(async () => { throw NO_ACEPTO; });

    // Assert
    expect(resultado).toEqual({ ok: false, error: NO_ACEPTO });
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
  });
});
