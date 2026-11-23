/**
 * RQNF-16 (Ley 2300 de 2023, art. 5; #108): BajaMensajesPage, la pagina
 * publica /baja/:token a la que lleva el enlace que va al final de cada
 * mensaje comercial. El miembro deja de recibirlos con un clic, sin iniciar
 * sesion.
 *
 * Lo que mas importa: abrir el enlace NO da de baja a nadie (los programas que
 * muestran una vista previa del enlace lo abren solos); la baja la hace el
 * boton, con POST /api/baja/:token. Solo se ven el primer nombre y el gimnasio.
 *
 * El API se simula con vi.mock, con las respuestas de
 * backend/src/routes/preferencias.js. No hay reloj.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import BajaMensajesPage from '../src/pages/BajaMensajesPage';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPost;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) } }));

// El token es <id_miembro>.<id_gimnasio>.<firma>: no lleva datos personales.
const TOKEN = '41.7.c2lnbmF0dXJlLWZpcm1hMQ';
// GET /api/baja/:token (paraBaja): solo el primer nombre, el gimnasio y si acepta.
const ANA_ACEPTA = { nombre: 'Ana', gimnasio: 'Gimnasio Central', aceptaComerciales: true };
const ANA_YA_NO = { ...ANA_ACEPTA, aceptaComerciales: false };
// POST /api/baja/:token.
const BAJA_HECHA = { message: 'Listo: dejaste de recibir mensajes comerciales de este gimnasio.', cambio: true, ...ANA_YA_NO };
const ENLACE_INVALIDO = { status: 404, code: 'ENLACE_INVALIDO', message: 'El enlace no es válido.' };

const abrirEnlace = (token = TOKEN) => renderWithProviders(<BajaMensajesPage />, { route: `/baja/${token}`, path: '/baja/:token' });
const botonBaja = () => screen.getByRole('button', { name: /Dejar de recibir mensajes comerciales$/ });
const sinBoton = () => expect(screen.queryByRole('button', { name: /Dejar de recibir|Guardando/ })).not.toBeInTheDocument();

beforeEach(() => {
  mockGet = vi.fn(async () => ({ data: ANA_ACEPTA }));
  mockPost = vi.fn(async () => ({ data: BAJA_HECHA }));
});

describe('BajaMensajesPage: abrir el enlace', () => {
  test('should greet the member by the first name, name the gym and offer the button when the link is valid', async () => {
    // Act
    abrirEnlace();

    // Assert
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mensajes comerciales');
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ })).toBeEnabled();
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent(
      'Hola Ana. Con este botón dejas de recibir mensajes comerciales de Gimnasio Central (promociones, campañas y mensajes para que vuelvas a entrenar).',
    );
    expect(screen.getByText('Los avisos sobre tu plan, como el de vencimiento, no son comerciales y te seguirán llegando.')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/baja/41.7.c2lnbmF0dXJlLWZpcm1hMQ');
  });

  test('should not unsubscribe anybody when the link is only opened', async () => {
    // Act: lo que hace la vista previa de WhatsApp o del correo
    abrirEnlace();
    await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ });

    // Assert
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Listo,/)).not.toBeInTheDocument();
  });

  test('should send the token as one piece of the URL when it has characters that mean something in a URL', async () => {
    // Act: un token con una barra y un interrogante (en la URL del navegador van codificados)
    abrirEnlace('41.7.a%2Fb%3Fc');

    // Assert
    await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ });
    expect(mockGet).toHaveBeenCalledWith('/baja/41.7.a%2Fb%3Fc');
  });

  test('should say it is already done and not offer the button when the member no longer receives commercial messages', async () => {
    // Arrange
    mockGet = vi.fn(async () => ({ data: ANA_YA_NO }));

    // Act
    abrirEnlace();

    // Assert
    expect(await screen.findByText('Listo, Ana')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent(
      'Ya no recibes mensajes comerciales de Gimnasio Central. Si cambias de opinión, puedes activarlos de nuevo desde la app FitLoyalty («Más» → «Mensajes del gimnasio») o en recepción.',
    );
    sinBoton();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('should say the link is not valid and how to unsubscribe another way when the server does not know the token', async () => {
    // Arrange
    mockGet = vi.fn(async () => { throw ENLACE_INVALIDO; });

    // Act
    abrirEnlace('41.7.firma-alterada');

    // Assert
    expect(await screen.findByText('El enlace no es válido')).toBeInTheDocument();
    expect(screen.getByText(
      'Revisa que lo hayas copiado completo. También puedes dejar de recibir mensajes desde la app de tu gimnasio o pidiéndolo en recepción.',
    )).toBeInTheDocument();
    sinBoton();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });

  test.each([
    ['the message of the API', { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar el enlace. Intenta de nuevo.' }, 'No pudimos cargar el enlace. Intenta de nuevo.'],
    ['a generic message', { status: 500 }, 'No pudimos cargar el enlace. Intenta de nuevo en un momento.'],
  ])('should show %s and not say the link is invalid when the link cannot be loaded', async (_caso, error, texto) => {
    // Arrange
    mockGet = vi.fn(async () => { throw error; });

    // Act
    abrirEnlace();

    // Assert
    expect(within(await screen.findByRole('alert')).getByText(texto)).toBeInTheDocument();
    expect(screen.queryByText('El enlace no es válido')).not.toBeInTheDocument();
    sinBoton();
  });
});

describe('BajaMensajesPage: darse de baja', () => {
  test('should unsubscribe with the token and confirm it when the member presses the button', async () => {
    // Arrange
    const { user } = abrirEnlace();

    // Act
    await user.click(await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ }));

    // Assert
    expect(await screen.findByText('Listo, Ana')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Ya no recibes mensajes comerciales de Gimnasio Central.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/baja/41.7.c2lnbmF0dXJlLWZpcm1hMQ');
    sinBoton();
    expect(screen.queryByText(/^Hola Ana\./)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should send a single request and say Guardando when the button is pressed twice while the first one is on its way', async () => {
    // Arrange: la baja no contesta hasta que el test lo diga
    let responder;
    mockPost = vi.fn(() => new Promise((resolve) => { responder = resolve; }));
    const { user } = abrirEnlace();
    await user.click(await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ }));

    // Act
    const guardando = screen.getByRole('button', { name: /Guardando…$/ });
    await user.click(guardando);

    // Assert
    expect(guardando).toBeDisabled();
    expect(mockPost).toHaveBeenCalledTimes(1);

    await act(async () => responder({ data: BAJA_HECHA }));
    expect(await screen.findByText('Listo, Ana')).toBeInTheDocument();
  });

  test.each([
    ['the message of the API', { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos guardar tu baja. Intenta de nuevo.' }, 'No pudimos guardar tu baja. Intenta de nuevo.'],
    ['the message of the rate limit', { status: 429, code: null, message: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' }, 'Demasiadas solicitudes. Intenta de nuevo en un minuto.'],
    ['a generic message', {}, 'No pudimos guardar tu baja. Intenta de nuevo.'],
  ])('should show %s and keep the button to try again when the unsubscription cannot be saved', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirEnlace();

    // Act
    await user.click(await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ }));

    // Assert: no se dice «Listo» si la baja no quedo guardada
    expect(within(await screen.findByRole('alert')).getByText(texto)).toBeInTheDocument();
    expect(botonBaja()).toBeEnabled();
    expect(screen.queryByText(/^Listo,/)).not.toBeInTheDocument();
  });

  test('should take the error away and confirm when the second try works', async () => {
    // Arrange: la primera vez falla la base
    mockPost = vi.fn()
      .mockRejectedValueOnce({ status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos guardar tu baja. Intenta de nuevo.' })
      .mockResolvedValueOnce({ data: BAJA_HECHA });
    const { user } = abrirEnlace();
    await user.click(await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ }));
    await screen.findByRole('alert');

    // Act
    await user.click(botonBaja());

    // Assert
    expect(await screen.findByText('Listo, Ana')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  test('should go to the landing when the member clicks Ir al inicio after unsubscribing', async () => {
    // Arrange
    const { user } = abrirEnlace();
    await user.click(await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ }));

    // Act
    await user.click(await screen.findByRole('link', { name: 'Ir al inicio' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /')).toBeInTheDocument();
  });
});

describe('BajaMensajesPage: tiempos', () => {
  const OTRO_TOKEN = '52.7.b3RyYS1maXJtYS1kZS1iZQ';
  const BETO_ACEPTA = { nombre: 'Beto', gimnasio: 'Gimnasio Central', aceptaComerciales: true };

  function OtroEnlace() {
    const navigate = useNavigate();
    return <button type="button" onClick={() => navigate(`/baja/${OTRO_TOKEN}`)}>Abrir el otro enlace</button>;
  }

  /** La pagina con un boton que cambia de enlace sin desmontarla; el primer GET lo responde el test. */
  const abrirDosEnlaces = () => {
    const primero = {};
    mockGet = vi.fn((url) => (url === `/baja/${TOKEN}`
      ? new Promise((resolve, reject) => { primero.responder = resolve; primero.fallar = reject; })
      : Promise.resolve({ data: BETO_ACEPTA })));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/baja/${TOKEN}`]}>
        <Routes>
          <Route path="/baja/:token" element={<><BajaMensajesPage /><OtroEnlace /></>} />
        </Routes>
      </MemoryRouter>,
    );
    return { user, primero };
  };

  test('should keep the member of the second link when the answer of the first one arrives later', async () => {
    // Arrange
    const { user, primero } = abrirDosEnlaces();
    await user.click(screen.getByRole('button', { name: 'Abrir el otro enlace' }));
    await screen.findByText(/^Hola Beto\./);

    // Act: llega tarde la respuesta del primer enlace, que ya no esta en pantalla
    await act(async () => primero.responder({ data: ANA_YA_NO }));

    // Assert
    expect(screen.getByText(/^Hola Beto\./)).toBeInTheDocument();
    expect(screen.queryByText('Listo, Ana')).not.toBeInTheDocument();
    expect(botonBaja()).toBeEnabled();
    expect(mockGet.mock.calls.map(([url]) => url)).toEqual([`/baja/${TOKEN}`, `/baja/${OTRO_TOKEN}`]);
  });

  test('should not call the second link invalid when the first one fails later', async () => {
    // Arrange
    const { user, primero } = abrirDosEnlaces();
    await user.click(screen.getByRole('button', { name: 'Abrir el otro enlace' }));
    await screen.findByText(/^Hola Beto\./);

    // Act
    await act(async () => primero.fallar(ENLACE_INVALIDO));

    // Assert
    expect(screen.getByText(/^Hola Beto\./)).toBeInTheDocument();
    expect(screen.queryByText('El enlace no es válido')).not.toBeInTheDocument();
    await waitFor(() => expect(botonBaja()).toBeEnabled());
  });

  test('should unsubscribe the member of the link on screen when the button is pressed after changing the link', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: { ...BETO_ACEPTA, aceptaComerciales: false, cambio: true, message: 'Listo.' } }));
    const { user } = abrirDosEnlaces();
    await user.click(screen.getByRole('button', { name: 'Abrir el otro enlace' }));
    await screen.findByText(/^Hola Beto\./);

    // Act
    await user.click(botonBaja());

    // Assert
    expect(await screen.findByText('Listo, Beto')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(`/baja/${OTRO_TOKEN}`);
  });
});
