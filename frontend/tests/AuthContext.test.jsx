/**
 * Bootcamp semana 8 (Luis): AuthContext (context/AuthContext.jsx), la sesion
 * del panel. Salio del analisis de ramas sin cubrir de la semana 8: los E2E de
 * rutas-protegidas.spec.js no prueban sus ramas.
 *
 *   - La sesion guardada al abrir la app: con un token en localStorage,
 *     AuthProvider pide GET /api/auth/me. Con 403 o 404 suelta el token (el
 *     catch con [401, 403, 404]); con un fallo de red lo conserva. Al 401 lo
 *     suelta antes el interceptor de api.js, y el backend responde 401, no 403
 *     ni 404, a un token con otra firma, vencido o de una cuenta eliminada: sin
 *     el bloque del catch, los 9 tests de ese spec pasaban igual.
 *   - El rol del backend (ADMINISTRADOR...) pasa al slug del front (admin...).
 *   - Los cierres de sesion: el aviso de api.js (SESION_EXPIRADA), la
 *     inactividad, el token vencido y el boton de salir.
 *
 * Se simulan api.get y api.post; getToken, clearToken, TOKEN_KEY y
 * SESION_EXPIRADA son los de api.js, asi que el token se lee y se borra de
 * localStorage de verdad.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ErrorProvider } from '../src/components/ErrorBanner';
import { SESION_EXPIRADA, TOKEN_KEY } from '../src/api';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPost;
vi.mock('../src/api', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) } };
});

// La clave donde AuthContext guarda la ultima actividad (RQF-02).
const ACTIVIDAD_KEY = 'fitloyalty_ultima_actividad';

/** Lo que muestra la app cuando AuthProvider termina de revisar la sesion. */
function EstadoDeLaSesion() {
  const { user, ready, login, logout } = useAuth();
  if (!ready) return <p>Revisando la sesión</p>;
  return (
    <>
      <p>{user ? `Sesión de ${user.nombre} (${user.role})` : 'Sin sesión'}</p>
      <button type="button" onClick={() => login('luis@example.com', 'clave1234')}>Entrar</button>
      <button type="button" onClick={() => logout()}>Salir</button>
    </>
  );
}

const abrirApp = () => renderWithProviders(
  <ErrorProvider><AuthProvider><EstadoDeLaSesion /></AuthProvider></ErrorProvider>,
  { route: '/admin/dashboard' },
);

/** Respuesta de GET /api/auth/me con el usuario del personal. */
const yo = (rol_nombre = 'ADMINISTRADOR') => async () => ({ data: { user: { nombre: 'Luis', rol_nombre }, gym: { nombre: 'Gimnasio Uno' } } });

/** Un JWT con solo el `exp` que se le pide (la firma la revisa el backend, no el front). */
const tokenQueVence = (expSegundos) => `cabecera.${btoa(JSON.stringify({ exp: expSegundos }))}.firma`;

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, 'token-guardado');
  mockGet = vi.fn(yo());
  mockPost = vi.fn(async () => ({ data: {} }));
});
afterEach(() => {
  localStorage.clear();
});

describe('AuthContext: la sesion guardada al abrir la app', () => {
  test('should keep the session when /auth/me answers with the user', async () => {
    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sesión de Luis (admin)')).toBeInTheDocument();
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

describe('AuthContext: el rol', () => {
  test.each([
    ['RECEPCIONISTA', 'receptionist'],
    ['ENTRENADOR', 'trainer'],
    [null, 'receptionist'],
  ])('should turn the role %s of the backend into %s', async (rolNombre, slug) => {
    // Arrange
    mockGet = vi.fn(yo(rolNombre));

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText(`Sesión de Luis (${slug})`)).toBeInTheDocument();
  });
});

describe('AuthContext: cerrar la sesion', () => {
  test('should close the session and say why when an API call answers that the account was disabled', async () => {
    // Arrange
    abrirApp();
    await screen.findByText('Sesión de Luis (admin)');

    // Act: api.js avisa que una peticion con el token vigente volvio con 401 ACCOUNT_DISABLED
    act(() => { window.dispatchEvent(new CustomEvent(SESION_EXPIRADA, { detail: { code: 'ACCOUNT_DISABLED' } })); });

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu cuenta fue desactivada o cambió de gimnasio. Habla con el administrador.');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  test('should close the session and say it expired when an API call answers 401 without a reason', async () => {
    // Arrange
    abrirApp();
    await screen.findByText('Sesión de Luis (admin)');

    // Act
    act(() => { window.dispatchEvent(new CustomEvent(SESION_EXPIRADA, { detail: { code: null } })); });

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró. Inicia sesión de nuevo.');
  });

  test('should close the session when the last activity saved is older than the inactivity limit', async () => {
    // Arrange: la ultima actividad fue hace 31 minutos (el limite es de 30)
    localStorage.setItem(ACTIVIDAD_KEY, String(Date.now() - 31 * 60 * 1000));

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión se cerró tras 30 minutos sin actividad. Inicia sesión de nuevo.');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  test('should close the session when the saved token is past its expiration', async () => {
    // Arrange: /auth/me todavia lo acepta, pero su exp ya paso hace un minuto
    localStorage.setItem(TOKEN_KEY, tokenQueVence(Math.floor(Date.now() / 1000) - 60));

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró. Inicia sesión de nuevo.');
  });

  test('should drop the token and the user when the user logs out', async () => {
    // Arrange
    const { user } = abrirApp();
    await screen.findByText('Sesión de Luis (admin)');

    // Act
    await user.click(screen.getByRole('button', { name: 'Salir' }));

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/auth/logout');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('AuthContext: iniciar sesion', () => {
  test('should save the token and open the session when the login answers with a token', async () => {
    // Arrange: sin token guardado
    localStorage.removeItem(TOKEN_KEY);
    mockPost = vi.fn(async () => ({ data: { token: 'token-nuevo', user: { nombre: 'Luis', rol_nombre: 'ADMINISTRADOR' }, gym: { nombre: 'Gimnasio Uno' } } }));
    const { user } = abrirApp();
    await screen.findByText('Sin sesión');

    // Act
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    // Assert
    expect(await screen.findByText('Sesión de Luis (admin)')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/auth/login', { email: 'luis@example.com', password: 'clave1234' });
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-nuevo');
    expect(mockGet).not.toHaveBeenCalled();
  });
});
