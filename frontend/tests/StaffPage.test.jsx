import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import StaffPage from '../src/pages/StaffPage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../src/api', () => ({ api: mocks }));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

const staff = [
  { id_usuario: 1, nombre: 'Dueño Principal', email: 'owner@example.test', rol: 'ADMINISTRADOR', activo: true, es_dueno: true },
  { id_usuario: 2, nombre: 'Carlos Recepción', email: 'carlos@example.test', rol: 'RECEPCIONISTA', activo: true },
  { id_usuario: 3, nombre: 'Entrenador Inactivo', email: 'trainer@example.test', rol: 'ENTRENADOR', activo: false },
];

const invitations = [
  { id_invitacion: 4, email: 'pending@example.test', nombre: 'Paula Pendiente', rol_asignado: 'RECEPCIONISTA', pendiente: true, fecha_expiracion: '2026-11-11T00:00:00.000Z' },
  { id_invitacion: 3, email: 'accepted@example.test', nombre: 'Andrés Aceptado', rol_asignado: 'ENTRENADOR', fecha_aceptacion: '2026-11-02T00:00:00.000Z', fecha_expiracion: '2026-11-10T00:00:00.000Z' },
  { id_invitacion: 2, email: 'revoked@example.test', nombre: 'Rita Revocada', rol_asignado: 'ADMINISTRADOR', fecha_revocado: '2026-11-01T00:00:00.000Z', fecha_expiracion: '2026-11-09T00:00:00.000Z' },
  { id_invitacion: 1, email: 'expired@example.test', nombre: 'Eva Expirada', rol_asignado: 'PERSONAL', fecha_expiracion: '2026-10-01T00:00:00.000Z' },
];

function renderStaffPage() {
  return render(<StaffPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((path) => {
    if (path === '/admin/staff') return Promise.resolve({ data: { staff } });
    if (path === '/admin/staff/invitations') return Promise.resolve({ data: { invitations } });
    return Promise.reject(new Error(`Ruta inesperada: ${path}`));
  });
  mocks.post.mockResolvedValue({});
  mocks.patch.mockResolvedValue({ data: { staff: { nombre: 'Carlos Nuevo', rol: 'ENTRENADOR' } } });
});

afterEach(cleanup);

describe('StaffPage', () => {
  test('presenta usuarios protegidos, usuarios activos y los estados de invitación', async () => {
    renderStaffPage();

    expect(await screen.findByText('Carlos Recepción')).toBeInTheDocument();
    expect(screen.getByText('Dueño Principal')).toBeInTheDocument();
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
    expect(screen.getByText('Revocada')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente')).toHaveLength(2);
    expect(screen.getByText('Expirada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /desactivar a dueño principal/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /desactivar a carlos recepción/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reactivar a entrenador inactivo/i })).toBeInTheDocument();
  });

  test('envía una invitación y explica cómo aceptarla cuando el correo no se entrega', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        invitation: { email: 'nueva@example.test' },
        emailDelivered: false,
        devAcceptToken: 'dev-token',
      },
    });
    const user = userEvent.setup();
    renderStaffPage();
    await screen.findByText('Carlos Recepción');

    await user.type(screen.getByLabelText('Nombre'), 'Nueva Persona');
    await user.type(screen.getByLabelText('Correo'), 'nueva@example.test');
    await user.selectOptions(screen.getByLabelText(/rol que tendrá/i), 'ENTRENADOR');
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/smtp no configurado/i);
    expect(screen.getByRole('status')).toHaveTextContent('/accept-invite?token=dev-token');
    expect(mocks.post).toHaveBeenCalledWith('/admin/staff/invite', {
      email: 'nueva@example.test',
      nombre: 'Nueva Persona',
      rol: 'ENTRENADOR',
    });
  });

  test('muestra el error de invitación y permite limpiar el feedback al editar el correo', async () => {
    mocks.post.mockRejectedValueOnce(new Error('El correo ya está invitado.'));
    const user = userEvent.setup();
    renderStaffPage();
    await screen.findByText('Carlos Recepción');

    await user.type(screen.getByLabelText('Nombre'), 'Nueva Persona');
    const email = screen.getByLabelText('Correo');
    await user.type(email, 'existente@example.test');
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/correo ya está invitado/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    await user.type(email, 'x');
    expect(email).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('confirma revocación y recarga las listas después de completar la acción', async () => {
    const user = userEvent.setup();
    renderStaffPage();
    await screen.findByText('Carlos Recepción');

    await user.click(screen.getByRole('button', { name: /revocar invitación a paula pendiente/i }));
    const dialog = screen.getByRole('dialog', { name: /revocar invitación/i });
    expect(within(dialog).getByText(/paula pendiente/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /sí, revocar/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/invitación revocada/i);
    expect(mocks.post).toHaveBeenCalledWith('/admin/staff/invitations/4/revoke');
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(4));
  });

  test('rechaza nombres demasiado cortos al editar un usuario', async () => {
    const user = userEvent.setup();
    renderStaffPage();
    await screen.findByText('Carlos Recepción');

    await user.click(screen.getByRole('button', { name: /editar a carlos recepción/i }));
    const dialog = screen.getByRole('dialog', { name: /editar usuario/i });
    let name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'A');
    await user.click(within(dialog).getByRole('button', { name: /guardar cambios/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/al menos 2 caracteres/i);
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  test('envía solo los campos editados al guardar un usuario', async () => {
    const user = userEvent.setup();
    renderStaffPage();
    await screen.findByText('Carlos Recepción');
    await user.click(screen.getByRole('button', { name: /editar a carlos recepción/i }));
    let dialog = screen.getByRole('dialog', { name: /editar usuario/i });
    const name = within(dialog).getByLabelText('Nombre');
    fireEvent.change(name, { target: { value: 'Carlos Nuevo' } });
    dialog = screen.getByRole('dialog', { name: /editar usuario/i });
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'ADMINISTRADOR' } });
    dialog = screen.getByRole('dialog', { name: /editar usuario/i });
    await user.click(within(dialog).getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent(/se actualizaron los datos de carlos nuevo/i);
    expect(mocks.patch).toHaveBeenCalledWith('/admin/staff/2', {
      nombre: 'Carlos Nuevo',
      rol: 'ADMINISTRADOR',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('confirma la desactivación de un usuario y permite reactivar otro', async () => {
    const user = userEvent.setup();
    renderStaffPage();
    await screen.findByText('Carlos Recepción');

    await user.click(screen.getByRole('button', { name: /desactivar a carlos recepción/i }));
    const dialog = screen.getByRole('dialog', { name: /desactivar usuario/i });
    await user.click(within(dialog).getByRole('button', { name: /sí, desactivar/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/quedó desactivada/i);
    expect(mocks.patch).toHaveBeenCalledWith('/admin/staff/2', { activo: false });

    await user.click(screen.getByRole('button', { name: /reactivar a entrenador inactivo/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/está activa otra vez/i);
    expect(mocks.patch).toHaveBeenCalledWith('/admin/staff/3', { activo: true });
  });
});
