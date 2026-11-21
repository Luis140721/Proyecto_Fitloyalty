/**
 * Cobertura del front (Luis): ramas de CheckinPage que no prueban
 * CheckinPage.test.jsx (semana 4) ni sus tiempos de la semana 7 (#79): el
 * estado INACTIVO, la camara con una membresia vencida o con un fallo sin
 * mensaje, Limpiar y el aviso que se va a los 5 segundos.
 *
 * Va en un archivo aparte para no chocar con CheckinPage.test.jsx del #79.
 * El API y useAuth se simulan con vi.mock, con las respuestas de
 * POST /api/admin/checkin (backend/src/routes/checkin.js). html5-qrcode abre
 * la camara: el doble guarda el callback de lectura para que el test "lea" un QR.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import CheckinPage from '../src/pages/CheckinPage';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPost, mockMarcarActividad, escaner;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ marcarActividad: (...a) => mockMarcarActividad(...a) }) }));
vi.mock('html5-qrcode', () => ({
  Html5QrcodeScanner: class {
    constructor(elementId) { escaner = { elementId, leer: null, cerrado: false }; }
    render(alLeer) { escaner.leer = alLeer; }
    clear() { escaner.cerrado = true; return Promise.resolve(); }
  },
}));

const INGRESO_ANA = { id_checkin: 90, fecha_hora: '2026-10-28T13:00:00.000Z', metodo: 'QR', valido: true, id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', codigo_qr: 'QR-ANA' };
const CARLOS = { id: 2, nombre: 'Carlos Ruiz', documento: '79123456' };

/** Respuesta 201 de POST /api/admin/checkin. */
const REGISTRADO = {
  data: {
    message: 'Ingreso registrado.',
    duplicado: false,
    checkin: { id_checkin: 91, fecha_hora: '2026-10-28T14:00:00.000Z', metodo: 'MANUAL' },
    gamificacion: { racha: 1, totalAsistencias: 1, hitosNuevos: [], proximoHito: null, mensaje: '¡Buen entrenamiento! Vuelve mañana y empieza tu racha.' },
    miembro: { ...CARLOS, codigo_qr: 'QR-CARLOS', qr_imagen: null },
    advertencia: null,
  },
};

const abrirCheckin = () => renderWithProviders(<CheckinPage />, { route: '/admin/checkin' });
const campoQr = () => screen.getByRole('textbox', { name: 'Código QR' });
const campoDocumento = () => screen.getByRole('textbox', { name: 'O por documento' });

/** jsdom no tiene navigator.vibrate: se pone un espia solo en el test que lo pide. */
function espiarVibracion() {
  const vibrar = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { value: vibrar, configurable: true, writable: true });
  return vibrar;
}

beforeEach(() => {
  escaner = null;
  mockGet = vi.fn(async () => ({ data: { checkins: [INGRESO_ANA] } }));
  mockPost = vi.fn(async () => REGISTRADO);
  mockMarcarActividad = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  delete navigator.vibrate;
});

describe('CheckinPage: la membresia que no deja entrar', () => {
  test('should deny the entry as overdue when the member is inactive', async () => {
    // Arrange: el backend tambien puede mandar INACTIVO
    mockPost = vi.fn(async () => ({ data: { miembro: { ...CARLOS, estado: 'inactivo' } } }));
    const { user } = abrirCheckin();

    // Act
    await user.type(campoDocumento(), '79123456{Enter}');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado: Membresía vencida');
    expect(mockMarcarActividad).not.toHaveBeenCalled();
  });

  test('should deny the entry with the expired message when the camera reads an overdue member', async () => {
    // Arrange
    const vibrar = espiarVibracion();
    mockPost = vi.fn(async () => ({ data: { miembro: { ...CARLOS, estado: 'VENCIDO' } } }));
    const { user } = abrirCheckin();
    await user.click(screen.getByRole('button', { name: 'Activar cámara' }));

    // Act
    await act(async () => escaner.leer('QR-CARLOS'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado: Membresía vencida');
    expect(screen.getByRole('status')).toHaveClass('alert-error');
    expect(vibrar).toHaveBeenCalledWith([200, 100, 200]);
    expect(mockMarcarActividad).not.toHaveBeenCalled();
  });

  test('should use a generic message when the camera check-in fails without one', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 503 }; });
    const { user } = abrirCheckin();
    await user.click(screen.getByRole('button', { name: 'Activar cámara' }));

    // Act
    await act(async () => escaner.leer('QR-CARLOS'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar el check-in.');
  });
});

describe('CheckinPage: lo que queda despues de un ingreso', () => {
  test('should empty both fields and take the notices away when Limpiar is clicked', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 404, code: 'MEMBER_NOT_FOUND', message: 'Miembro no encontrado en este gimnasio.' }; });
    const { user } = abrirCheckin();
    await user.type(campoQr(), 'QR-X');
    await user.type(campoDocumento(), '11111111{Enter}');
    await screen.findByRole('alert');

    // Act
    await user.click(screen.getByRole('button', { name: 'Limpiar' }));

    // Assert
    expect(campoQr()).toHaveValue('');
    expect(campoDocumento()).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('should take the notice away when five seconds pass, so the next person starts clean', async () => {
    // Arrange: timers falsos para setTimeout; los clicks van con fireEvent
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    abrirCheckin();
    await act(async () => {});
    fireEvent.change(campoDocumento(), { target: { value: '79123456' } });
    fireEvent.keyDown(campoDocumento(), { key: 'Enter' });
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Ingreso registrado.');

    // Act
    act(() => vi.advanceTimersByTime(4999));
    const antes = screen.queryByRole('status');
    act(() => vi.advanceTimersByTime(1));

    // Assert
    expect(antes).not.toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
