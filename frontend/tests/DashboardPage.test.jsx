import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DashboardPage from '../src/pages/DashboardPage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  pushApiError: vi.fn(),
  trial: null,
}));

vi.mock('../src/api', () => ({ api: { get: mocks.get } }));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Daniel Rivera' } }),
}));
vi.mock('../src/context/TrialContext', () => ({
  useTrial: () => ({ trial: mocks.trial }),
}));
vi.mock('../src/components/ErrorBanner', () => ({
  useApiError: () => ({ pushApiError: mocks.pushApiError }),
}));
vi.mock('../src/hooks/useAnimatedCount', () => ({
  default: () => () => {},
}));

const dashboard = {
  totalMiembros: 42,
  checkinsHoy: 5,
  vencen7: 2,
  enRiesgo: 1,
  retention: 75,
  ingresosMes: 125000,
  cobrosPendientes: 3,
  planTop: 'Mensual',
  planTopCount: 20,
  qrsActivos: 40,
  weekly: [{ day: 'lun', count: 4 }, { day: 'mar', count: 6 }],
  enRiesgoList: [{ nombre: 'Ana Torres', dias_sin: null, monto: 0 }],
  proximos: [{
    id_miembro: 12,
    miembro: 'Luis Pérez',
    plan: 'Mensual',
    fecha_fin: '2026-11-10T00:00:00.000Z',
    dias_restantes: 3,
    documento: 'CC 123',
  }],
  recientes: [{
    id_checkin: 9,
    nombre: 'Sara Díaz',
    metodo: 'QR',
    fecha_hora: '2026-11-04T10:00:00.000Z',
  }],
};

const peakHours = {
  total: 8,
  etiqueta: 'Hoy',
  horaPico: { hora: 10, total: 4 },
  horas: [{ hora: 9, total: 2 }, { hora: 10, total: 4 }],
};

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <Routes>
        <Route path="/admin/dashboard" element={<DashboardPage />} />
        <Route path="/admin/checkin" element={<h1>Registro de entradas</h1>} />
        <Route path="/admin/miembros" element={<h1>Lista de miembros</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trial = null;
  mocks.get.mockImplementation((path) => {
    if (path === '/admin/dashboard') return Promise.resolve({ data: dashboard });
    if (path === '/admin/dashboard/horas-pico') return Promise.resolve({ data: peakHours });
    return Promise.reject(new Error('Exportación no disponible.'));
  });
});

afterEach(cleanup);

describe('DashboardPage', () => {
  test('muestra indicadores, actividad, vencimientos y horas pico', async () => {
    renderDashboard();

    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText(/nunca ha venido/i)).toBeInTheDocument();
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByText('Sara Díaz')).toBeInTheDocument();
    expect(screen.getByText(/10:00 a 11:00/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /entradas por hora del día/i })).toBeInTheDocument();
  });

  test('cambia el periodo de horas pico y consulta el periodo seleccionado', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Hola, Daniel');

    await user.click(screen.getByRole('button', { name: '7 días' }));

    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(
      '/admin/dashboard/horas-pico',
      { params: { periodo: 'semana' } }
    ));
    expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('navega a check-in, a vencimientos y al detalle del miembro', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Hola, Daniel');

    await user.click(screen.getByRole('button', { name: /registrar entrada/i }));
    expect(await screen.findByRole('heading', { name: /registro de entradas/i })).toBeInTheDocument();
    cleanup();

    renderDashboard();
    await screen.findByText('Hola, Daniel');
    await user.click(screen.getByRole('button', { name: /ver todos/i }));
    expect(await screen.findByRole('heading', { name: /lista de miembros/i })).toBeInTheDocument();
    cleanup();

    renderDashboard();
    await screen.findByText('Hola, Daniel');
    await user.click(screen.getByRole('button', { name: /ver detalle de luis pérez/i }));
    expect(await screen.findByRole('heading', { name: /lista de miembros/i })).toBeInTheDocument();
  });

  test('muestra la advertencia del trial y el aviso informativo de activar plan', async () => {
    mocks.trial = { estado: 'trial', diasRestantes: 5 };
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText(/te quedan 5 días/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /activar plan/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/pago en construccion/i);
  });

  test('muestra error inicial y permite reportar el fallo de exportación', async () => {
    mocks.get.mockRejectedValue(new Error('Servicio temporalmente no disponible.'));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(/servicio temporalmente no disponible/i);
    await userEvent.setup().click(screen.getByRole('button', { name: /exportar/i }));

    expect(mocks.pushApiError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Servicio temporalmente no disponible.' })
    );
  });
});
