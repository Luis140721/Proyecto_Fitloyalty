/**
 * Bootcamp semana 4 (Front, Luis): CheckinPage desde la recepcion: el
 * historial del dia, el ingreso por documento (arreglo del #56), el QR pegado
 * o leido con la camara y los mensajes cuando se niega la entrada.
 *
 * El API y useAuth se simulan con vi.mock. Las respuestas tienen la forma de
 * POST y GET /api/admin/checkin (backend/src/routes/checkin.js): la membresia
 * vencida o congelada llega con 200 y miembro.estado; el miembro que no existe,
 * con 404 MEMBER_NOT_FOUND.
 *
 * html5-qrcode abre la camara: el doble guarda el callback de lectura para que
 * el test "lea" un QR.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import CheckinPage from '../src/pages/CheckinPage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test, como en LoginPage.test.jsx.
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

// Fila de GET /api/admin/checkin.
const INGRESO_ANA = { id_checkin: 90, fecha_hora: '2026-10-28T13:00:00.000Z', metodo: 'QR', valido: true, id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', codigo_qr: 'QR-ANA' };
const CARLOS = { id: 2, nombre: 'Carlos Ruiz', documento: '79123456' };

/** Respuesta 201 de POST /api/admin/checkin con la racha que calcula lib/gamificacion.js. */
const registrado = (gamificacion = { racha: 1, totalAsistencias: 1, hitosNuevos: [], proximoHito: null, mensaje: '¡Buen entrenamiento! Vuelve mañana y empieza tu racha.' }) => ({
  data: {
    message: 'Ingreso registrado.',
    duplicado: false,
    checkin: { id_checkin: 91, fecha_hora: '2026-10-28T14:00:00.000Z', metodo: 'MANUAL' },
    gamificacion,
    miembro: { ...CARLOS, codigo_qr: 'QR-CARLOS', qr_imagen: null },
    membresia: { tipo_plan: 'MENSUAL', fecha_fin: '2026-11-20', estado_pago: 'PAGADO', congelado_desde: null },
    advertencia: null,
  },
});

const abrirCheckin = () => renderWithProviders(<CheckinPage />, { route: '/admin/checkin' });
const campoQr = () => screen.getByRole('textbox', { name: 'Código QR' });
const campoDocumento = () => screen.getByRole('textbox', { name: 'O por documento' });
const aviso = () => screen.findByRole('status');

