/**
 * Bootcamp semana 4 (Front, Luis): la ficha de un miembro en MiembrosPage
 * (editar datos, plan y cobro, congelar, QR y contrato) y el boton de
 * WhatsApp de la lista. La lista, la busqueda y el alta estan en
 * MiembrosPage.test.jsx.
 *
 * El API, useAuth y qrcode se simulan con vi.mock. Las fechas del plan llegan
 * como las manda el backend en Render: una columna date de PostgreSQL que pg
 * convierte en la medianoche UTC (2026-10-01T00:00:00.000Z). La pagina las lee
 * con fechaDia y formatearFechaDia (src/fechas.js, del #63). El archivo corre
 * con la hora de Colombia, como el navegador de recepcion: en UTC, como el CI,
 * el defecto no se veria.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
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
let rol;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: rol } }) }));
let dibujarQr;
vi.mock('qrcode', () => ({ default: { toDataURL: (...a) => dibujarQr(...a) } }));

// Fila de la lista y registro completo de GET /api/admin/miembros/:id.
const ANA = { id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', telefono: '3001234567', email: 'ana@correo.co', codigo_qr: 'QR-ANA', activo: true, whatsapp: null };
const ANA_COMPLETA = {
  ...ANA, tipo_documento: 'CC', fecha_nacimiento: '1990-05-17T00:00:00.000Z', genero: 'Femenino', codigo_pais_telefono: '57',
  ciudad: 'Medellín', direccion: 'Calle 10 # 20-30', contacto_emergencia: 'Luz Pérez', telefono_emergencia: '3110000000',
  condiciones_medicas: '', alergias: '', objetivo: '', nivel_experiencia: '', observaciones: '',
};
const CARLOS = {
  id_miembro: 2, nombre: 'Carlos Ruiz', documento: '79888777', telefono: '3109876543', codigo_qr: 'QR-CARLOS', activo: true, vencido: true,
  whatsapp: { motivo: 'vencida', telefono: '573109876543', mensaje: 'Hola Carlos, tu plan de Gimnasio Central venció hace 3 días.' },
};

// GET /api/admin/miembros/:id/plan: mensual de octubre, pagado a medias.
const PLAN = {
  id_plan_cobro: 9, tipo_plan: 'MENSUAL', fecha_inicio: '2026-10-01T00:00:00.000Z', fecha_fin: '2026-10-31T00:00:00.000Z',
  valor_total: '90000.00', valor_pagado: '45000.00', metodo_pago: 'EFECTIVO', referencia_pago: '', estado_pago: 'PARCIAL',
  congelado_desde: null, dias_congelado: 0,
};

const EDITABLES = [
  'nombre', 'documento', 'telefono', 'email', 'activo', 'tipo_documento', 'fecha_nacimiento', 'genero', 'codigo_pais_telefono',
  'ciudad', 'direccion', 'contacto_emergencia', 'telefono_emergencia', 'condiciones_medicas', 'alergias', 'objetivo',
  'nivel_experiencia', 'observaciones',
];

let plan, congelaciones;

/** Doble del GET: configuracion, lista, ficha completa y plan de Ana. */
function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/admin/config') return { data: { config: { plan_mensual_valor: '90000.00', plan_trimestral_valor: '240000.00' } } };
    if (url === '/admin/miembros') return { data: { miembros: [ANA, CARLOS] } };
    if (url === '/admin/miembros/1') return { data: { miembro: ANA_COMPLETA } };
    if (url === '/admin/miembros/1/plan') return { data: { plan, congelaciones } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const filaDe = (nombre) => screen.getByRole('row', { name: new RegExp(nombre) });
const ficha = () => screen.getByRole('dialog', { name: 'Editar Ana Pérez' });

/** Abre la pagina y la ficha de Ana; espera a que cargue el plan. */
async function abrirFichaDeAna() {
  const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
  await pantalla.user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));
  await within(ficha()).findByRole('heading', { name: 'Plan y cobro' });
  return pantalla;
}

