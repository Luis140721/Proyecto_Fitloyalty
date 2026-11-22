/**
 * MiembrosPage: lo que pasa entre una ficha y la siguiente (arreglos de la
 * revision del #108). Al abrir la ficha de un miembro no puede quedar nada del
 * anterior: ni su plan, ni sus congelaciones, ni el motivo que se estaba
 * escribiendo, ni un error de su plan, ni la imagen de su QR. Y lo que llegue
 * tarde de una ficha que ya no esta en pantalla (su plan, o el error de su
 * plan) no se muestra en la que si esta.
 *
 * Importa porque el plan tiene su propio boton: con el plan de Ana a la vista
 * en la ficha de Carlos, «Guardar plan» le guardaba a Carlos el plan de Ana.
 *
 * Que la ficha solo se guarda con el registro completo esta en
 * MiembrosPage.ficha.test.jsx; la aceptacion de mensajes comerciales, en
 * MiembrosPage.comerciales.test.jsx.
 *
 * El API, useAuth y qrcode se simulan con vi.mock. El test puede retener la
 * respuesta de una URL y soltarla (o hacerla fallar) cuando quiera. Las fechas
 * de los planes vienen fijas en las respuestas: nada depende del reloj.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import MiembrosPage from '../src/pages/MiembrosPage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test, como en LoginPage.test.jsx.
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
let dibujarQr;
vi.mock('qrcode', () => ({ default: { toDataURL: (...a) => dibujarQr(...a) } }));

// Filas de la lista y registros completos de GET /api/admin/miembros/:id.
const ANA = { id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', telefono: '3001234567', email: 'ana@correo.co', codigo_qr: 'QR-ANA', activo: true, whatsapp: null };
const CARLOS = { id_miembro: 2, nombre: 'Carlos Ruiz', documento: '79888777', telefono: '3109876543', codigo_qr: 'QR-CARLOS', activo: true, whatsapp: null };
const completo = (fila, ciudad) => ({
  ...fila, tipo_documento: 'CC', fecha_nacimiento: '1990-05-17T00:00:00.000Z', genero: '', codigo_pais_telefono: '57', ciudad,
  direccion: '', contacto_emergencia: '', telefono_emergencia: '', condiciones_medicas: '', alergias: '', objetivo: '',
  nivel_experiencia: '', observaciones: '', acepta_mensajes_comerciales: false, canales_comerciales: [], autorizo_datos_sensibles: false,
});

// GET /api/admin/miembros/:id/plan. El de Ana: mensual de octubre, pagado a medias y con una congelacion vieja.
const PLAN_DE_ANA = {
  id_plan_cobro: 9, tipo_plan: 'MENSUAL', fecha_inicio: '2026-10-01T00:00:00.000Z', fecha_fin: '2026-10-31T00:00:00.000Z',
  valor_total: '90000.00', valor_pagado: '45000.00', metodo_pago: 'EFECTIVO', referencia_pago: '', estado_pago: 'PARCIAL',
  congelado_desde: null, dias_congelado: 0,
};
const CONGELACIONES_DE_ANA = [
  { id_congelacion: 3, fecha_inicio: '2026-08-01T00:00:00.000Z', fecha_fin: '2026-08-15T00:00:00.000Z', dias: 14, motivo: 'Incapacidad' },
];
// El de Carlos: trimestral, pagado completo por Nequi y sin congelaciones.
const PLAN_DE_CARLOS = {
  id_plan_cobro: 12, tipo_plan: 'TRIMESTRAL', fecha_inicio: '2026-09-01T00:00:00.000Z', fecha_fin: '2026-11-30T00:00:00.000Z',
  valor_total: '240000.00', valor_pagado: '240000.00', metodo_pago: 'NEQUI', referencia_pago: 'NQ-551', estado_pago: 'PAGADO',
  congelado_desde: null, dias_congelado: 0,
};
const SIN_BASE = { status: 503, code: 'DB_UNREACHABLE', message: 'Sin base' };
const ERROR_DEL_PLAN = 'No pudimos cargar el plan de este miembro.';

const REGISTRO_DE_ANA = '/admin/miembros/1';
const PLAN_ANA = '/admin/miembros/1/plan';
const REGISTRO_DE_CARLOS = '/admin/miembros/2';
const PLAN_CARLOS = '/admin/miembros/2/plan';

/** Lo que contesta el servidor a cada GET cuando todo va bien. */
const respuestaDe = (url) => {
  if (url === '/admin/config') return { config: {} };
  if (url === '/admin/miembros') return { miembros: [ANA, CARLOS] };
  if (url === REGISTRO_DE_ANA) return { miembro: completo(ANA, 'Medellín'), autorizaciones: null };
  if (url === PLAN_ANA) return { plan: PLAN_DE_ANA, congelaciones: CONGELACIONES_DE_ANA };
  if (url === REGISTRO_DE_CARLOS) return { miembro: completo(CARLOS, 'Cali'), autorizaciones: null };
  if (url === PLAN_CARLOS) return { plan: PLAN_DE_CARLOS, congelaciones: [] };
  throw new Error(`GET no simulado en el test: ${url}`);
};

