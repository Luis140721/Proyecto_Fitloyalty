/**
 * Cobertura del front (Luis): AuthProvider desde lo que vive la persona: abrir
 * la app con o sin sesion guardada, entrar, salir y el cierre por inactividad
 * o por token vencido (RQF-02), con el aviso que deja en el banner.
 *
 * Solo se simula el cliente HTTP (api.get y api.post). getToken, setToken y
 * tokenVenceEn son los reales de api.js y trabajan sobre localStorage, y el
 * banner de errores es el real.
 *
 * Se llama AuthProvider.test.jsx para no chocar con AuthContext.test.jsx de la
 * semana 8 (PR #78): alla estan el 403, el 404 y el fallo de red de /auth/me, y
 * aqui no se repiten.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ErrorProvider } from '../src/components/ErrorBanner';

// Un vi.fn nuevo por test, como en LoginPage.test.jsx.
let mockGet, mockPost;
vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) },
}));

const TOKEN_KEY = 'fitloyalty_token';
const ACTIVIDAD_KEY = 'fitloyalty_ultima_actividad';
const MINUTO = 60 * 1000;
const AHORA = new Date('2026-11-19T15:00:00.000Z');

/** JWT de prueba: solo importa el payload, la firma la revisa el backend. */
const jwt = (payload) => `cabecera.${btoa(JSON.stringify(payload))}.firma`;
const TOKEN_VIGENTE = jwt({ sub: 1, exp: Math.floor(AHORA.getTime() / 1000) + 8 * 3600 });

const ANA = { id: 1, name: 'Ana Pérez', email: 'ana@gym.co', role: 'ADMINISTRADOR' };
const GIMNASIO = { id: 7, name: 'Gimnasio Central', active: true };

/** Lo minimo que muestra y hace una pantalla con la sesion. */
function PantallaDeSesion() {
  const { user, gym, ready, login, register, acceptInvite, logout, marcarActividad } = useAuth();
  const [error, setError] = useState('');
  const intentar = (accion) => accion().catch((e) => setError(e.message));
  if (!ready) return <p>Revisando la sesión…</p>;
  return (
    <main>
      <p>{user ? `Sesión de ${user.name} como ${user.role} en ${gym?.name ?? 'sin gimnasio'}` : 'Sin sesión'}</p>
      {error && <p>No se pudo: {error}</p>}
      <button type="button" onClick={() => intentar(() => login('ana@gym.co', 'clave1234'))}>Entrar</button>
      <button type="button" onClick={() => intentar(() => register({ gymName: 'Gimnasio Central', ownerEmail: 'ana@gym.co' }))}>Registrar gimnasio</button>
      <button type="button" onClick={() => intentar(() => acceptInvite('token-invitacion', 'clave1234'))}>Aceptar invitación</button>
      <button type="button" onClick={marcarActividad}>Registrar ingreso con la cámara</button>
      <button type="button" onClick={() => intentar(logout)}>Salir</button>
    </main>
  );
}

function abrirApp() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ErrorProvider>
        <AuthProvider><PantallaDeSesion /></AuthProvider>
      </ErrorProvider>
    </MemoryRouter>,
  );
  return { user };
}

const sesionAbierta = (texto = 'Sesión de Ana Pérez como admin en Gimnasio Central') => screen.findByText(texto);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  mockGet = vi.fn(async () => ({ data: { user: ANA, gym: GIMNASIO } }));
  mockPost = vi.fn(async () => ({ data: { token: TOKEN_VIGENTE, user: ANA, gym: GIMNASIO } }));
});
afterEach(() => vi.useRealTimers());

