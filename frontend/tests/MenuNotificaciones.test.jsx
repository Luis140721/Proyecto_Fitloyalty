/**
 * Cobertura del front (Luis): MenuNotificaciones, la campana del encabezado.
 * Los avisos los arma GET /api/admin/notificaciones (vencidas, por vencer, en
 * riesgo y accesos bloqueados); desde cada uno se va a Miembros con el nombre
 * buscado, se escribe por WhatsApp (y se registra el envio, RQF-09) o se marca
 * un acceso bloqueado como visto (RQF-06).
 *
 * RQNF-16 (Ley 2300 de 2023, #108): el envio se registra ANTES de abrir el
 * chat. El clic abre una pestaña en blanco; el servidor revisa el permiso, el
 * horario y la frecuencia y, si deja, la pestaña va a wa.me con el texto que
 * devuelve. Si no, la pestaña se cierra y el panel dice por que.
 *
 * El API se simula con vi.mock. La campana se refresca cada 30 s: ese test
 * usa timers falsos solo para setInterval.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import MenuNotificaciones from '../src/components/MenuNotificaciones';

let mockGet, mockPost;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) } }));

// Avisos como los arma backend/src/routes/notificaciones.js.
const BLOQUEADO = {
  id: 'acceso-bloqueado-9', tipo: 'acceso-bloqueado', icono: 'block', titulo: 'Ana Pérez intento ingresar y fue bloqueado',
  detalle: 'Membresia vencida · hace 5 min', idMiembro: 1, nombreMiembro: 'Ana Pérez', telefono: null, mensaje: 'Hola Ana', idNotificacion: 9,
};
const VENCIDA = {
  id: 'vencida-2', tipo: 'vencida', icono: 'event_busy', titulo: 'La membresia de Carlos Ruiz vencio', detalle: 'Hace 3 dias',
  idMiembro: 2, nombreMiembro: 'Carlos Ruiz', telefono: '573109876543', mensaje: 'Hola Carlos, tu plan vencio hace 3 dias.',
};
const RIESGO = {
  id: 'riesgo-3', tipo: 'riesgo', icono: 'trending_down', titulo: 'Alerta roja: Luisa Gómez dejo de venir', detalle: '16 dias sin ingresar',
  idMiembro: 3, nombreMiembro: 'Luisa Gómez', telefono: '573001112233', mensaje: 'Luisa, te extrañamos.', nivel: 'ROJA', idAlerta: 31,
};

let avisos;

/** La pestaña en blanco que abre el clic, como la usa src/lib/contactoWhatsapp.js. */
const pestanaEnBlanco = () => ({ closed: false, opener: window, location: { replace: vi.fn() }, close: vi.fn() });
// El pie que el servidor le agrega a un mensaje comercial (backend/src/lib/baja-mensajes.js).
const PIE_BAJA = '\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: https://panel.fitloyalty.test/baja/3.7.firma';
// 201 de POST /api/admin/notificaciones/enviado.
const registrado = (mensaje, clase) => ({
  data: { message: 'Envio registrado.', envio: { id_envio: 55, estado: 'ENVIADO' }, mensaje, clase, texto_del_servidor: clase === 'AVISO' },
});

function Destino() {
  const { pathname, search } = useLocation();
  return <p>Ruta actual: {pathname}{search}</p>;
}

function abrirEncabezado() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <Routes>
        <Route path="/admin/dashboard" element={<div><MenuNotificaciones /><p>Resto del encabezado</p></div>} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
  return { user };
}

const campana = (nombre) => screen.findByRole('button', { name: nombre });
const panel = () => screen.getByRole('dialog', { name: 'Notificaciones' });
const avisoDe = (titulo) => within(panel()).getByText(titulo).closest('button');

/** Abre la app con los avisos cargados y la campana abierta. */
async function abrirCampana() {
  const pantalla = abrirEncabezado();
  await pantalla.user.click(await campana(`Notificaciones (${avisos.length})`));
  await within(panel()).findByText(avisos[0].titulo);
  return pantalla;
}

