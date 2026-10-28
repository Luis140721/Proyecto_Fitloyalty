/**
 * Bootcamp semana 4 (Front, Luis): DashboardPage desde lo que ve el dueño del
 * gimnasio: los KPI, las horas pico, los refrescos y los botones de la cabecera.
 *
 * El API, useAuth, useTrial y useApiError se simulan con vi.mock. Las
 * respuestas tienen la forma de GET /api/admin/dashboard y
 * /api/admin/dashboard/horas-pico (backend/tests/contrato-front.test.js fija
 * ese contrato).
 *
 * Los KPI cuentan hacia su valor con requestAnimationFrame salvo que el
 * navegador pida movimiento reducido: el test lo pide con matchMedia para leer
 * el valor final sin esperar la animacion.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { act, screen, within, waitFor, fireEvent } from '@testing-library/react';
import DashboardPage from '../src/pages/DashboardPage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test, como en LoginPage.test.jsx.
let mockGet, mockPushApiError, trial;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a) } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Laura Gómez', role: 'admin' } }) }));
vi.mock('../src/context/TrialContext', () => ({ useTrial: () => ({ trial }) }));
vi.mock('../src/components/ErrorBanner', () => ({ useApiError: () => ({ pushApiError: (...a) => mockPushApiError(...a) }) }));

// Respuesta de GET /api/admin/dashboard con los campos que lee la pagina.
const DASHBOARD = {
  totalMiembros: 128,
  checkinsHoy: 7,
  vencen7: 3,
  retention: 82,
  enRiesgo: 5,
  enRiesgoList: [
    { nombre: 'Luisa Gómez', dias_sin: 18, monto: 89900 },
    { nombre: 'Pedro Nel Ruiz', dias_sin: null, monto: 120000 },
    { nombre: 'Marta Díaz', dias_sin: 21, monto: 89900 },
    { nombre: 'Jorge Peña', dias_sin: 30, monto: 89900 },
    { nombre: 'Quinto Fuera', dias_sin: 45, monto: 89900 },
  ],
  weekly: [{ day: 'lun', count: 4 }, { day: 'mar', count: 6 }],
  proximos: [
    { id_miembro: 11, miembro: 'Ana Pérez', documento: '1020304050', plan: 'Mensual', fecha_fin: '2026-10-31T12:00:00.000Z', dias_restantes: 3 },
    { id_miembro: 12, miembro: 'Carlos Ruiz', documento: '79888777', plan: 'Trimestral', fecha_fin: '2026-11-09T12:00:00.000Z', dias_restantes: 12 },
  ],
  recientes: [{ id_checkin: 501, fecha_hora: '2026-10-28T13:05:00.000Z', metodo: 'QR', nombre: 'Ana Pérez' }],
  ingresosMes: 1250000,
  cobrosPendientes: 2,
  planTop: 'Trimestral',
  planTopCount: 14,
  qrsActivos: 128,
};

const ETIQUETAS = { hoy: 'Hoy', semana: 'Últimos 7 días', mes: 'Últimos 30 días' };

/** Respuesta de horas-pico con `totales` por hora ({ 18: 9 }) y la hora pico ya resuelta, como la manda el backend. */
function horasPico(periodo, totales = {}, horaPico = null) {
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, total: totales[hora] ?? 0 }));
  const total = horas.reduce((acc, h) => acc + h.total, 0);
  return { periodo, etiqueta: ETIQUETAS[periodo], zona: 'America/Bogota', total, horas, horaPico };
}

const HORAS = {
  hoy: horasPico('hoy', { 6: 2, 7: 1 }, { hora: 6, total: 2 }),
  semana: horasPico('semana', { 7: 3, 18: 9, 19: 4 }, { hora: 18, total: 9 }),
  mes: horasPico('mes', { 6: 20, 18: 31 }, { hora: 18, total: 31 }),
};

