import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AcceptInvitePage from '../src/pages/AcceptInvitePage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  acceptInvite: vi.fn(),
}));

vi.mock('../src/api', () => ({ api: { get: mocks.get } }));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ acceptInvite: mocks.acceptInvite }),
}));

function renderInvite(path = '/accept-invite?token=invite-token') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/admin/dashboard" element={<h1>Panel de administración</h1>} />
        <Route path="/admin/checkin" element={<h1>Check-in del equipo</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({
    data: {
      gym: 'Power House',
      rol: 'entrenador',
      email: 'ana@example.test',
      expiresAt: '2026-11-11T00:00:00.000Z',
    },
  });
  mocks.acceptInvite.mockResolvedValue({ role: 'receptionist' });
});

afterEach(cleanup);

describe('AcceptInvitePage', () => {
  test('advierte cuando se abre el formulario sin token', async () => {
    renderInvite('/accept-invite');

    expect(await screen.findByText(/esta url no incluye un token/i)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /crear cuenta y entrar/i })).not.toBeInTheDocument();
  });

  test('verifica el token y presenta los datos de la invitación', async () => {
    renderInvite('/accept-invite?token=token%20con%20espacio');

    expect(await screen.findByText('Power House')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/entrenador/i);
    expect(screen.getByText(/ana@example\.test/i)).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/auth/accept-invite/token%20con%20espacio');
    expect(screen.getByLabelText(/crea tu contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirma tu contraseña/i)).toBeInTheDocument();
  });

  test('valida contraseña y confirmación sin aceptar la invitación', async () => {
    const user = userEvent.setup();
    renderInvite();
    await screen.findByLabelText(/crea tu contraseña/i);

    await user.click(screen.getByRole('button', { name: /crear cuenta y entrar/i }));

    expect(screen.getByText(/escribe una contraseña/i)).toBeInTheDocument();
    expect(screen.getByText(/repite la contraseña para confirmarla/i)).toBeInTheDocument();
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });

  test('acepta la invitación y dirige al usuario al check-in', async () => {
    const user = userEvent.setup();
    renderInvite();
    await screen.findByLabelText(/crea tu contraseña/i);

    await user.type(screen.getByLabelText(/crea tu contraseña/i), 'Clave123');
    await user.type(screen.getByLabelText(/confirma tu contraseña/i), 'Clave123');
    await user.click(screen.getByRole('button', { name: /crear cuenta y entrar/i }));

    expect(await screen.findByRole('heading', { name: /check-in del equipo/i })).toBeInTheDocument();
    expect(mocks.acceptInvite).toHaveBeenCalledWith('invite-token', 'Clave123');
  });

  test('rechaza una contraseña distinta y comunica que el correo ya tiene cuenta', async () => {
    const user = userEvent.setup();
    renderInvite();
    await screen.findByLabelText(/crea tu contraseña/i);
    await user.type(screen.getByLabelText(/crea tu contraseña/i), 'Clave123');
    await user.type(screen.getByLabelText(/confirma tu contraseña/i), 'OtraClave123');
    await user.click(screen.getByRole('button', { name: /crear cuenta y entrar/i }));

    expect(screen.getByText(/las contraseñas no coinciden/i)).toBeInTheDocument();
    expect(mocks.acceptInvite).not.toHaveBeenCalled();

    mocks.acceptInvite.mockRejectedValueOnce(Object.assign(
      new Error('conflict'),
      { status: 409 }
    ));
    await user.clear(screen.getByLabelText(/confirma tu contraseña/i));
    await user.type(screen.getByLabelText(/confirma tu contraseña/i), 'Clave123');
    await user.click(screen.getByRole('button', { name: /crear cuenta y entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ya existe una cuenta/i);
  });

  test('muestra errores de invitación vencida o de red', async () => {
    mocks.get.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 410 }));
    renderInvite();
    expect(await screen.findByRole('alert')).toHaveTextContent(/invitación expiró/i);
    cleanup();

    mocks.get.mockRejectedValueOnce(Object.assign(new Error('offline'), { isNetwork: true }));
    renderInvite();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos contactar al servidor/i);
  });
});
