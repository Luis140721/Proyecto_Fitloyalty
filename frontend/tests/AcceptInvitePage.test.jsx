import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import AcceptInvitePage from '../src/pages/AcceptInvitePage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  acceptInvite: vi.fn(),
}));

vi.mock('../src/api', () => ({ api: { get: (...args) => mocks.get(...args) } }));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ acceptInvite: (...args) => mocks.acceptInvite(...args) }),
}));

function CurrentPath() {
  const { pathname } = useLocation();
  return <p>Ruta actual: {pathname}</p>;
}

function renderInvite(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.get.mockReset();
    mocks.acceptInvite.mockReset();
  });

  test('advierte cuando falta el token', async () => {
    renderInvite('/accept-invite');

    expect(await screen.findByText(/Esta URL no incluye un token/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  test('valida contraseña, acepta invitación y dirige al dashboard según el rol', async () => {
    mocks.get.mockResolvedValue({
      data: {
        email: 'ana@example.com',
        gym: 'Fit Gym',
        rol: 'admin',
        expiresAt: '2026-12-01T00:00:00Z',
      },
    });
    mocks.acceptInvite.mockResolvedValue({ role: 'admin' });
    const user = userEvent.setup();
    renderInvite('/accept-invite?token=secure-invitation-token');

    await screen.findByText('Fit Gym');
    const preview = screen.getByRole('status');
    expect(within(preview).getByText('Fit Gym')).toBeInTheDocument();
    expect(preview).toHaveTextContent('ana@example.com');
    expect(mocks.get).toHaveBeenCalledWith('/auth/accept-invite/secure-invitation-token');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y entrar/ }));
    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent).join(' '))
      .toMatch(/Escribe una contraseña/);

    await user.type(screen.getByLabelText(/Crea tu contraseña/), 'abc');
    await user.type(screen.getByLabelText(/Confirma tu contraseña/), 'different');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y entrar/ }));
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent).join(' ')).toMatch(/mínimo 6/);
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent).join(' ')).toMatch(/no coinciden/);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Crea tu contraseña/));
    await user.type(screen.getByLabelText(/Crea tu contraseña/), 'Admin123');
    await user.clear(screen.getByLabelText(/Confirma tu contraseña/));
    await user.type(screen.getByLabelText(/Confirma tu contraseña/), 'Admin123');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y entrar/ }));

    await waitFor(() => expect(mocks.acceptInvite).toHaveBeenCalledWith('secure-invitation-token', 'Admin123'));
    expect(screen.getByText('Ruta actual: /admin/dashboard')).toBeInTheDocument();
  });

  test('presenta errores para invitaciones inexistentes, vencidas o rechazos del servidor', async () => {
    mocks.get.mockRejectedValueOnce({ status: 404, message: 'not found' });
    const missing = renderInvite('/accept-invite?token=missing-token-1234567890');
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta invitación no existe o ya fue usada');
    missing.unmount();

    mocks.get.mockRejectedValueOnce({ status: 410, message: 'expired' });
    renderInvite('/accept-invite?token=expired-invitation-token');
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta invitación expiró.');
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });
});
