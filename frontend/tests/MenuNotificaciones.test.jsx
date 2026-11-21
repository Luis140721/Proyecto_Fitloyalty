/**
 * Cobertura del front (Luis): MenuNotificaciones, la campana del encabezado.
 * Los avisos los arma GET /api/admin/notificaciones (vencidas, por vencer, en
 * riesgo y accesos bloqueados); desde cada uno se va a Miembros con el nombre
 * buscado, se escribe por WhatsApp (y se registra el envio, RQF-09) o se marca
 * un acceso bloqueado como visto (RQF-06).
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

  test('should open WhatsApp, record the sending and mark it as sent when the WhatsApp button of a notice is clicked', async () => {
    // Arrange
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user } = await abrirCampana();

    // Act
    await user.click(within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(abrir).toHaveBeenCalledWith(`https://wa.me/573001112233?text=${encodeURIComponent(RIESGO.mensaje)}`, '_blank', 'noopener,noreferrer');
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', {
      idMiembro: 3, canal: 'WHATSAPP', tipo: 'riesgo', mensaje: RIESGO.mensaje, idAlerta: 31,
    }));
    expect(within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(panel()).toBeInTheDocument();
  });

  test('should ignore other keys and open WhatsApp when Space is pressed on the WhatsApp button', async () => {
    // Arrange
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user } = await abrirCampana();
    within(avisoDe(RIESGO.titulo)).getByRole('button', { name: 'WhatsApp' }).focus();

    // Act y Assert: una letra no hace nada
    await user.keyboard('a');
    expect(abrir).not.toHaveBeenCalled();

    // Act y Assert: la barra espaciadora abre el chat, como Enter
    await user.keyboard(' ');
    expect(abrir).toHaveBeenCalledWith(`https://wa.me/573001112233?text=${encodeURIComponent(RIESGO.mensaje)}`, '_blank', 'noopener,noreferrer');
  });

  test('should say that the sending was not recorded when the API fails after opening WhatsApp', async () => {
    // Arrange
    vi.spyOn(window, 'open').mockReturnValue(null);
    mockPost = vi.fn(async () => { throw { status: 503, message: 'Sin base' }; });
    const { user } = await abrirCampana();

    // Act: tambien con el teclado
    within(avisoDe(VENCIDA.titulo)).getByRole('button', { name: 'WhatsApp' }).focus();
    await user.keyboard('{Enter}');

    // Assert
    expect(await within(panel()).findByRole('status')).toHaveTextContent('Se abrió WhatsApp, pero no pudimos registrar el envío a Carlos Ruiz.');
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
