/**
 * Bootcamp semana 4 (Front, Luis): el banner global de errores del API
 * (components/ErrorBanner.jsx) desde lo que ve la persona: el titulo segun el
 * status, el mensaje, cerrar, el cierre solo a los 6 s, el maximo de 4 avisos
 * y el boton "Iniciar sesion" del 401.
 *
 * Una pantalla de prueba dentro de ErrorProvider llama a pushApiError con el
 * error que fija cada test, como hacen las paginas en su catch.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ErrorProvider, useApiError } from '../src/components/ErrorBanner';
import { renderWithProviders } from './renderWithProviders';

let proximoError;

function PantallaQueFalla() {
  const { pushApiError, clear } = useApiError();
  return (
    <>
      <button type="button" onClick={() => pushApiError(proximoError)}>Simular error</button>
      <button type="button" onClick={() => pushApiError(proximoError, { persistent: true })}>Simular error fijo</button>
      <button type="button" onClick={clear}>Limpiar errores</button>
    </>
  );
}

const abrirPantalla = () => renderWithProviders(<ErrorProvider><PantallaQueFalla /></ErrorProvider>, { route: '/admin/miembros' });
const avisos = () => screen.queryAllByRole('alert');
/** Click sincronico: con timers falsos, user-event esperaria timers que no avanzan. */
const fallar = (error, boton = 'Simular error') => { proximoError = error; fireEvent.click(screen.getByRole('button', { name: boton })); };

beforeEach(() => { proximoError = null; });
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe('ErrorBanner: lo que dice cada aviso', () => {
  test.each([
    [0, 'Sin conexion', 'net'],
    [401, 'Sesion expirada', 'warn'],
    [402, 'Tu periodo de prueba expiro', 'warn'],
    [403, 'Sin permiso', 'warn'],
    [404, 'No encontrado', 'error'],
    [409, 'Conflicto', 'warn'],
    [429, 'Demasiadas solicitudes', 'warn'],
    [503, 'Error del servidor', 'error'],
    [400, 'Error', 'error'],
  ])('should title the banner by the status when the API answers %i', async (status, titulo, tono) => {
    // Arrange
    const { user } = abrirPantalla();
    proximoError = { status, code: 'X', message: 'Mensaje del API.' };

    // Act
    await user.click(screen.getByRole('button', { name: 'Simular error' }));

    // Assert
    const aviso = screen.getByRole('alert');
    expect(within(aviso).getByText(titulo)).toHaveClass('error-banner__title');
    expect(within(aviso).getByText('Mensaje del API.')).toBeInTheDocument();
    expect(aviso).toHaveClass(`error-banner--${tono}`);
  });

  test('should say Error desconocido when the error has no message', async () => {
    // Arrange
    const { user } = abrirPantalla();
    proximoError = { status: 500 };

    // Act
    await user.click(screen.getByRole('button', { name: 'Simular error' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Error del servidorError desconocido');
  });

  test('should close the banner when the user clicks the X', async () => {
    // Arrange
    const { user } = abrirPantalla();
    proximoError = { status: 404, message: 'No existe ese miembro.' };
    await user.click(screen.getByRole('button', { name: 'Simular error' }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Cerrar notificacion' }));

    // Assert
    expect(avisos()).toHaveLength(0);
  });

  test('should drop the token and go to the login when the session expired and the user clicks Iniciar sesion', async () => {
    // Arrange
    localStorage.setItem('fitloyalty_token', 'token-vencido');
    const { user } = abrirPantalla();
    proximoError = { status: 401, code: 'TOKEN_EXPIRED', message: 'Tu sesión expiró.' };
    await user.click(screen.getByRole('button', { name: 'Simular error' }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Iniciar sesion' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /login')).toBeInTheDocument();
    expect(localStorage.getItem('fitloyalty_token')).toBeNull();
    expect(sessionStorage.getItem('fitloyalty_after_login_redirect')).toBe(window.location.pathname);
  });

  test('should not offer Iniciar sesion when the error is not a 401', async () => {
    // Arrange
    const { user } = abrirPantalla();
    proximoError = { status: 403, code: 'FORBIDDEN', message: 'No tienes permiso.' };

    // Act
    await user.click(screen.getByRole('button', { name: 'Simular error' }));

    // Assert
    expect(screen.queryByRole('button', { name: 'Iniciar sesion' })).not.toBeInTheDocument();
  });
});

describe('ErrorBanner: cuantos avisos y cuanto duran', () => {
  test('should keep only the last four banners when five errors arrive', async () => {
    // Arrange
    const { user } = abrirPantalla();

    // Act
    for (let n = 1; n <= 5; n += 1) {
      proximoError = { status: 503, message: `Fallo ${n}` };
      await user.click(screen.getByRole('button', { name: 'Simular error' }));
    }

    // Assert
    expect(avisos().map((a) => within(a).getByText(/^Fallo/).textContent)).toEqual(['Fallo 2', 'Fallo 3', 'Fallo 4', 'Fallo 5']);
  });

  test('should remove every banner when the page clears the errors', async () => {
    // Arrange
    const { user } = abrirPantalla();
    proximoError = { status: 503, message: 'Fallo' };
    await user.click(screen.getByRole('button', { name: 'Simular error' }));
    await user.click(screen.getByRole('button', { name: 'Simular error fijo' }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Limpiar errores' }));

    // Assert
    expect(avisos()).toHaveLength(0);
  });

  test('should close a banner by itself after six seconds unless it is persistent', () => {
    // Arrange
    vi.useFakeTimers();
    abrirPantalla();
    fallar({ status: 503, message: 'Se va solo' });
    fallar({ status: 402, message: 'Se queda' }, 'Simular error fijo');

    // Act
    act(() => vi.advanceTimersByTime(5999));
    const antes = avisos().length;
    act(() => vi.advanceTimersByTime(1));

    // Assert
    expect(antes).toBe(2);
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0]).toHaveTextContent('Se queda');
  });

  test('should not restart the six seconds of a banner when another error arrives', () => {
    // Arrange
    vi.useFakeTimers();
    abrirPantalla();
    fallar({ status: 503, message: 'Primero' });
    act(() => vi.advanceTimersByTime(5000));

    // Act: llega otro error al segundo 5; el primero cumple sus 6 s en el 6
    fallar({ status: 503, message: 'Segundo' });
    act(() => vi.advanceTimersByTime(1000));

    // Assert
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0]).toHaveTextContent('Segundo');
  });
});

describe('ErrorBanner: uso del hook', () => {
  test('should explain the missing provider when a page uses useApiError outside ErrorProvider', () => {
    // Arrange: React escribe el error en consola antes de lanzarlo
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act y Assert
    expect(() => render(<PantallaQueFalla />)).toThrow('useApiError debe usarse dentro de <ErrorProvider>');
    console.error.mockRestore();
  });
});
