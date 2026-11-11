import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ErrorProvider } from '../src/components/ErrorBanner';
import useAnimatedCount from '../src/hooks/useAnimatedCount';
import { useApiHandler } from '../src/hooks/useApiErrors';
import { render } from '@testing-library/react';

function ApiHandlerHarness({ handler, options }) {
  const run = useApiHandler(handler, options);
  return <button onClick={() => run('dato')}>Ejecutar</button>;
}

function CountHarness({ target, duration = 800, easing }) {
  const ref = useAnimatedCount(target, { duration, easing });
  return <span ref={ref}>0</span>;
}

describe('useApiHandler', () => {
  test('devuelve el resultado sin crear un aviso cuando el handler tiene éxito', async () => {
    const handler = vi.fn().mockResolvedValue('guardado');
    render(
      <MemoryRouter>
        <ErrorProvider><ApiHandlerHarness handler={handler} /></ErrorProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    await waitFor(() => expect(handler).toHaveBeenCalledWith('dato'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('registra el error, llama onError y conserva persistencia solicitada', async () => {
    const error = { status: 422, code: 'INVALID', message: 'Revisa el formulario' };
    const handler = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    render(
      <MemoryRouter>
        <ErrorProvider>
          <ApiHandlerHarness handler={handler} options={{ persistent: true, onError }} />
        </ErrorProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect(await screen.findByText('Revisa el formulario')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('useAnimatedCount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('muestra el objetivo directamente si el usuario prefiere movimiento reducido', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<CountHarness target={1234} />);
    expect(screen.getByText('1.234')).toBeInTheDocument();
  });

  test.each([
    [42, 0],
    [Number.NaN, 500],
  ])('salta la animación para objetivo %s con duración %s', (target, duration) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    render(<CountHarness target={target} duration={duration} />);
    expect(screen.getByText(target === 42 ? '42' : '0')).toBeInTheDocument();
  });

  test('anima con easing y fija el resultado exacto al completar', () => {
    const scheduled = [];
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(100);
    render(<CountHarness target={100} duration={200} easing={(t) => t} />);
    expect(scheduled).toHaveLength(1);
    scheduled.shift()(200);
    expect(screen.getByText('50')).toBeInTheDocument();
    scheduled.shift()(300);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  test('cancela el frame al cambiar el objetivo y programa la nueva animación', () => {
    const scheduled = [];
    const cancel = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { rerender } = render(<CountHarness target={100} />);
    rerender(<CountHarness target={200} />);
    expect(cancel).toHaveBeenCalled();
    expect(scheduled.length).toBeGreaterThan(0);
  });

  test('formatea valores negativos redondeados y funciona sin matchMedia', () => {
    const scheduled = [];
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
    render(<CountHarness target={-10} duration={10} />);
    scheduled.shift()(10);
    expect(screen.getByText('-10')).toBeInTheDocument();
  });
});
