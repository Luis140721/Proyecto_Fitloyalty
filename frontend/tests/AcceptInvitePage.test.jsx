/**
 * Bootcamp semana 4 (Front, Luis): AcceptInvitePage muestra la invitacion con
 * los campos que manda GET /api/auth/accept-invite/:token (backend/tests/
 * contrato-front.test.js fija ese contrato: gym, rol, email, expiresAt).
 *
 * El API y useAuth se simulan con vi.mock. El token viaja en la query
 * (?token=), que renderWithProviders deja en la URL.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import AcceptInvitePage from '../src/pages/AcceptInvitePage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test, como en LoginPage.test.jsx.
let mockGet;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a) } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ acceptInvite: vi.fn() }) }));

// Respuesta real del endpoint para una invitacion vigente de recepcion.
const INVITACION = { email: 'ana@gym.co', nombre: 'Ana', rol: 'RECEPCIONISTA', gym: 'Gimnasio Central', expiresAt: '2026-10-29T15:00:00.000Z' };

const abrirInvitacion = () => renderWithProviders(<AcceptInvitePage />, { route: '/accept-invite?token=token-de-prueba' });

beforeEach(() => { mockGet = vi.fn(async () => ({ data: INVITACION })); });

describe('AcceptInvitePage', () => {
  test('should name the gym and the role in words when the invitation is valid', async () => {
    // Act
    abrirInvitacion();

    // Assert
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Te invitaron a Gimnasio Central como recepcionista.'));
    expect(mockGet).toHaveBeenCalledWith('/auth/accept-invite/token-de-prueba');
  });

  test('should explain that the invitation expired when the API answers 410 INVITE_EXPIRED', async () => {
    // Arrange: error ya normalizado por buildError
    mockGet = vi.fn(async () => { throw { status: 410, code: 'INVITE_EXPIRED', message: 'Esta invitacion expiro.' }; });

    // Act
    abrirInvitacion();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta invitación expiró. Pídele al dueño que te envíe una nueva.');
    expect(screen.queryByLabelText(/Crea tu contraseña/)).not.toBeInTheDocument();
  });
});
