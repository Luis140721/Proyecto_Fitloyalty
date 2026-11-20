/**
 * Cobertura del front (Luis): MenuPerfil, el avatar del encabezado que abre la
 * ficha de la sesion (nombre, correo, rol, gimnasio) con Configuracion para el
 * administrador y Cerrar sesion. Incluye UserAvatar: foto o iniciales.
 *
 * useAuth se simula con vi.mock.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import MenuPerfil from '../src/components/MenuPerfil';
import { renderWithProviders } from './renderWithProviders';

let sesion, mockLogout;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => sesion }));

const ADMIN = { id: 1, name: 'Ana Pérez', email: 'ana@gym.co', role: 'admin' };

const abrirEncabezado = () => renderWithProviders(
  <div><MenuPerfil /><p>Resto del encabezado</p></div>,
  { route: '/admin/miembros' },
);
const disparador = () => screen.getByRole('button', { name: 'Tu perfil' });
const ficha = () => screen.getByRole('dialog', { name: 'Tu perfil' });

beforeEach(() => {
  mockLogout = vi.fn();
  sesion = { user: ADMIN, gym: { id: 7, name: 'Gimnasio Central', active: true }, logout: mockLogout };
});

describe('MenuPerfil: la ficha de la sesion', () => {
  test('should open the profile with the name, email, role and gym when the avatar is clicked', async () => {
    // Arrange
    const { user } = abrirEncabezado();
    expect(disparador()).toHaveAttribute('aria-expanded', 'false');

    // Act
    await user.click(disparador());

    // Assert
    expect(disparador()).toHaveAttribute('aria-expanded', 'true');
    expect(within(ficha()).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(ficha()).getByText('ana@gym.co')).toBeInTheDocument();
    expect(within(ficha()).getByText('Administrador')).toBeInTheDocument();
    expect(within(ficha()).getByText('Gimnasio Central')).toBeInTheDocument();
    expect(within(ficha()).getByText('Activa')).toBeInTheDocument();
  });

  test('should take the admin to Configuración when the link of the profile is clicked', async () => {
    // Arrange
    const { user } = abrirEncabezado();
    await user.click(disparador());

    // Act
    await user.click(within(ficha()).getByRole('link', { name: 'Configuración' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /admin/config')).toBeInTheDocument();
  });

  test('should not offer Configuración and name the role in words when the person is the reception', async () => {
    // Arrange
    sesion = { ...sesion, user: { ...ADMIN, role: 'receptionist' } };
    const { user } = abrirEncabezado();

    // Act
    await user.click(disparador());

    // Assert
    expect(within(ficha()).getByText('Recepcionista')).toBeInTheDocument();
    expect(within(ficha()).queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  test('should use the fallbacks when the name, the known role and the gym are missing', async () => {
    // Arrange
    sesion = { user: { id: 3, email: 'sin@gym.co', role: 'coach', rol_nombre: 'COACH' }, gym: null, logout: mockLogout };
    const { user } = abrirEncabezado();

    // Act
    await user.click(disparador());

    // Assert
    expect(within(ficha()).getByText('Usuario')).toBeInTheDocument();
    expect(within(ficha()).getByText('COACH')).toBeInTheDocument();
    expect(within(ficha()).getByText('—')).toBeInTheDocument();
  });

  test('should say the account is inactive when the gym is not active', async () => {
    // Arrange
    sesion = { ...sesion, gym: { id: 7, name: 'Gimnasio Central', active: false } };
    const { user } = abrirEncabezado();

    // Act
    await user.click(disparador());

    // Assert
    expect(within(ficha()).getByText('Inactiva')).toBeInTheDocument();
  });

  test('should close the session when Cerrar sesión is clicked', async () => {
    // Arrange
    const { user } = abrirEncabezado();
    await user.click(disparador());

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Cerrar sesión' }));

    // Assert
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('MenuPerfil: abrir y cerrar', () => {
  test('should close when Escape, a click outside or the avatar is used, but not when the click is inside', async () => {
    // Arrange
    const { user } = abrirEncabezado();
    await user.click(disparador());

    // Act y Assert: un click dentro no la cierra
    fireEvent.mouseDown(within(ficha()).getByText('Gimnasio Central'));
    expect(ficha()).toBeInTheDocument();

    // Act y Assert: Escape la cierra
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Act y Assert: fuera la cierra
    await user.click(disparador());
    fireEvent.mouseDown(screen.getByText('Resto del encabezado'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Act y Assert: el avatar la abre y la cierra
    await user.click(disparador());
    await user.click(disparador());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('UserAvatar', () => {
  test('should show the photo of the person and the initials when the photo fails to load', async () => {
    // Arrange
    sesion = { ...sesion, user: { ...ADMIN, photoUrl: 'https://cdn.example/ana.jpg' } };
    const { user } = abrirEncabezado();
    await user.click(disparador());
    const fotos = screen.getAllByRole('img', { name: 'Foto de Ana Pérez' });

    // Act
    fireEvent.error(fotos[1]);

    // Assert
    expect(fotos[0]).toHaveAttribute('src', 'https://cdn.example/ana.jpg');
    expect(screen.getAllByRole('img', { name: 'Foto de Ana Pérez' })).toHaveLength(1);
    expect(within(ficha()).getByText('AP')).toBeInTheDocument();
  });

  test('should describe the photo as Avatar when the person has a photo but no name', async () => {
    // Arrange
    sesion = { ...sesion, user: { id: 4, role: 'admin', photoUrl: 'https://cdn.example/sin-nombre.jpg' } };

    // Act
    abrirEncabezado();

    // Assert
    expect(screen.getByRole('img', { name: 'Avatar' })).toHaveAttribute('src', 'https://cdn.example/sin-nombre.jpg');
  });

  test('should show a question mark as initials when the person has no name', async () => {
    // Arrange
    sesion = { ...sesion, user: { id: 4, role: 'admin' } };
    const { user } = abrirEncabezado();

    // Act
    await user.click(disparador());

    // Assert
    expect(within(ficha()).getByText('?')).toBeInTheDocument();
  });
});
