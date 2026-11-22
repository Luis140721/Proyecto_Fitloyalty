/**
 * Cobertura del front (Luis): las rutas de App.jsx con los providers reales:
 * paginas publicas, redirecciones (/register, /admin y cualquier ruta que no
 * existe) y las rutas del panel protegidas por rol.
 *
 * Solo se simula el cliente HTTP; el token se guarda en localStorage como lo
 * hace la app. BrowserRouter lee la ruta de window.history.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

let mockGet;
vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: { get: (...a) => mockGet(...a), post: vi.fn(async () => ({ data: {} })), put: vi.fn(), delete: vi.fn() },
}));

const TOKEN_KEY = 'fitloyalty_token';
let usuario;

function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/auth/me') return { data: { user: usuario, gym: { id: 7, name: 'Gimnasio Central', active: true } } };
    if (url === '/billing/trial-status') return { data: { trial: { active: true, expired: false, reason: 'suscrito', daysLeft: null, endsAt: null } } };
    if (url === '/admin/notificaciones') return { data: { avisos: [] } };
    if (url === '/admin/config') return { data: { config: { umbral_alerta_amarilla: 9, umbral_alerta_roja: 15 } } };
    if (url === '/admin/hitos') return { data: { hitos: [] } };
    if (url === '/admin/checkin') return { data: { checkins: [] } };
    // RQNF-16: el enlace de baja de los mensajes comerciales (GET /api/baja/:token).
    if (url === '/baja/41.7.c2lnbmF0dXJlLWZpcm1hMQ') return { data: { nombre: 'Ana', gimnasio: 'Gimnasio Central', aceptaComerciales: true } };
    return { data: {} };
  });
}

/** Abre la app en `ruta`, con sesion si se pasa un rol. */
function abrirEn(ruta, rol) {
  if (rol) {
    usuario = { id: 1, name: 'Ana Pérez', email: 'ana@gym.co', role: rol };
    localStorage.setItem(TOKEN_KEY, 'token-de-prueba');
  }
  window.history.pushState({}, '', ruta);
  render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  usuario = null;
  mockGet = apiQueResponde();
});
afterEach(() => window.history.pushState({}, '', '/'));

describe('App: rutas publicas', () => {
  test('should open the landing when the root is visited', () => {
    // Act
    abrirEn('/');

    // Assert
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('El motor de tu gimnasio');
  });

  test('should open the gym sign-up when the old /register is visited', async () => {
    // Act
    abrirEn('/register');

    // Assert
    expect(await screen.findByRole('heading', { name: 'Crea tu gimnasio gratis' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/register-owner');
  });

  test('should open the 404 page when the route does not exist', async () => {
    // Act
    abrirEn('/planes-viejos');

    // Assert
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/404');
  });

  test.each([
    ['/legal/terminos', 'Términos y condiciones'],
    ['/legal/privacidad', /privacidad/i],
    ['/legal/datos', /datos/i],
    ['/legal/eliminar-cuenta', 'Eliminar cuenta y datos'],
  ])('should open the legal page when %s is visited', (ruta, titulo) => {
    // Act
    abrirEn(ruta);

    // Assert
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(titulo);
  });

  // RQNF-16 (Ley 2300 de 2023, art. 5): el enlace que va al final de cada mensaje comercial.
  test('should open the unsubscribe page without asking for a session when the link of a commercial message is visited', async () => {
    // Act: sin token guardado, como quien toca el enlace desde WhatsApp
    abrirEn('/baja/41.7.c2lnbmF0dXJlLWZpcm1hMQ');

    // Assert
    expect(await screen.findByRole('button', { name: /Dejar de recibir mensajes comerciales$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mensajes comerciales');
    expect(screen.getByRole('main')).toHaveTextContent('Hola Ana. Con este botón dejas de recibir mensajes comerciales de Gimnasio Central');
    expect(window.location.pathname).toBe('/baja/41.7.c2lnbmF0dXJlLWZpcm1hMQ');
    expect(mockGet).toHaveBeenCalledWith('/baja/41.7.c2lnbmF0dXJlLWZpcm1hMQ');
    expect(mockGet).not.toHaveBeenCalledWith('/auth/me');
  });
});

describe('App: rutas del panel', () => {
  test('should send /admin to the login when there is no session', async () => {
    // Act
    abrirEn('/admin');

    // Assert
    expect(await screen.findByRole('heading', { name: 'Bienvenido de vuelta' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  test('should open the configuration inside the panel when an admin visits it', async () => {
    // Act
    abrirEn('/admin/config', 'ADMINISTRADOR');

    // Assert: la pagina pinta los valores iniciales, carga y pinta los del API (9)
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Alerta amarilla (días sin venir)' })).toHaveValue(9));
    expect(screen.getByRole('heading', { name: 'Configuración del Gimnasio' })).toBeInTheDocument();
    // La pagina tiene su propio <header>: el del panel es el del perfil.
    expect(screen.getByRole('button', { name: 'Tu perfil' }).closest('header')).toHaveTextContent('Gimnasio Central');
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
  });

  test('should take the reception to the check-in when it opens the dashboard', async () => {
    // Act
    abrirEn('/admin/dashboard', 'RECEPCIONISTA');

    // Assert
    expect(await screen.findByRole('heading', { name: 'Check-in', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin/checkin');
  });
});
