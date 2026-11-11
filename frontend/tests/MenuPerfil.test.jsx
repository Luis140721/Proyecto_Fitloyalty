import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MenuPerfil from '../src/components/MenuPerfil';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: {},
  logout: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../src/components/UserAvatar', () => ({
  default: ({ user }) => <span>{user?.name || user?.nombre || 'Avatar'}</span>,
}));

describe('MenuPerfil', () => {
  beforeEach(() => {
    mocks.auth = {
      user: { name: 'Daniel', email: 'daniel@example.com', role: 'admin' },
      gym: { name: 'Gimnasio Norte', active: true },
      logout: mocks.logout,
    };
    mocks.logout.mockReset();
  });

  test('muestra la ficha del administrador y navega a configuración', async () => {
    const { user } = renderWithProviders(<MenuPerfil />);
    await user.click(screen.getByRole('button', { name: 'Tu perfil' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Tu perfil' }));
    expect(dialog.getAllByText('Daniel')).toHaveLength(2);
    expect(dialog.getByText('daniel@example.com')).toBeInTheDocument();
    expect(dialog.getByText('Administrador')).toBeInTheDocument();
    expect(dialog.getByText('Gimnasio Norte')).toBeInTheDocument();
    expect(dialog.getByText('Activa')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Configuración/ }));
    expect(screen.getByText('Ruta actual: /admin/config')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('presenta alternativas del nombre y rol, cuenta inactiva y cierre de sesión', async () => {
    mocks.auth.user = {
      nombre: 'Santiago',
      email: 'santiago@example.com',
      role: 'manager',
      rol_nombre: 'Entrenador personal',
    };
    mocks.auth.gym = { active: false };
    const { user } = renderWithProviders(<MenuPerfil />);
    await user.click(screen.getByRole('button', { name: 'Tu perfil' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Tu perfil' }));
    expect(dialog.getAllByText('Santiago')).toHaveLength(2);
    expect(dialog.getByText('Entrenador personal')).toBeInTheDocument();
    expect(dialog.getByText('—')).toBeInTheDocument();
    expect(dialog.getByText('Inactiva')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Configuración/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  test('usa valores de reserva y cierra con Escape o al hacer clic fuera', async () => {
    mocks.auth.user = null;
    mocks.auth.gym = null;
    const { user } = renderWithProviders(<MenuPerfil />);

    await user.click(screen.getByRole('button', { name: 'Tu perfil' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Tu perfil' }));
    expect(dialog.getAllByText('Usuario')).toHaveLength(2);
    expect(dialog.getByText('Activa')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tu perfil' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
