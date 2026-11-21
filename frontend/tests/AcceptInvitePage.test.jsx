/**
 * Bootcamp semana 4 (Front, Luis): AcceptInvitePage muestra la invitacion con
 * los campos que manda GET /api/auth/accept-invite/:token (backend/tests/
 * contrato-front.test.js fija ese contrato: gym, rol, email, expiresAt).
 * Cobertura del front (Luis): ademas, la contrasena (reglas, foco en el primer
 * error, mostrar), aceptar y entrar al panel segun el rol, y los errores.
 *
 * El API y useAuth se simulan con vi.mock. El token viaja en la query
 * (?token=), que renderWithProviders deja en la URL.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import AcceptInvitePage from '../src/pages/AcceptInvitePage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test, como en LoginPage.test.jsx.
let mockGet, mockAcceptInvite;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a) } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ acceptInvite: (...a) => mockAcceptInvite(...a) }) }));

// Respuesta real del endpoint para una invitacion vigente de recepcion.
const INVITACION = { email: 'ana@gym.co', nombre: 'Ana', rol: 'RECEPCIONISTA', gym: 'Gimnasio Central', expiresAt: '2026-10-29T15:00:00.000Z' };

const abrirInvitacion = (route = '/accept-invite?token=token-de-prueba') => renderWithProviders(<AcceptInvitePage />, { route });
const contrasena = () => screen.getByLabelText(/^Crea tu contraseña/);
const confirmacion = () => screen.getByLabelText(/^Confirma tu contraseña/);
const crearCuenta = () => screen.getByRole('button', { name: 'Crear cuenta y entrar' });

/** Abre la invitacion y espera el formulario. */
async function conFormulario() {
  const pantalla = abrirInvitacion();
  await screen.findByLabelText(/^Crea tu contraseña/);
  return pantalla;
}

beforeEach(() => {
  mockGet = vi.fn(async () => ({ data: INVITACION }));
  mockAcceptInvite = vi.fn(async () => ({ id: 9, name: 'Ana', role: 'receptionist' }));
});

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

describe('AcceptInvitePage: verificar la invitacion', () => {
  test('should warn and not call the API when the link has no token', () => {
    // Act
    abrirInvitacion('/accept-invite');

    // Assert
    expect(screen.getByText('Esta URL no incluye un token de invitación. Pídele al dueño que te reenvíe el link.')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('should say it is checking the invitation when the server has not answered yet', () => {
    // Arrange
    mockGet = vi.fn(() => new Promise(() => {}));

    // Act
    abrirInvitacion();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Verificando tu invitación…');
  });

  test.each([
    ['the invitation does not exist', { status: 404, code: 'INVITE_NOT_FOUND', message: 'No existe' }, 'Esta invitación no existe o ya fue usada. Pídele al dueño que te envíe una nueva.'],
    ['there is no connection', { status: 0, code: 'NETWORK', isNetwork: true, message: 'Sin conexion' }, 'No pudimos contactar al servidor. Revisa tu conexión e intenta de nuevo.'],
    ['the invitation was revoked', { status: 403, code: 'INVITE_REVOKED', message: 'El dueño revocó esta invitación.' }, 'El dueño revocó esta invitación.'],
  ])('should explain the problem when %s', async (_caso, error, texto) => {
    // Arrange
    mockGet = vi.fn(async () => { throw error; });

    // Act
    abrirInvitacion();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
  });
});

describe('AcceptInvitePage: la contrasena', () => {
  test('should ask for both fields and put the focus on the password when the form is sent empty', async () => {
    // Arrange
    const { user } = await conFormulario();

    // Act
    await user.click(crearCuenta());

    // Assert
    expect(screen.getByText('Escribe una contraseña.')).toBeInTheDocument();
    expect(screen.getByText('Repite la contraseña para confirmarla.')).toBeInTheDocument();
    expect(contrasena()).toHaveAttribute('aria-invalid', 'true');
    expect(contrasena()).toHaveFocus();
    expect(mockAcceptInvite).not.toHaveBeenCalled();
  });

  test.each([
    ['clave', 'Te faltan 1 caracteres (mínimo 6).'],
    ['abcdefg', 'Debe incluir al menos un número.'],
  ])('should explain what is missing when the password is %s', async (clave, texto) => {
    // Arrange
    const { user } = await conFormulario();
    await user.type(contrasena(), clave);
    await user.type(confirmacion(), clave);

    // Act
    await user.click(crearCuenta());

    // Assert
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(contrasena()).toHaveFocus();
  });

  test('should put the focus on the confirmation when only the confirmation does not match', async () => {
    // Arrange
    const { user } = await conFormulario();
    await user.type(contrasena(), 'clave123');
    await user.type(confirmacion(), 'clave124');

    // Act
    await user.click(crearCuenta());

    // Assert
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(confirmacion()).toHaveFocus();
  });

  test('should take the error away and confirm the password when the person types a valid one', async () => {
    // Arrange
    const { user } = await conFormulario();
    await user.click(crearCuenta());

    // Act
    await user.type(contrasena(), 'clave123');
    await user.type(confirmacion(), 'clave123');

    // Assert
    expect(screen.queryByText('Escribe una contraseña.')).not.toBeInTheDocument();
    expect(screen.getByText('Contraseña válida.')).toBeInTheDocument();
    expect(screen.getByText('Coinciden.')).toBeInTheDocument();
  });

  test('should show and hide what is typed when the eye button is clicked', async () => {
    // Arrange
    const { user } = await conFormulario();

    // Act y Assert
    expect(contrasena()).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(contrasena()).toHaveAttribute('type', 'text');
    expect(confirmacion()).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(contrasena()).toHaveAttribute('type', 'password');
  });
});

describe('AcceptInvitePage: aceptar', () => {
  test.each([
    ['receptionist', '/admin/checkin'],
    ['admin', '/admin/dashboard'],
  ])('should accept with the token and the password and open the panel when a %s accepts', async (rol, panel) => {
    // Arrange
    mockAcceptInvite = vi.fn(async () => ({ id: 9, name: 'Ana', role: rol }));
    const { user } = await conFormulario();
    await user.type(contrasena(), 'clave123');
    await user.type(confirmacion(), 'clave123');

    // Act
    await user.click(crearCuenta());

    // Assert
    expect(await screen.findByText(`Ruta actual: ${panel}`)).toBeInTheDocument();
    expect(mockAcceptInvite).toHaveBeenCalledWith('token-de-prueba', 'clave123');
  });

  test.each([
    ['the email already has an account', { status: 409, code: 'EMAIL_TAKEN', message: 'Conflicto' }, 'Ya existe una cuenta con este correo. Inicia sesión en vez de aceptar la invitación.'],
    ['there is no connection', { status: 0, isNetwork: true, message: 'Sin conexion' }, 'No pudimos contactar al servidor. Revisa tu conexión e intenta de nuevo.'],
    ['the invitation expired meanwhile', { status: 410, code: 'INVITE_EXPIRED', message: 'La invitación expiró mientras la llenabas.' }, 'La invitación expiró mientras la llenabas.'],
  ])('should explain the problem and stay on the form when %s', async (_caso, error, texto) => {
    // Arrange
    mockAcceptInvite = vi.fn(async () => { throw error; });
    const { user } = await conFormulario();
    await user.type(contrasena(), 'clave123');
    await user.type(confirmacion(), 'clave123');

    // Act
    await user.click(crearCuenta());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(crearCuenta()).toBeEnabled();
  });
});