beforeEach(() => {
  avisos = [BLOQUEADO, VENCIDA, RIESGO];
  mockGet = vi.fn(async () => ({ data: { total: avisos.length, avisos } }));
  mockPost = vi.fn(async () => ({ data: { ok: true } }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MenuNotificaciones: la campana', () => {
  test('should count the notices in the bell when the header loads', async () => {
    // Act
    abrirEncabezado();

    // Assert
    expect(await campana('Notificaciones (3)')).toHaveTextContent('3');
    expect(mockGet).toHaveBeenCalledWith('/admin/notificaciones');
  });

  test('should list each notice with its label and say when a member has no phone', async () => {
    // Act
    await abrirCampana();

    // Assert
    expect(avisoDe(BLOQUEADO.titulo)).toHaveTextContent('Membresia vencida · hace 5 min');
    expect(avisoDe(BLOQUEADO.titulo)).toHaveTextContent('Bloqueado');
    expect(avisoDe(BLOQUEADO.titulo)).toHaveTextContent('Sin teléfono');
    expect(avisoDe(VENCIDA.titulo)).toHaveTextContent('Vencida');
    expect(avisoDe(RIESGO.titulo)).toHaveTextContent('En riesgo');
    expect(within(avisoDe(VENCIDA.titulo)).getByRole('button', { name: 'WhatsApp' })).toHaveAttribute('title', 'Escribirle a Carlos Ruiz por WhatsApp');
  });

  test('should say everything is up to date when there are no notices', async () => {
    // Arrange
    avisos = [];
    const { user } = abrirEncabezado();

    // Act
    await user.click(await campana('Notificaciones'));

    // Assert
    expect(await within(panel()).findByText('Todo al día. No hay membresías por vencer ni miembros en riesgo.')).toBeInTheDocument();
  });

  test('should explain the failure when the notices cannot be loaded', async () => {
    // Arrange
    mockGet = vi.fn(async () => { throw { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar los avisos. Intenta de nuevo.' }; });
    const { user } = abrirEncabezado();

    // Act
    await user.click(await campana('Notificaciones'));

    // Assert
    expect(await within(panel()).findByText('No pudimos cargar los avisos.')).toBeInTheDocument();
    expect(within(panel()).queryByText(/^Todo al día/)).not.toBeInTheDocument();
  });

  test('should reload the notices when 30 seconds pass and when the bell opens', async () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    abrirEncabezado();
    await campana('Notificaciones (3)');

    // Act
    act(() => vi.advanceTimersByTime(30000));
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones (3)' }));

    // Assert
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
  });
});

describe('MenuNotificaciones: lo que se hace con un aviso', () => {
  test('should go to Miembros with the name already searched when a notice is clicked', async () => {
    // Arrange
    const { user } = await abrirCampana();

    // Act
    await user.click(avisoDe(VENCIDA.titulo));

    // Assert
    expect(await screen.findByText('Ruta actual: /admin/miembros?q=Carlos%20Ruiz')).toBeInTheDocument();
  });

  // RQNF-16: antes el chat se abria con el texto del aviso y despues se registraba. Ahora se
  // registra primero (antesDeAbrir) y el chat se abre con el texto que devuelve el servidor:
  // a un mensaje comercial, como el de «en riesgo», le agrega el enlace de baja.
  test('should record the sending first, open WhatsApp with the text of the server and mark it as sent when the WhatsApp button of a notice is clicked', async () => {
    // Arrange: Luisa acepto mensajes comerciales por WhatsApp
    const ventana = pestanaEnBlanco();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => registrado(`${RIESGO.mensaje}${PIE_BAJA}`, 'COMERCIAL'));
    const { user } = await abrirCampana();

    // Act
    await user.click(within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(await within(avisoDe(RIESGO.titulo)).findByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', {
      idMiembro: 3, canal: 'WHATSAPP', tipo: 'riesgo', mensaje: RIESGO.mensaje, idAlerta: 31, antesDeAbrir: true,
    });
    expect(ventana.location.replace).toHaveBeenCalledTimes(1);
    expect(ventana.location.replace).toHaveBeenCalledWith(`https://wa.me/573001112233?text=${encodeURIComponent(`${RIESGO.mensaje}${PIE_BAJA}`)}`);
    // El registro va antes de llevar la pestaña a WhatsApp, y WhatsApp no puede tocar el panel.
    expect(mockPost.mock.invocationCallOrder[0]).toBeLessThan(ventana.location.replace.mock.invocationCallOrder[0]);
    expect(ventana.opener).toBeNull();
    expect(ventana.close).not.toHaveBeenCalled();
    expect(within(panel()).queryByRole('status')).not.toBeInTheDocument();
    expect(panel()).toBeInTheDocument();
  });

  test('should open the chat with the text the server wrote for the notice of the plan when the notice is an expired membership', async () => {
    // Arrange: un aviso del plan (AVISO) no pide la aceptacion comercial y su texto lo arma el servidor
    const DEL_SERVIDOR = 'Hola Carlos, tu plan en Gimnasio Central venció hace 3 días. Renuévalo cuando quieras.';
    const ventana = pestanaEnBlanco();
    vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => registrado(DEL_SERVIDOR, 'AVISO'));
    const { user } = await abrirCampana();

    // Act
    await user.click(within(avisoDe(VENCIDA.titulo)).getByRole('button', { name: 'WhatsApp' }));

    // Assert: no se abre el texto del panel sino el que quedo en la constancia
    await waitFor(() => expect(ventana.location.replace).toHaveBeenCalledWith(`https://wa.me/573109876543?text=${encodeURIComponent(DEL_SERVIDOR)}`));
    expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', {
      idMiembro: 2, canal: 'WHATSAPP', tipo: 'vencida', mensaje: VENCIDA.mensaje, idAlerta: undefined, antesDeAbrir: true,
    });
    expect(await within(avisoDe(VENCIDA.titulo)).findByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
  });

  test('should not open WhatsApp and say why when the member has not accepted commercial messages', async () => {
    // Arrange: el 409 de un mensaje de retencion a quien no lo acepto (Ley 2300, art. 5)
    const ventana = pestanaEnBlanco();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => {
      throw { status: 409, code: 'CONTACTO_NO_PERMITIDO', message: 'Luisa no ha aceptado recibir mensajes comerciales del gimnasio.' };
    });
    const { user } = await abrirCampana();

    // Act
    await user.click(within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(await within(panel()).findByRole('status')).toHaveTextContent(
      /^No se abrió WhatsApp: Luisa no ha aceptado recibir mensajes comerciales del gimnasio\.$/,
    );
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: 'Enviado' })).not.toBeInTheDocument();
  });

  test('should take the previous reason away when the next message can be sent', async () => {
    // Arrange: el primero no se puede (comercial sin aceptacion); el segundo es un aviso del plan
    const ventana = pestanaEnBlanco();
    vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn()
      .mockRejectedValueOnce({ status: 409, code: 'CONTACTO_NO_PERMITIDO', message: 'Luisa no ha aceptado recibir mensajes comerciales del gimnasio.' })
      .mockResolvedValueOnce(registrado(VENCIDA.mensaje, 'AVISO'));
    const { user } = await abrirCampana();
    await user.click(within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' }));
    await within(panel()).findByRole('status');

    // Act
    await user.click(within(avisoDe(VENCIDA.titulo)).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(await within(avisoDe(VENCIDA.titulo)).findByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('status')).not.toBeInTheDocument();
  });

  test('should ignore other keys and open WhatsApp when Space is pressed on the WhatsApp button', async () => {
    // Arrange: window.open devuelve null, como cuando el navegador bloquea la pestaña en blanco
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user } = await abrirCampana();
    within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' }).focus();

    // Act y Assert: una letra no hace nada
    await user.keyboard('a');
    expect(abrir).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();

    // Act y Assert: la barra espaciadora abre el chat, como Enter. Sin pestaña en blanco, se abre ya con la respuesta
    await user.keyboard(' ');
    await waitFor(() => expect(abrir).toHaveBeenCalledWith(
      `https://wa.me/573001112233?text=${encodeURIComponent(RIESGO.mensaje)}`, '_blank', 'noopener,noreferrer',
    ));
  });

  // RQNF-16: el escenario viejo («se abrio WhatsApp pero no quedo registrado») ya no existe:
  // sin registro no se abre el chat. Este es el equivalente.
  test('should not open WhatsApp and say that the sending could not be recorded when the API fails', async () => {
    // Arrange
    const ventana = pestanaEnBlanco();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => { throw { status: 503, message: 'Sin base' }; });
    const { user } = await abrirCampana();

    // Act: tambien con el teclado
    within(avisoDe(VENCIDA.titulo)).getByRole('button', { name: 'WhatsApp' }).focus();
    await user.keyboard('{Enter}');

    // Assert
    expect(await within(panel()).findByRole('status')).toHaveTextContent(
      /^No se abrió WhatsApp porque no pudimos registrar el envío a Carlos Ruiz\. Intenta de nuevo\.$/,
    );
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(within(avisoDe(VENCIDA.titulo)).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: 'Enviado' })).not.toBeInTheDocument();
  });

  test('should remove a blocked access from the list when it is marked as seen', async () => {
    // Arrange
    const { user } = await abrirCampana();

    // Act
    await user.click(within(avisoDe(BLOQUEADO.titulo)).getByRole('button', { name: 'Visto' }));

    // Assert
    expect(within(panel()).queryByText(BLOQUEADO.titulo)).not.toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/acceso-bloqueado/9/leida');
    expect(screen.getByRole('button', { name: 'Notificaciones (2)' })).toBeInTheDocument();
  });

  // RQNF-16: felicitar por un reto es un mensaje comercial (decision 3 de la evidencia), no un aviso del plan.
  test('should not open WhatsApp for a completed challenge when the member has not accepted commercial messages, and mark it as seen through its own route', async () => {
    // Arrange: el aviso de reto completado como lo arma GET /api/admin/notificaciones (#104)
    const RETO = {
      id: 'reto-completado-12', tipo: 'reto-completado', icono: 'emoji_events', titulo: 'Luisa Gómez completó un reto', detalle: 'Completó el reto «10 visitas en noviembre»',
      idMiembro: 3, nombreMiembro: 'Luisa Gómez', telefono: '573001112233', mensaje: 'Luisa, felicitaciones por completar el reto «10 visitas en noviembre».', idNotificacion: 12,
    };
    avisos = [RETO];
    const ventana = pestanaEnBlanco();
    vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async (url) => {
      if (url === '/admin/notificaciones/enviado') {
        throw { status: 409, code: 'CONTACTO_NO_PERMITIDO', message: 'Luisa no ha aceptado recibir mensajes comerciales del gimnasio.' };
      }
      return { data: { ok: true } };
    });
    const { user } = await abrirCampana();
    expect(avisoDe(RETO.titulo)).toHaveTextContent('Reto');

    // Act
    await user.click(within(avisoDe(RETO.titulo)).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(await within(panel()).findByRole('status')).toHaveTextContent(
      /^No se abrió WhatsApp: Luisa no ha aceptado recibir mensajes comerciales del gimnasio\.$/,
    );
    expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', {
      idMiembro: 3, canal: 'WHATSAPP', tipo: 'reto-completado', mensaje: RETO.mensaje, idAlerta: undefined, antesDeAbrir: true,
    });
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);

    // Act
    await user.click(within(avisoDe(RETO.titulo)).getByRole('button', { name: 'Visto' }));

    // Assert
    expect(within(panel()).queryByText(RETO.titulo)).not.toBeInTheDocument();
    expect(mockPost).toHaveBeenLastCalledWith('/admin/notificaciones/reto/12/leida');
  });

  test('should bring the blocked access back when marking it as seen fails', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 503, message: 'Sin base' }; });
    const { user } = await abrirCampana();

    // Act: con la barra espaciadora
    within(avisoDe(BLOQUEADO.titulo)).getByRole('button', { name: 'Visto' }).focus();
    await user.keyboard(' ');

    // Assert
    expect(await within(panel()).findByText(BLOQUEADO.titulo)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledTimes(3);
  });
});

describe('MenuNotificaciones: abrir y cerrar', () => {
  test('should close when Escape or a click outside happens, and stay open when the click is inside', async () => {
    // Arrange
    const { user } = await abrirCampana();

    // Act y Assert
    fireEvent.mouseDown(within(panel()).getByText('Avisos'));
    expect(panel()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notificaciones (3)' }));
    fireEvent.mouseDown(screen.getByText('Resto del encabezado'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should reload the notices when the refresh button of the panel is clicked', async () => {
    // Arrange
    const { user } = await abrirCampana();
    const antes = mockGet.mock.calls.length;

    // Act
    await user.click(within(panel()).getByRole('button', { name: 'Actualizar avisos' }));

    // Assert
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(antes + 1));
  });
});
