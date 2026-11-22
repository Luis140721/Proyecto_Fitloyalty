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
 * Lo mismo con lo que la persona empezo en una ficha y contesta tarde: un
 * «Guardar plan», un «Congelar membresía» o la copia del QR solo valen para la
 * ficha desde la que se pulsaron.
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
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

// El plan de Ana que contesta el servidor: un test lo cambia para simular que ya quedo congelada.
let planDeAna;

/** Lo que contesta el servidor a cada GET cuando todo va bien. */
const respuestaDe = (url) => {
  if (url === '/admin/config') return { config: {} };
  if (url === '/admin/miembros') return { miembros: [ANA, CARLOS] };
  if (url === REGISTRO_DE_ANA) return { miembro: completo(ANA, 'Medellín'), autorizaciones: null };
  if (url === PLAN_ANA) return { plan: planDeAna, congelaciones: CONGELACIONES_DE_ANA };
  if (url === REGISTRO_DE_CARLOS) return { miembro: completo(CARLOS, 'Cali'), autorizaciones: null };
  if (url === PLAN_CARLOS) return { plan: PLAN_DE_CARLOS, congelaciones: [] };
  throw new Error(`GET no simulado en el test: ${url}`);
};

/**
 * Doble del GET. La primera peticion a cada URL de `retenidas` (o la segunda, para
 * las de `recargas`) no contesta hasta que el test llame a llegar(url) (la respuesta
 * normal) o a fallar(url); las demas contestan de una vez. Las `fallidas` fallan siempre.
 */
