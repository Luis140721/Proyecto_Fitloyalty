/**
 * Bootcamp semana 4 (Front, Luis): MiembrosPage desde lo que ve y hace la
 * persona de recepcion. Es la pantalla mas grande del front.
 *
 * El modulo del API se reemplaza con vi.mock: cada test decide que responde
 * GET /admin/miembros y el alta, sin backend ni red. useAuth da un admin y
 * qrcode devuelve una imagen fija (jsdom no dibuja en canvas).
 *
 * La pagina pinta a la vez la tabla (escritorio) y las tarjetas (movil), y el
 * CSS elige cual se ve. En jsdom estan las dos, por eso la lista se busca por
 * filas de la tabla.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import MiembrosPage from '../src/pages/MiembrosPage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test en vez de mockReset (ver LoginPage.test.jsx).
let mockGet, mockPost, mockPut, mockDelete;
vi.mock('../src/api', () => ({
  api: {
    get: (...a) => mockGet(...a),
    post: (...a) => mockPost(...a),
    put: (...a) => mockPut(...a),
    delete: (...a) => mockDelete(...a),
  },
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,UVI=' } }));

// Filas como las manda GET /api/admin/miembros (solo los campos que lee la pagina).
const ANA = { id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', telefono: '3001234567', email: 'ana@correo.co', codigo_qr: 'QR-ANA', activo: true };
const CARLOS = { id_miembro: 2, nombre: 'Carlos Ruiz', documento: '79888777', telefono: '3109876543', codigo_qr: 'QR-CARLOS', activo: true, vencido: true };
const ERROR_503 = { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar los miembros. Intenta de nuevo.' };

let miembros;

/**
 * Doble del GET: la configuracion del gimnasio y la lista de `miembros`
 * filtrada por nombre con el texto de busqueda, como hace el backend.
 */
function apiQueResponde() {
  return vi.fn(async (url, opciones = {}) => {
    if (url === '/admin/config') return { data: { config: { plan_mensual_valor: '90000.00' } } };
    const texto = (opciones.params?.q || '').toLowerCase();
    return { data: { miembros: miembros.filter((m) => m.nombre.toLowerCase().includes(texto)) } };
  });
}

const abrirMiembros = () => renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
const filaDe = (nombre) => screen.getByRole('row', { name: new RegExp(nombre) });
const botonSiguiente = () => screen.getByRole('button', { name: 'Siguiente →' });

// jsdom no implementa scrollIntoView, y el asistente lo usa para llevarte al
// primer campo con error. Se simula solo en este archivo.
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterAll(() => { delete Element.prototype.scrollIntoView; });