let zonaOriginal;
beforeAll(() => {
  zonaOriginal = process.env.TZ;
  process.env.TZ = 'America/Bogota';
  Element.prototype.scrollIntoView = () => {};
});
afterAll(() => {
  if (zonaOriginal === undefined) delete process.env.TZ; else process.env.TZ = zonaOriginal;
  delete Element.prototype.scrollIntoView;
});

beforeEach(() => {
  rol = 'admin';
  dibujarQr = async () => 'data:image/png;base64,UVI=';
  plan = { ...PLAN };
  congelaciones = [];
  mockGet = apiQueResponde();
  mockPost = vi.fn(async () => ({ data: {} }));
  mockPut = vi.fn(async () => ({ data: {} }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => vi.restoreAllMocks());

describe('MiembrosPage: la ficha del miembro', () => {
  test('should load the full record, the QR and the plan when the user opens a member', async () => {
    // Act
    await abrirFichaDeAna();

    // Assert: la ciudad no viene en la lista, solo en el registro completo
    expect(within(ficha()).getByRole('textbox', { name: 'Ciudad' })).toHaveValue('Medellín');
    expect(within(ficha()).getByRole('img', { name: 'Código QR de Ana Pérez' })).toHaveAttribute('src', 'data:image/png;base64,UVI=');
    expect(within(ficha()).getByText('PARCIAL')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/miembros/1');
    expect(mockGet).toHaveBeenCalledWith('/admin/miembros/1/plan');
  });

  test('should send only the fields the API accepts when the user saves the changes', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const telefono = within(ficha()).getByRole('textbox', { name: 'Teléfono' });

    // Act
    await user.clear(telefono);
    await user.type(telefono, '3007654321');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('Miembro actualizado.');
    const [url, cuerpo] = mockPut.mock.calls[0];
    expect(url).toBe('/admin/miembros/1');
    expect(cuerpo).toMatchObject({ telefono: '3007654321', ciudad: 'Medellín', fecha_nacimiento: '1990-05-17', activo: true });
    expect(Object.keys(cuerpo).filter((k) => !EDITABLES.includes(k))).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Reemplaza 16 campos tecla por tecla: con toda la suite en paralelo se acerca a los 5 s por defecto.
  test('should send every field when the person changes the whole file', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const ficha_ = within(ficha());
    const reemplazar = async (etiqueta, texto) => {
      const el = ficha_.getByLabelText(etiqueta);
      await user.clear(el);
      await user.type(el, texto);
    };

    // Act
    await reemplazar('Nombre completo', 'Ana María Pérez');
    await reemplazar('Documento', '1020304051');
    await reemplazar('Email', 'anamaria@correo.co');
    await user.selectOptions(ficha_.getByLabelText('Tipo de documento'), 'CE');
    await reemplazar('Fecha de nacimiento', '1991-06-18');
    await user.selectOptions(ficha_.getByLabelText('Género'), 'Otro');
    await reemplazar('Ciudad', 'Cali');
    await reemplazar('Dirección', 'Carrera 7 # 8-9');
    await reemplazar('Contacto de emergencia', 'Pedro Pérez');
    await reemplazar('Teléfono de emergencia', '3120000000');
    await reemplazar('Condiciones médicas', 'Asma');
    await reemplazar('Alergias', 'Polen');
    await user.selectOptions(ficha_.getByLabelText('Objetivo'), 'Resistencia');
    await user.selectOptions(ficha_.getByLabelText('Nivel de experiencia'), 'Avanzado');
    await reemplazar('Observaciones', 'Prefiere las clases de la tarde');
    await user.click(ficha_.getByRole('checkbox', { name: 'Miembro activo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/miembros/1', expect.objectContaining({
      nombre: 'Ana María Pérez', documento: '1020304051', email: 'anamaria@correo.co', tipo_documento: 'CE',
      fecha_nacimiento: '1991-06-18', genero: 'Otro', ciudad: 'Cali', direccion: 'Carrera 7 # 8-9',
      contacto_emergencia: 'Pedro Pérez', telefono_emergencia: '3120000000', condiciones_medicas: 'Asma', alergias: 'Polen',
      objetivo: 'Resistencia', nivel_experiencia: 'Avanzado', observaciones: 'Prefiere las clases de la tarde', activo: false,
    })));
  }, 15000);

  test('should send the empty email so the API clears it when the person deletes it in the file', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act
    await user.clear(within(ficha()).getByRole('textbox', { name: 'Email' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert: el updateSchema del backend convierte '' en null
    expect(await screen.findByRole('status')).toHaveTextContent('Miembro actualizado.');
    expect(mockPut.mock.calls[0][1]).toHaveProperty('email', '');
  });

  test('should still show the code as text when the QR image cannot be drawn', async () => {
    // Arrange
    dibujarQr = async () => { throw new Error('Canvas no disponible'); };

    // Act
    await abrirFichaDeAna();

    // Assert
    expect(within(ficha()).queryByRole('img', { name: 'Código QR de Ana Pérez' })).not.toBeInTheDocument();
    expect(within(ficha()).getByText('QR-ANA')).toBeInTheDocument();
    expect(within(ficha()).getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
    expect(within(ficha()).getByText('PARCIAL')).toBeInTheDocument();
  });

  test('should close the file without saving when the X of the dialog is clicked', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Cerrar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should close the file without saving when the person clicks Cancelar', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should keep the file open with the API error when saving fails', async () => {
    // Arrange
    mockPut = vi.fn(async () => { throw { status: 409, code: 'DUPLICATE_DOCUMENT', message: 'Ya existe un miembro con ese documento.' }; });
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await within(ficha()).findByRole('alert')).toHaveTextContent('Ya existe un miembro con ese documento.');
  });

  test('should explain the error when the full record cannot be loaded', async () => {
    // Arrange
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => {
      if (url === '/admin/miembros/1') throw { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar el miembro. Intenta de nuevo.' };
      return getNormal(url);
    });
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });

    // Act
    await user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));

    // Assert
    expect(await within(ficha()).findByRole('alert')).toHaveTextContent('No pudimos cargar el miembro. Intenta de nuevo.');
  });
});

describe('MiembrosPage: el plan y el cobro', () => {
  test('should move the API date one day back when new Date() reads it in this zone (control of the zone)', () => {
    // Act y Assert (control): si la zona no quedo fijada, los tests de fechas no probarian nada
    expect(new Date(PLAN.fecha_inicio).toLocaleDateString('es-CO')).toBe('30/9/2026');
  });

  test('should show and save the plan dates without moving them one day when the browser is in Colombia', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Assert: el 1 de octubre sigue siendo el 1 de octubre
    expect(within(ficha()).getByRole('textbox', { name: 'Inicio' })).toHaveValue('01/10/2026');
    expect(within(ficha()).getByRole('textbox', { name: /^Vence/ })).toHaveValue('31/10/2026');

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Guardar plan' }));

    // Assert
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/miembros/1/plan', expect.objectContaining({
      fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', proxima_fecha_cobro: '2026-11-01',
    })));
  });

  test('should move the end date and suggest the gym price when the plan type changes', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act
    await user.selectOptions(within(ficha()).getByRole('combobox', { name: 'Tipo de plan' }), 'TRIMESTRAL');

    // Assert: 90 dias desde el 1 de octubre y el precio trimestral de la configuracion
    expect(within(ficha()).getByRole('textbox', { name: /^Vence/ })).toHaveValue('30/12/2026');
    expect(within(ficha()).getByRole('spinbutton', { name: 'Valor del plan' })).toHaveValue(240000);
    expect(within(ficha()).getByText('PARCIAL')).toBeInTheDocument();
  });

  test('should mark the plan as paid when the payment covers the price', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const pagado = within(ficha()).getByRole('spinbutton', { name: 'Valor pagado' });

    // Act
    await user.clear(pagado);
    await user.type(pagado, '90000');

    // Assert
    expect(await within(ficha()).findByText('PAGADO')).toBeInTheDocument();
  });

  test('should not save the plan when the payment is higher than the price', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const pagado = within(ficha()).getByRole('spinbutton', { name: 'Valor pagado' });
    await user.clear(pagado);
    await user.type(pagado, '120000');

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Guardar plan' }));

    // Assert
    expect(within(ficha()).getByText('Lo pagado no puede superar el valor del plan.')).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should save the price, method, reference and dates when the person types them in the plan', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const ficha_ = within(ficha());

    // Act
    await user.clear(ficha_.getByRole('textbox', { name: /^Inicio/ }));
    await user.type(ficha_.getByRole('textbox', { name: /^Inicio/ }), '05102026');
    await user.clear(ficha_.getByRole('textbox', { name: /^Vence/ }));
    await user.type(ficha_.getByRole('textbox', { name: /^Vence/ }), '04112026');
    await user.clear(ficha_.getByRole('spinbutton', { name: 'Valor del plan' }));
    await user.type(ficha_.getByRole('spinbutton', { name: 'Valor del plan' }), '95000');
    await user.selectOptions(ficha_.getByRole('combobox', { name: 'Método de pago' }), 'NEQUI');
    await user.type(ficha_.getByRole('textbox', { name: 'Referencia o comprobante' }), 'NQ-778');
    await user.click(ficha_.getByRole('button', { name: 'Guardar plan' }));

    // Assert
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/miembros/1/plan', expect.objectContaining({
      fecha_inicio: '2026-10-05', fecha_fin: '2026-11-04', valor_total: 95000, metodo_pago: 'NEQUI', referencia_pago: 'NQ-778',
    })));
  });

  test.each([
    ['the start date does not exist', { inicio: '31022026' }, 'La fecha de inicio no es valida. Usa DD/MM/AAAA.'],
    ['the end date does not exist', { vence: '31112026' }, 'La fecha de vencimiento no es valida. Usa DD/MM/AAAA.'],
    ['the end is before the start', { vence: '30092026' }, 'El vencimiento no puede ser anterior al inicio.'],
  ])('should not save the plan and explain it when %s', async (_caso, { inicio, vence }, mensaje) => {
    // Arrange: el plan va del 01/10/2026 al 31/10/2026
    const { user } = await abrirFichaDeAna();
    const ficha_ = within(ficha());
    if (inicio) {
      await user.clear(ficha_.getByRole('textbox', { name: /^Inicio/ }));
      await user.type(ficha_.getByRole('textbox', { name: /^Inicio/ }), inicio);
    }
    if (vence) {
      await user.clear(ficha_.getByRole('textbox', { name: /^Vence/ }));
      await user.type(ficha_.getByRole('textbox', { name: /^Vence/ }), vence);
    }

    // Act
    await user.click(ficha_.getByRole('button', { name: 'Guardar plan' }));

    // Assert
    expect(ficha_.getByText(mensaje)).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should send 0 as the price and the payment when the person leaves them empty', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const ficha_ = within(ficha());
    await user.clear(ficha_.getByRole('spinbutton', { name: 'Valor del plan' }));
    await user.clear(ficha_.getByRole('spinbutton', { name: 'Valor pagado' }));

    // Act
    await user.click(ficha_.getByRole('button', { name: 'Guardar plan' }));

    // Assert
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/miembros/1/plan', expect.objectContaining({ valor_total: 0, valor_pagado: 0 })));
  });

  test('should confirm and reload the plan and the list when the plan is saved', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const llamadasAntes = mockGet.mock.calls.length;

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Guardar plan' }));

    // Assert
    expect(await within(ficha()).findByText('Plan actualizado.')).toBeInTheDocument();
    const nuevas = mockGet.mock.calls.slice(llamadasAntes).map(([u]) => u);
    expect(nuevas).toEqual(expect.arrayContaining(['/admin/miembros/1/plan', '/admin/miembros']));
  });
});

