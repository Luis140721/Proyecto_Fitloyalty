import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CheckinPage from '../src/pages/CheckinPage';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  markActivity: vi.fn(),
  render: vi.fn(),
  clear: vi.fn().mockResolvedValue(),
}));

vi.mock('../src/api', () => ({
  api: {
    get: (...args) => mocks.get(...args),
    post: (...args) => mocks.post(...args),
  },
}));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ marcarActividad: mocks.markActivity }),
}));
vi.mock('../src/components/Ripple', () => ({ default: () => () => {} }));
vi.mock('html5-qrcode', () => ({
  Html5QrcodeScanner: class {
    render(...args) {
      return mocks.render(...args);
    }

    clear(...args) {
      return mocks.clear(...args);
    }
  },
}));

const checkin = {
  id_checkin: 1,
  nombre: 'Ana Ruiz',
  documento: 'CC123',
  metodo: 'QR',
};

describe('CheckinPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.get.mockReset().mockResolvedValue({ data: { checkins: [checkin] } });
    mocks.post.mockReset();
    mocks.markActivity.mockReset();
    mocks.render.mockReset();
    mocks.clear.mockReset().mockResolvedValue();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(),
    });
  });

  test('registra un ingreso por QR, presenta gamificación y actualiza la actividad', async () => {
    mocks.post.mockResolvedValue({
      data: {
        message: 'Ingreso registrado.',
        miembro: { nombre: 'Ana Ruiz', documento: 'CC123' },
        gamificacion: {
          hitosNuevos: [{ nombre: 'Primera semana' }],
          mensaje: '¡Buen trabajo!',
          racha: 1,
          totalAsistencias: 5,
        },
      },
    });
    const { user } = renderWithProviders(<CheckinPage />, { route: '/admin/checkin' });
    await screen.findByText('Ana Ruiz');

    await user.type(screen.getByPlaceholderText('Escanea o pega el código QR aquí'), ' QR-ANA-1 ');
    await user.click(screen.getByRole('button', { name: /Registrar/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('Ingreso registrado.');
    expect(screen.getByText(/Hito logrado: Primera semana/)).toBeInTheDocument();
    expect(screen.getByText(/Racha: 1 día/)).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('/admin/checkin', { metodo: 'QR', codigo: 'QR-ANA-1' });
    expect(mocks.markActivity).toHaveBeenCalledOnce();
    expect(navigator.vibrate).toHaveBeenCalledWith(80);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });

  test('valida campos vacíos, muestra not-found y limpia los campos manuales', async () => {
    const { user } = renderWithProviders(<CheckinPage />, { route: '/admin/checkin' });
    await screen.findByText('Ana Ruiz');
    await user.click(screen.getByRole('button', { name: /Registrar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el código QR o el documento.');
    expect(mocks.post).not.toHaveBeenCalled();

    mocks.post.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });
    await user.type(screen.getByLabelText('O por documento'), '79123456');
    await user.click(screen.getByRole('button', { name: /Registrar/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Not found');

    await user.click(screen.getByRole('button', { name: /Limpiar/ }));
    expect(screen.getByLabelText('O por documento')).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test.each([
    ['CONGELADO', 'Acceso denegado: membresía suspendida temporalmente'],
    ['VENCIDO', 'Acceso denegado: Membresía vencida'],
    ['INACTIVO', 'Acceso denegado: Membresía vencida'],
  ])('bloquea un miembro %s sin marcar actividad', async (estado, message) => {
    mocks.post.mockResolvedValue({
      data: { message, miembro: { estado, nombre: 'Ana Ruiz', documento: 'CC123' } },
    });
    const { user } = renderWithProviders(<CheckinPage />, { route: '/admin/checkin' });
    await screen.findByText('Ana Ruiz');
    await user.type(screen.getByPlaceholderText('Escanea o pega el código QR aquí'), 'QR-BLOQUEADO');
    await user.click(screen.getByRole('button', { name: /Registrar/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(message);
    expect(mocks.markActivity).not.toHaveBeenCalled();
    expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200]);
  });

  test('activa el lector de cámara y libera el scanner al desactivarlo', async () => {
    const { user } = renderWithProviders(<CheckinPage />, { route: '/admin/checkin' });
    await screen.findByText('Ana Ruiz');
    await user.click(screen.getByRole('button', { name: /Activar cámara/ }));
    expect(await screen.findByText('Desactivar cámara')).toBeInTheDocument();
    expect(mocks.render).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: /Desactivar cámara/ }));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: /Activar cámara/ })).toBeInTheDocument();
  });
});