beforeEach(() => {
  miembros = [ANA, CARLOS];
  mockGet = apiQueResponde();
  mockPost = vi.fn();
  mockPut = vi.fn(async () => ({ data: {} }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => vi.useRealTimers());

describe('MiembrosPage: la lista', () => {
  test('should show the loading bar and disable the search when the members are still loading', async () => {
    // Arrange: la lista no responde hasta que el test lo diga
    let responder;
    mockGet = vi.fn((url) => (url === '/admin/config'
      ? Promise.resolve({ data: { config: {} } })
      : new Promise((resolve) => { responder = resolve; })));

    // Act
    abrirMiembros();

    // Assert
    expect(screen.getByRole('progressbar', { name: 'Cargando miembros' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeDisabled();

    responder({ data: { miembros: [ANA] } });
    expect(await screen.findByRole('row', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('should show the empty state when the gym has no members', async () => {
    // Arrange
    miembros = [];

    // Act
    abrirMiembros();

    // Assert
    const tabla = screen.getByRole('table');
    expect(await within(tabla).findByText('Sin miembros que mostrar')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 0 de 0 miembros')).toBeInTheDocument();
  });

  test('should list each member with the document and the state badge when the API answers', async () => {
    // Act
    abrirMiembros();

    // Assert
    expect(await screen.findByRole('row', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(within(filaDe('Ana Pérez')).getByText('1020304050')).toBeInTheDocument();
    expect(within(filaDe('Ana Pérez')).getByText('Al día')).toBeInTheDocument();
    expect(within(filaDe('Carlos Ruiz')).getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 2 de 2 miembros')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/miembros', { params: { q: '', pageSize: 100, includeInactive: false } });
  });

  test('should show the API error message when the members cannot be loaded', async () => {
    // Arrange: el interceptor de api.js ya normalizo el error
    mockGet = vi.fn((url) => (url === '/admin/config'
      ? Promise.resolve({ data: { config: {} } })
      : Promise.reject(ERROR_503)));

    // Act
    abrirMiembros();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los miembros. Intenta de nuevo.');
  });

  test('should ask the API for the typed text and show only the matching members when searching', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Carlos Ruiz/ });

    // Act
    await user.type(screen.getByRole('textbox', { name: 'Buscar miembros' }), 'ana');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    // Assert
    await waitFor(() => expect(screen.queryByRole('row', { name: /Carlos Ruiz/ })).not.toBeInTheDocument());
    expect(filaDe('Ana Pérez')).toBeInTheDocument();
    expect(mockGet).toHaveBeenLastCalledWith('/admin/miembros', { params: { q: 'ana', pageSize: 100, includeInactive: false } });
  });

  test('should show only the expired members when the Vencido filter is chosen', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });

    // Act
    await user.click(screen.getByRole('tab', { name: /^Vencido/ }));

    // Assert
    expect(screen.getByRole('tab', { name: /^Vencido/ })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.queryByRole('row', { name: /Ana Pérez/ })).not.toBeInTheDocument());
    expect(filaDe('Carlos Ruiz')).toBeInTheDocument();
  });

  test('should ask for confirmation and deactivate the member when the button of a mobile card is used', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    const [tarjetaAna] = screen.getAllByRole('article');

    // Act
    await user.click(within(tarjetaAna).getByRole('button', { name: 'Desactivar a Ana Pérez' }));
    const confirmacion = screen.getByRole('dialog', { name: 'Desactivar miembro' });
    await user.click(within(confirmacion).getByRole('button', { name: 'Sí, desactivar' }));

    // Assert
    expect(mockDelete).toHaveBeenCalledWith('/admin/miembros/1');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('MiembrosPage: alta con el asistente de 5 pasos', () => {
  const abrirAlta = async () => {
    const pantalla = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await pantalla.user.click(screen.getByRole('button', { name: 'Nuevo miembro' }));
    return pantalla;
  };

  /** Llena el paso 1 y avanza hasta Terminos (paso 5). */
  const llegarATerminos = async (user) => {
    await user.type(screen.getByLabelText(/^Nombre completo/), 'Sofía Gómez');
    await user.type(screen.getByLabelText(/^Número documento/), '1033444555');
    await user.type(screen.getByLabelText(/^Teléfono \/ WhatsApp/), '3201112233');
    for (let paso = 2; paso <= 5; paso += 1) {
      await user.click(botonSiguiente());
      expect(screen.getByText(`Paso ${paso} de 5`)).toBeInTheDocument();
    }
  };

  test('should mark the required fields and stay on step 1 when Siguiente is pressed with the form empty', async () => {
    // Arrange
    const { user } = await abrirAlta();

    // Act
    await user.click(botonSiguiente());

    // Assert
    expect(screen.getByText('Escribe el nombre del miembro.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el número de documento.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el teléfono.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre completo/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
  });

  test('should say how many digits the phone has when it is incomplete', async () => {
    // Arrange
    const { user } = await abrirAlta();
    await user.type(screen.getByLabelText(/^Nombre completo/), 'Sofía Gómez');
    await user.type(screen.getByLabelText(/^Número documento/), '1033444555');

    // Act
    await user.type(screen.getByLabelText(/^Teléfono \/ WhatsApp/), '320111');
    await user.click(botonSiguiente());

    // Assert
    expect(screen.getByText('Debe tener 10 dígitos (escribiste 6).')).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
  });

  test('should not send the member and should mark the terms when they are not accepted', async () => {
    // Arrange
    const { user } = await abrirAlta();
    await llegarATerminos(user);

    // Act
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert
    expect(screen.getByText('Debes aceptar los términos para registrar al miembro.')).toBeInTheDocument();
    expect(screen.getByText('Falta la autorización de tratamiento de datos.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('should create the member after the five steps and announce it in a status message', async () => {
    // Arrange: solo se fija la fecha (los timers siguen reales para user-event)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 10, 0, 0));
    const SOFIA = { id_miembro: 3, nombre: 'Sofía Gómez', documento: '1033444555', telefono: '3201112233', codigo_qr: 'QR-SOFIA', activo: true };
    mockPost = vi.fn(async () => { miembros = [...miembros, SOFIA]; return { data: { miembro: SOFIA } }; });
    const { user } = await abrirAlta();
    await llegarATerminos(user);
    await user.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Autorizo el uso de mis datos/ }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('Miembro creado exitosamente.');
    expect(mockPost).toHaveBeenCalledWith('/admin/miembros', expect.objectContaining({
      nombre: 'Sofía Gómez', documento: '1033444555', telefono: '3201112233', tipo_documento: 'CC',
      tipo_plan: 'MENSUAL', fecha_inicio: '2026-10-27', fecha_fin: '2026-11-26', proxima_fecha_cobro: '2026-11-27',
      estado_pago: 'PENDIENTE', acepto_terminos: true, autorizo_datos: true,
    }));
    expect(mockPost.mock.calls[0][1]).not.toHaveProperty('email');
    expect(mockPut).toHaveBeenCalledWith('/admin/miembros/3', { qr_imagen: 'data:image/png;base64,UVI=' });
    expect(screen.getByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Sofía Gómez/ })).toBeInTheDocument();
  });
});