describe('MiembrosPage: los errores de la ficha', () => {
  test('should explain it and hide the plan editor when the plan cannot be loaded', async () => {
    // Arrange
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => {
      if (url === '/admin/miembros/1/plan') throw { status: 503, message: 'Sin base' };
      return getNormal(url);
    });
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });

    // Act
    await user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));

    // Assert
    expect(await within(ficha()).findByText('No pudimos cargar el plan de este miembro.')).toBeInTheDocument();
    expect(within(ficha()).queryByRole('heading', { name: 'Plan y cobro' })).not.toBeInTheDocument();
  });

  test('should show the API error when the plan cannot be saved', async () => {
    // Arrange
    mockPut = vi.fn(async () => { throw { status: 400, code: 'VALIDATION_ERROR', message: 'La fecha de fin no es valida.' }; });
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Guardar plan' }));

    // Assert
    expect(await within(ficha()).findByText('La fecha de fin no es valida.')).toBeInTheDocument();
  });

  test('should show the API error when the contract cannot be sent', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 503, code: 'WHATSAPP_DOWN', message: 'WhatsApp no responde.' }; });
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Enviar contrato' }));

    // Assert
    expect(await within(ficha()).findByRole('alert')).toHaveTextContent('WhatsApp no responde.');
  });

  test('should say that only the admin can freeze when the person is the reception', async () => {
    // Arrange
    rol = 'receptionist';

    // Act
    await abrirFichaDeAna();

    // Assert
    expect(within(ficha()).getByText('Solo el administrador puede congelar o descongelar la membresía.')).toBeInTheDocument();
    expect(within(ficha()).queryByRole('button', { name: 'Congelar membresía' })).not.toBeInTheDocument();
  });
});

