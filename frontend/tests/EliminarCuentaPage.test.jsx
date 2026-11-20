/**
 * Cobertura del front (Luis): EliminarCuentaPage, el derecho de supresion
 * (RQF-22, Ley 1581 de 2012): sin sesion pide iniciarla; con sesion, la
 * contrasena y la casilla habilitan el borrado, que llama a DELETE
 * /api/auth/account, cierra la sesion y confirma; el error del API se muestra.
 *
 * useAuth y el API se simulan con vi.mock.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import EliminarCuentaPage from '../src/pages/EliminarCuentaPage';
import { renderWithProviders } from './renderWithProviders';

let sesion, mockLogout, mockDelete;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('../src/api', () => ({ api: { delete: (...a) => mockDelete(...a) } }));

const DUENO = { id: 1, name: 'Ana Pérez', email: 'ana@gym.co', role: 'admin' };

const abrirPagina = () => renderWithProviders(<EliminarCuentaPage />, { route: '/legal/eliminar-cuenta' });
const eliminar = () => screen.getByRole('button', { name: 'Eliminar cuenta definitivamente' });
const contrasena = () => screen.getByLabelText('Tu contraseña');
const casilla = () => screen.getByRole('checkbox');

beforeEach(() => {
  mockLogout = vi.fn();
  mockDelete = vi.fn(async () => ({ data: { ok: true } }));
  sesion = { user: DUENO, gym: { id: 7, name: 'Gimnasio Central' }, logout: mockLogout };
});

describe('EliminarCuentaPage: sin sesion', () => {
  test('should ask to sign in and not show the form when nobody is signed in', async () => {
    // Arrange
    sesion = { user: null, gym: null, logout: mockLogout };
    const { user } = abrirPagina();

    // Act
    await user.click(screen.getByRole('link', { name: 'Inicia sesión' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /login')).toBeInTheDocument();
  });

  test('should explain that only the owner can delete the account when nobody is signed in', () => {
    // Arrange
    sesion = { user: null, gym: null, logout: mockLogout };

    // Act
    abrirPagina();

    // Assert
    expect(screen.getByText('Inicia sesión para eliminar tu cuenta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar cuenta definitivamente' })).not.toBeInTheDocument();
  });
});

describe('EliminarCuentaPage: con sesion', () => {
  test('should enable the delete button only when the password is typed and the box is checked', async () => {
    // Arrange
    const { user } = abrirPagina();

    // Act y Assert
    expect(eliminar()).toBeDisabled();
    await user.type(contrasena(), 'clave1234');
    expect(eliminar()).toBeDisabled();
    await user.click(casilla());
    expect(eliminar()).toBeEnabled();
  });

  test('should name the gym in the confirmation box when the gym is known', () => {
    // Act
    abrirPagina();

    // Assert
    expect(casilla().closest('label')).toHaveTextContent('todos los datos del gimnasio "Gimnasio Central" serán eliminados permanentemente');
  });

  test('should name the owner when the gym name is not known', () => {
    // Arrange
    sesion = { ...sesion, gym: null };

    // Act
    abrirPagina();

    // Assert
    expect(casilla().closest('label')).toHaveTextContent('"Ana Pérez"');
  });

  test('should delete the account, close the session and confirm when the owner confirms with the password', async () => {
    // Arrange
    const { user } = abrirPagina();
    await user.type(screen.getByRole('textbox', { name: 'Motivo (opcional)' }), 'Cerramos el gimnasio');
    await user.type(contrasena(), 'clave1234');
    await user.click(casilla());

    // Act
    await user.click(eliminar());

    // Assert
    expect(await screen.findByRole('heading', { name: 'Cuenta eliminada' })).toBeInTheDocument();
    expect(mockDelete).toHaveBeenCalledWith('/auth/account', { data: { password: 'clave1234', reason: 'Cerramos el gimnasio' } });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Eliminar cuenta definitivamente' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));
    expect(await screen.findByText('Ruta actual: /')).toBeInTheDocument();
  });

  test('should show the API error and keep the session when the password is wrong', async () => {
    // Arrange
    mockDelete = vi.fn(async () => { throw { status: 401, code: 'BAD_CREDENTIALS', message: 'La contraseña no es correcta.' }; });
    const { user } = abrirPagina();
    await user.type(contrasena(), 'otra-clave');
    await user.click(casilla());

    // Act
    await user.click(eliminar());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña no es correcta.');
    expect(mockLogout).not.toHaveBeenCalled();
    expect(eliminar()).toBeEnabled();
  });

  test('should explain how to write to the team when the API error has no message', async () => {
    // Arrange
    mockDelete = vi.fn(async () => { throw { status: 0 }; });
    const { user } = abrirPagina();
    await user.type(contrasena(), 'clave1234');
    await user.click(casilla());

    // Act
    await user.click(eliminar());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo procesar la solicitud. Escríbenos a fitloyaltysaas@gmail.com.');
  });

  test('should go back to the previous page when the owner clicks Cancelar', async () => {
    // Arrange: venia de Configuracion
    function RutaActual() { return <p>Ruta actual: {useLocation().pathname}</p>; }
    render(
      <MemoryRouter initialEntries={['/admin/config', '/legal/eliminar-cuenta']} initialIndex={1}>
        <Routes>
          <Route path="/legal/eliminar-cuenta" element={<EliminarCuentaPage />} />
          <Route path="*" element={<RutaActual />} />
        </Routes>
      </MemoryRouter>,
    );

    // Act
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /admin/config')).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
