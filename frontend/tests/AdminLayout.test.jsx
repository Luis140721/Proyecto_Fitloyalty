/**
 * Cobertura del front (Luis): AdminLayout y su Sidebar, el marco de todas las
 * pantallas del panel: el encabezado (gimnasio, saludo segun la hora, seccion),
 * el menu segun el rol, el menu lateral del movil y los avisos del periodo de
 * prueba (vencido bloquea la pantalla; en los 3 ultimos dias, aviso urgente).
 *
 * useAuth y useTrial se simulan con vi.mock. La campana (MenuNotificaciones)
 * es la real con el API simulado: aqui no tiene avisos.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from '../src/components/AdminLayout';
import { renderWithProviders } from './renderWithProviders';

let sesion, trial, mockRefresh, mockLogout, mockGet;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('../src/context/TrialContext', () => ({ useTrial: () => ({ trial, refresh: mockRefresh }) }));
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), post: vi.fn() } }));

const ADMIN = { id: 1, name: 'Ana Pérez', email: 'ana@gym.co', role: 'admin' };
const SUSCRITO = { status: 'suscrito', active: true, expired: false, daysLeft: null, endsAt: null };

const abrirPanel = (route = '/admin/miembros') => renderWithProviders(
  <AdminLayout><p>Contenido de la página</p></AdminLayout>,
  { route },
);
const menuLateral = () => screen.getByRole('complementary');
const saludo = () => screen.getByText(/^Buen(os|as) /).closest('p');

beforeEach(() => {
  mockLogout = vi.fn();
  mockRefresh = vi.fn();
  mockGet = vi.fn(async () => ({ data: { avisos: [] } }));
  sesion = { user: ADMIN, gym: { id: 7, name: 'Gimnasio Central', active: true }, loading: false, ready: true, logout: mockLogout };
  trial = SUSCRITO;
});
afterEach(() => vi.useRealTimers());

describe('AdminLayout: el encabezado', () => {
  test('should show only a spinner when the session is still being checked', () => {
    // Arrange
    sesion = { ...sesion, loading: true, ready: false };

    // Act
    abrirPanel();

    // Assert
    expect(screen.queryByText('Contenido de la página')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  test('should name the gym, greet the person and title the section when the panel opens', async () => {
    // Act
    abrirPanel('/admin/miembros');

    // Assert
    const encabezado = screen.getByRole('banner');
    expect(within(encabezado).getByText('Gimnasio Central')).toBeInTheDocument();
    expect(saludo()).toHaveTextContent(/, Ana Pérez$/);
    expect(screen.getByText('Miembros', { selector: '.admin-header__seccion' })).toBeInTheDocument();
    expect(screen.getByText('Contenido de la página')).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
  });

  test('should fall back to Tu gimnasio and Panel when the gym has no name and the route is unknown', () => {
    // Arrange
    sesion = { ...sesion, gym: null, user: { id: 2, role: 'admin' } };

    // Act
    abrirPanel('/admin/reportes');

    // Assert
    expect(within(screen.getByRole('banner')).getByText('Tu gimnasio')).toBeInTheDocument();
    expect(screen.getByText('Panel', { selector: '.admin-header__seccion' })).toBeInTheDocument();
    expect(saludo().textContent).not.toContain(',');
  });

  test.each([
    [9, 'Buenos días'],
    [12, 'Buenas tardes'],
    [18, 'Buenas tardes'],
    [19, 'Buenas noches'],
  ])('should greet by the hour of the device when it is %i:00', (hora, texto) => {
    // Arrange: hora local, como la ve la persona
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 19, hora, 0, 0));

    // Act
    abrirPanel();

    // Assert
    expect(saludo()).toHaveTextContent(`${texto}, Ana Pérez`);
  });

  test('should close the session when the person clicks Salir in the header', async () => {
    // Arrange
    const { user } = abrirPanel();

    // Act
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Salir' }));

    // Assert
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('AdminLayout: el periodo de prueba', () => {
  test('should block the screen with the date when the trial expired', () => {
    // Arrange
    trial = { status: 'trial-vencido', active: false, expired: true, daysLeft: 0, endsAt: '2026-11-18T15:00:00.000Z' };

    // Act
    abrirPanel();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Tu prueba gratuita ha finalizado. Activa tu plan para seguir usando FitLoyalty.');
    expect(screen.getByRole('heading', { name: 'Acceso bloqueado' })).toBeInTheDocument();
    expect(screen.getByText(/Tu período de prueba venció el 18\/11\/2026\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contactar al equipo' })).toHaveAttribute('href', 'mailto:fitloyaltysaas@gmail.com');
    expect(screen.queryByText('Contenido de la página')).not.toBeInTheDocument();
  });

  test('should say recently when the expired trial has no end date', () => {
    // Arrange
    trial = { status: 'inactivo', active: false, expired: true, daysLeft: null, endsAt: null };

    // Act
    abrirPanel();

    // Assert
    expect(screen.getByText(/Tu período de prueba venció el recientemente\./)).toBeInTheDocument();
  });

  test.each([
    [1, 'Te quedan 1 día de prueba'],
    [3, 'Te quedan 3 días de prueba'],
  ])('should warn in a banner when %i days of trial are left', (dias, texto) => {
    // Arrange
    trial = { status: 'trial-activo', active: true, expired: false, daysLeft: dias, endsAt: '2026-11-22T15:00:00.000Z' };

    // Act
    abrirPanel();

    // Assert
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(screen.getByText('Contenido de la página')).toBeInTheDocument();
  });

  test.each([
    ['there are 4 days left', { active: true, expired: false, daysLeft: 4 }],
    ['the gym is subscribed', { active: true, expired: false, daysLeft: null }],
    ['the trial is not active', { active: false, expired: false, daysLeft: 2 }],
  ])('should not show the urgent banner when %s', (_caso, estado) => {
    // Arrange
    trial = { status: 'x', endsAt: null, ...estado };

    // Act
    abrirPanel();

    // Assert
    expect(screen.queryByText(/^Te quedan/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('AdminLayout: el menu lateral', () => {
  test.each([
    ['admin', ['Dashboard', 'Miembros', 'Check-in', 'Equipo', 'Configuración'], 'Administrador'],
    ['receptionist', ['Miembros', 'Check-in'], 'Recepción'],
    ['trainer', [], 'Entrenador'],
    [undefined, ['Miembros', 'Check-in'], 'Recepción'],
  ])('should show only the allowed sections when the role is %s', (rol, secciones, nombreRol) => {
    // Arrange
    sesion = { ...sesion, user: { ...ADMIN, role: rol } };

    // Act
    abrirPanel();

    // Assert
    const nav = within(menuLateral()).getByRole('navigation');
    expect(within(nav).queryAllByRole('link').map((a) => a.textContent.replace(/^[a-z_]+/, ''))).toEqual(secciones);
    expect(within(menuLateral()).getByText(nombreRol)).toBeInTheDocument();
  });

  test('should mark the section as active when its route is open', () => {
    // Act
    abrirPanel('/admin/checkin');

    // Assert
    expect(within(menuLateral()).getByRole('link', { name: 'Check-in' })).toHaveAttribute('aria-current', 'page');
    expect(within(menuLateral()).getByRole('link', { name: 'Miembros' })).not.toHaveAttribute('aria-current');
  });

  test('should open the side menu with the hamburger and close it when Cerrar menú is clicked', async () => {
    // Arrange
    const { user } = abrirPanel();

    // Act y Assert
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(menuLateral()).toHaveClass('open');
    await user.click(within(menuLateral()).getByRole('button', { name: 'Cerrar menú' }));
    expect(menuLateral()).not.toHaveClass('open');
  });

  test('should close the side menu when the dark background is clicked', async () => {
    // Arrange
    const { user, container } = abrirPanel();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));

    // Act: el fondo oscuro es decorativo (aria-hidden), se toca por su clase
    await user.click(container.querySelector('.admin-overlay'));

    // Assert
    expect(menuLateral()).not.toHaveClass('open');
  });

  test('should take the person to the section when a link of the side menu is clicked', async () => {
    // Arrange
    const { user } = abrirPanel('/admin/miembros');
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));

    // Act
    await user.click(within(menuLateral()).getByRole('link', { name: 'Check-in' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /admin/checkin')).toBeInTheDocument();
  });

  test('should close the session and the menu when Cerrar sesión of the side menu is clicked', async () => {
    // Arrange
    const { user } = abrirPanel();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));

    // Act
    await user.click(within(menuLateral()).getByRole('button', { name: 'Cerrar sesión' }));

    // Assert
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(menuLateral()).not.toHaveClass('open');
  });
});

describe('AdminLayout: como ruta padre', () => {
  test('should render the child route when it is used without children', () => {
    // Act
    render(
      <MemoryRouter initialEntries={['/admin/miembros']}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin/miembros" element={<p>Lista de miembros</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // Assert
    expect(screen.getByText('Lista de miembros')).toBeInTheDocument();
  });
});
