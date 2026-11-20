/**
 * Cobertura del front (Luis): los hooks compartidos.
 * - useAnimatedCount: los KPI del dashboard cuentan hacia su valor con
 *   requestAnimationFrame y saltan al final si se pide movimiento reducido.
 * - useApiHandler: envuelve un handler async; si falla, deja el error en el
 *   banner global y avisa al caller.
 *
 * Para la animacion se usan timers falsos solo para requestAnimationFrame y
 * performance: cada avance de 16 ms es un cuadro.
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import useAnimatedCount from '../src/hooks/useAnimatedCount';
import { useApiHandler, useApiErrors } from '../src/hooks/useApiErrors';
import { ErrorProvider } from '../src/components/ErrorBanner';

function Contador({ valor, duracion }) {
  const ref = useAnimatedCount(valor, duracion === undefined ? undefined : { duration: duracion });
  return <span data-testid="contador" ref={ref}>0</span>;
}

const contador = () => screen.getByTestId('contador');

/** Pide movimiento reducido (o no) por matchMedia. */
function movimientoReducido(si) {
  window.matchMedia = (query) => ({ matches: si && query.includes('reduce'), media: query });
}

afterEach(() => {
  vi.useRealTimers();
  delete window.matchMedia;
});

describe('useAnimatedCount', () => {
  test('should paint the final value at once, formatted for Colombia, when reduced motion is requested', () => {
    // Arrange
    movimientoReducido(true);

    // Act
    render(<Contador valor={1250000} />);

    // Assert
    expect(contador()).toHaveTextContent('1.250.000');
  });

  test('should count up frame by frame and end exactly on the target', () => {
    // Arrange: sin matchMedia (como jsdom) no hay movimiento reducido
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<Contador valor={100} duracion={800} />);

    // Act y Assert: a mitad de camino ya paso de la mitad (salida cubica)
    act(() => vi.advanceTimersByTime(400));
    const aMitad = Number(contador().textContent);
    expect(aMitad).toBeGreaterThan(50);
    expect(aMitad).toBeLessThan(100);

    act(() => vi.advanceTimersByTime(500));
    expect(contador()).toHaveTextContent(/^100$/);
  });

  test('should continue from the value it reached when the target changes', () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { rerender } = render(<Contador valor={100} duracion={800} />);
    act(() => vi.advanceTimersByTime(1000));

    // Act: el refresco trae 200; el primer cuadro no vuelve a 0
    rerender(<Contador valor={200} duracion={800} />);
    act(() => vi.advanceTimersByTime(16));

    // Assert
    expect(Number(contador().textContent)).toBeGreaterThanOrEqual(100);
    act(() => vi.advanceTimersByTime(1000));
    expect(contador()).toHaveTextContent(/^200$/);
  });

  test.each([
    ['a target that is not a number', 'abc', '0'],
    ['the same value it shows', 0, '0'],
  ])('should paint without animating when it gets %s', (_caso, valor, texto) => {
    // Arrange
    const rAF = vi.spyOn(window, 'requestAnimationFrame');

    // Act
    render(<Contador valor={valor} />);

    // Assert
    expect(contador()).toHaveTextContent(texto);
    expect(rAF).not.toHaveBeenCalled();
    rAF.mockRestore();
  });

  test('should paint at once when the duration is zero', () => {
    // Act
    render(<Contador valor={42} duracion={0} />);

    // Assert
    expect(contador()).toHaveTextContent('42');
  });

  test('should stop the animation when the counter leaves the screen', () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const cancelar = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = render(<Contador valor={500} duracion={800} />);
    act(() => vi.advanceTimersByTime(100));

    // Act
    unmount();

    // Assert
    expect(cancelar).toHaveBeenCalled();
  });
});

describe('useApiHandler', () => {
  /** Pantalla con un boton que llama al handler envuelto. */
  function Formulario({ handler, opciones }) {
    const [resultado, setResultado] = useState('');
    const enviar = useApiHandler(handler, opciones);
    return (
      <>
        <button type="button" onClick={async () => setResultado(String(await enviar('ana@gym.co')))}>Enviar</button>
        <p>Resultado: {resultado}</p>
      </>
    );
  }

  const abrir = (props) => {
    const user = userEvent.setup();
    render(<MemoryRouter><ErrorProvider><Formulario {...props} /></ErrorProvider></MemoryRouter>);
    return { user };
  };

  test('should return what the handler returns and leave no notice when it succeeds', async () => {
    // Arrange
    const handler = vi.fn(async (email) => `ok ${email}`);
    const { user } = abrir({ handler });

    // Act
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    // Assert
    expect(await screen.findByText('Resultado: ok ana@gym.co')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should put the error in the banner, call onError and return null when the handler fails', async () => {
    // Arrange
    const error = { status: 409, code: 'DUPLICATE', message: 'Ese correo ya existe.' };
    const onError = vi.fn();
    const { user } = abrir({ handler: async () => { throw error; }, opciones: { onError } });

    // Act
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('ConflictoEse correo ya existe.');
    expect(screen.getByText('Resultado: null')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(error);
  });

  test('should keep the notice after six seconds when the error is persistent', async () => {
    // Arrange
    const { user } = abrir({ handler: async () => { throw { status: 503, message: 'Servidor caido.' }; }, opciones: { persistent: true } });
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByRole('alert');

    // Act
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(7000));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Servidor caido.');
  });

  test('should give the pushApiError of the banner through useApiErrors', async () => {
    // Arrange
    function Avisar() {
      const pushError = useApiErrors();
      return <button type="button" onClick={() => pushError({ status: 404, message: 'No existe.' })}>Avisar</button>;
    }
    const user = userEvent.setup();
    render(<MemoryRouter><ErrorProvider><Avisar /></ErrorProvider></MemoryRouter>);

    // Act
    await user.click(screen.getByRole('button', { name: 'Avisar' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('No encontradoNo existe.');
  });
});
