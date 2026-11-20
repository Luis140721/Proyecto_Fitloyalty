/**
 * Cobertura del front (Luis): ProtectedRoute, la puerta de las rutas del
 * panel: espera mientras se revisa la sesion, manda al login (recordando a
 * donde iba) sin sesion, y lleva a un rol no permitido a /admin/checkin.
 *
 * useAuth se simula con vi.mock.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from '../src/components/ProtectedRoute';

let sesion;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => sesion }));

function Login() {
  const { state } = useLocation();
  return <p>Login (venía de {state?.from ?? 'ninguna parte'})</p>;
}

function abrir(ruta = '/admin/staff', roles = ['admin']) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/admin/staff" element={<ProtectedRoute roles={roles}><p>Pantalla de equipo</p></ProtectedRoute>} />
        <Route path="/admin/perfil" element={<ProtectedRoute><p>Mi perfil</p></ProtectedRoute>} />
        <Route path="/admin/checkin" element={<p>Check-in</p>} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sesion = { user: { id: 1, role: 'admin' }, loading: false, ready: true };
});

describe('ProtectedRoute', () => {
  test('should wait and not redirect when the session is still being checked', () => {
    // Arrange
    sesion = { user: null, loading: true, ready: false };

    // Act
    abrir();

    // Assert
    expect(screen.queryByText('Pantalla de equipo')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Login/)).not.toBeInTheDocument();
  });

  test('should send to the login and remember the requested route when there is no session', () => {
    // Arrange
    sesion = { user: null, loading: false, ready: true };

    // Act
    abrir('/admin/staff');

    // Assert
    expect(screen.getByText('Login (venía de /admin/staff)')).toBeInTheDocument();
  });

  test('should show the screen when the role is allowed', () => {
    // Act
    abrir();

    // Assert
    expect(screen.getByText('Pantalla de equipo')).toBeInTheDocument();
  });

  test.each([
    ['role', { role: 'receptionist' }],
    ['rol', { rol: 'receptionist' }],
    ['rol_nombre', { rol_nombre: 'receptionist' }],
  ])('should take the person to the check-in when the role read from %s is not allowed', (_campo, usuario) => {
    // Arrange
    sesion = { ...sesion, user: { id: 2, ...usuario } };

    // Act
    abrir('/admin/staff', ['admin']);

    // Assert
    expect(screen.getByText('Check-in')).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de equipo')).not.toBeInTheDocument();
  });

  test('should let any signed in person in when the route does not list roles', () => {
    // Arrange
    sesion = { ...sesion, user: { id: 3, role: 'trainer' } };

    // Act
    abrir('/admin/perfil');

    // Assert
    expect(screen.getByText('Mi perfil')).toBeInTheDocument();
  });
});