function servidor({ retenidas = [], recargas = [], fallidas = [] } = {}) {
  const pendientes = {};
  const veces = {};
  mockGet = vi.fn((url) => {
    veces[url] = (veces[url] || 0) + 1;
    if (fallidas.includes(url)) return Promise.reject(SIN_BASE);
    if ((retenidas.includes(url) && veces[url] === 1) || (recargas.includes(url) && veces[url] === 2)) {
      return new Promise((resolve, reject) => { pendientes[url] = { resolve, reject }; });
    }
    return Promise.resolve({ data: respuestaDe(url) });
  });
  return {
    llegar: (url) => act(async () => pendientes[url].resolve({ data: respuestaDe(url) })),
    fallar: (url) => act(async () => pendientes[url].reject(SIN_BASE)),
  };
}
const pedidas = () => mockGet.mock.calls.map(([url]) => url);
const vecesPedida = (url) => pedidas().filter((pedida) => pedida === url).length;

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
  planDeAna = PLAN_DE_ANA;
  servidor();
  mockPost = vi.fn(async () => ({ data: {} }));
  mockPut = vi.fn(async () => ({ data: {} }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    // El guardado contesta con la ficha ya cerrada: se recarga la lista, pero el plan de Ana ya no se vuelve a pedir.
    await act(async () => responderPlan({ data: {} }));
    await waitFor(() => expect(vecesPedida('/admin/miembros')).toBe(2));
    await act(async () => {});
    expect(vecesPedida(PLAN_ANA)).toBe(1);

    // Act: se abre la de Carlos, cuyo registro todavia no llega
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');

    // Assert
    expect(ficha.getByText('Cargando los datos completos del miembro…')).toBeInTheDocument();
    sinElPlanDeAna(ficha);
    expect(ficha.queryByText('Plan actualizado.')).not.toBeInTheDocument();
    expect(vecesPedida(PLAN_ANA)).toBe(1);
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

/*
 * Lo que la persona empezo en la ficha de Ana y contesta cuando en pantalla ya esta la de Carlos.
 * Antes, el «Guardar plan» o el «Congelar» de Ana volvian a pedir el plan de Ana y lo ponian, con su
 * aviso, en la ficha de Carlos; el siguiente «Guardar plan» le guardaba a Carlos el plan de Ana.
 */
describe('MiembrosPage: lo que contesta tarde de la ficha anterior', () => {
  const CUERPO_DEL_PLAN_DE_CARLOS = {
    tipo_plan: 'TRIMESTRAL', fecha_inicio: '2026-09-01', fecha_fin: '2026-11-30', valor_total: 240000, valor_pagado: 240000,
    metodo_pago: 'NEQUI', referencia_pago: 'NQ-551', proxima_fecha_cobro: '2026-12-01',
  };
  const CONGELADA = 'Membresía congelada desde hoy.';
  const motivo = (ficha) => ficha.getByRole('textbox', { name: 'Motivo del congelamiento' });

  /** Doble de un PUT o un POST: la primera peticion la contesta (o la hace fallar) el test; las demas contestan de una vez. */
  const retenerLaPrimera = () => {
    const pendiente = {};
    return {
      doble: vi.fn(() => (pendiente.resolve
        ? Promise.resolve({ data: {} })
        : new Promise((resolve, reject) => { Object.assign(pendiente, { resolve, reject }); }))),
      contestar: (data = {}) => act(async () => pendiente.resolve({ data })),
      fallar: (error) => act(async () => pendiente.reject(error)),
    };
  };

  /** En la ficha de Ana se pulsa «Guardar plan», se cierra sin esperar la respuesta y se abre la de Carlos, con su plan ya cargado. */
  const guardarElPlanDeAnaYAbrirACarlos = async () => {
    const guardado = retenerLaPrimera();
    mockPut = guardado.doble;
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(await fichaDe('Ana Pérez').findByRole('button', { name: 'Guardar plan' }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/miembros/1/plan', expect.objectContaining({ valor_total: 90000 })));
    await cancelar(user);
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    await ficha.findByRole('heading', { name: 'Plan y cobro' });
    conElPlanDeCarlos(ficha);
    return { user, ficha, guardado, antes: pedidas().length };
  };

  /** Lo mismo con «Congelar membresía»; ademas, en la ficha de Carlos se empieza a escribir un motivo. */
  const congelarAAnaYAbrirACarlos = async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const congelado = retenerLaPrimera();
    mockPost = congelado.doble;
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.type(await fichaDe('Ana Pérez').findByRole('textbox', { name: 'Motivo del congelamiento' }), 'Viaje de Ana');
    await user.click(fichaDe('Ana Pérez').getByRole('button', { name: 'Congelar membresía' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/miembros/1/congelar', { motivo: 'Viaje de Ana' }));
    await cancelar(user);
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    await ficha.findByRole('heading', { name: 'Plan y cobro' });
    await user.type(motivo(ficha), 'Cirugía de Carlos');
    conElPlanDeCarlos(ficha);
    return { user, ficha, congelado, antes: pedidas().length };
  };

  test('should keep the plan of the open file and ask for no plan again when the plan save of the previous file answers late', async () => {
    // Arrange
    const { user, ficha, guardado, antes } = await guardarElPlanDeAnaYAbrirACarlos();

    // Act: contesta el guardado del plan de Ana
    await guardado.contestar();
    await waitFor(() => expect(pedidas().slice(antes)).toEqual(['/admin/miembros']));
    const guardarPlan = await ficha.findByRole('button', { name: 'Guardar plan' });

    // Assert: solo se recarga la lista; ni el plan de Ana ni el de Carlos se vuelven a pedir
    expect(pedidas().slice(antes)).toEqual(['/admin/miembros']);
    conElPlanDeCarlos(ficha);
    expect(ficha.queryByText('Plan actualizado.')).not.toBeInTheDocument();

    // Act: ahora se guarda el plan de Carlos
    await user.click(guardarPlan);

    // Assert: a Carlos se le guarda su plan, no el de Ana
    expect(await ficha.findByText('Plan actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockPut).toHaveBeenLastCalledWith('/admin/miembros/2/plan', CUERPO_DEL_PLAN_DE_CARLOS);
  });

  test('should show no plan error in the open file when the plan save of the previous file fails late', async () => {
    // Arrange
    const { ficha, guardado, antes } = await guardarElPlanDeAnaYAbrirACarlos();

    // Act: el guardado de Ana falla, sin mensaje del servidor (la pagina pondria el suyo)
    await guardado.fallar({ status: 503, code: 'DB_UNREACHABLE' });
    await ficha.findByRole('button', { name: 'Guardar plan' });

    // Assert
    expect(ficha.queryByText('No pudimos guardar el plan.')).not.toBeInTheDocument();
    conElPlanDeCarlos(ficha);
    expect(pedidas().slice(antes)).toEqual([]);
  });

  test('should not say Plan actualizado in the open file when the file changed while the saved plan was being reloaded', async () => {
    // Arrange: el guardado del plan de Ana contesta, pero la recarga de su plan tarda; se pasa a la ficha de Carlos
    const { llegar } = servidor({ recargas: [PLAN_ANA] });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(await fichaDe('Ana Pérez').findByRole('button', { name: 'Guardar plan' }));
    await waitFor(() => expect(vecesPedida(PLAN_ANA)).toBe(2));
    await cancelar(user);
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    await ficha.findByRole('heading', { name: 'Plan y cobro' });

    // Act: llega la recarga del plan de Ana
    await llegar(PLAN_ANA);
    await ficha.findByRole('button', { name: 'Guardar plan' });

    // Assert
    expect(ficha.queryByText('Plan actualizado.')).not.toBeInTheDocument();
    conElPlanDeCarlos(ficha);
  });

  test('should keep the plan and the typed reason of the open file when the freeze of the previous file answers late', async () => {
    // Arrange
    const { ficha, congelado, antes } = await congelarAAnaYAbrirACarlos();

    // Act: contesta el congelamiento de Ana
    await congelado.contestar({ message: CONGELADA });
    await waitFor(() => expect(pedidas().slice(antes)).toEqual(['/admin/miembros']));
    await ficha.findByRole('button', { name: 'Congelar membresía' });

    // Assert: solo se recarga la lista; en la ficha de Carlos no cambia nada
    expect(pedidas().slice(antes)).toEqual(['/admin/miembros']);
    expect(ficha.queryByText(CONGELADA)).not.toBeInTheDocument();
    expect(motivo(ficha)).toHaveValue('Cirugía de Carlos');
    conElPlanDeCarlos(ficha);
  });

  test('should show no freeze error in the open file and keep its typed reason when the freeze of the previous file fails late', async () => {
    // Arrange
    const { ficha, congelado, antes } = await congelarAAnaYAbrirACarlos();

    // Act: el congelamiento de Ana falla, sin mensaje del servidor (la pagina pondria el suyo)
    await congelado.fallar({ status: 409, code: 'ALREADY_FROZEN' });
    await ficha.findByRole('button', { name: 'Congelar membresía' });

    // Assert
    expect(ficha.queryByText('No pudimos cambiar el congelamiento.')).not.toBeInTheDocument();
    expect(motivo(ficha)).toHaveValue('Cirugía de Carlos');
    conElPlanDeCarlos(ficha);
    expect(pedidas().slice(antes)).toEqual([]);
  });

  test('should not say the membership was frozen in the open file when the file changed while the frozen plan was being reloaded', async () => {
    // Arrange: el congelamiento de Ana contesta, pero la recarga de su plan tarda; se pasa a la ficha de Carlos
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost = vi.fn(async () => ({ data: { message: CONGELADA } }));
    const { llegar } = servidor({ recargas: [PLAN_ANA] });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(await fichaDe('Ana Pérez').findByRole('button', { name: 'Congelar membresía' }));
    await waitFor(() => expect(vecesPedida(PLAN_ANA)).toBe(2));
    await cancelar(user);
    await user.click(filaDe('Carlos Ruiz'));
    const ficha = fichaDe('Carlos Ruiz');
    await ficha.findByRole('heading', { name: 'Plan y cobro' });

    // Act: llega la recarga del plan de Ana
    await llegar(PLAN_ANA);
    await ficha.findByRole('button', { name: 'Congelar membresía' });

    // Assert
    expect(ficha.queryByText(CONGELADA)).not.toBeInTheDocument();
    conElPlanDeCarlos(ficha);
  });

  // Con la misma ficha abierta todo sigue igual. Que «Guardar plan» recarga el plan y avisa ya lo afirma
  // MiembrosPage.ficha.test.jsx («should confirm and reload the plan and the list...»); aqui, el congelamiento.
  test('should reload the plan and show the notice in the same file when the membership is frozen and the file stays open', async () => {
    // Arrange: despues de congelar, el servidor contesta el plan de Ana ya congelado
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost = vi.fn(async () => {
      planDeAna = { ...PLAN_DE_ANA, congelado_desde: '2026-11-20T00:00:00.000Z', dias_congelado: 2 };
      return { data: { message: CONGELADA } };
    });
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    const ficha = fichaDe('Ana Pérez');
    await user.type(await ficha.findByRole('textbox', { name: 'Motivo del congelamiento' }), 'Viaje');

    // Act
    await user.click(ficha.getByRole('button', { name: 'Congelar membresía' }));

    // Assert
    expect(await ficha.findByText(CONGELADA)).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/admin/miembros/1/congelar', { motivo: 'Viaje' });
    expect(vecesPedida(PLAN_ANA)).toBe(2);
    expect(ficha.getByText(/Congelada desde el 20\/11\/2026 \(2 días\)\./)).toBeInTheDocument();
    expect(ficha.getByRole('button', { name: 'Descongelar membresía' })).toBeInTheDocument();
    expect(ficha.queryByRole('button', { name: 'Congelar membresía' })).not.toBeInTheDocument();
  });
});

describe('MiembrosPage: la copia del QR de la ficha anterior', () => {
  /**
   * Con timers falsos para setTimeout (los clics van con fireEvent, como en CheckinPage.ramas.test.jsx):
   * en la ficha de Ana se pulsa «Copiar código», el portapapeles no contesta y la ficha se cierra.
   * Devuelve la funcion que termina la copia.
   */
  const empezarACopiarYCerrar = async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await act(async () => {});
    fireEvent.click(filaDe('Ana Pérez'));
    await act(async () => {});
    let terminarCopia;
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise((resolve) => { terminarCopia = resolve; }));
    fireEvent.click(fichaDe('Ana Pérez').getByRole('button', { name: 'Copiar código' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    return () => act(async () => terminarCopia());
  };

  test('should not show Copiado in the open file nor leave a timer when the copy of the previous file finishes late', async () => {
    // Arrange: ya esta abierta la ficha de Carlos, y sus timers de entrada ya corrieron
    const terminarCopia = await empezarACopiarYCerrar();
    fireEvent.click(filaDe('Carlos Ruiz'));
    await act(async () => {});
    act(() => vi.advanceTimersByTime(100));
    const ficha = fichaDe('Carlos Ruiz');
    expect(vi.getTimerCount()).toBe(0);

    // Act: termina la copia del QR de Ana
    await terminarCopia();

    // Assert
    expect(ficha.getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
    expect(ficha.queryByRole('button', { name: 'Copiado' })).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('should leave no timer when the copy finishes with the file already closed', async () => {
    // Arrange
    const terminarCopia = await empezarACopiarYCerrar();
    act(() => vi.advanceTimersByTime(100));
    expect(vi.getTimerCount()).toBe(0);

    // Act
    await terminarCopia();

    // Assert: antes quedaba aqui el timer de «Copiado», sin ninguna ficha abierta
    expect(vi.getTimerCount()).toBe(0);
  });
});
