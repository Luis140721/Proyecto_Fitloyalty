/**
 * El panel muestra datos reales (2026-11-24).
 *
 *  - Dashboard: los textos bajo cada cifra salen de los datos (antes «+12 este
 *    mes», «Por encima del promedio» y «100% operativos» eran fijos) y los
 *    botones de «Próximos vencimientos» llevan a donde dicen.
 *  - Miembros: lee ?filtro y ?ficha al entrar, filtra «Vence en 30 días» y en
 *    las tarjetas del celular se puede abrir la ficha.
 *  - Check-in: «Ingresos de hoy» pide solo los de hoy y dice si no hay.
 *
 * El API se simula con vi.mock, como en DashboardPage.test.jsx. El destino de
 * la navegacion se lee con un componente que muestra la ruta completa.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import DashboardPage from '../src/pages/DashboardPage';
import MiembrosPage from '../src/pages/MiembrosPage';
import CheckinPage from '../src/pages/CheckinPage';

let mockGet;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Laura Gómez', role: 'admin' }, marcarActividad() {} }) }));
vi.mock('../src/context/TrialContext', () => ({ useTrial: () => ({ trial: { status: 'suscrito' } }) }));
vi.mock('../src/components/ErrorBanner', () => ({ useApiError: () => ({ pushApiError() {} }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,UVI=' } }));
vi.mock('html5-qrcode', () => ({ Html5QrcodeScanner: class { render() {} clear() { return Promise.resolve(); } } }));

function Destino() {
  const { pathname, search } = useLocation();
  return <p>Destino: {pathname}{search}</p>;
}

/** La URL actual y el boton Atras del navegador. */
function Navegador() {
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  return (
    <>
      <output aria-label="URL">{pathname}{search}</output>
      <button type="button" onClick={() => navegar(-1)}>Atrás</button>
    </>
  );
}
const url = () => screen.getByRole('status', { name: 'URL' }).textContent;

/**
 * Monta `pagina` en `ruta`; cualquier otra ruta muestra su URL completa. Con
 * `enlace`, agrega un enlace «Ir» a esa URL (p. ej. un aviso de la campana) y
 * el boton «Atrás» del navegador.
 */
function abrir(pagina, ruta, enlace) {
  const user = userEvent.setup();
  const { unmount } = render(
    <MemoryRouter initialEntries={[ruta]}>
      {enlace && <><Link to={enlace}>Ir</Link><Navegador /></>}
      <Routes>
        <Route path={ruta.split('?')[0]} element={pagina} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
  return Object.assign(user, { cerrarPagina: unmount });
}

// Movimiento reducido: useAnimatedCount pinta el valor final de una vez.
beforeAll(() => {
  window.matchMedia = (query) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} });
  Element.prototype.scrollIntoView = () => {};
});
afterAll(() => {
  delete window.matchMedia;
  delete Element.prototype.scrollIntoView;
});

