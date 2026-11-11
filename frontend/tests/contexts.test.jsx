import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ErrorProvider } from '../src/components/ErrorBanner';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { TrialProvider, useTrial } from '../src/context/TrialContext';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  tokenVenceEn: vi.fn(),
}));

vi.mock('../src/api', () => ({
  ...mocks,
  SESION_EXPIRADA: 'fitloyalty:sesion-expirada',
  TOKEN_KEY: 'fitloyalty_token',
}));

function AuthControls() {
  const auth = useAuth();
  const [actionError, setActionError] = useState('');
  const ejecutar = (action) => {
    action().catch((error) => setActionError(error.message));
  };
  return (
    <section>
      <p data-testid="auth-state">{JSON.stringify({
        user: auth.user,
        gym: auth.gym,
        loading: auth.loading,
        ready: auth.ready,
      })}</p>
      <button onClick={() => ejecutar(() => auth.login('ana@gym.co', 'clave'))}>Login</button>
      <button onClick={() => ejecutar(() => auth.register({ ownerEmail: 'ana@gym.co' }))}>Registrar</button>
      <button onClick={() => ejecutar(() => auth.acceptInvite('inv-1', 'clave'))}>Invitación</button>
      <button onClick={() => auth.marcarActividad()}>Actividad</button>
      <button onClick={() => ejecutar(() => auth.logout())}>Salir</button>
      {actionError && <p role="alert">{actionError}</p>}
    </section>
  );
}

function TrialControls() {
  const { trial, refresh } = useTrial();
  return <>
    <p data-testid="trial">{JSON.stringify(trial)}</p>
    <button onClick={refresh}>Actualizar trial</button>
  </>;
}

function estadoAuth() {
  return JSON.parse(screen.getByTestId('auth-state').textContent);
}