beforeEach(() => {
  escaner = null;
  mockGet = vi.fn(async () => ({ data: { checkins: [INGRESO_ANA] } }));
  mockPost = vi.fn(async () => registrado());
  mockMarcarActividad = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe('CheckinPage: el historial', () => {
  test('should list the check-ins of today with the method and the document when the page opens', async () => {
    // Act
    abrirCheckin();

    // Assert
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('QR · 1020304050')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/checkin', { params: { limit: 20 } });
  });

  test('should show the API error when the history cannot be loaded', async () => {
    // Arrange: error ya normalizado por buildError
    mockGet = vi.fn(async () => { throw { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar el historial. Intenta de nuevo.' }; });

    // Act
    abrirCheckin();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el historial. Intenta de nuevo.');
  });
});

describe('CheckinPage: el ingreso por documento', () => {
  test('should register the document as MANUAL when the user types it and presses Enter', async () => {
    // Arrange
    const { user } = abrirCheckin();
    await screen.findByText('Ana Pérez');

    // Act
    await user.type(campoDocumento(), ' 79123456 {Enter}');

    // Assert
    expect(await aviso()).toHaveTextContent('Ingreso registrado.Carlos Ruiz (79123456)');
    expect(mockPost).toHaveBeenCalledWith('/admin/checkin', { metodo: 'MANUAL', documento: '79123456' });
    expect(screen.getByRole('status')).toHaveTextContent('Racha: 1 día · Asistencias: 1');
    expect(mockMarcarActividad).toHaveBeenCalledTimes(1);
    expect(campoDocumento()).toHaveValue('');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  test('should register by document when Enter is pressed in the document field and the QR field has text', async () => {
    // Arrange
    const { user } = abrirCheckin();
    await user.type(campoQr(), 'QR-A-MEDIAS');

    // Act
    await user.type(campoDocumento(), '79123456{Enter}');

    // Assert
    await aviso();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/admin/checkin', { metodo: 'MANUAL', documento: '79123456' });
  });

  test('should keep the method chosen by the user when it is Código barras and the user clicks Registrar', async () => {
    // Arrange
    const { user } = abrirCheckin();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Método de ingreso' }), 'Método: Código barras');
    await user.type(campoDocumento(), '79123456');

    // Act
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    // Assert
    await aviso();
    expect(mockPost).toHaveBeenCalledWith('/admin/checkin', { metodo: 'CODIGOBARRAS', documento: '79123456' });
  });

  test('should ask for the QR code or the document when the user clicks Registrar with both fields empty', async () => {
    // Arrange
    const { user } = abrirCheckin();
    await screen.findByText('Ana Pérez');

    // Act
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el código QR o el documento.');
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('CheckinPage: el QR y la respuesta del backend', () => {
  test('should send the pasted QR without spaces when Enter is pressed in the QR field', async () => {
    // Arrange
    const { user } = abrirCheckin();

    // Act
    await user.type(campoQr(), '  QR-CARLOS  {Enter}');

    // Assert
    await aviso();
    expect(mockPost).toHaveBeenCalledWith('/admin/checkin', { metodo: 'QR', codigo: 'QR-CARLOS' });
    expect(campoQr()).toHaveValue('');
  });

  test('should deny the entry with the expired message when the membership is overdue', async () => {
    // Arrange: el backend niega con 200 y miembro.estado
    mockPost = vi.fn(async () => ({ data: { miembro: { ...CARLOS, estado: 'VENCIDO' } } }));
    const { user } = abrirCheckin();

    // Act
    await user.type(campoDocumento(), '79123456{Enter}');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado: Membresía vencida');
    expect(screen.getByRole('status')).toHaveClass('alert-error');
    expect(screen.getByRole('status')).toHaveTextContent('Carlos Ruiz (79123456)');
    expect(mockMarcarActividad).not.toHaveBeenCalled();
  });

  test('should show the message of the backend when the membership is frozen', async () => {
    // Arrange
    const mensaje = 'Tu membresía está congelada. Pide en recepción que la reactiven para poder ingresar.';
    mockPost = vi.fn(async () => ({ data: { message: mensaje, miembro: { ...CARLOS, estado: 'CONGELADO' } } }));
    const { user } = abrirCheckin();

    // Act
    await user.type(campoDocumento(), '79123456{Enter}');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
    expect(screen.queryByText(/Membresía vencida/)).not.toBeInTheDocument();
  });

  test('should show the API message when no member has that document', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 404, code: 'MEMBER_NOT_FOUND', message: 'Miembro no encontrado en este gimnasio.' }; });
    const { user } = abrirCheckin();

    // Act
    await user.type(campoDocumento(), '11111111{Enter}');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Miembro no encontrado en este gimnasio.');
    expect(screen.getByRole('status')).toHaveClass('alert-error');
    expect(campoDocumento()).toHaveValue('11111111');
  });

  test('should warn instead of celebrating when the member already checked in a moment ago', async () => {
    // Arrange: respuesta del antirrebote del backend
    mockPost = vi.fn(async () => ({
      data: { message: 'Carlos Ruiz ya registro su ingreso hace un momento.', duplicado: true, miembro: CARLOS, advertencia: null },
    }));
    const { user } = abrirCheckin();

    // Act
    await user.type(campoDocumento(), '79123456{Enter}');

    // Assert
    const estado = await aviso();
    expect(estado).toHaveTextContent('Carlos Ruiz ya registro su ingreso hace un momento.');
    expect(estado).toHaveClass('alert-warning');
  });

  test('should name the new milestone and count the streak in plural when the backend sends them', async () => {
    // Arrange
    mockPost = vi.fn(async () => registrado({
      racha: 5,
      totalAsistencias: 10,
      hitosNuevos: [{ id: 3, nombre: '10 asistencias', tipo: 'ASISTENCIAS', valor: 10, mensaje: '¡Llegaste a 10 asistencias!' }],
      proximoHito: null,
      mensaje: '¡Llegaste a 10 asistencias!',
    }));
    const { user } = abrirCheckin();

    // Act
    await user.type(campoDocumento(), '79123456{Enter}');

    // Assert
    const estado = await aviso();
    expect(estado).toHaveTextContent('🏆 Hito logrado: 10 asistencias');
    expect(estado).toHaveTextContent('¡Llegaste a 10 asistencias!');
    expect(estado).toHaveTextContent('Racha: 5 días · Asistencias: 10');
  });
});

describe('CheckinPage: la cámara', () => {
  test('should register a QR read by the camera once and read it again only after four seconds', async () => {
    // Arrange: hora fija para medir la espera entre lecturas del mismo QR
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T14:00:00.000Z'));
    const { user } = abrirCheckin();
    await user.click(screen.getByRole('button', { name: 'Activar cámara' }));

    // Act: el mismo QR tres veces; la tercera, 4,5 s despues
    await act(async () => escaner.leer('QR-CARLOS'));
    await aviso();
    await act(async () => escaner.leer('QR-CARLOS'));
    vi.setSystemTime(new Date('2026-10-28T14:00:04.500Z'));
    await act(async () => escaner.leer('QR-CARLOS'));

    // Assert
    expect(escaner.elementId).toBe('qr-reader');
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenNthCalledWith(1, '/admin/checkin', { metodo: 'QR', codigo: 'QR-CARLOS' });
    expect(mockMarcarActividad).toHaveBeenCalledTimes(2);
  });

  test('should say that the QR does not belong to a member when the camera reads an unknown code', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 404, code: 'MEMBER_NOT_FOUND', message: 'Miembro no encontrado en este gimnasio.' }; });
    const { user } = abrirCheckin();
    await user.click(screen.getByRole('button', { name: 'Activar cámara' }));

    // Act
    await act(async () => escaner.leer('QR-DE-OTRO-GYM'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario no encontrado. Verifica que el QR sea correcto.');
  });

  test('should close the scanner when the user turns the camera off', async () => {
    // Arrange
    const { user } = abrirCheckin();
    await user.click(screen.getByRole('button', { name: 'Activar cámara' }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Desactivar cámara' }));

    // Assert
    expect(escaner.cerrado).toBe(true);
    expect(screen.getByRole('button', { name: 'Activar cámara' })).toBeInTheDocument();
  });
});
