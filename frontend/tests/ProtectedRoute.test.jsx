/**
 * Semana 8 (CI completo), capa Front, Santiago: ramas sin cubrir del reporte de
 * cobertura del frontend (artefacto coverage-frontend del job `frontend`).
 *
 * ProtectedRoute salia en 0 % de ramas, y es la puerta de todo /admin: decide
 * quien ve el panel y a donde se manda a quien no puede. Cada rama tiene su test:
 *   1. revalidando la sesion (loading && !ready) -> spinner, nunca /login
 *   2. sin usuario                               -> /login, recordando de donde venia
 *   3. rol fuera de la lista                     -> /admin/checkin
 *   4. rol permitido (role, rol o rol_nombre)    -> el contenido
 *   5. sin lista de roles                        -> cualquier usuario con sesion
 *
 * useAuth se reemplaza con vi.mock (stub): cada test fija la sesion que necesita.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render } from '@testing-library/react';
import ProtectedRoute from '../src/components/ProtectedRoute';

let sesion;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => sesion }));

function Destino({ nombre }) {
  const { state } = useLocation();
  return <p>{nombre}{state?.from ? ` (desde ${state.from})` : ''}</p>;
}

/** Monta /admin/staff protegida con `roles` y las rutas a las que puede mandar. */
function abrir(roles) {
  return render(
    <MemoryRouter initialEntries={['/admin/staff']}>
      <Routes>
        <Route
          path="/admin/staff"
          element={<ProtectedRoute roles={roles}><p>Contenido protegido</p></ProtectedRoute>}
        />
        <Route path="/login" element={<Destino nombre="Pantalla de login" />} />
        <Route path="/admin/checkin" element={<Destino nombre="Pantalla de check-in" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sesion = { user: null, loading: false, ready: true };
});

describe('ProtectedRoute', () => {
  test('should show the spinner and not send to login while the session is being revalidated', () => {
    // Arrange: hay token guardado y /auth/me todavia no responde
    sesion = { user: null, loading: true, ready: false };

    // Act
    const { container } = abrir(['admin']);

    // Assert
    expect(container.querySelector('.boot-shell .spinner')).not.toBeNull();
    expect(screen.queryByText(/Pantalla de login/)).not.toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
  });

  test('should send to login and remember the page when there is no user', () => {
    sesion = { user: null, loading: false, ready: true };

    abrir(['admin']);

    expect(screen.getByText('Pantalla de login (desde /admin/staff)')).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
  });

  test('should send to login when loading ended without a user even if ready is false', () => {
    // loading en false manda: ya no hay nada que esperar.
    sesion = { user: null, loading: false, ready: false };

    abrir(['admin']);

    expect(screen.getByText(/Pantalla de login/)).toBeInTheDocument();
  });

  test('should send a receptionist to check-in when the page is only for admins', () => {
    sesion = { user: { id: 2, role: 'receptionist' }, loading: false, ready: true };

    abrir(['admin']);

    expect(screen.getByText('Pantalla de check-in ROJO PROVOCADO')).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
  });

  test.each([
    ['role', { role: 'admin' }],
    ['rol', { rol: 'admin' }],
    ['rol_nombre', { rol_nombre: 'admin' }],
  ])('should show the content when the allowed role comes in %s', (_campo, rol) => {
    sesion = { user: { id: 1, ...rol }, loading: false, ready: true };

    abrir(['admin']);

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });

  test('should let any signed-in user in when the route has no role list', () => {
    sesion = { user: { id: 3, role: 'trainer' }, loading: false, ready: true };

    abrir(undefined);

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });

  test('should keep showing the content while revalidating if the user is already known', () => {
    // loading con ready en true: es un refresco de /auth/me, no el arranque.
    sesion = { user: { id: 1, role: 'admin' }, loading: true, ready: true };

    abrir(['admin']);

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });
});
