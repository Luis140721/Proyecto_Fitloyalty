import { act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ErrorProvider, useApiError } from '../src/components/ErrorBanner';
import { TOKEN_KEY } from '../src/api';
import { render } from '@testing-library/react';

function Controls() {
  const { pushApiError, clear } = useApiError();
  return (
    <div>
      <button onClick={() => pushApiError({ status: 0, message: 'Sin conexión' })}>Red</button>
      <button onClick={() => pushApiError({ status: 401, message: 'Sesión caducada' }, { persistent: true })}>401</button>
      <button onClick={() => pushApiError({ status: 402, message: 'Prueba vencida' })}>402</button>
      <button onClick={() => pushApiError({ status: 403, message: 'Prohibido' })}>403</button>
      <button onClick={() => pushApiError({ status: 404, message: 'Falta' })}>404</button>
      <button onClick={() => pushApiError({ status: 409, message: 'Duplicado' })}>409</button>
      <button onClick={() => pushApiError({ status: 429, message: 'Límite' })}>429</button>
      <button onClick={() => pushApiError({ status: 500, message: 'Caído' })}>500</button>
      <button onClick={() => pushApiError({})}>Desconocido</button>
      <button onClick={() => clear()}>Limpiar</button>
    </div>
  );
}

function Location() {
  const location = useLocation();
  return <p>Ruta actual: {location.pathname}</p>;
}

function renderErrors() {
  return render(
    <MemoryRouter initialEntries={['/admin/miembros']}>
      <ErrorProvider>
        <Controls />
        <Routes>
          <Route path="*" element={<Location />} />
        </Routes>
      </ErrorProvider>
    </MemoryRouter>,
  );
}

describe('ErrorProvider y ErrorBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    ['Red', 'Sin conexion', 'error-banner--net'],
    ['402', 'Tu periodo de prueba expiro', 'error-banner--warn'],
    ['403', 'Sin permiso', 'error-banner--warn'],
    ['404', 'No encontrado', 'error-banner--error'],
    ['409', 'Conflicto', 'error-banner--warn'],
    ['429', 'Demasiadas solicitudes', 'error-banner--warn'],
    ['500', 'Error del servidor', 'error-banner--error'],
    ['Desconocido', 'Sin conexion', 'error-banner--net'],
  ])('clasifica y permite cerrar el error %s', (button, title, tone) => {
    renderErrors();
    fireEvent.click(screen.getByRole('button', { name: button }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(title)).toBeInTheDocument();
    expect(alert).toHaveClass(tone);
    fireEvent.click(within(alert).getByRole('button', { name: 'Cerrar notificacion' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('el error 401 limpia sesión, conserva la ruta de retorno y navega al login', () => {
    localStorage.setItem(TOKEN_KEY, 'token-vencido');
    renderErrors();
    fireEvent.click(screen.getByRole('button', { name: '401' }));
    const alert = screen.getByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: 'Iniciar sesion' }));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem('fitloyalty_after_login_redirect')).toBe('/');
    expect(screen.getByText('Ruta actual: /login')).toBeInTheDocument();
  });

  test('limita la lista a cuatro errores recientes y permite limpiar todos', () => {
    renderErrors();
    ['402', '403', '404', '409', '429'].forEach((name) => fireEvent.click(screen.getByRole('button', { name })));
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    expect(screen.queryByText('Prueba vencida')).not.toBeInTheDocument();
    expect(screen.getByText('Límite')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  test('cierra los avisos temporales y mantiene los persistentes tras el timeout', () => {
    vi.useFakeTimers();
    renderErrors();
    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    fireEvent.click(screen.getByRole('button', { name: '401' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('Sesión caducada')).toBeInTheDocument();
  });

  test('exige ErrorProvider para usar el hook', () => {
    function BrokenConsumer() {
      useApiError();
      return null;
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BrokenConsumer />)).toThrow('useApiError debe usarse dentro de <ErrorProvider>');
    consoleError.mockRestore();
  });
});