describe('DashboardPage: textos que salen de los datos', () => {
  const DASHBOARD = {
    totalMiembros: 128, nuevosMes: 9, checkinsHoy: 7, vencen7: 3, retention: 82, enRiesgo: 2,
    enRiesgoList: [{ nombre: 'Luisa Gómez', dias_sin: 18, monto: 89000 }, { nombre: 'Sin Plan', dias_sin: 40, monto: null }, { nombre: 'Plan Cero', dias_sin: 41, monto: 0 }],
    weekly: [], ingresosMes: 0, cobrosPendientes: 0, planTop: 'Trimestral', planTopCount: 14, qrsActivos: 128,
    proximos: [{ id_miembro: 11, miembro: 'Ana Pérez', documento: '1020 & 30', plan: 'Mensual', fecha_fin: '2026-12-01', dias_restantes: 3 }],
    recientes: [{ id_checkin: 501, fecha_hora: '2026-11-24T13:05:00.000Z', metodo: 'QR', nombre: 'Ana Pérez' }],
  };
  let dashboard;
  beforeEach(() => {
    dashboard = DASHBOARD;
    mockGet = vi.fn(async (url) => ({
      data: url === '/admin/dashboard' ? dashboard : { periodo: 'hoy', etiqueta: 'Hoy', total: 0, horas: [], horaPico: null },
    }));
  });
  const abrirDashboard = async () => {
    const user = abrir(<DashboardPage />, '/admin/dashboard');
    await screen.findByRole('region', { name: 'Indicadores clave' });
    return user;
  };
  const kpi = (etiqueta) => screen.getByText(etiqueta).closest('article');

  test('should not show any of the old fixed texts', async () => {
    await abrirDashboard();

    expect(screen.queryByText(/\+12 este mes|Por encima del promedio|100% operativos/)).not.toBeInTheDocument();
  });

  test.each([
    [9, '+9 este mes'],
    [1, '+1 este mes'],
    [0, 'Ninguno nuevo este mes'],
    [undefined, 'Con perfil activo'], // backend anterior: no manda el dato
  ])('should say how many members are new when %s registered this month', async (nuevosMes, texto) => {
    dashboard = { ...DASHBOARD, nuevosMes };

    await abrirDashboard();

    expect(within(kpi('Miembros activos')).getByText(texto)).toBeInTheDocument();
  });

  test.each([
    [1, 'Acción recomendada hoy'],
    [0, 'Nadie vence en 7 días'],
  ])('should recommend an action only when someone expires (%i)', async (vencen7, texto) => {
    dashboard = { ...DASHBOARD, vencen7 };

    await abrirDashboard();

    expect(within(kpi('Vencen en 7 días')).getByText(texto)).toBeInTheDocument();
  });

  test('should explain the retention and the QR codes instead of comparing them', async () => {
    await abrirDashboard();

    expect(within(kpi('Retención 90d')).getByText('Activos que vinieron en 90 días')).toBeInTheDocument();
    expect(within(kpi('QR generados')).getByText('Uno por miembro activo')).toBeInTheDocument();
  });

  test.each([
    ['Trimestral', 14, 'Trimestral', '14 miembros'],
    ['Mensual', 0, 'Sin planes', '0 miembros'],
  ])('should show the top plan %s with %i members as %s', async (planTop, planTopCount, plan, miembros) => {
    dashboard = { ...DASHBOARD, planTop, planTopCount };

    await abrirDashboard();

    expect(within(kpi('Plan más vendido')).getByText(plan)).toBeInTheDocument();
    expect(within(kpi('Plan más vendido')).getByText(miembros)).toBeInTheDocument();
  });

  test('should say Sin plan, not an invented amount, when a member at risk has no plan', async () => {
    await abrirDashboard();

    const fila = (nombre) => screen.getByText(nombre).closest('.risk-row');
    expect(fila('Luisa Gómez')).toHaveTextContent('$89.000');
    expect(fila('Sin Plan')).toHaveTextContent(/40 días sin irSin plan$/);
    expect(fila('Plan Cero')).toHaveTextContent(/\$0$/);
  });

  test('should show the time of the recent check-ins as a time of the day', async () => {
    await abrirDashboard();

    expect(screen.getByText(/^QR · a las /)).toBeInTheDocument();
  });

  test.each([
    ['Ver todos', '/admin/miembros?filtro=vence30'],
    ['Ver detalle de Ana Pérez', '/admin/miembros?q=1020+%26+30&ficha=11'],
  ])('should go to the list that matches the card when the user clicks %s', async (boton, destino) => {
    const user = await abrirDashboard();

    await user.click(screen.getByRole('button', { name: boton }));

    expect(await screen.findByText(`Destino: ${destino}`)).toBeInTheDocument();
  });
});