function renderAuth() {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <ErrorProvider>
        <AuthProvider><AuthControls /></AuthProvider>
      </ErrorProvider>
    </MemoryRouter>,
  );
  return { ...view, user };
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.api.get.mockReset();
    mocks.api.post.mockReset();
    mocks.getToken.mockReset().mockReturnValue(null);
    mocks.setToken.mockReset();
    mocks.setToken.mockImplementation((token) => mocks.getToken.mockReturnValue(token));
    mocks.clearToken.mockReset().mockImplementation(() => mocks.getToken.mockReturnValue(null));
    mocks.tokenVenceEn.mockReset().mockReturnValue(null);
    mocks.api.post.mockResolvedValue({ data: {} });
  });

  test('sin token queda listo y sin sesión', async () => {
    renderAuth();
    await waitFor(() => expect(estadoAuth()).toMatchObject({ user: null, gym: null, loading: false, ready: true }));
    expect(mocks.api.get).not.toHaveBeenCalled();
  });

  test.each([
    [{ role: 'ADMINISTRADOR' }, 'admin'],
    [{ rol: 'recepcionista' }, 'receptionist'],
    [{ rol_nombre: 'ENTRENADOR' }, 'trainer'],
    [{ role: 'coach' }, 'coach'],
    [{}, 'receptionist'],
  ])('revalida y normaliza el rol de la sesión %#', async (user, role) => {
    mocks.getToken.mockReturnValue('existing-token');
    mocks.api.get.mockResolvedValue({ data: { user, gym: { name: 'Fit Gym' } } });
    renderAuth();
    await waitFor(() => expect(estadoAuth().loading).toBe(false));
    expect(mocks.api.get).toHaveBeenCalledWith('/auth/me');
    expect(estadoAuth()).toMatchObject({
      user: { role, rol_nombre: user.rol_nombre ?? user.rol ?? role },
      gym: { name: 'Fit Gym' },
      ready: true,
    });
  });

  test.each([401, 403, 404])('borra un token rechazado durante la revalidación (%s)', async (status) => {
    mocks.getToken.mockReturnValue('dead-token');
    mocks.api.get.mockRejectedValue({ status });
    renderAuth();
    await waitFor(() => expect(estadoAuth().ready).toBe(true));
    expect(mocks.clearToken).toHaveBeenCalledOnce();
    expect(estadoAuth().user).toBeNull();
  });

  test('conserva la sesión si la revalidación falla por red', async () => {
    mocks.getToken.mockReturnValue('token');
    mocks.api.get.mockRejectedValue({ isNetwork: true, status: 0 });
    renderAuth();
    await waitFor(() => expect(estadoAuth().ready).toBe(true));
    expect(mocks.clearToken).not.toHaveBeenCalled();
  });

  test.each([
    ['Login', 'ana@gym.co', 'admin'],
    ['Registrar', 'ana@gym.co', 'receptionist'],
    ['Invitación', 'ana@gym.co', 'trainer'],
  ])('completa autenticación mediante %s', async (button, email, role) => {
    const user = role === 'admin' ? { role: 'admin' } : role === 'trainer' ? { rol: 'ENTRENADOR' } : { rol: 'RECEPCIONISTA' };
    mocks.api.post.mockResolvedValue({ data: { token: `token-${role}`, user, gym: { name: 'Nuevo Gym' } } });
    const { user: person } = renderAuth();
    await person.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(estadoAuth().user?.role).toBe(role));
    expect(mocks.setToken).toHaveBeenCalledWith(`token-${role}`);
    expect(estadoAuth().gym).toEqual({ name: 'Nuevo Gym' });
    if (button === 'Login') expect(mocks.api.post).toHaveBeenCalledWith('/auth/login', { email, password: 'clave' });
    if (button === 'Registrar') expect(mocks.api.post).toHaveBeenCalledWith('/auth/signup', { ownerEmail: email });
    if (button === 'Invitación') expect(mocks.api.post).toHaveBeenCalledWith('/auth/accept-invite', { token: 'inv-1', password: 'clave' });
    expect(localStorage.getItem('fitloyalty_ultima_actividad')).not.toBeNull();
  });

  test('login propaga el error del servicio para que el formulario lo maneje', async () => {
    const error = new Error('Credenciales incorrectas');
    mocks.api.post.mockRejectedValue(error);
    const { user } = renderAuth();
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas');
    expect(estadoAuth().user).toBeNull();
  });

  test('marcarActividad solo escribe con sesión y logout cierra aunque falle la petición', async () => {
    const { user } = renderAuth();
    await user.click(screen.getByRole('button', { name: 'Actividad' }));
    expect(localStorage.getItem('fitloyalty_ultima_actividad')).toBeNull();
    mocks.getToken.mockReturnValue('token');
    await user.click(screen.getByRole('button', { name: 'Actividad' }));
    expect(localStorage.getItem('fitloyalty_ultima_actividad')).not.toBeNull();

    mocks.api.post.mockRejectedValue(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(mocks.clearToken).toHaveBeenCalled());
    expect(estadoAuth().user).toBeNull();
    expect(localStorage.getItem('fitloyalty_ultima_actividad')).toBeNull();
  });

  test('el evento de sesión expirada muestra el aviso correspondiente', async () => {
    mocks.getToken.mockReturnValue('token');
    mocks.api.get.mockResolvedValue({ data: { user: { role: 'admin' } } });
    renderAuth();
    await waitFor(() => expect(estadoAuth().user).not.toBeNull());
    window.dispatchEvent(new CustomEvent('fitloyalty:sesion-expirada', { detail: { code: 'ACCOUNT_DISABLED' } }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Tu cuenta fue desactivada'));
    expect(mocks.clearToken).toHaveBeenCalled();
  });

  test('cierra una sesión con actividad vencida durante la revalidación', async () => {
    mocks.getToken.mockReturnValue('token');
    mocks.api.get.mockResolvedValue({ data: { user: { role: 'admin' } } });
    localStorage.setItem('fitloyalty_ultima_actividad', String(Date.now() - 31 * 60 * 1000));
    renderAuth();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión se cerró tras'));
    expect(estadoAuth().user).toBeNull();
  });

  test('exige AuthProvider para usar el hook', () => {
    function MissingProvider() {
      useAuth();
      return null;
    }
    expect(() => render(<MissingProvider />)).toThrow('useAuth debe usarse dentro de <AuthProvider>');
  });
});

describe('TrialProvider', () => {
  beforeEach(() => {
    mocks.api.get.mockReset();
  });

  test('carga y actualiza el estado de prueba', async () => {
    mocks.api.get.mockResolvedValue({
      data: { trial: { reason: 'ACTIVE', active: true, expired: false, daysLeft: 9, endsAt: '2026-12-01' } },
    });
    render(<TrialProvider><TrialControls /></TrialProvider>);
    await waitFor(() => expect(screen.getByTestId('trial')).toHaveTextContent('"status":"ACTIVE"'));
    expect(screen.getByTestId('trial')).toHaveTextContent('"daysLeft":9');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar trial' }));
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledTimes(2));
  });

  test.each([
    [{ status: 401 }, '"status":"sin-sesion"'],
    [{ status: 503 }, '"status":"error"'],
  ])('presenta un estado seguro si falla la API', async (error, expected) => {
    mocks.api.get.mockRejectedValue(error);
    render(<TrialProvider><TrialControls /></TrialProvider>);
    await waitFor(() => expect(screen.getByTestId('trial')).toHaveTextContent(expected));
  });

  test('usa el motivo desconocido si la respuesta no incluye uno', async () => {
    mocks.api.get.mockResolvedValue({ data: { trial: { active: false, expired: false, daysLeft: null } } });
    render(<TrialProvider><TrialControls /></TrialProvider>);
    await waitFor(() => expect(screen.getByTestId('trial')).toHaveTextContent('"status":"desconocido"'));
  });

  test('exige TrialProvider para usar el hook', () => {
    function MissingProvider() {
      useTrial();
      return null;
    }
    expect(() => render(<MissingProvider />)).toThrow('useTrial debe usarse dentro de <TrialProvider>');
  });
});
