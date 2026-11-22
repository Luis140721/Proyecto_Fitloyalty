/**
 * Bootcamp semana 3 (Front, Santiago): LoginPage desde lo que ve la persona.
 *
 * useAuth se reemplaza con vi.mock: el test controla lo que responde login()
 * sin AuthProvider ni API. La navegacion se comprueba con la ruta que muestra
 * renderWithProviders.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import LoginPage from '../src/pages/LoginPage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test en vez de mockReset: con Vitest 2.1.9, despues de
// mockReset/mockClear la promesa rechazada que devuelve el mock queda sin manejar.
let mockLogin;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ login: (...a) => mockLogin(...a) }) }));

const abrirLogin = () => renderWithProviders(<LoginPage />, { route: '/login' });
const campoCorreo = () => screen.getByLabelText('Correo electrónico');
const campoClave = () => screen.getByLabelText('Contraseña');
const botonEntrar = () => screen.getByRole('button', { name: /entrar a mi panel/i });

beforeEach(() => { mockLogin = vi.fn(); });

describe('LoginPage', () => {
  test('should show an error and not call login when the form is empty', async () => {
    // Arrange
    const { user } = abrirLogin();

    // Act
    await user.click(botonEntrar());

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu correo y contraseña');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('should show an error when only the email is filled', async () => {
    const { user } = abrirLogin();

    await user.type(campoCorreo(), 'ana@gym.co');
    await user.click(botonEntrar());

    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu correo y contraseña');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('should send the email trimmed and in lowercase and open the dashboard for an admin', async () => {
    mockLogin.mockResolvedValue({ id: 1, role: 'admin' });
    const { user } = abrirLogin();

    await user.type(campoCorreo(), '  Ana@Gym.CO ');
    await user.type(campoClave(), 'clave123');
    await user.click(botonEntrar());

    expect(await screen.findByText('Ruta actual: /admin/dashboard')).toBeInTheDocument();
    expect(mockLogin).toHaveBeenCalledWith('ana@gym.co', 'clave123');
  });

  test('should open the check-in for a receptionist', async () => {
    mockLogin.mockResolvedValue({ id: 2, rol_nombre: 'RECEPCIONISTA' });
    const { user } = abrirLogin();

    await user.type(campoCorreo(), 'recepcion@gym.co');
    await user.type(campoClave(), 'clave123');
    await user.click(botonEntrar());

    expect(await screen.findByText('Ruta actual: /admin/checkin')).toBeInTheDocument();
  });

  test('should disable the button while the login is in progress', async () => {
    let responder;
    mockLogin.mockImplementation(() => new Promise((resolve) => { responder = resolve; }));
    const { user } = abrirLogin();

    await user.type(campoCorreo(), 'ana@gym.co');
    await user.type(campoClave(), 'clave123');
    await user.click(botonEntrar());

    expect(screen.getByRole('button', { name: /entrando/i })).toBeDisabled();

    responder({ id: 1, role: 'admin' });
    expect(await screen.findByText('Ruta actual: /admin/dashboard')).toBeInTheDocument();
  });

  test('should show the API error and stay on the login when the credentials are wrong', async () => {
    mockLogin.mockImplementation(() => Promise.reject(new Error('Credenciales incorrectas')));
    const { user } = abrirLogin();

    await user.type(campoCorreo(), 'ana@gym.co');
    await user.type(campoClave(), 'mala');
    await user.click(botonEntrar());

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas');
    expect(botonEntrar()).toBeEnabled();
    expect(screen.queryByText(/Ruta actual/)).not.toBeInTheDocument();
  });

  test('should show and hide the password with the eye button', async () => {
    const { user } = abrirLogin();
    await user.type(campoClave(), 'clave123');

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(campoClave()).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(campoClave()).toHaveAttribute('type', 'password');
  });
});

// Semana 8 (Front, Santiago): ramas que el reporte de cobertura marcaba sin cubrir
// (LoginPage.jsx lineas 25 y 31, y las formas de reconocer a un administrador).
describe('LoginPage: ramas sin cubrir del reporte de la semana 8', () => {
  const entrar = async (user) => {
    await user.type(campoCorreo(), 'ana@fitgym.co');
    await user.type(campoClave(), 'clave1234');
    await user.click(botonEntrar());
  };

  test.each([
    ['rol ADMINISTRADOR', { id: 1, rol: 'ADMINISTRADOR' }],
    ['id_rol 1', { id: 1, id_rol: 1 }],
  ])('should open the dashboard when the admin comes as %s', async (_forma, usuario) => {
    mockLogin.mockResolvedValue(usuario);
    const { user } = abrirLogin();

    await entrar(user);

    expect(await screen.findByText('Ruta actual: /admin/dashboard')).toBeInTheDocument();
  });

  test('should show a generic error and stay when login resolves without a user', async () => {
    mockLogin.mockResolvedValue(null);
    const { user } = abrirLogin();

    await entrar(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesión');
    expect(screen.queryByText(/Ruta actual/)).not.toBeInTheDocument();
    expect(botonEntrar()).toBeEnabled();
  });

  test('should show a generic error when the failure brings no message', async () => {
    mockLogin.mockRejectedValue({ status: 0 });
    const { user } = abrirLogin();

    await entrar(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesión');
  });
});