describe('MiembrosPage: lo que pide el Dashboard', () => {
  const miembro = (id, nombre, mas = {}) => ({ id_miembro: id, nombre, documento: `10${id}`, telefono: '3001234567', codigo_qr: `QR-${id}`, activo: true, ...mas });
  const ANA = miembro(1, 'Ana Pérez', { dias_para_vencer: 30 });
  const CARLOS = miembro(2, 'Carlos Ruiz', { dias_para_vencer: 31 });
  const DIANA = miembro(3, 'Diana Vera', { dias_para_vencer: 0 });
  const ELIO = miembro(4, 'Elio Vargas', { dias_para_vencer: -1, vencido: true });
  const FABIO = miembro(5, 'Fabio Congelado', { dias_para_vencer: 10, congelada: true });
  const GINA = miembro(6, 'Gina Sinplan', { dias_para_vencer: null });
  const HUGO = miembro(7, 'Hugo Inactivo', { activo: false, dias_para_vencer: 5 });
  let lista;

  beforeEach(() => {
    lista = [ANA, CARLOS, DIANA, ELIO, FABIO, GINA];
    mockGet = vi.fn(async (url, opciones = {}) => {
      if (url === '/admin/config') return { data: { config: {} } };
      if (/\/plan$/.test(url)) return { data: { plan: null, congelaciones: [] } };
      const id = /^\/admin\/miembros\/(\d+)$/.exec(url)?.[1];
      if (id) return { data: { miembro: { ...lista.find((m) => m.id_miembro === Number(id)), telefono: '3009998877' }, autorizaciones: null } };
      const q = (opciones.params?.q || '').toLowerCase();
      return { data: { miembros: lista.filter((m) => (m.nombre + m.documento).toLowerCase().includes(q)) } };
    });
  });
  const listas = () => mockGet.mock.calls.filter(([url]) => url === '/admin/miembros').map(([, o]) => o.params);
  const filas = () => screen.getAllByRole('row').slice(1).map((f) => f.querySelector('strong')?.textContent);

  test('should show only who expires between today and 30 days, without the frozen ones, when it opens with ?filtro=vence30', async () => {
    abrir(<MiembrosPage />, '/admin/miembros?filtro=vence30');

    await screen.findByRole('row', { name: /Ana Pérez/ });
    expect(screen.getByRole('tab', { name: /^Vence en 30 días/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Vence en 30 días/ })).toHaveTextContent('2');
    expect(filas()).toEqual(['Ana Pérez', 'Diana Vera']);
    expect(listas()).toEqual([{ q: '', pageSize: 100, includeInactive: false }]);
  });

  test('should ask for the inactive members when it opens with ?filtro=desactivados', async () => {
    lista = [ANA, HUGO];

    abrir(<MiembrosPage />, '/admin/miembros?filtro=desactivados');

    await screen.findByRole('row', { name: /Hugo Inactivo/ });
    expect(filas()).toEqual(['Hugo Inactivo']);
    expect(listas()).toEqual([{ q: '', pageSize: 100, includeInactive: true }]);
    // Un miembro desactivado no cuenta entre los que vencen.
    expect(screen.getByRole('tab', { name: /^Vence en 30 días/ })).toHaveTextContent('1');
  });

  test('should show everyone when ?filtro is not one of the filters', async () => {
    abrir(<MiembrosPage />, '/admin/miembros?filtro=otro');

    await screen.findByRole('row', { name: /Ana Pérez/ });
    expect(screen.getByRole('tab', { name: /^Todos/ })).toHaveAttribute('aria-selected', 'true');
    expect(filas()).toHaveLength(6);
  });

  test('should open the record of that member with its full data when it opens with ?ficha', async () => {
    abrir(<MiembrosPage />, '/admin/miembros?q=103&ficha=3', '/admin/miembros');

    const ficha = await screen.findByRole('dialog', { name: 'Editar Diana Vera' });
    await waitFor(() => expect(within(ficha).getByDisplayValue('3009998877')).toBeInTheDocument());
    expect(filas()).toEqual(['Diana Vera']);
    // La ficha se abre una vez: sale de la URL sin volver a pedir la lista.
    expect(url()).toBe('/admin/miembros?q=103');
    expect(listas()).toEqual([{ q: '103', pageSize: 100, includeInactive: false }]);
  });

  test('should not lose what the person is editing when going back to the URL that opened another record', async () => {
    // Dashboard -> flecha de Diana -> cerrar -> «Miembros» -> editar a Ana -> Atras
    const user = abrir(<MiembrosPage />, '/admin/miembros?q=103&ficha=3', '/admin/miembros');
    const diana = await screen.findByRole('dialog', { name: 'Editar Diana Vera' });
    await user.click(within(diana).getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('link', { name: 'Ir' }));
    await user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));
    const ana = await screen.findByRole('dialog', { name: 'Editar Ana Pérez' });
    const telefono = await within(ana).findByDisplayValue('3009998877');
    await user.clear(telefono);
    await user.type(telefono, '3110000000');

    await user.click(screen.getByRole('button', { name: 'Atrás', hidden: true }));
    await waitFor(() => expect(filas()).toEqual(['Diana Vera']));

    expect(screen.getByRole('dialog', { name: 'Editar Ana Pérez' })).toBeInTheDocument();
    expect(within(ana).getByDisplayValue('3110000000')).toBeInTheDocument();
    expect(mockGet.mock.calls.filter(([u]) => u === '/admin/miembros/3')).toHaveLength(1);
  });

  test('should keep the open record when a link asks for another one', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros', '/admin/miembros?ficha=3');
    await user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));
    await screen.findByRole('dialog', { name: 'Editar Ana Pérez' });

    await user.click(screen.getByRole('link', { name: 'Ir', hidden: true }));
    await waitFor(() => expect(url()).toBe('/admin/miembros'));

    expect(screen.getByRole('dialog', { name: 'Editar Ana Pérez' })).toBeInTheDocument();
    expect(mockGet.mock.calls.map(([u]) => u)).not.toContain('/admin/miembros/3');
  });

  test('should not open the record over a sign-up in progress', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros', '/admin/miembros?ficha=3');
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(screen.getByRole('button', { name: /Nuevo miembro/ }));

    await user.click(screen.getByRole('link', { name: 'Ir' }));
    await waitFor(() => expect(url()).toBe('/admin/miembros'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente →' })).toBeInTheDocument();
  });

  test('should open the record that a link asks for after the sign-up was closed', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros', '/admin/miembros?ficha=3');
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(screen.getByRole('button', { name: /Nuevo miembro/ }));
    await user.click(screen.getByRole('button', { name: /Cerrar/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Siguiente →' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('link', { name: 'Ir' }));

    expect(await screen.findByRole('dialog', { name: 'Editar Diana Vera' })).toBeInTheDocument();
  });

  test('should ask for the list once when the search of the URL has spaces and accents', async () => {
    abrir(<MiembrosPage />, '/admin/miembros?q=Ana%20P%C3%A9rez&ficha=1', '/admin/miembros');

    expect(await screen.findByRole('dialog', { name: 'Editar Ana Pérez' })).toBeInTheDocument();
    await waitFor(() => expect(url()).not.toContain('ficha'));
    expect(screen.getByRole('textbox', { name: 'Buscar miembros', hidden: true })).toHaveValue('Ana Pérez');
    expect(listas()).toEqual([{ q: 'Ana Pérez', pageSize: 100, includeInactive: false }]);
  });

  test('should open the record that a link asks for after the previous one was closed', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros?ficha=3', '/admin/miembros?ficha=1');
    const diana = await screen.findByRole('dialog', { name: 'Editar Diana Vera' });
    await user.click(within(diana).getByRole('button', { name: 'Cancelar' }));

    await user.click(screen.getByRole('link', { name: 'Ir' }));

    expect(await screen.findByRole('dialog', { name: 'Editar Ana Pérez' })).toBeInTheDocument();
  });

  test('should clear the search box when the URL no longer searches, so the filters do not repeat the old search', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros?q=103', '/admin/miembros');
    await waitFor(() => expect(filas()).toEqual(['Diana Vera']));
    expect(screen.getByRole('textbox', { name: 'Buscar miembros' })).toHaveValue('103');

    await user.click(screen.getByRole('link', { name: 'Ir' }));
    await waitFor(() => expect(filas()).toHaveLength(6));
    await user.click(screen.getByRole('tab', { name: /^Vencido/ }));

    expect(screen.getByRole('textbox', { name: 'Buscar miembros' })).toHaveValue('');
    await waitFor(() => expect(filas()).toEqual(['Elio Vargas']));
  });

  test.each([
    ['is not in the list', '/admin/miembros?ficha=99', '/admin/miembros'],
    ['is not a number', '/admin/miembros?ficha=abc', '/admin/miembros?ficha=abc'],
    ['is empty', '/admin/miembros?ficha=', '/admin/miembros?ficha='],
  ])('should show the list without a record when ?ficha %s', async (_caso, ruta, urlFinal) => {
    abrir(<MiembrosPage />, ruta, '/admin/miembros');

    await screen.findByRole('row', { name: /Ana Pérez/ });
    await waitFor(() => expect(url()).toBe(urlFinal));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockGet.mock.calls.filter(([url]) => /^\/admin\/miembros\//.test(url))).toEqual([]);
  });

  test('should not open the record when the list could not be loaded', async () => {
    mockGet = vi.fn(async (url) => {
      if (url === '/admin/config') return { data: { config: {} } };
      throw { status: 503, message: 'No pudimos cargar los miembros. Intenta de nuevo.' };
    });

    abrir(<MiembrosPage />, '/admin/miembros?ficha=3', '/admin/miembros');

    expect((await screen.findAllByText('No pudimos cargar los miembros')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Sigue en la URL: al recargar la pagina se vuelve a intentar.
    expect(url()).toBe('/admin/miembros?ficha=3');
  });

  test('should respect the record the person opened while the list of ?ficha was loading', async () => {
    // La lista ya esta en pantalla; el enlace pide otra con ?ficha=3 que tarda, y la persona abre a Ana.
    const user = abrir(<MiembrosPage />, '/admin/miembros', '/admin/miembros?ficha=3');
    await screen.findByRole('row', { name: /Ana Pérez/ });
    const original = mockGet;
    let responder;
    mockGet = vi.fn((url, opciones) => (url === '/admin/miembros'
      ? new Promise((resolve) => { responder = () => resolve({ data: { miembros: lista } }); })
      : original(url, opciones)));
    await user.click(screen.getByRole('link', { name: 'Ir' }));
    await user.click(screen.getByRole('row', { name: /Ana Pérez/ }));
    expect(await screen.findByRole('dialog', { name: 'Editar Ana Pérez' })).toBeInTheDocument();

    await act(async () => responder());

    expect(screen.getByRole('dialog', { name: 'Editar Ana Pérez' })).toBeInTheDocument();
    expect(mockGet.mock.calls.map(([url]) => url)).not.toContain('/admin/miembros/3');
  });

  test('should not open the record of the URL when the person opened and closed another one while the list was loading', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros', '/admin/miembros?ficha=3');
    await screen.findByRole('row', { name: /Ana Pérez/ });
    const original = mockGet;
    let responder;
    mockGet = vi.fn((ruta, opciones) => (ruta === '/admin/miembros'
      ? new Promise((resolve) => { responder = () => resolve({ data: { miembros: lista } }); })
      : original(ruta, opciones)));
    await user.click(screen.getByRole('link', { name: 'Ir' }));
    await user.click(screen.getByRole('row', { name: /Ana Pérez/ }));
    const ana = await screen.findByRole('dialog', { name: 'Editar Ana Pérez' });
    await user.click(within(ana).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await act(async () => responder());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockGet.mock.calls.map(([ruta]) => ruta)).not.toContain('/admin/miembros/3');
  });

  test('should go back to the previous list, not to the record again, when the person goes back after closing it', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros?q=102', '/admin/miembros?ficha=3');
    await screen.findByRole('row', { name: /Carlos Ruiz/ });
    await user.click(screen.getByRole('link', { name: 'Ir' }));
    const diana = await screen.findByRole('dialog', { name: 'Editar Diana Vera' });
    await user.click(within(diana).getByRole('button', { name: 'Cancelar' }));

    await user.click(screen.getByRole('button', { name: 'Atrás' }));

    await waitFor(() => expect(filas()).toEqual(['Carlos Ruiz']));
    expect(url()).toBe('/admin/miembros?q=102');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should not ask for the record when the person leaves the page before the list arrives', async () => {
    const original = mockGet;
    let responder;
    mockGet = vi.fn((url, opciones) => (url === '/admin/miembros'
      ? new Promise((resolve) => { responder = () => resolve({ data: { miembros: lista } }); })
      : original(url, opciones)));
    const user = abrir(<MiembrosPage />, '/admin/miembros?ficha=3');
    await waitFor(() => expect(responder).toBeDefined());

    user.cerrarPagina();
    await act(async () => responder());

    expect(mockGet.mock.calls.map(([url]) => url)).not.toContain('/admin/miembros/3');
  });

  test('should drop the filter when a notification opens the page with ?q= from a filtered list', async () => {
    // Elio esta vencido: con «Vence en 30 días» puesto no se veria.
    const user = abrir(<MiembrosPage />, '/admin/miembros?filtro=vence30', '/admin/miembros?q=elio');
    await screen.findByRole('row', { name: /Ana Pérez/ });

    await user.click(screen.getByRole('link', { name: 'Ir' }));

    expect(await screen.findByRole('row', { name: /Elio Vargas/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Todos/ })).toHaveAttribute('aria-selected', 'true');
    expect(filas()).toEqual(['Elio Vargas']);
  });

  test('should not open the record of the URL again when the list is reloaded', async () => {
    const responder = [];
    const original = mockGet;
    mockGet = vi.fn((url, opciones) => (url === '/admin/miembros'
      ? new Promise((resolve) => { responder.push(() => resolve({ data: { miembros: lista } })); })
      : original(url, opciones)));
    const user = abrir(<MiembrosPage />, '/admin/miembros?ficha=3');
    await waitFor(() => expect(responder).toHaveLength(1));

    await act(async () => responder[0]());
    const ficha = await screen.findByRole('dialog', { name: 'Editar Diana Vera' });
    await user.click(within(ficha).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Actualizar/ }));
    await act(async () => responder[1]());

    // Recargar la lista no vuelve a abrir la ficha de la URL.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should open the record from the mobile card of an active member', async () => {
    const user = abrir(<MiembrosPage />, '/admin/miembros');
    await screen.findByRole('row', { name: /Ana Pérez/ });
    const [tarjetaAna] = screen.getAllByRole('article');

    await user.click(within(tarjetaAna).getByRole('button', { name: 'Ver ficha de Ana Pérez' }));

    expect(await screen.findByRole('dialog', { name: 'Editar Ana Pérez' })).toBeInTheDocument();
    expect(within(tarjetaAna).getByRole('button', { name: 'Desactivar a Ana Pérez' })).toBeInTheDocument();
    expect(within(tarjetaAna).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  test('should offer Ver ficha and Eliminar, not Desactivar, on the mobile card of an inactive member', async () => {
    lista = [HUGO];
    const user = abrir(<MiembrosPage />, '/admin/miembros?filtro=desactivados');
    await screen.findByRole('row', { name: /Hugo Inactivo/ });
    const [tarjeta] = screen.getAllByRole('article');

    expect(within(tarjeta).queryByRole('button', { name: /Desactivar/ })).not.toBeInTheDocument();
    await user.click(within(tarjeta).getByRole('button', { name: 'Eliminar permanentemente a Hugo Inactivo' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Hugo Inactivo/);
    await user.keyboard('{Escape}');
    await user.click(within(tarjeta).getByRole('button', { name: 'Ver ficha de Hugo Inactivo' }));
    expect(await screen.findByRole('dialog', { name: 'Editar Hugo Inactivo' })).toBeInTheDocument();
  });
});

describe('CheckinPage: los ingresos de hoy', () => {
  const ANA = { id_checkin: 90, fecha_hora: '2026-11-24T13:00:00.000Z', metodo: 'QR', valido: true, id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', codigo_qr: 'QR-ANA' };
  const abrirCheckin = () => abrir(<CheckinPage />, '/admin/checkin');
  const lista = () => screen.getByRole('list', { name: 'Ingresos de hoy' });

  test('should ask only for the check-ins of today and list them', async () => {
    mockGet = vi.fn(async () => ({ data: { checkins: [ANA] } }));

    abrirCheckin();

    expect(await within(lista()).findByText('Ana Pérez')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/checkin', { params: { dia: 'hoy', limit: 200 } });
    expect(screen.queryByText('Aún no hay ingresos hoy.')).not.toBeInTheDocument();
  });

  test('should say that there are no check-ins only after the answer arrives', async () => {
    let responder;
    mockGet = vi.fn(() => new Promise((resolve) => { responder = resolve; }));
    abrirCheckin();
    expect(screen.queryByText('Aún no hay ingresos hoy.')).not.toBeInTheDocument();

    await act(async () => responder({ data: { checkins: [] } }));

    expect(screen.getByText('Aún no hay ingresos hoy.')).toBeInTheDocument();
    expect(within(lista()).queryAllByRole('listitem')).toEqual([]);
    expect(lista()).not.toHaveAttribute('tabindex'); // vacia no es parada del teclado
  });

  test('should not say that there are no check-ins when the history cannot be loaded', async () => {
    mockGet = vi.fn(async () => { throw { status: 503, message: 'No pudimos cargar el historial. Intenta de nuevo.' }; });

    abrirCheckin();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el historial.');
    expect(screen.queryByText('Aún no hay ingresos hoy.')).not.toBeInTheDocument();
  });

  test('should let the keyboard reach the list to scroll it', async () => {
    mockGet = vi.fn(async () => ({ data: { checkins: [ANA] } }));

    abrirCheckin();

    await within(lista()).findByText('Ana Pérez');
    expect(lista()).toHaveAttribute('tabindex', '0');
  });
});
