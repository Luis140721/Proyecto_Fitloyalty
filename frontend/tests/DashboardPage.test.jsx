import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import DashboardPage from '../src/pages/DashboardPage';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  pushApiError: vi.fn(),
  user: { name: 'Luis Pérez' },
  trial: { estado: 'activo' },
}));

vi.mock('../src/api', () => ({
  api: { get: (...args) => mocks.get(...args) },
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../src/context/TrialContext', () => ({ useTrial: () => ({ trial: mocks.trial }) }));
vi.mock('../src/components/ErrorBanner', () => ({
  useApiError: () => ({ pushApiError: mocks.pushApiError }),
}));
vi.mock('../src/hooks/useAnimatedCount', () => ({ default: () => () => {} }));

const dashboard = {
  totalMiembros: 42,
  checkinsHoy: 8,
  vencen7: 2,
  retention: 75,
  enRiesgo: 1,
  enRiesgoList: [{ nombre: 'Ana Ruiz', dias_sin: 18, monto: 90000 }],
  weekly: [
    { day: 'Dom', count: 0 },
    { day: 'Lun', count: 4 },
    { day: 'Mar', count: 0 },
    { day: 'Mie', count: 2 },
    { day: 'Jue', count: 0 },
    { day: 'Vie', count: 0 },
    { day: 'Sab', count: 0 },
  ],
  proximos: [{
    id_miembro: 11,
    miembro: 'Bruno Díaz',
    documento: 'CC 123',
    plan: 'Mensual',
    fecha_fin: '2026-12-01',
    dias_restantes: 3,
  }],
  recientes: [{
    id_checkin: 3,
    fecha_hora: '2026-11-18T15:00:00',
    metodo: 'QR',
    nombre: 'Carla Mora',
  }],
  ingresosMes: 125000,
  cobrosPendientes: 4,
  planTop: 'Mensual',
  planTopCount: 20,
  qrsActivos: 42,
};

const horas = {
  periodo: 'hoy',
  etiqueta: 'Hoy',
  total: 3,
  horas: [{ hora: 8, total: 3 }],
  horaPico: { hora: 8, total: 3 },
};

function respondToReads() {
  mocks.get.mockImplementation((path) => {
    if (path === '/admin/dashboard') return Promise.resolve({ data: dashboard });
    if (path === '/admin/dashboard/horas-pico') return Promise.resolve({ data: horas });
    if (path === '/admin/dashboard/export') {
      return Promise.resolve({
        data: new Blob(['nombre']),
        headers: { 'content-disposition': 'attachment; filename="miembros.csv"' },
      });
    }
    return Promise.reject(new Error(`GET inesperado: ${path}`));
  });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.get.mockReset();
    mocks.pushApiError.mockReset();
    mocks.user = { name: 'Luis Pérez' };
    mocks.trial = { estado: 'activo' };
    respondToReads();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:dashboard'),
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  test('presenta métricas, gráficos, alertas y permite cambiar el período', async () => {
    const { user } = renderWithProviders(<DashboardPage />, { route: '/admin/dashboard' });

    expect(await screen.findByRole('heading', { name: 'Hola, Luis' })).toBeInTheDocument();
    expect(screen.getByText('Miembros activos')).toBeInTheDocument();
    expect(screen.getByText(/Buen día/)).toBeInTheDocument();
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('18 días sin ir')).toBeInTheDocument();
    expect(screen.getByText('Bruno Díaz')).toBeInTheDocument();
    expect(screen.getByText('Carla Mora')).toBeInTheDocument();
    expect(screen.getByText(/08:00 a 09:00/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '7 días' }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(
      '/admin/dashboard/horas-pico',
      { params: { periodo: 'semana' } },
    ));
    expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('exporta, refresca y muestra el estado de prueba y su aviso de activación', async () => {
    mocks.trial = { estado: 'trial', diasRestantes: 5 };
    const { user } = renderWithProviders(<DashboardPage />, { route: '/admin/dashboard' });
    await screen.findByRole('heading', { name: 'Hola, Luis' });

    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalledOnce());
    expect(mocks.get).toHaveBeenCalledWith('/admin/dashboard/export', { responseType: 'blob' });
    expect(document.querySelector('a[download="miembros.csv"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actualizar el dashboard' }));
    await waitFor(() => expect(mocks.get.mock.calls.filter(([path]) => path === '/admin/dashboard')).toHaveLength(2));
    expect(screen.getByText(/Te quedan 5 días/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Activar plan/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Pago en construccion.');
  });

  test('muestra errores iniciales y mantiene disponibles la navegación al check-in y miembros', async () => {
    mocks.get.mockRejectedValue(new Error('Servicio no disponible'));
    const { user } = renderWithProviders(<DashboardPage />, { route: '/admin/dashboard' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible');

    await user.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    expect(screen.getByText('Ruta actual: /admin/checkin')).toBeInTheDocument();
  });
});
