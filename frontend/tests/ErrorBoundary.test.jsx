import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useState } from 'react';
import ErrorBoundary from '../src/components/ErrorBoundary';

function UnstableChild({ shouldThrow }) {
  if (shouldThrow) throw new Error('Fallo de render controlado.');
  return <p>Contenido recuperado.</p>;
}

function RecoverableApp() {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShouldThrow(false)}>
        Preparar recuperación
      </button>
      <ErrorBoundary>
        <UnstableChild shouldThrow={shouldThrow} />
      </ErrorBoundary>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  test('renderiza sus hijos cuando no hay errores', () => {
    render(
      <ErrorBoundary>
        <p>Aplicación disponible.</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('Aplicación disponible.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('muestra el error y permite reiniciar cuando el componente vuelve a ser estable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<RecoverableApp />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/algo se rompio en la app/i);
    expect(screen.getByText(/fallo de render controlado/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /preparar recuperación/i }));
    await user.click(screen.getByRole('button', { name: /intentar de nuevo/i }));

    expect(await screen.findByText('Contenido recuperado.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