/**
 * Doble del GET. La primera peticion a cada URL de `retenidas` no contesta hasta
 * que el test llame a llegar(url) (la respuesta normal) o a fallar(url); las
 * siguientes contestan de una vez. Las `fallidas` fallan siempre.
 */
function servidor({ retenidas = [], fallidas = [] } = {}) {
  const pendientes = {};
  mockGet = vi.fn((url) => {
    if (fallidas.includes(url)) return Promise.reject(SIN_BASE);
    if (retenidas.includes(url) && !pendientes[url]) return new Promise((resolve, reject) => { pendientes[url] = { resolve, reject }; });
    return Promise.resolve({ data: respuestaDe(url) });
  });
  return {
    llegar: (url) => act(async () => pendientes[url].resolve({ data: respuestaDe(url) })),
    fallar: (url) => act(async () => pendientes[url].reject(SIN_BASE)),
  };
}
const pedidas = () => mockGet.mock.calls.map(([url]) => url);

const filaDe = (nombre) => screen.getByRole('row', { name: new RegExp(nombre) });
const fichaDe = (nombre) => within(screen.getByRole('dialog', { name: `Editar ${nombre}` }));
const valorDelPlan = (ficha) => ficha.getByRole('spinbutton', { name: 'Valor del plan' });

async function abrirLista() {
  const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
  await screen.findByRole('row', { name: /Ana Pérez/ });
  return pantalla;
}
/** Las dos maneras de dejar una ficha: sin guardar o guardando. */
const cancelar = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
};
const guardarCambios = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Miembro actualizado.');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
};
const FORMAS_DE_DEJARLA = [['cancelled', cancelar], ['saved', guardarCambios]];

/** En la ficha no hay rastro del plan de Ana ni manera de guardarlo. */
const sinElPlanDeAna = (ficha) => {
  expect(ficha.queryByRole('heading', { name: 'Plan y cobro' })).not.toBeInTheDocument();
  expect(ficha.queryByRole('button', { name: 'Guardar plan' })).not.toBeInTheDocument();
  expect(ficha.queryByRole('spinbutton', { name: 'Valor del plan' })).not.toBeInTheDocument();
  expect(ficha.queryByText('PARCIAL')).not.toBeInTheDocument();
  expect(ficha.queryByText(/Incapacidad/)).not.toBeInTheDocument();
};
/** En la ficha esta el plan de Carlos, completo y sin nada del de Ana. */
const conElPlanDeCarlos = (ficha) => {
  expect(valorDelPlan(ficha)).toHaveValue(240000);
  expect(ficha.getByRole('spinbutton', { name: 'Valor pagado' })).toHaveValue(240000);
  expect(ficha.getByRole('combobox', { name: 'Tipo de plan' })).toHaveValue('TRIMESTRAL');
  expect(ficha.getByText('PAGADO')).toBeInTheDocument();
  expect(ficha.queryByText('PARCIAL')).not.toBeInTheDocument();
  expect(ficha.queryByText(/Incapacidad/)).not.toBeInTheDocument();
  expect(ficha.queryByText(ERROR_DEL_PLAN)).not.toBeInTheDocument();
};

// jsdom no implementa scrollIntoView, y la pagina lo usa para llevarte al primer campo con error.
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterAll(() => { delete Element.prototype.scrollIntoView; });

