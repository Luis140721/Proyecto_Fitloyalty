import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CheckinPage from '../src/pages/CheckinPage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  renderScanner: vi.fn(),
  clearScanner: vi.fn(),
}));

vi.mock('../src/api', () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock('html5-qrcode', () => ({
  Html5QrcodeScanner: vi.fn(() => ({
    render: mocks.renderScanner,
    clear: mocks.clearScanner,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: { checkins: [] } });
  mocks.post.mockResolvedValue({
    data: {
      message: 'Acceso permitido.',
      miembro: { nombre: 'Ana Torres', documento: 'CC 123' },
    },
  });
  mocks.clearScanner.mockResolvedValue();
});

afterEach(cleanup);

describe('CheckinPage', () => {
  test('muestra la pantalla y el estado vacío del historial', async () => {
    render(<CheckinPage />);

    expect(await screen.findByRole('heading', { name: 'Check-in' })).toBeInTheDocument();
    expect(screen.getByText('Ingresos de hoy')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/admin/checkin', { params: { limit: 20 } });
  });

  test('requiere un código o documento antes de enviar el registro', async () => {
    const user = userEvent.setup();
    render(<CheckinPage />);
    await screen.findByRole('heading', { name: 'Check-in' });

    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/escribe el código qr o el documento/i);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  test('registra una entrada manual con el código QR y muestra el miembro', async () => {
    const user = userEvent.setup();
    render(<CheckinPage />);
    await screen.findByRole('heading', { name: 'Check-in' });
    await user.type(screen.getByPlaceholderText(/escanea o pega el código qr/i), '  QR-ANA-123  ');
    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/acceso permitido/i);
    expect(screen.getByRole('status')).toHaveTextContent(/ana torres \(cc 123\)/i);
    expect(mocks.post).toHaveBeenCalledWith('/admin/checkin', { metodo: 'QR', codigo: 'QR-ANA-123' });
  });

  test('bloquea el ingreso cuando el miembro está vencido', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        message: 'Membresía vencida.',
        miembro: { nombre: 'Luis Pérez', documento: 'CC 456', estado: 'VENCIDO' },
      },
    });
    const user = userEvent.setup();
    render(<CheckinPage />);
    await screen.findByRole('heading', { name: 'Check-in' });
    await user.type(screen.getByPlaceholderText(/escanea o pega el código qr/i), 'QR-LUIS');
    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/acceso denegado: membresía vencida/i);
    expect(screen.getByRole('status')).toHaveTextContent(/luis pérez/i);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  test('usa documento en modo manual y muestra el error recibido del API', async () => {
    mocks.post.mockRejectedValueOnce(Object.assign(
      new Error('No existe'),
      { response: { status: 404 } }
    ));
    const user = userEvent.setup();
    render(<CheckinPage />);
    await screen.findByRole('heading', { name: 'Check-in' });

    await user.selectOptions(screen.getByRole('combobox'), 'MANUAL');
    await user.type(screen.getByLabelText(/o por documento/i), '79123456');
    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no existe/i);
    expect(mocks.post).toHaveBeenCalledWith('/admin/checkin', {
      metodo: 'MANUAL',
      documento: '79123456',
    });
  });

  test('activa y desactiva el escáner liberando la cámara', async () => {
    const user = userEvent.setup();
    render(<CheckinPage />);
    await screen.findByRole('heading', { name: 'Check-in' });

    await user.click(screen.getByRole('button', { name: /activar cámara/i }));
    await waitFor(() => expect(mocks.renderScanner).toHaveBeenCalled());
    expect(screen.getByText('Desactivar cámara')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /desactivar cámara/i }));
    await waitFor(() => expect(mocks.clearScanner).toHaveBeenCalled());
  });

  test('muestra un mensaje específico cuando el QR escaneado no existe', async () => {
    mocks.post.mockRejectedValueOnce(Object.assign(
      new Error('No existe'),
      { response: { status: 404 } }
    ));
    const user = userEvent.setup();
    render(<CheckinPage />);
    await screen.findByRole('heading', { name: 'Check-in' });
    await user.click(screen.getByRole('button', { name: /activar cámara/i }));
    await waitFor(() => expect(mocks.renderScanner).toHaveBeenCalled());

    await mocks.renderScanner.mock.calls[0][0]('QR-DESCONOCIDO');

    expect(await screen.findByRole('alert')).toHaveTextContent(/usuario no encontrado/i);
    expect(mocks.post).toHaveBeenCalledWith('/admin/checkin', {
      metodo: 'QR',
      codigo: 'QR-DESCONOCIDO',
    });
  });
});
