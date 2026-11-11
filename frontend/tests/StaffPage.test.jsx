import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import StaffPage from '../src/pages/StaffPage';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  user: { id: 1 },
}));

vi.mock('../src/api', () => ({
  api: {
    get: (...args) => mocks.get(...args),
    post: (...args) => mocks.post(...args),
    patch: (...args) => mocks.patch(...args),
  },
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../src/components/Ripple', () => ({ default: () => () => {} }));

const staff = [
  {
    id_usuario: 1,
    nombre: 'Luis Admin',
    email: 'luis@example.com',
    rol: 'ADMINISTRADOR',
    activo: true,
    es_dueno: true,
  },
  {
    id_usuario: 2,
    nombre: 'Ana Recepción',
    email: 'ana@example.com',
    rol: 'RECEPCIONISTA',
    activo: true,
  },
  {
    id_usuario: 3,
    nombre: 'Bruno Entrenador',
    email: 'bruno@example.com',
    rol: 'ENTRENADOR',
    activo: false,
  },
];

const invitations = [
  {
    id_invitacion: 7,
    email: 'nueva@example.com',
    nombre: 'Nueva persona',
    rol_asignado: 'RECEPCIONISTA',
    pendiente: true,
    fecha_expiracion: '2026-12-01',
  },
  {
    id_invitacion: 6,
    email: 'aceptada@example.com',
    nombre: 'Persona aceptada',
    rol_asignado: 'ENTRENADOR',
    fecha_aceptacion: '2026-11-17',
    fecha_expiracion: '2026-11-22',
  },
  {
    id_invitacion: 5,
    email: 'revocada@example.com',
    nombre: 'Persona revocada',
    rol_asignado: 'ADMINISTRADOR',
    fecha_revocado: '2026-11-16',
    fecha_expiracion: '2026-11-22',
  },
];

function respondToReads() {
  mocks.get.mockImplementation((path) => {
    if (path === '/admin/staff') return Promise.resolve({ data: { staff: staff.map((item) => ({ ...item })) } });
    if (path === '/admin/staff/invitations') {
      return Promise.resolve({ data: { invitations: invitations.map((item) => ({ ...item })) } });
    }
    return Promise.reject(new Error(`GET inesperado: ${path}`));
  });
}

describe('StaffPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.user = { id: 1 };
    respondToReads();
  });

  test('muestra equipo, estados de invitación, actividad y protege la cuenta propia', async () => {
    renderWithProviders(<StaffPage />, { route: '/admin/staff' });

    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument();
    expect(screen.getByText('Luis Admin')).toBeInTheDocument();
    expect(screen.getByText('Dueño')).toBeInTheDocument();
    expect(screen.getByText('Tú')).toBeInTheDocument();
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
    expect(screen.getByText('Revocada')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente')).not.toHaveLength(0);
    expect(screen.getByText('Persona aceptada aceptó la invitación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar a Luis Admin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reactivar a Bruno Entrenador' })).toBeInTheDocument();
  });

  test('invita a un usuario y presenta el enlace de desarrollo cuando no se envía correo', async () => {
    mocks.post.mockResolvedValue({
      data: {
        invitation: { email: 'sara@example.com' },
        emailDelivered: false,
        devAcceptToken: 'token-sara',
      },
    });
    const { user } = renderWithProviders(<StaffPage />, { route: '/admin/staff' });
    await screen.findByRole('heading', { name: 'Equipo' });

    await user.type(screen.getByPlaceholderText('Nombre y apellido'), 'Sara López');
    await user.type(screen.getByPlaceholderText('persona@correo.com'), 'sara@example.com');
    await user.selectOptions(screen.getByLabelText('Rol que tendrá'), 'ENTRENADOR');
    await user.click(screen.getByRole('button', { name: /Enviar invitación/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('Invitación enviada a sara@example.com.');
    expect(screen.getByRole('status')).toHaveTextContent('/accept-invite?token=token-sara');
    expect(mocks.post).toHaveBeenCalledWith('/admin/staff/invite', {
      email: 'sara@example.com',
      nombre: 'Sara López',
      rol: 'ENTRENADOR',
    });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(4));
  });

  test('valida la edición, actualiza el nombre y el rol y conserva solo los cambios', async () => {
    mocks.patch.mockResolvedValue({
      data: { staff: { nombre: 'Ana María', rol: 'ADMINISTRADOR' } },
    });
    const { user } = renderWithProviders(<StaffPage />, { route: '/admin/staff' });
    await screen.findByRole('heading', { name: 'Equipo' });
    await user.click(screen.getByRole('button', { name: 'Editar a Ana Recepción' }));

    const dialog = screen.getByRole('dialog', { name: 'Editar usuario' });
    await user.clear(within(dialog).getByLabelText('Nombre'));
    await user.click(within(dialog).getByRole('button', { name: /Guardar cambios/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El nombre debe tener al menos 2 caracteres.');

    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Ana María' } });
    await user.selectOptions(within(dialog).getByLabelText('Rol'), 'ADMINISTRADOR');
    await user.click(within(dialog).getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/admin/staff/2', {
      nombre: 'Ana María',
      rol: 'ADMINISTRADOR',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Se actualizaron los datos de Ana María.');
    expect(screen.getByText('Ana María')).toBeInTheDocument();
  });

  test('confirma revocación y desactivación, y permite reactivar a un usuario', async () => {
    mocks.post.mockResolvedValue({ data: {} });
    mocks.patch.mockResolvedValue({ data: { staff: { activo: false } } });
    const { user } = renderWithProviders(<StaffPage />, { route: '/admin/staff' });
    await screen.findByRole('heading', { name: 'Equipo' });

    await user.click(screen.getByRole('button', { name: 'Revocar invitación a Nueva persona' }));
    const revokeDialog = screen.getByRole('dialog', { name: 'Revocar invitación' });
    await user.click(within(revokeDialog).getByRole('button', { name: /Sí, revocar/ }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/staff/invitations/7/revoke'));
    expect(await screen.findByRole('status')).toHaveTextContent('Invitación revocada.');

    await user.click(screen.getByRole('button', { name: 'Desactivar a Ana Recepción' }));
    const disableDialog = screen.getByRole('dialog', { name: 'Desactivar usuario' });
    await user.click(within(disableDialog).getByRole('button', { name: /Sí, desactivar/ }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/admin/staff/2', { activo: false }));
    expect(await screen.findByRole('status')).toHaveTextContent('quedó desactivada');

    await user.click(screen.getByRole('button', { name: 'Reactivar a Bruno Entrenador' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/admin/staff/3', { activo: true }));
  });
});