beforeEach(() => {
  dibujarQr = async (codigo) => `data:image/png;base64,${codigo}`;
  servidor();
  mockPost = vi.fn(async () => ({ data: {} }));
  mockPut = vi.fn(async () => ({ data: {} }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => vi.restoreAllMocks());

describe('MiembrosPage: el plan de la ficha anterior', () => {
  test('should not show the plan of the saved file nor a way to save it when the next file is loading or fails to load', async () => {
    // Arrange: la ficha de Ana, con su plan y su congelacion a la vista, se guarda
    const { fallar } = servidor({ retenidas: [REGISTRO_DE_CARLOS] });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await fichaDe('Ana Pérez').findByRole('heading', { name: 'Plan y cobro' });
    expect(valorDelPlan(fichaDe('Ana Pérez'))).toHaveValue(90000);
    expect(fichaDe('Ana Pérez').getByText('1/8/2026 → 15/8/2026 (14 días) · Incapacidad')).toBeInTheDocument();
    await guardarCambios(user);

    // Act: se abre la de Carlos, cuyo registro todavia no llega
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');

    // Assert
    expect(ficha.getByText('Cargando los datos completos del miembro…')).toBeInTheDocument();
    sinElPlanDeAna(ficha);

    // Act: el registro de Carlos no carga
    await fallar(REGISTRO_DE_CARLOS);

    // Assert: tampoco entonces, y a Carlos no le llega ningun plan
    expect(ficha.getByRole('alert')).toHaveTextContent('Sin base');
    sinElPlanDeAna(ficha);
    expect(mockPut.mock.calls.map(([url]) => url)).toEqual([REGISTRO_DE_ANA]);
    expect(pedidas()).not.toContain(PLAN_CARLOS);
  });

  test.each(FORMAS_DE_DEJARLA)('should show only the plan of the next member and save it for that member when the previous file was %s', async (_caso, dejarLaDeAna) => {
    // Arrange: el plan de Carlos tarda
    const { llegar } = servidor({ retenidas: [PLAN_CARLOS] });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await fichaDe('Ana Pérez').findByRole('heading', { name: 'Plan y cobro' });
    await dejarLaDeAna(user);
    mockPut.mockClear();

    // Act: se abre la de Carlos; su registro llega, su plan todavia no
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    expect(await ficha.findByRole('textbox', { name: 'Ciudad' })).toHaveValue('Cali');

    // Assert: mientras tanto no se ve el de Ana
    sinElPlanDeAna(ficha);

    // Act: llega el plan de Carlos y se guarda
    await llegar(PLAN_CARLOS);
    conElPlanDeCarlos(ficha);
    await user.click(ficha.getByRole('button', { name: 'Guardar plan' }));

    // Assert
    expect(await ficha.findByText('Plan actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith('/admin/miembros/2/plan', {
      tipo_plan: 'TRIMESTRAL', fecha_inicio: '2026-09-01', fecha_fin: '2026-11-30', valor_total: 240000, valor_pagado: 240000,
      metodo_pago: 'NEQUI', referencia_pago: 'NQ-551', proxima_fecha_cobro: '2026-12-01',
    });
  });

  test.each(FORMAS_DE_DEJARLA)('should keep the plan of the open file when the plan of the previous one arrives late and that file was %s', async (_caso, dejarLaDeAna) => {
    // Arrange: la ficha de Ana se deja con su plan todavia en camino, y se abre la de Carlos
    const { llegar } = servidor({ retenidas: [PLAN_ANA] });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    expect(await fichaDe('Ana Pérez').findByRole('textbox', { name: 'Ciudad' })).toHaveValue('Medellín');
    await waitFor(() => expect(pedidas()).toContain(PLAN_ANA));
    await dejarLaDeAna(user);
    mockPut.mockClear();
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    await ficha.findByRole('heading', { name: 'Plan y cobro' });
    conElPlanDeCarlos(ficha);

    // Act: llega el plan de Ana
    await llegar(PLAN_ANA);

    // Assert: la ficha de Carlos sigue con el suyo, y «Guardar plan» guarda el de Carlos
    conElPlanDeCarlos(ficha);
    await user.click(ficha.getByRole('button', { name: 'Guardar plan' }));
    expect(await ficha.findByText('Plan actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith('/admin/miembros/2/plan', expect.objectContaining({ tipo_plan: 'TRIMESTRAL', valor_total: 240000, valor_pagado: 240000 }));
  });

  test('should keep the plan of the open file and show no plan error when the plan of the previous one fails late', async () => {
    // Arrange
    const { fallar } = servidor({ retenidas: [PLAN_ANA] });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await waitFor(() => expect(pedidas()).toContain(PLAN_ANA));
    await cancelar(user);
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    await ficha.findByRole('heading', { name: 'Plan y cobro' });

    // Act: falla el plan de Ana
    await fallar(PLAN_ANA);

    // Assert: ni el error de Ana, ni se pierde el editor del plan de Carlos
    expect(ficha.queryByText(ERROR_DEL_PLAN)).not.toBeInTheDocument();
    expect(ficha.getByRole('heading', { name: 'Plan y cobro' })).toBeInTheDocument();
    conElPlanDeCarlos(ficha);
  });

  test('should not show the plan error of the saved file when the next file is still loading', async () => {
    // Arrange: el plan de Ana no cargo y su ficha lo dice; aun asi se guarda la ficha
    servidor({ fallidas: [PLAN_ANA], retenidas: [REGISTRO_DE_CARLOS] });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    expect(await fichaDe('Ana Pérez').findByText(ERROR_DEL_PLAN)).toBeInTheDocument();
    await guardarCambios(user);

    // Act
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');

    // Assert: el plan de Carlos ni siquiera se ha pedido
    expect(ficha.getByText('Cargando los datos completos del miembro…')).toBeInTheDocument();
    expect(ficha.queryByText(ERROR_DEL_PLAN)).not.toBeInTheDocument();
  });

  test('should not show the plan of the closed file when its plan save finished after it was closed and the next file is loading', async () => {
    // Arrange: en la ficha de Ana se pulsa «Guardar plan», el servidor tarda y la ficha se cierra
    servidor({ retenidas: [REGISTRO_DE_CARLOS] });
    let responderPlan;
    mockPut = vi.fn(() => new Promise((resolve) => { responderPlan = resolve; }));
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(await fichaDe('Ana Pérez').findByRole('button', { name: 'Guardar plan' }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith(`${REGISTRO_DE_ANA}/plan`, expect.objectContaining({ valor_total: 90000 })));
    await cancelar(user);
    // El guardado contesta con la ficha ya cerrada, y la pagina vuelve a pedir el plan de Ana.
    await act(async () => responderPlan({ data: {} }));
    await waitFor(() => expect(pedidas().filter((url) => url === PLAN_ANA)).toHaveLength(2));
    await act(async () => {});

    // Act: se abre la de Carlos, cuyo registro todavia no llega
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');

    // Assert
    expect(ficha.getByText('Cargando los datos completos del miembro…')).toBeInTheDocument();
    sinElPlanDeAna(ficha);
    expect(ficha.queryByText('Plan actualizado.')).not.toBeInTheDocument();
  });

  test('should not keep the freeze reason typed in the saved file when the next file opens', async () => {
    // Arrange: en la ficha de Ana se escribe un motivo de congelamiento, pero no se congela
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.type(await fichaDe('Ana Pérez').findByRole('textbox', { name: 'Motivo del congelamiento' }), 'Viaje de trabajo');
    await guardarCambios(user);

    // Act
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');

    // Assert
    expect(await ficha.findByRole('textbox', { name: 'Motivo del congelamiento' })).toHaveValue('');
  });
});

describe('MiembrosPage: el QR de la ficha anterior', () => {
  test('should show the QR of the open file and not ask for the plan of the previous one when its QR image is drawn late', async () => {
    // Arrange: la imagen del QR de Ana tarda en dibujarse; la ficha se cierra y se abre la de Carlos
    let terminarQrDeAna;
    dibujarQr = (codigo) => (codigo === 'QR-ANA'
      ? new Promise((resolve) => { terminarQrDeAna = resolve; })
      : Promise.resolve(`data:image/png;base64,${codigo}`));
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await waitFor(() => expect(terminarQrDeAna).toBeTypeOf('function'));
    await cancelar(user);
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    expect(await ficha.findByRole('img', { name: 'Código QR de Carlos Ruiz' })).toHaveAttribute('src', 'data:image/png;base64,QR-CARLOS');

    // Act: termina de dibujarse el QR de Ana
    await act(async () => terminarQrDeAna('data:image/png;base64,QR-ANA'));

    // Assert
    expect(ficha.getByRole('img', { name: 'Código QR de Carlos Ruiz' })).toHaveAttribute('src', 'data:image/png;base64,QR-CARLOS');
    expect(pedidas()).not.toContain(PLAN_ANA);
    conElPlanDeCarlos(ficha);
  });
});