describe('MiembrosPage: congelar la membresia', () => {
  test('should freeze the membership with the reason when the user confirms', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost = vi.fn(async () => ({ data: { message: 'Membresía congelada desde hoy.' } }));
    const { user } = await abrirFichaDeAna();

    // Act
    await user.type(within(ficha()).getByRole('textbox', { name: 'Motivo del congelamiento' }), '  Viaje  ');
    await user.click(within(ficha()).getByRole('button', { name: 'Congelar membresía' }));

    // Assert
    expect(await within(ficha()).findByText('Membresía congelada desde hoy.')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/admin/miembros/1/congelar', { motivo: 'Viaje' });
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  test('should not freeze the membership when the user cancels the confirmation', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Congelar membresía' }));

    // Assert
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('should unfreeze without asking when the membership is frozen', async () => {
    // Arrange
    plan = { ...PLAN, congelado_desde: '2026-10-20T00:00:00.000Z', dias_congelado: 8 };
    congelaciones = [
      { id_congelacion: 3, fecha_inicio: '2026-08-01T00:00:00.000Z', fecha_fin: '2026-08-15T00:00:00.000Z', dias: 14, motivo: 'Incapacidad' },
      { id_congelacion: 4, fecha_inicio: '2026-10-20T00:00:00.000Z', fecha_fin: null, dias: null, motivo: 'Viaje' },
    ];
    vi.spyOn(window, 'confirm');
    const { user } = await abrirFichaDeAna();
    expect(within(ficha()).getByText(/Congelada desde el 20\/10\/2026 \(8 días\)/)).toBeInTheDocument();
    expect(within(ficha()).getByText('1/8/2026 → 15/8/2026 (14 días) · Incapacidad')).toBeInTheDocument();
    expect(within(ficha()).getByText('20/10/2026 → sigue congelada · Viaje')).toBeInTheDocument();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Descongelar membresía' }));

    // Assert
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/miembros/1/descongelar', {}));
    expect(within(ficha()).getByText('Membresía descongelada.')).toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  test('should say día in singular and name who froze and unfroze when the history has them', async () => {
    // Arrange: congelada desde ayer y una congelacion vieja de un dia, sin motivo
    plan = { ...PLAN, congelado_desde: '2026-10-30T00:00:00.000Z', dias_congelado: 1 };
    congelaciones = [
      { id_congelacion: 7, fecha_inicio: '2026-09-01T00:00:00.000Z', fecha_fin: '2026-09-02T00:00:00.000Z', dias: 1, motivo: '', congelada_por: 'Ana Admin', descongelada_por: 'Luis Recepción' },
      { id_congelacion: 8, fecha_inicio: '2026-10-30T00:00:00.000Z', fecha_fin: null, dias: null, motivo: null, congelada_por: null, descongelada_por: null },
    ];

    // Act
    await abrirFichaDeAna();

    // Assert
    expect(within(ficha()).getByText(/Congelada desde el 30\/10\/2026 \(1 día\)\./)).toBeInTheDocument();
    expect(within(ficha()).getByText('1/9/2026 → 2/9/2026 (1 día) · congeló Ana Admin, descongeló Luis Recepción')).toBeInTheDocument();
    expect(within(ficha()).getByText('30/10/2026 → sigue congelada')).toBeInTheDocument();
  });

  test('should show the error of the API when the membership cannot be frozen', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost = vi.fn(async () => { throw { status: 409, code: 'ALREADY_FROZEN', message: 'La membresía ya está congelada.' }; });
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Congelar membresía' }));

    // Assert
    expect(await within(ficha()).findByText('La membresía ya está congelada.')).toBeInTheDocument();
  });
});

describe('MiembrosPage: el QR y el contrato', () => {
  test('should copy the QR code and confirm it on the button when Copiar is clicked', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    const escribir = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Copiar código' }));

    // Assert
    expect(escribir).toHaveBeenCalledWith('QR-ANA');
    expect(await within(ficha()).findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });

  test('should ask to copy the code by hand when the browser blocks the clipboard', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'));

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Copiar código' }));

    // Assert
    expect(await within(ficha()).findByRole('alert')).toHaveTextContent('Tu navegador bloqueó el portapapeles. Copia el código a mano.');
  });

  test('should confirm the phone when the contract is sent by WhatsApp', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: { exito: true, telefono: '573001234567', cliente_listo: true } }));
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Enviar contrato' }));

    // Assert
    expect(await within(ficha()).findByRole('status')).toHaveTextContent('Contrato enviado al 573001234567.');
    expect(mockPost).toHaveBeenCalledWith('/admin/miembros/1/contrato/enviar', { version: 'v1' });
  });

  test('should warn that WhatsApp is not linked when the server client is not ready', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: { exito: false, cliente_listo: false } }));
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Enviar contrato' }));

    // Assert
    expect(await within(ficha()).findByRole('alert')).toHaveTextContent('El cliente de WhatsApp no esta autenticado en el servidor.');
  });
});

