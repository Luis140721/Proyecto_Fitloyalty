/**
 * Bootcamp semana 8 (Luis): la sesion guardada al abrir la app. Con un token
 * en localStorage, AuthProvider (context/AuthContext.jsx) pide GET /api/auth/me:
 *   - 403 o 404: el token esta muerto y se suelta (el catch con [401, 403, 404]).
 *   - un fallo de red: el token se queda, puede ser un bajon de conexion.
 *
 * Salieron del analisis de ramas sin cubrir de la semana 8: los E2E de
 * rutas-protegidas.spec.js no las prueban. Al 401 lo suelta antes el
 * interceptor de api.js, y el backend responde 401, no 403 ni 404, a un token
 * con otra firma, vencido o de una cuenta eliminada. Sin el bloque del catch,
 * los 9 tests de ese spec pasaban igual.
 *
 * Se simula api.get; getToken, clearToken y TOKEN_KEY son los de api.js, asi
 * que el token se lee y se borra de localStorage de verdad.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ErrorProvider } from '../src/components/ErrorBanner';
import { TOKEN_KEY } from '../src/api';
import { renderWithProviders } from './renderWithProviders';

let mockGet;
vi.mock('../src/api', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, api: { get: (...a) => mockGet(...a), post: vi.fn() } };
});

/** Lo que muestra la app cuando AuthProvider termina de revisar la sesion. */
function EstadoDeLaSesion() {
  const { user, ready } = useAuth();
  if (!ready) return <p>Revisando la sesión</p>;
  return <p>{user ? `Sesión de ${user.nombre}` : 'Sin sesión'}</p>;
}

const abrirApp = () => renderWithProviders(
  <ErrorProvider><AuthProvider><EstadoDeLaSesion /></AuthProvider></ErrorProvider>,
  { route: '/admin/dashboard' },
);

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, 'token-guardado');
});
afterEach(() => {
  localStorage.clear();
});

describe('AuthContext: la sesion guardada al abrir la app', () => {
  test('should keep the session when /auth/me answers with the user', async () => {
    // Arrange
    mockGet = vi.fn(async () => ({ data: { user: { nombre: 'Luis', rol_nombre: 'ADMINISTRADOR' }, gym: { nombre: 'Gimnasio Uno' } } }));

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sesión de Luis')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-guardado');
  });

  // Errores ya normalizados por buildError (api.js), como los recibe el catch.
  test.each([
    [403, 'FORBIDDEN', 'No tienes permiso para esta acción.'],
    [404, 'USER_NOT_FOUND', 'Usuario no encontrado'],
  ])('should drop the saved token when /auth/me answers %i', async (status, code, message) => {
    // Arrange
    mockGet = vi.fn(async () => { throw { status, code, message, isNetwork: false }; });

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  test('should keep the saved token when /auth/me fails because there is no connection', async () => {
    // Arrange
    mockGet = vi.fn(async () => {
      throw { status: 0, code: 'NETWORK', message: 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.', isNetwork: true };
    });

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-guardado');
  });
});
