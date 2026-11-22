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
import { StrictMode } from 'react';
import { describe, expect, test, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { act, fireEvent, screen, within, waitFor } from '@testing-library/react';
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
  // RQNF-17 (#102): la autorizacion de datos sensibles y los datos del representante legal.
  'autorizo_datos_sensibles', 'autoriza_representante', 'representante_nombre', 'representante_tipo_documento',
  'representante_documento', 'representante_parentesco', 'representante_telefono',
  // RQNF-16 (#108): la aceptacion de mensajes comerciales y sus canales (updateSchema de routes/miembros.js).
  // La API los acepta, pero la ficha solo los manda si la decision se cambio en ella.
  'acepta_mensajes_comerciales', 'canales_comerciales',
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
    // RQNF-16: la decision sobre los mensajes comerciales no se toco en esta ficha, asi que no viaja:
    // guardar otro campo no registra una aceptacion ni una baja que nadie decidio.
    expect(cuerpo).not.toHaveProperty('acepta_mensajes_comerciales');
    expect(cuerpo).not.toHaveProperty('canales_comerciales');
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
    // Con el #102, las condiciones medicas y las alergias se escriben despues de autorizar los datos sensibles.
    await user.click(ficha_.getByRole('checkbox', { name: /^Datos sensibles \(salud\)/ }));
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
      autorizo_datos_sensibles: true,
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
  /** La pestaña en blanco que abre el clic, como la usa src/lib/contactoWhatsapp.js. */
  const pestanaEnBlanco = () => ({ closed: false, opener: window, location: { replace: vi.fn() }, close: vi.fn() });
  // Un miembro en riesgo: escribirle es un mensaje de retencion, o sea comercial (Ley 2300).
  const LUISA = {
    id_miembro: 3, nombre: 'Luisa Gómez', documento: '52999888', telefono: '3001112233', codigo_qr: 'QR-LUISA', activo: true, enRiesgo: true,
    whatsapp: { motivo: 'riesgo', telefono: '573001112233', mensaje: 'Hola Luisa, en Gimnasio Central te extrañamos.' },
  };
  const abrirListaCon = async (...miembros) => {
    mockGet = vi.fn(async (url) => (url === '/admin/config' ? { data: { config: {} } } : { data: { miembros } }));
    const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('row', { name: new RegExp(miembros[0].nombre) });
    return pantalla;
  };

  // RQNF-16 (#108): antes el chat se abria con el texto de la lista y despues se registraba. Ahora
  // el clic abre una pestaña en blanco, se registra (antesDeAbrir) y la pestaña va a wa.me con el
  // texto que devuelve el servidor: en un aviso del plan, el de su plantilla.
  test('should record the sending first and open the chat with the message of the server without opening the file when WhatsApp is clicked', async () => {
    // Arrange: el texto del servidor es distinto del de la lista, para saber cual se abre
    const DEL_SERVIDOR = 'Hola Carlos, tu plan en Gimnasio Central venció hace 3 días. Renuévalo cuando quieras.';
    const ventana = pestanaEnBlanco();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => ({
      data: { message: 'Envio registrado.', envio: { id_envio: 70, estado: 'ENVIADO' }, mensaje: DEL_SERVIDOR, clase: 'AVISO', texto_del_servidor: true },
    }));
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('row', { name: /Carlos Ruiz/ });

    // Act
    await user.click(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Avisar' }));

    // Assert
    expect(await within(filaDe('Carlos Ruiz')).findByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    // El registro lleva el texto de la lista (RQF-09, #73) y avisa que el chat todavia no se abrio.
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', {
      idMiembro: 2, canal: 'WHATSAPP', tipo: 'vencida', mensaje: CARLOS.whatsapp.mensaje, antesDeAbrir: true,
    });
    expect(ventana.location.replace).toHaveBeenCalledTimes(1);
    expect(ventana.location.replace).toHaveBeenCalledWith(`https://wa.me/573109876543?text=${encodeURIComponent(DEL_SERVIDOR)}`);
    expect(mockPost.mock.invocationCallOrder[0]).toBeLessThan(ventana.location.replace.mock.invocationCallOrder[0]);
    expect(ventana.opener).toBeNull();
    expect(ventana.close).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/No se abrió WhatsApp/)).not.toBeInTheDocument();
  });

  // RQNF-16: el escenario viejo («se abrio WhatsApp pero no quedo registrado», con el boton en
  // «Enviado») ya no existe: sin registro no se abre el chat. Este es el equivalente.
  test('should not open the chat and warn that the sending could not be recorded when the record fails', async () => {
    // Arrange
    const ventana = pestanaEnBlanco();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => { throw { status: 503, code: 'DB_UNREACHABLE', message: 'Sin conexion.' }; });
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('row', { name: /Carlos Ruiz/ });

    // Act
    await user.click(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Avisar' }));

    // Assert
    expect(within(await screen.findByRole('status')).getByText(
      'No se abrió WhatsApp porque no pudimos registrar el envío a Carlos Ruiz. Intenta de nuevo.',
    )).toBeInTheDocument();
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Avisar' })).toBeInTheDocument();
    expect(within(filaDe('Carlos Ruiz')).queryByRole('button', { name: 'Enviado' })).not.toBeInTheDocument();
  });

  test('should not open the chat and say why when the member at risk has not accepted commercial messages', async () => {
    // Arrange: el 409 de POST /admin/notificaciones/enviado para un mensaje de retencion sin aceptacion
    const ventana = pestanaEnBlanco();
    vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => {
      throw { status: 409, code: 'CONTACTO_NO_PERMITIDO', message: 'Luisa no ha aceptado recibir mensajes comerciales del gimnasio.' };
    });
    const { user } = await abrirListaCon(LUISA);

    // Act
    await user.click(within(filaDe('Luisa Gómez')).getByRole('button', { name: 'Avisar' }));

    // Assert
    expect(within(await screen.findByRole('status')).getByText(
      'No se abrió WhatsApp: Luisa no ha aceptado recibir mensajes comerciales del gimnasio.',
    )).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', {
      idMiembro: 3, canal: 'WHATSAPP', tipo: 'riesgo', mensaje: LUISA.whatsapp.mensaje, antesDeAbrir: true,
    });
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);
    expect(within(filaDe('Luisa Gómez')).getByRole('button', { name: 'Avisar' })).toBeInTheDocument();
  });

  test('should open the chat with the unsubscribe link the server adds when the member at risk accepted commercial messages', async () => {
    // Arrange
    const PIE_BAJA = '\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: https://panel.fitloyalty.test/baja/3.7.firma';
    const ventana = pestanaEnBlanco();
    vi.spyOn(window, 'open').mockReturnValue(ventana);
    mockPost = vi.fn(async () => ({
      data: { message: 'Envio registrado.', envio: { id_envio: 71, estado: 'ENVIADO' }, mensaje: `${LUISA.whatsapp.mensaje}${PIE_BAJA}`, clase: 'COMERCIAL', texto_del_servidor: false },
    }));
    const { user } = await abrirListaCon(LUISA);

    // Act
    await user.click(within(filaDe('Luisa Gómez')).getByRole('button', { name: 'Avisar' }));

    // Assert
    expect(await within(filaDe('Luisa Gómez')).findByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(ventana.location.replace).toHaveBeenCalledWith(
      `https://wa.me/573001112233?text=${encodeURIComponent(`${LUISA.whatsapp.mensaje}${PIE_BAJA}`)}`,
    );
    expect(screen.queryByText(/No se abrió WhatsApp/)).not.toBeInTheDocument();
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

/*
 * Arreglo del #108 (RQNF-16 y RQNF-17). Mientras GET /admin/miembros/:id no responde bien, el
 * formulario de la ficha es la fila de la lista: sin ciudad, sin autorizaciones y con los mensajes
 * comerciales apagados. Guardarla asi vaciaba campos y le registraba al miembro una baja de los
 * mensajes comerciales que nadie decidio. Ahora la ficha solo se guarda con el registro completo, y
 * la respuesta tardia de una ficha anterior (o ya cerrada) no toca la que esta en pantalla.
 */
describe('MiembrosPage: la ficha solo se guarda con el registro completo', () => {
  // Ana ya habia aceptado mensajes comerciales por WhatsApp: eso solo viene en el registro completo.
  const ANA_ACEPTO = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'], autorizo_datos_sensibles: false };
  const CARLOS_COMPLETO = {
    ...CARLOS, tipo_documento: 'CC', fecha_nacimiento: '1985-02-03T00:00:00.000Z', genero: 'Masculino', codigo_pais_telefono: '57',
    ciudad: 'Cali', direccion: 'Carrera 5 # 6-7', contacto_emergencia: 'Rosa Ruiz', telefono_emergencia: '3125556677',
    condiciones_medicas: '', alergias: '', objetivo: '', nivel_experiencia: '', observaciones: '',
    acepta_mensajes_comerciales: false, canales_comerciales: [], autorizo_datos_sensibles: false,
  };
  const ERROR_503 = { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar el miembro. Intenta de nuevo.' };
  const CARGANDO = 'Cargando los datos completos del miembro…';
  const SIN_REGISTRO = 'No se cargaron los datos completos del miembro, así que no se pueden guardar cambios. Cierra la ficha y vuelve a abrirla.';

  const guardar = () => screen.getByRole('button', { name: 'Guardar cambios' });
  const fichaDe = (nombre) => screen.getByRole('dialog', { name: `Editar ${nombre}` });
  /** Lo que hace Enter en un campo: enviar el formulario al que pertenece el boton, sin pasar por el. */
  const enviarFormulario = async () => {
    fireEvent.submit(guardar().form);
    await act(async () => {});
  };

  /** El registro completo de cada miembro lo responde, o lo hace fallar, el test cuando quiera. */
  const conRegistrosPendientes = () => {
    const registros = {};
    const getNormal = apiQueResponde();
    mockGet = vi.fn((url) => {
      const pedido = /^\/admin\/miembros\/(\d+)$/.exec(url);
      if (pedido) {
        return new Promise((resolve, reject) => {
          registros[pedido[1]] = { responder: (miembro) => resolve({ data: { miembro, autorizaciones: null } }), fallar: reject };
        });
      }
      if (url === '/admin/miembros/2/plan') return Promise.resolve({ data: { plan: null, congelaciones: [] } });
      return getNormal(url);
    });
    return registros;
  };
  const abrirLista = async () => {
    const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('row', { name: /Ana Pérez/ });
    return pantalla;
  };

  test('should keep Guardar cambios disabled and send nothing when the form is submitted while the full record is still loading', async () => {
    // Arrange
    conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    const ficha_ = within(fichaDe('Ana Pérez'));
    expect(ficha_.getByText(CARGANDO)).toBeInTheDocument();

    // Act: un clic en el boton y un Enter en el formulario
    await user.click(guardar());
    await enviarFormulario();

    // Assert
    expect(guardar()).toBeDisabled();
    expect(mockPut).not.toHaveBeenCalled();
    expect(ficha_.getByText(CARGANDO)).toBeInTheDocument();
    // Todavia no fallo nada: el aviso de que no se cargo es para cuando la carga falla.
    expect(ficha_.queryByRole('status')).not.toBeInTheDocument();
  });

  test('should keep Guardar cambios disabled, say why and send nothing when the full record cannot be loaded', async () => {
    // Arrange
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    const ficha_ = within(fichaDe('Ana Pérez'));

    // Act: la carga falla; despues, un clic en el boton y un Enter en el formulario
    await act(async () => registros[1].fallar(ERROR_503));
    await user.click(guardar());
    await enviarFormulario();

    // Assert
    expect(ficha_.getByRole('alert')).toHaveTextContent('No pudimos cargar el miembro. Intenta de nuevo.');
    expect(within(ficha_.getByRole('status')).getByText(SIN_REGISTRO)).toBeInTheDocument();
    expect(ficha_.queryByText(CARGANDO)).not.toBeInTheDocument();
    expect(guardar()).toBeDisabled();
    // Ningun PUT: en especial, ninguno que le apague los mensajes comerciales a quien los habia aceptado.
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should enable Guardar cambios and save the data of the full record when it arrives', async () => {
    // Arrange
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    const ficha_ = within(fichaDe('Ana Pérez'));
    expect(guardar()).toBeDisabled();

    // Act: llega el registro completo
    await act(async () => registros[1].responder(ANA_ACEPTO));
    await ficha_.findByRole('heading', { name: 'Plan y cobro' });

    // Assert
    expect(guardar()).toBeEnabled();
    expect(ficha_.queryByText(CARGANDO)).not.toBeInTheDocument();
    expect(ficha_.queryByRole('status')).not.toBeInTheDocument();

    // Act
    await user.click(guardar());

    // Assert: viaja lo del registro completo (la ciudad, la direccion y la fecha no vienen en la lista)
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [url, cuerpo] = mockPut.mock.calls[0];
    expect(url).toBe('/admin/miembros/1');
    expect(cuerpo).toMatchObject({
      nombre: 'Ana Pérez', ciudad: 'Medellín', direccion: 'Calle 10 # 20-30', fecha_nacimiento: '1990-05-17', contacto_emergencia: 'Luz Pérez',
    });
    // La aceptacion comercial de Ana no se toco en esta ficha: no viaja.
    expect(cuerpo).not.toHaveProperty('acepta_mensajes_comerciales');
    expect(cuerpo).not.toHaveProperty('canales_comerciales');
  });

  test('should save when Enter submits the form and the full record is loaded', async () => {
    // Arrange
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await act(async () => registros[1].responder(ANA_ACEPTO));
    await within(fichaDe('Ana Pérez')).findByRole('heading', { name: 'Plan y cobro' });

    // Act
    await enviarFormulario();

    // Assert
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [url, cuerpo] = mockPut.mock.calls[0];
    expect(url).toBe('/admin/miembros/1');
    expect(cuerpo).toMatchObject({ nombre: 'Ana Pérez', ciudad: 'Medellín', fecha_nacimiento: '1990-05-17' });
    expect(cuerpo).not.toHaveProperty('acepta_mensajes_comerciales');
    expect(cuerpo).not.toHaveProperty('canales_comerciales');
  });

  test('should treat it as a failed load and not let the file be saved when the server answers without the member', async () => {
    // Arrange: un 200 sin `miembro`. Antes la ficha quedaba «completa» con la fila de la lista.
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => (url === '/admin/miembros/1' ? { data: { autorizaciones: null } } : getNormal(url)));
    const { user } = await abrirLista();

    // Act
    await user.click(filaDe('Ana Pérez'));
    const ficha_ = within(fichaDe('Ana Pérez'));
    const error = await ficha_.findByRole('alert');
    await user.click(guardar());
    await enviarFormulario();

    // Assert
    expect(error).toHaveTextContent('No pudimos cargar los datos completos del miembro.');
    expect(within(ficha_.getByRole('status')).getByText(SIN_REGISTRO)).toBeInTheDocument();
    expect(ficha_.queryByText(CARGANDO)).not.toBeInTheDocument();
    expect(guardar()).toBeDisabled();
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockGet.mock.calls.map(([url]) => url)).not.toContain('/admin/miembros/1/plan');
  });

  // Hueco que encontro la revision: en los tests de este bloque la primera ficha nunca llegaba a cargar.
  // Aqui la de Ana carga completa (queda lista para guardar) y despues se abre la de Carlos: lo que
  // habilito la ficha de Ana no puede habilitar la de Carlos.
  test.each([
    ['cancelled', async (user) => { await user.click(screen.getByRole('button', { name: 'Cancelar' })); }, []],
    ['saved', async (user) => { await user.click(guardar()); await screen.findByText('Miembro actualizado.'); }, ['/admin/miembros/1']],
  ])('should keep Guardar cambios disabled while the next file loads and after its load fails when the previous file was fully loaded and then %s', async (_caso, cerrarLaDeAna, guardados) => {
    // Arrange: la ficha de Ana carga completa y se cierra
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await act(async () => registros[1].responder(ANA_ACEPTO));
    await within(fichaDe('Ana Pérez')).findByRole('heading', { name: 'Plan y cobro' });
    expect(guardar()).toBeEnabled();
    await cerrarLaDeAna(user);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Act: se abre la de Carlos, que todavia no carga; un clic en el boton y un Enter en el formulario
    await user.click(filaDe('Carlos Ruiz'));
    const ficha_ = within(fichaDe('Carlos Ruiz'));
    await user.click(guardar());
    await enviarFormulario();

    // Assert
    expect(ficha_.getByText(CARGANDO)).toBeInTheDocument();
    expect(guardar()).toBeDisabled();
    expect(mockPut.mock.calls.map(([url]) => url)).toEqual(guardados);

    // Act: la carga de Carlos falla; otro clic y otro Enter
    await act(async () => registros[2].fallar(ERROR_503));
    await user.click(guardar());
    await enviarFormulario();

    // Assert: sigue sin poder guardarse, y a Carlos no le llego ningun PUT
    expect(within(ficha_.getByRole('status')).getByText(SIN_REGISTRO)).toBeInTheDocument();
    expect(guardar()).toBeDisabled();
    expect(mockPut.mock.calls.map(([url]) => url)).toEqual(guardados);
  });

  test('should leave the second file untouched when the answer of the first one arrives after another file was opened', async () => {
    // Arrange: se abre la ficha de Ana, se cierra sin esperar y se abre la de Carlos
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(filaDe('Carlos Ruiz'));
    await act(async () => registros[2].responder(CARLOS_COMPLETO));
    const ficha_ = within(fichaDe('Carlos Ruiz'));
    await ficha_.findByRole('heading', { name: 'Plan y cobro' });

    // Act: llega tarde el registro de Ana
    await act(async () => registros[1].responder(ANA_ACEPTO));

    // Assert: sigue siendo la ficha de Carlos, con sus datos
    expect(screen.queryByRole('dialog', { name: 'Editar Ana Pérez' })).not.toBeInTheDocument();
    expect(ficha_.getByLabelText('Nombre completo')).toHaveValue('Carlos Ruiz');
    expect(ficha_.getByRole('textbox', { name: 'Ciudad' })).toHaveValue('Cali');
    expect(mockGet.mock.calls.map(([url]) => url)).not.toContain('/admin/miembros/1/plan');

    // Act
    await user.click(guardar());

    // Assert: se guarda a Carlos con lo de Carlos, y sin la aceptacion comercial de Ana (ni la suya, que no se toco)
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [url, cuerpo] = mockPut.mock.calls[0];
    expect(url).toBe('/admin/miembros/2');
    expect(cuerpo).toMatchObject({
      nombre: 'Carlos Ruiz', documento: '79888777', ciudad: 'Cali', direccion: 'Carrera 5 # 6-7', fecha_nacimiento: '1985-02-03',
    });
    expect(cuerpo).not.toHaveProperty('acepta_mensajes_comerciales');
    expect(cuerpo).not.toHaveProperty('canales_comerciales');
  });

  test('should keep loading the second file when the answer of the first one arrives before its own', async () => {
    // Arrange
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(filaDe('Carlos Ruiz'));
    const ficha_ = within(fichaDe('Carlos Ruiz'));

    // Act: llega el registro de Ana; el de Carlos sigue en camino
    await act(async () => registros[1].responder(ANA_ACEPTO));

    // Assert: la ficha de Carlos sigue cargando, sin datos de Ana y sin poder guardarse
    expect(ficha_.getByText(CARGANDO)).toBeInTheDocument();
    expect(ficha_.queryByRole('status')).not.toBeInTheDocument();
    expect(ficha_.getByLabelText('Nombre completo')).toHaveValue('Carlos Ruiz');
    expect(ficha_.getByRole('textbox', { name: 'Ciudad' })).toHaveValue('');
    expect(guardar()).toBeDisabled();

    // Act: llega el de Carlos
    await act(async () => registros[2].responder(CARLOS_COMPLETO));

    // Assert
    expect(await ficha_.findByRole('heading', { name: 'Plan y cobro' })).toBeInTheDocument();
    expect(ficha_.getByRole('textbox', { name: 'Ciudad' })).toHaveValue('Cali');
    expect(guardar()).toBeEnabled();
  });

  test('should not show the error of the first file in the second one when the first one fails after another file was opened', async () => {
    // Arrange
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(filaDe('Carlos Ruiz'));
    await act(async () => registros[2].responder(CARLOS_COMPLETO));
    const ficha_ = within(fichaDe('Carlos Ruiz'));
    await ficha_.findByRole('heading', { name: 'Plan y cobro' });

    // Act: falla tarde el registro de Ana
    await act(async () => registros[1].fallar(ERROR_503));

    // Assert
    expect(ficha_.queryByRole('alert')).not.toBeInTheDocument();
    expect(ficha_.queryByRole('status')).not.toBeInTheDocument();
    expect(ficha_.getByRole('textbox', { name: 'Ciudad' })).toHaveValue('Cali');
    expect(guardar()).toBeEnabled();
  });

  test('should stay closed and ask for nothing else when the answer of a file arrives after the file was closed', async () => {
    // Arrange: se abre la ficha de Ana y se cierra con la X antes de que cargue
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(within(fichaDe('Ana Pérez')).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Act
    await act(async () => registros[1].responder(ANA_ACEPTO));

    // Assert: no se reabre ni sigue con el plan de esa ficha
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockGet.mock.calls.map(([url]) => url)).not.toContain('/admin/miembros/1/plan');
  });

  test('should load the file again from scratch when it is reopened after a late answer was thrown away', async () => {
    // Arrange: la primera respuesta de Ana llega con la ficha ya cerrada
    const registros = conRegistrosPendientes();
    const { user } = await abrirLista();
    await user.click(filaDe('Ana Pérez'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    const primera = registros[1];
    await act(async () => primera.responder({ ...ANA_ACEPTO, ciudad: 'Bogotá' }));

    // Act: se vuelve a abrir y esta vez si se espera
    await user.click(filaDe('Ana Pérez'));
    const ficha_ = within(fichaDe('Ana Pérez'));
    expect(ficha_.getByText(CARGANDO)).toBeInTheDocument();
    expect(guardar()).toBeDisabled();
    expect(registros[1]).not.toBe(primera);
    await act(async () => registros[1].responder(ANA_ACEPTO));

    // Assert: manda la respuesta de esta apertura, no la que se descarto
    expect(await ficha_.findByRole('heading', { name: 'Plan y cobro' })).toBeInTheDocument();
    expect(ficha_.getByRole('textbox', { name: 'Ciudad' })).toHaveValue('Medellín');
    expect(guardar()).toBeEnabled();
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/miembros/1')).toHaveLength(2);
  });
});

/*
 * Arreglo del #108: «Copiado» vuelve a «Copiar código» a los 2 s, y ese timer se cancela al cerrar la
 * ficha o salir de la pagina. Antes seguia vivo con la pagina ya desmontada y, si el archivo de tests
 * habia terminado, Vitest marcaba la corrida con error («window is not defined»).
 */
describe('MiembrosPage: el aviso «Copiado» del QR', () => {
  afterEach(() => vi.useRealTimers());

  const copiar = async () => {
    fireEvent.click(within(ficha()).getByRole('button', { name: /^(Copiar código|Copiado)$/ }));
    await act(async () => {});
    expect(within(ficha()).getByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  };

  /**
   * Abre la ficha de Ana y copia el codigo, con timers falsos para setTimeout (los clics van con
   * fireEvent, como en CheckinPage.ramas.test.jsx). Antes de copiar deja pasar 100 ms para que corran
   * los timers de entrada (la pagina y el foco del dialogo): asi el unico pendiente es el de «Copiado».
   */
  const abrirFichaYCopiar = async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await act(async () => {});
    fireEvent.click(screen.getByRole('row', { name: /Ana Pérez/ }));
    await act(async () => {});
    act(() => vi.advanceTimersByTime(100));
    expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await copiar();
    expect(vi.getTimerCount()).toBe(1);
    return pantalla;
  };

  test('should turn the button back to Copiar código by itself when 2 seconds pass with the file still open', async () => {
    // Arrange
    await abrirFichaYCopiar();

    // Act
    act(() => vi.advanceTimersByTime(1999));
    const antes = within(ficha()).queryByRole('button', { name: 'Copiado' });
    act(() => vi.advanceTimersByTime(1));

    // Assert
    expect(antes).not.toBeNull();
    expect(within(ficha()).getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
    expect(within(ficha()).queryByRole('button', { name: 'Copiado' })).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('should keep Copiado 2 seconds from the last copy when the code is copied again before it goes away', async () => {
    // Arrange: ha pasado 1 s desde la primera copia
    await abrirFichaYCopiar();
    act(() => vi.advanceTimersByTime(1000));

    // Act: se copia otra vez y pasan casi 2 s
    await copiar();
    const timersDelAviso = vi.getTimerCount();
    act(() => vi.advanceTimersByTime(1999));
    const antes = within(ficha()).queryByRole('button', { name: 'Copiado' });
    act(() => vi.advanceTimersByTime(1));

    // Assert: el timer de la primera copia no devuelve el boton antes de tiempo, ni queda suelto
    expect(timersDelAviso).toBe(1);
    expect(antes).not.toBeNull();
    expect(within(ficha()).getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
  });

  test.each([
    ['Cancelar', () => screen.getByRole('button', { name: 'Cancelar' })],
    ['the X of the dialog', () => within(ficha()).getByRole('button', { name: 'Cerrar' })],
  ])('should leave no timer pending when the file is closed with %s right after copying', async (_caso, botonDeCerrar) => {
    // Arrange
    await abrirFichaYCopiar();

    // Act
    fireEvent.click(botonDeCerrar());

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('should leave no Copiado timer pending when the file is saved right after copying', async () => {
    // Arrange
    await abrirFichaYCopiar();

    // Act: se guarda la ficha y pasa 1 s, lo que tarda en irse la onda del boton (700 ms)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await act(async () => {});
    act(() => vi.advanceTimersByTime(1000));

    // Assert: a «Copiado» le quedaba 1 s, pero su timer se cancelo al guardar
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('should leave no timer pending when the person leaves the page right after copying', async () => {
    // Arrange
    const { unmount } = await abrirFichaYCopiar();

    // Act
    unmount();

    // Assert: antes el timer seguia vivo 2 s mas, con la pagina ya desmontada
    expect(vi.getTimerCount()).toBe(0);
  });

  /** Abre la ficha de Ana con timers falsos y pulsa «Copiar código», pero el portapapeles no contesta hasta que el test lo diga. */
  const abrirFichaYEmpezarACopiar = async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await act(async () => {});
    fireEvent.click(screen.getByRole('row', { name: /Ana Pérez/ }));
    await act(async () => {});
    act(() => vi.advanceTimersByTime(100));
    let terminarCopia;
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise((resolve) => { terminarCopia = resolve; }));
    fireEvent.click(within(ficha()).getByRole('button', { name: 'Copiar código' }));
    await act(async () => {});
    expect(vi.getTimerCount()).toBe(0);
    return { ...pantalla, terminarCopia: () => act(async () => terminarCopia()) };
  };

  test('should create no timer when the copy finishes after the person left the page', async () => {
    // Arrange: el portapapeles todavia no contesto
    const { unmount, terminarCopia } = await abrirFichaYEmpezarACopiar();

    // Act: la persona sale de la pagina y despues termina la copia
    unmount();
    await terminarCopia();

    // Assert: antes se creaba aqui el timer de «Copiado», con la pagina ya desmontada
    expect(vi.getTimerCount()).toBe(0);
  });

  test('should show Copiado and start its 2 seconds when the copy finishes with the file still open', async () => {
    // Arrange
    const { terminarCopia } = await abrirFichaYEmpezarACopiar();
    expect(within(ficha()).getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();

    // Act
    await terminarCopia();

    // Assert: la guarda de «ya salio de la pagina» no estorba cuando la pagina sigue abierta
    expect(within(ficha()).getByRole('button', { name: 'Copiado' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
  });

  test('should show Copiado when the page runs inside StrictMode, as the app does', async () => {
    // Arrange: src/main.jsx monta la app en <StrictMode>, que en desarrollo monta cada pagina, la
    // desmonta y la vuelve a montar. La pagina no puede quedarse creyendo que ya salieron de ella.
    const { user } = renderWithProviders(<StrictMode><MiembrosPage /></StrictMode>, { route: '/admin/miembros' });
    await user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));
    await within(ficha()).findByRole('heading', { name: 'Plan y cobro' });
    const escribir = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    // Act
    await user.click(within(ficha()).getByRole('button', { name: 'Copiar código' }));

    // Assert
    expect(await within(ficha()).findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
    expect(escribir).toHaveBeenCalledWith('QR-ANA');
  });

  /** Para abrir despues la ficha de Carlos: su registro completo y sin plan. */
  const conLaFichaDeCarlos = () => {
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => {
      if (url === '/admin/miembros/2') return { data: { miembro: { ...CARLOS, tipo_documento: 'CC', ciudad: 'Cali' }, autorizaciones: null } };
      if (url === '/admin/miembros/2/plan') return { data: { plan: null, congelaciones: [] } };
      return getNormal(url);
    });
  };
  const abrirFichaDeCarlos = async () => {
    fireEvent.click(screen.getByRole('row', { name: /Carlos Ruiz/ }));
    await act(async () => {});
    return within(screen.getByRole('dialog', { name: 'Editar Carlos Ruiz' }));
  };

  // Los timers falsos no avanzan solos: si «Copiado» no se limpia al cambiar de ficha, sigue ahi.
  test.each([
    ['cancelled', () => screen.getByRole('button', { name: 'Cancelar' })],
    ['saved', () => screen.getByRole('button', { name: 'Guardar cambios' })],
  ])('should offer Copiar código in the next file when the previous one was %s right after copying', async (_caso, botonQueCierra) => {
    // Arrange: «Copiado» en la ficha de Ana, con sus 2 s en marcha
    conLaFichaDeCarlos();
    await abrirFichaYCopiar();
    fireEvent.click(botonQueCierra());
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Act: se abre la de Carlos antes de que pasen los 2 s
    const fichaDeCarlos = await abrirFichaDeCarlos();

    // Assert
    expect(fichaDeCarlos.getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
    expect(fichaDeCarlos.queryByRole('button', { name: 'Copiado' })).not.toBeInTheDocument();
  });

  test('should offer Copiar código in the next file when the copy of the previous one finished after it was closed', async () => {
    // Arrange: se pulsa copiar en la ficha de Ana y se cierra antes de que el portapapeles conteste
    conLaFichaDeCarlos();
    const { terminarCopia } = await abrirFichaYEmpezarACopiar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await terminarCopia();

    // Act
    const fichaDeCarlos = await abrirFichaDeCarlos();

    // Assert: el «Copiado» que llego tarde era de la ficha de Ana
    expect(fichaDeCarlos.getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
    expect(fichaDeCarlos.queryByRole('button', { name: 'Copiado' })).not.toBeInTheDocument();
  });
});
