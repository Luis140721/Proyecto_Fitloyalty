/**
 * StaffPage: al desactivar o bajar de rol a un administrador, el servidor
 * revoca las invitaciones pendientes que creo (RQF-01). La pantalla lo avisa
 * antes de confirmar y vuelve a pedir la lista para mostrarlas revocadas.
 *
 * El API y useAuth se simulan con vi.mock, como en las demas pantallas.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import StaffPage from '../src/pages/StaffPage';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPatch;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), patch: (...a) => mockPatch(...a), post: vi.fn() } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Luis Admin', role: 'admin' } }) }));

const LUIS = { id_usuario: 1, nombre: 'Luis Admin', email: 'luis@gym.co', rol: 'ADMINISTRADOR', activo: true, es_dueno: true };
const OTRO = { id_usuario: 2, nombre: 'Otro Admin', email: 'otro@gym.co', rol: 'ADMINISTRADOR', activo: true, es_dueno: false };
const RECEP = { id_usuario: 3, nombre: 'Rosa Recepción', email: 'rosa@gym.co', rol: 'RECEPCIONISTA', activo: true, es_dueno: false };
const invitacion = (revocada) => ({
  id_invitacion: 9, email: 'nuevo@gym.co', nombre: 'Nuevo', rol_asignado: 'ADMINISTRADOR', pendiente: !revocada,
  fecha_creacion: '2026-11-25T15:00:00.000Z', fecha_expiracion: '2026-12-02T15:00:00.000Z', fecha_aceptacion: null, fecha_revocado: revocada ? '2026-11-25T16:00:00.000Z' : null,
});

let revocada;
const pedidas = (url) => mockGet.mock.calls.filter(([u]) => u === url).length;

beforeEach(() => {
  revocada = false;
  mockGet = vi.fn(async (url) => ({ data: url === '/admin/staff' ? { staff: [LUIS, OTRO, RECEP] } : { invitations: [invitacion(revocada)] } }));
  // El servidor revoca al desactivar: la siguiente lista ya la trae revocada.
  mockPatch = vi.fn(async (_url, cambios) => { revocada = true; return { data: { message: 'ok', staff: { ...OTRO, ...cambios } } }; });
});

const abrir = async () => {
  const { user } = renderWithProviders(<StaffPage />, { route: '/admin/staff' });
  await screen.findAllByText('Otro Admin');
  return user;
};
const desactivar = async (user, nombre) => {
  await user.click(screen.getAllByRole('button', { name: new RegExp(`Desactivar.*${nombre}`) })[0]);
  return screen.findByRole('dialog');
};

describe('StaffPage: las invitaciones de quien deja de ser administrador', () => {
  test('should warn that the pending invitations are revoked when an admin is going to be deactivated', async () => {
    const user = await abrir();

    const dialogo = await desactivar(user, 'Otro Admin');

    expect(dialogo).toHaveTextContent('Las invitaciones pendientes que creó quedan revocadas.');
  });

  test('should not talk about invitations when a receptionist is going to be deactivated', async () => {
    const user = await abrir();

    const dialogo = await desactivar(user, 'Rosa Recepción');

    expect(dialogo).not.toHaveTextContent('invitaciones');
  });

  test('should ask for the invitations again and stop offering to revoke them after the admin is deactivated', async () => {
    const user = await abrir();
    expect(pedidas('/admin/staff/invitations')).toBe(1);
    expect(screen.getAllByRole('button', { name: /Revocar/ }).length).toBeGreaterThan(0);

    const dialogo = await desactivar(user, 'Otro Admin');
    await user.click(within(dialogo).getByRole('button', { name: /Sí, desactivar/ }));

    await waitFor(() => expect(pedidas('/admin/staff/invitations')).toBe(2));
    expect(mockPatch).toHaveBeenCalledWith('/admin/staff/2', { activo: false });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Revocar/ })).not.toBeInTheDocument());
  });
});
