/**
 * Cobertura del front (Luis): ErrorBoundary, lo que se ve cuando una pantalla
 * revienta al pintarse: un aviso con el detalle (fuera de produccion) y
 * "Intentar de nuevo", en vez de la pagina en blanco.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../src/components/ErrorBoundary';

let romper;

function Pantalla() {
  if (romper) throw new Error('No se pudo leer data.miembros');
  return <p>Lista de miembros</p>;
}

beforeEach(() => {
  romper = false;
  // React y el boundary escriben el error en consola: aqui se espera.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  test('should show the screen when nothing fails', () => {
    // Act
    render(<ErrorBoundary><Pantalla /></ErrorBoundary>);

    // Assert
    expect(screen.getByText('Lista de miembros')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should show a notice with the error instead of a blank page when the screen fails', () => {
    // Arrange
    romper = true;

    // Act
    render(<ErrorBoundary><Pantalla /></ErrorBoundary>);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Algo se rompio en la app');
    expect(screen.getByRole('heading', { name: 'Algo se rompio en la app' })).toBeInTheDocument();
    expect(screen.getByText(/No se pudo leer data\.miembros/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar pagina' })).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith('[ErrorBoundary] Capturado:', expect.any(Error), expect.anything());
  });

  test('should paint the screen again when the person clicks Intentar de nuevo and it no longer fails', async () => {
    // Arrange
    romper = true;
    render(<ErrorBoundary><Pantalla /></ErrorBoundary>);
    romper = false;

    // Act
    await userEvent.setup().click(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    // Assert
    expect(screen.getByText('Lista de miembros')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