describe('AuthProvider: al abrir la app', () => {
  test('should be ready without a session and not ask the API when there is no saved token', async () => {
    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test.each([
    ['ADMINISTRADOR', 'admin'],
    ['recepcionista', 'receptionist'],
    ['ENTRENADOR', 'trainer'],
    ['', 'receptionist'],
    ['coach', 'coach'],
  ])('should normalize the role "%s" of /auth/me to %s when the saved token is still valid', async (rol, normalizado) => {
    // Arrange
    localStorage.setItem(TOKEN_KEY, TOKEN_VIGENTE);
    mockGet = vi.fn(async () => ({ data: { user: { ...ANA, role: undefined, rol }, gym: GIMNASIO } }));

    // Act
    abrirApp();

    // Assert
    expect(await sesionAbierta(`Sesión de Ana Pérez como ${normalizado} en Gimnasio Central`)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
  });

  test('should read the role from rol_nombre when /auth/me sends neither role nor rol', async () => {
    // Arrange
    localStorage.setItem(TOKEN_KEY, TOKEN_VIGENTE);
    mockGet = vi.fn(async () => ({ data: { user: { ...ANA, role: undefined, rol_nombre: 'ADMINISTRADOR' }, gym: GIMNASIO } }));

    // Act
    abrirApp();

    // Assert: sin rol_nombre quedaria como receptionist
    expect(await sesionAbierta('Sesión de Ana Pérez como admin en Gimnasio Central')).toBeInTheDocument();
  });

  // 403, 404 y el fallo de red estan en AuthContext.test.jsx (semana 8); aqui solo el 401.
  test('should drop the saved token when /auth/me answers 401', async () => {
    // Arrange
    localStorage.setItem(TOKEN_KEY, TOKEN_VIGENTE);
    mockGet = vi.fn(async () => { throw { status: 401, code: 'TOKEN_INVALID', message: 'Token no valido' }; });

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  test('should close the session with the inactivity notice when the last activity is older than 30 minutes', async () => {
    // Arrange: cerro el navegador hace 31 minutos con la sesion abierta
    localStorage.setItem(TOKEN_KEY, TOKEN_VIGENTE);
    localStorage.setItem(ACTIVIDAD_KEY, String(AHORA.getTime() - 31 * MINUTO));

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión se cerró tras 30 minutos sin actividad. Inicia sesión de nuevo.');
    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVIDAD_KEY)).toBeNull();
  });

  test('should keep the session when the last activity is less than 30 minutes old', async () => {
    // Arrange
    localStorage.setItem(TOKEN_KEY, TOKEN_VIGENTE);
    localStorage.setItem(ACTIVIDAD_KEY, String(AHORA.getTime() - 29 * MINUTO));

    // Act
    abrirApp();

    // Assert
    expect(await sesionAbierta()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should close the session as expired when the saved token is past its exp', async () => {
    // Arrange
    localStorage.setItem(TOKEN_KEY, jwt({ sub: 1, exp: Math.floor(AHORA.getTime() / 1000) - 60 }));

    // Act
    abrirApp();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión expiró. Inicia sesión de nuevo.');
    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
  });
});

describe('AuthProvider: entrar y salir', () => {
  test.each([
    ['Entrar', '/auth/login', { email: 'ana@gym.co', password: 'clave1234' }],
    ['Registrar gimnasio', '/auth/signup', { gymName: 'Gimnasio Central', ownerEmail: 'ana@gym.co' }],
    ['Aceptar invitación', '/auth/accept-invite', { token: 'token-invitacion', password: 'clave1234' }],
  ])('should save the token, start the activity clock and show the user when %s succeeds', async (boton, ruta, cuerpo) => {
    // Arrange
    const { user } = abrirApp();
    await screen.findByText('Sin sesión');

    // Act
    await user.click(screen.getByRole('button', { name: boton }));

    // Assert
    expect(await sesionAbierta()).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(ruta, cuerpo);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(TOKEN_VIGENTE);
    expect(localStorage.getItem(ACTIVIDAD_KEY)).toBe(String(AHORA.getTime()));
  });

  test('should keep the session closed and pass the error to the screen when the login fails', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 401, code: 'BAD_CREDENTIALS', message: 'Credenciales incorrectas' }; });
    const { user } = abrirApp();
    await screen.findByText('Sin sesión');

    // Act
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    // Assert
    expect(await screen.findByText('No se pudo: Credenciales incorrectas')).toBeInTheDocument();
    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  test('should tell the server and close the session without a notice when the person signs out', async () => {
    // Arrange
    const { user } = abrirApp();
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    await sesionAbierta();
    mockPost = vi.fn(async () => ({ data: { ok: true } }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Salir' }));

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/auth/logout');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should close the session and forget the activity even when POST /auth/logout fails', async () => {
    // Arrange
    const { user } = abrirApp();
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    await sesionAbierta();
    mockPost = vi.fn(async () => { throw { status: 0, code: 'NETWORK', message: 'Sin conexion' }; });

    // Act
    await user.click(screen.getByRole('button', { name: 'Salir' }));

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/auth/logout');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVIDAD_KEY)).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should count a camera check-in as activity only when there is a session', async () => {
    // Arrange
    const { user } = abrirApp();
    await screen.findByText('Sin sesión');

    // Act y Assert: sin sesion no guarda nada
    await user.click(screen.getByRole('button', { name: 'Registrar ingreso con la cámara' }));
    expect(localStorage.getItem(ACTIVIDAD_KEY)).toBeNull();

    // Act y Assert: con sesion, 20 minutos despues, guarda la hora nueva
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await sesionAbierta();
    vi.setSystemTime(new Date(AHORA.getTime() + 20 * MINUTO));
    await user.click(screen.getByRole('button', { name: 'Registrar ingreso con la cámara' }));
    expect(localStorage.getItem(ACTIVIDAD_KEY)).toBe(String(AHORA.getTime() + 20 * MINUTO));
  });

  test('should take the inactivity notice away when the person signs in again', async () => {
    // Arrange: la sesion se cerro por inactividad y el aviso quedo fijo
    localStorage.setItem(TOKEN_KEY, TOKEN_VIGENTE);
    localStorage.setItem(ACTIVIDAD_KEY, String(AHORA.getTime() - 31 * MINUTO));
    const { user } = abrirApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('sin actividad');

    // Act
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    // Assert
    expect(await sesionAbierta()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('AuthProvider: con la sesion abierta', () => {
  /** Abre la app con una sesion recien iniciada. */
  async function conSesion() {
    const pantalla = abrirApp();
    await pantalla.user.click(await screen.findByRole('button', { name: 'Entrar' }));
    await sesionAbierta();
    return pantalla;
  }

  test.each([
    ['ACCOUNT_DISABLED', 'Tu cuenta fue desactivada o cambió de gimnasio. Habla con el administrador.'],
    [null, 'Tu sesión expiró. Inicia sesión de nuevo.'],
  ])('should close the session with the right notice when an API call reports the session ended with code %s', async (code, aviso) => {
    // Arrange
    await conSesion();

    // Act: lo que dispara api.js cuando una peticion con el token vigente vuelve 401
    fireEvent(window, new CustomEvent('fitloyalty:sesion-expirada', { detail: { code } }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(aviso);
    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
  });

  test('should close the session when 30 minutes pass without activity and the tab becomes visible again', async () => {
    // Arrange
    await conSesion();
    vi.setSystemTime(new Date(AHORA.getTime() + 31 * MINUTO));

    // Act
    fireEvent(document, new Event('visibilitychange'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión se cerró tras 30 minutos sin actividad.');
    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
  });

  test('should keep the session when the person used the screen within the last 30 minutes', async () => {
    // Arrange: se movio a los 20 minutos; a los 45 lleva 25 sin actividad
    await conSesion();
    vi.setSystemTime(new Date(AHORA.getTime() + 20 * MINUTO));
    fireEvent.pointerDown(document.body);
    vi.setSystemTime(new Date(AHORA.getTime() + 45 * MINUTO));

    // Act
    fireEvent(document, new Event('visibilitychange'));

    // Assert
    expect(localStorage.getItem(ACTIVIDAD_KEY)).toBe(String(AHORA.getTime() + 20 * MINUTO));
    expect(screen.getByText('Sesión de Ana Pérez como admin en Gimnasio Central')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should close the session without a notice when another tab removes the token', async () => {
    // Arrange
    await conSesion();

    // Act
    localStorage.removeItem(TOKEN_KEY);
    fireEvent(window, new StorageEvent('storage', { key: TOKEN_KEY }));

    // Assert
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('useAuth', () => {
  test('should explain the missing provider when a screen uses it outside AuthProvider', () => {
    // Arrange: React escribe el error en consola antes de lanzarlo
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function SinProvider() { useAuth(); return null; }

    // Act y Assert
    expect(() => render(<SinProvider />)).toThrow('useAuth debe usarse dentro de <AuthProvider>');
    console.error.mockRestore();
  });
});

describe('AuthProvider: los minutos de VITE_INACTIVIDAD_MIN', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test.each([
    ['5', 6, 'Tu sesión se cerró tras 5 minutos sin actividad. Inicia sesión de nuevo.'],
    ['1', 2, 'Tu sesión se cerró tras 1 minuto sin actividad. Inicia sesión de nuevo.'],
    ['0', 31, 'Tu sesión se cerró tras 30 minutos sin actividad. Inicia sesión de nuevo.'],
  ])('should close the session with the right notice when the variable is "%s" and %i minutes pass', async (valor, minutosSinUso, aviso) => {
    // Arrange: la variable se lee al cargar el modulo, por eso se vuelve a importar
    vi.stubEnv('VITE_INACTIVIDAD_MIN', valor);
    vi.resetModules();
    const { AuthProvider: Proveedor } = await import('../src/context/AuthContext');
    const { ErrorProvider: Avisos } = await import('../src/components/ErrorBanner');
    localStorage.setItem(TOKEN_KEY, TOKEN_VIGENTE);
    localStorage.setItem(ACTIVIDAD_KEY, String(AHORA.getTime() - minutosSinUso * MINUTO));

    // Act
    render(<MemoryRouter><Avisos><Proveedor><p>Panel</p></Proveedor></Avisos></MemoryRouter>);

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(aviso);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
