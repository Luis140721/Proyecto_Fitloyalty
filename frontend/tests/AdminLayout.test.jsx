import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AdminLayout from '../src/components/AdminLayout';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: {},
  trialContext: {},
  logout: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../src/context/TrialContext', () => ({
  useTrial: () => mocks.trialContext,
}));

vi.mock('../src/components/Sidebar', () => ({
  default: ({ open, onClose }) => (
    <div data-testid="sidebar" data-open={open}>
      <button onClick={onClose}>Cerrar sidebar</button>
    </div>
  ),
}));

vi.mock('../src/components/Logo', () => ({
  default: () => <span>Logo</span>,
}));

vi.mock('../src/components/MenuPerfil', () => ({
  default: () => <span>Perfil</span>,
}));

vi.mock('../src/components/MenuNotificaciones', () => ({
  default: () => <span>Notificaciones</span>,
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.auth = {
      user: { name: 'Daniel' },
      gym: { name: 'Gimnasio Norte' },
      loading: false,
      ready: true,
      logout: mocks.logout,
    };
    mocks.trialContext = {
      trial: { active: false, expired: false, daysLeft: null, endsAt: null },
      refresh: mocks.refresh,
    };
    mocks.logout.mockReset();
    mocks.refresh.mockReset();
  });

  test('espera a que auth termine de cargar y renueva el estado del trial', () => {
    mocks.auth.loading = true;
    renderWithProviders(<AdminLayout><p>Contenido</p></AdminLayout>, { route: '/admin/dashboard' });
    expect(document.querySelector('.spinner')).toBeInTheDocument();
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  test('presenta gimnasio, usuario y metadatos de la ruta, y cierra sesión', async () => {
    const { user } = renderWithProviders(<AdminLayout><p>Contenido</p></AdminLayout>, { route: '/admin/config' });
    expect(screen.getByText('Gimnasio Norte')).toBeInTheDocument();
    expect(screen.getByText('Daniel')).toBeInTheDocument();
    expect(screen.getByText('Configuración')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Salir/ }));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  test('usa valores de reserva para rutas desconocidas, gimnasio ausente y usuario sin nombre', () => {
    mocks.auth.gym = null;
    mocks.auth.user = {};
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 8, 0));
    renderWithProviders(<AdminLayout />, { route: '/otra-ruta' });
    expect(screen.getByText('Tu gimnasio')).toBeInTheDocument();
    expect(screen.getByText('Panel')).toBeInTheDocument();
    expect(screen.getByText('Buenos días')).toBeInTheDocument();
    vi.useRealTimers();
  });

  test('actualiza el saludo según la hora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 13, 0));
    const { unmount } = renderWithProviders(<AdminLayout />, { route: '/admin/dashboard' });
    expect(screen.getByText('Buenas tardes,')).toBeInTheDocument();
    unmount();
    vi.setSystemTime(new Date(2026, 0, 1, 20, 0));
    renderWithProviders(<AdminLayout />, { route: '/admin/dashboard' });
    expect(screen.getByText('Buenas noches,')).toBeInTheDocument();
    vi.useRealTimers();
  });

  test('muestra la advertencia y bloquea la aplicación si el trial venció', () => {
    mocks.trialContext.trial = {
      active: false,
      expired: true,
      daysLeft: 0,
      endsAt: '2026-01-01T00:00:00.000Z',
    };
    renderWithProviders(<AdminLayout><p>Contenido bloqueado</p></AdminLayout>, { route: '/admin/dashboard' });
    expect(screen.getByRole('alert')).toHaveTextContent('Tu prueba gratuita ha finalizado.');
    expect(screen.getByRole('heading', { name: 'Acceso bloqueado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mail Contactar al equipo' })).toHaveAttribute('href', 'mailto:fitloyaltysaas@gmail.com');
    expect(screen.queryByText('Contenido bloqueado')).not.toBeInTheDocument();
  });

  test.each([
    [1, 'día'],
    [3, 'días'],
  ])('muestra el banner cuando quedan %i %s de prueba', (daysLeft, unit) => {
    mocks.trialContext.trial = { active: true, expired: false, daysLeft, endsAt: null };
    renderWithProviders(<AdminLayout />, { route: '/admin/miembros' });
    expect(screen.getByText(`Te quedan ${daysLeft} ${unit} de prueba`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar plan' })).toBeInTheDocument();
  });

  test('no muestra el banner urgente para trials inactivos, largos o inválidos y controla el drawer', async () => {
    mocks.trialContext.trial = { active: true, expired: false, daysLeft: 4, endsAt: null };
    const { user } = renderWithProviders(<AdminLayout />, { route: '/admin/staff' });
    expect(screen.getByText('Equipo')).toBeInTheDocument();
    expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true');
    fireEvent.click(document.querySelector('.admin-overlay'));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar sidebar' }));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
  });
});