describe('MiembrosPage: el aviso por WhatsApp de la lista', () => {
  test('should open the chat with the message of the server and record it without opening the file when WhatsApp is clicked', async () => {
    // Arrange
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('row', { name: /Carlos Ruiz/ });

    // Act
    await user.click(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Avisar' }));

    // Assert
    expect(abrir).toHaveBeenCalledWith(
      `https://wa.me/573109876543?text=${encodeURIComponent(CARLOS.whatsapp.mensaje)}`, '_blank', 'noopener,noreferrer',
    );
    // El registro guarda tambien el texto que se abrio en WhatsApp (RQF-09, #73).
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', {
      idMiembro: 2, canal: 'WHATSAPP', tipo: 'vencida', mensaje: CARLOS.whatsapp.mensaje,
    }));
    expect(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/no pudimos registrar el envío/)).not.toBeInTheDocument();
  });

  test('should warn that the sending was not recorded when the chat opens but the record fails', async () => {
    // Arrange
    vi.spyOn(window, 'open').mockReturnValue(null);
    mockPost = vi.fn(async () => { throw { status: 503, code: 'DB_UNREACHABLE', message: 'Sin conexion.' }; });
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('row', { name: /Carlos Ruiz/ });

    // Act
    await user.click(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Avisar' }));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Se abrió WhatsApp, pero no pudimos registrar el envío a Carlos Ruiz.',
    );
    expect(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Enviado' })).toBeInTheDocument();
  });

  test('should say there is no phone instead of a button when the member has no valid phone', async () => {
    // Arrange
    const sinTelefono = { ...CARLOS, whatsapp: { ...CARLOS.whatsapp, telefono: null } };
    mockGet = vi.fn(async (url) => (url === '/admin/config' ? { data: { config: {} } } : { data: { miembros: [sinTelefono] } }));

    // Act
    renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });

    // Assert
    const fila = await screen.findByRole('row', { name: /Carlos Ruiz/ });
    expect(within(fila).getByText('Sin teléfono')).toBeInTheDocument();
    expect(within(fila).queryByRole('button', { name: 'Avisar' })).not.toBeInTheDocument();
  });
});