const ERROR_503 = { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar las metricas del dashboard. Intenta de nuevo.' };

let dashboard;

/** Doble del GET: el dashboard en `dashboard` y las horas pico del periodo pedido. */
function apiQueResponde() {
  return vi.fn(async (url, opciones = {}) => {
    if (url === '/admin/dashboard') return { data: dashboard };
    if (url === '/admin/dashboard/horas-pico') return { data: HORAS[opciones.params.periodo] };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const abrirDashboard = () => renderWithProviders(<DashboardPage />, { route: '/admin/dashboard' });
const cargado = () => screen.findByRole('region', { name: 'Indicadores clave' });
const kpi = (etiqueta) => screen.getByText(etiqueta).closest('article');
const resumenHorasPico = () => screen.getByRole('heading', { name: 'Horas pico' }).nextElementSibling;
const llamadasA = (url) => mockGet.mock.calls.filter(([u]) => u === url);

// Movimiento reducido: useAnimatedCount pinta el valor final de una vez.
beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
});
afterAll(() => { delete window.matchMedia; });

beforeEach(() => {
  dashboard = DASHBOARD;
  trial = { status: 'suscrito', active: true, expired: false, daysLeft: null, endsAt: null };
  mockGet = apiQueResponde();
  mockPushApiError = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DashboardPage: la carga', () => {
  test('should show the API error instead of the metrics when the first load fails', async () => {
    // Arrange: el interceptor de api.js ya normalizo el error
    mockGet = vi.fn(async () => { throw ERROR_503; });

    // Act
    abrirDashboard();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las metricas del dashboard. Intenta de nuevo.');
    expect(screen.queryByRole('region', { name: 'Indicadores clave' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('should show the loading bar until the API answers', async () => {
    // Arrange: el dashboard no responde hasta que el test lo diga
    let responder;
    mockGet = vi.fn((url, opciones) => (url === '/admin/dashboard'
      ? new Promise((resolve) => { responder = resolve; })
      : Promise.resolve({ data: HORAS[opciones.params.periodo] })));

    // Act
    abrirDashboard();

    // Assert
    expect(screen.getByRole('progressbar', { name: 'Cargando el dashboard' })).toBeInTheDocument();
    responder({ data: DASHBOARD });
    await cargado();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('should show each KPI with the value of the API when the dashboard loads', async () => {
    // Act
    abrirDashboard();
    await cargado();

    // Assert
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hola, Laura');
    expect(kpi('Miembros activos')).toHaveTextContent('128');
    expect(kpi('Asistencia hoy')).toHaveTextContent('7↑ Buen día');
    expect(kpi('Vencen en 7 días')).toHaveTextContent('3');
    expect(kpi('Retención 90d')).toHaveTextContent('82%');
    expect(kpi('Cobros del mes')).toHaveTextContent('$1.250.000');
    expect(kpi('Cobros del mes')).toHaveTextContent('2 pendientes');
    expect(kpi('Plan más vendido')).toHaveTextContent('Trimestral14 miembros');
    expect(mockGet).toHaveBeenCalledWith('/admin/dashboard/horas-pico', { params: { periodo: 'hoy' } });
  });

  test('should list at most four members at risk and say when one never came', async () => {
    // Act
    abrirDashboard();
    await cargado();

    // Assert
    const riesgo = screen.getByRole('heading', { name: 'Miembros en riesgo' }).closest('article');
    expect(within(riesgo).getByText('5')).toBeInTheDocument();
    expect(within(riesgo).getByText('Luisa Gómez').closest('.risk-row')).toHaveTextContent('LGLuisa Gómez18 días sin ir$89.900');
    expect(within(riesgo).getByText('Pedro Nel Ruiz').closest('.risk-row')).toHaveTextContent('Nunca ha venido$120.000');
    expect(within(riesgo).getByText('Jorge Peña')).toBeInTheDocument();
    expect(within(riesgo).queryByText('Quinto Fuera')).not.toBeInTheDocument();
  });

  test('should mark in warning the memberships that expire in three days or less', async () => {
    // Act
    abrirDashboard();
    await cargado();

    // Assert
    const fila = (nombre) => screen.getByRole('row', { name: new RegExp(nombre) });
    expect(within(fila('Ana Pérez')).getByText('3 días')).toHaveClass('chip-status--warning');
    expect(within(fila('Carlos Ruiz')).getByText('12 días')).toHaveClass('chip-status--active');
  });

  test('should show the empty messages when nothing expires, nobody came today and there are no entries', async () => {
    // Arrange
    dashboard = { ...DASHBOARD, proximos: [], recientes: [] };
    const sinEntradas = horasPico('hoy');
    mockGet = vi.fn(async (url) => ({ data: url === '/admin/dashboard' ? dashboard : sinEntradas }));

    // Act
    abrirDashboard();
    await cargado();

    // Assert
    expect(screen.getByText('Nadie vence en los próximos 30 días.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Aún no hay check-ins hoy');
    expect(resumenHorasPico()).toHaveTextContent('Todavía no hay entradas en este periodo.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('DashboardPage: las horas pico', () => {
  test('should ask for the chosen period and describe its peak hour when the user picks 7 days', async () => {
    // Arrange
    const { user } = abrirDashboard();
    await cargado();

    // Act
    await user.click(screen.getByRole('button', { name: '7 días' }));

    // Assert
    await waitFor(() => expect(resumenHorasPico()).toHaveTextContent(
      'La hora con más entradas es de 18:00 a 19:00 (9 de 16 entradas, últimos 7 días).',
    ));
    expect(mockGet).toHaveBeenLastCalledWith('/admin/dashboard/horas-pico', { params: { periodo: 'semana' } });
    expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('should close the peak range at 00:00 when the peak hour is 23:00', async () => {
    // Arrange
    const deNoche = horasPico('hoy', { 22: 1, 23: 5 }, { hora: 23, total: 5 });
    mockGet = vi.fn(async (url) => ({ data: url === '/admin/dashboard' ? DASHBOARD : deNoche }));

    // Act
    abrirDashboard();
    await cargado();

    // Assert
    expect(resumenHorasPico()).toHaveTextContent('La hora con más entradas es de 23:00 a 00:00 (5 de 6 entradas, hoy).');
  });

  test('should keep the last chosen period when the answer of an older one arrives later', async () => {
    // Arrange: la respuesta de 7 dias se queda esperando
    let responderSemana;
    mockGet = vi.fn((url, opciones = {}) => {
      if (url === '/admin/dashboard') return Promise.resolve({ data: DASHBOARD });
      const { periodo } = opciones.params;
      if (periodo === 'semana') return new Promise((resolve) => { responderSemana = () => resolve({ data: HORAS.semana }); });
      return Promise.resolve({ data: HORAS[periodo] });
    });
    const { user } = abrirDashboard();
    await cargado();

    // Act: 7 dias y enseguida 30 dias; la de 7 dias llega de ultima
    await user.click(screen.getByRole('button', { name: '7 días' }));
    await user.click(screen.getByRole('button', { name: '30 días' }));
    await waitFor(() => expect(resumenHorasPico()).toHaveTextContent('(31 de 51 entradas, últimos 30 días)'));
    await act(async () => responderSemana());

    // Assert
    expect(resumenHorasPico()).toHaveTextContent('(31 de 51 entradas, últimos 30 días)');
    expect(screen.getByRole('button', { name: 'Actualizar el dashboard' })).toBeEnabled();
  });
});

describe('DashboardPage: los refrescos', () => {
  test('should keep the metrics and warn in small text when a refresh fails', async () => {
    // Arrange
    const { user } = abrirDashboard();
    await cargado();
    expect(screen.getByText(/se actualiza solo cada minuto/)).toBeInTheDocument();
    mockGet = vi.fn(async () => { throw ERROR_503; });

    // Act
    await user.click(screen.getByRole('button', { name: 'Actualizar el dashboard' }));

    // Assert
    expect(await screen.findByText('No se pudo actualizar; se reintentará en un minuto.')).toBeInTheDocument();
    expect(kpi('Miembros activos')).toHaveTextContent('128');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should load the metrics again when the tab becomes visible', async () => {
    // Arrange
    abrirDashboard();
    await cargado();
    expect(llamadasA('/admin/dashboard')).toHaveLength(1);

    // Act
    fireEvent(document, new Event('visibilitychange'));

    // Assert
    await waitFor(() => expect(llamadasA('/admin/dashboard')).toHaveLength(2));
    expect(document.visibilityState).toBe('visible');
  });
});

describe('DashboardPage: los botones', () => {
  // jsdom no implementa las URL de Blob ni la descarga: se simulan aqui y el
  // click del enlace se intercepta para leer el nombre del archivo.
  let descargas;
  beforeEach(() => {
    descargas = [];
    URL.createObjectURL = vi.fn(() => 'blob:fitloyalty/csv-1');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function guardar() {
      descargas.push({ href: this.href, download: this.download });
    });
  });

  test('should download the CSV with the file name of Content-Disposition and then free the Blob URL', async () => {
    // Arrange: 8:00 p. m. del 27 en Colombia, ya 28 en UTC; manda el nombre del servidor
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T01:00:00.000Z'));
    const csv = new Blob(['nombre,documento\n'], { type: 'text/csv' });
    const respuestaExport = { data: csv, headers: { 'content-disposition': 'attachment; filename="fitloyalty-export-2026-10-27.csv"' } };
    const getDashboard = apiQueResponde();
    mockGet = vi.fn(async (url, opciones) => (url === '/admin/dashboard/export' ? respuestaExport : getDashboard(url, opciones)));
    const { user } = abrirDashboard();
    await cargado();

    // Act
    await user.click(screen.getByRole('button', { name: 'Exportar' }));

    // Assert
    await waitFor(() => expect(descargas).toEqual([{ href: 'blob:fitloyalty/csv-1', download: 'fitloyalty-export-2026-10-27.csv' }]));
    expect(mockGet).toHaveBeenCalledWith('/admin/dashboard/export', { responseType: 'blob' });
    expect(URL.createObjectURL).toHaveBeenCalledWith(csv);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fitloyalty/csv-1'), { timeout: 2000 });
  });

  test('should name the file with the date of today when the header is not readable', async () => {
    // Arrange: sin exposedHeaders en CORS el navegador esconde Content-Disposition
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T15:00:00.000Z'));
    const getDashboard = apiQueResponde();
    mockGet = vi.fn(async (url, opciones) => (url === '/admin/dashboard/export'
      ? { data: new Blob(['x']), headers: {} }
      : getDashboard(url, opciones)));
    const { user } = abrirDashboard();
    await cargado();

    // Act
    await user.click(screen.getByRole('button', { name: 'Exportar' }));

    // Assert
    await waitFor(() => expect(descargas[0]?.download).toBe('fitloyalty-export-2026-10-28.csv'));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled(), { timeout: 2000 });
  });

  test('should send the export error to the error banner when the API fails', async () => {
    // Arrange
    const error = { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos generar el archivo. Intenta de nuevo.' };
    const getDashboard = apiQueResponde();
    mockGet = vi.fn(async (url, opciones) => {
      if (url === '/admin/dashboard/export') throw error;
      return getDashboard(url, opciones);
    });
    const { user } = abrirDashboard();
    await cargado();

    // Act
    await user.click(screen.getByRole('button', { name: 'Exportar' }));

    // Assert
    await waitFor(() => expect(mockPushApiError).toHaveBeenCalledWith(error));
    expect(descargas).toEqual([]);
  });

  test.each([
    ['Registrar entrada', '/admin/checkin'],
    ['Ver todos', '/admin/miembros'],
    ['Ver detalle de Ana Pérez', '/admin/miembros'],
  ])('should go to the right page when the user clicks %s', async (boton, ruta) => {
    // Arrange
    const { user } = abrirDashboard();
    await cargado();

    // Act
    await user.click(screen.getByRole('button', { name: boton }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${ruta}`)).toBeInTheDocument();
  });
});

describe('DashboardPage: el periodo de prueba', () => {
  test('should show the days left and the payment notice when the gym is on trial', async () => {
    // Arrange: TrialContext con lo que manda GET /api/billing/trial-status
    trial = { status: 'trial-activo', active: true, expired: false, daysLeft: 9, endsAt: '2026-11-06T15:00:00.000Z' };
    const { user } = abrirDashboard();
    await cargado();

    // Act
    await user.click(screen.getByRole('button', { name: 'Activar plan' }));

    // Assert
    expect(screen.getByText('Estás en período de prueba').closest('.trial-banner'))
      .toHaveTextContent('Te quedan 9 días. Activa tu plan para no perder datos.');
    expect(screen.getByText('Pago en construccion. Te avisaremos cuando este listo.').closest('[role="status"]')).toBeInTheDocument();
  });

  test.each([
    ['subscribed', { status: 'suscrito', active: true, expired: false, daysLeft: null }],
    ['in the last three days (the layout already warns)', { status: 'trial-activo', active: true, expired: false, daysLeft: 3 }],
  ])('should not show the trial banner of the dashboard when the gym is %s', async (_caso, estado) => {
    // Arrange
    trial = estado;

    // Act
    abrirDashboard();
    await cargado();

    // Assert
    expect(screen.queryByText('Estás en período de prueba')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar plan' })).not.toBeInTheDocument();
  });
});
