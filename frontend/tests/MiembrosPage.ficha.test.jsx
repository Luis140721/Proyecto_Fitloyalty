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
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,UVI=' } }));

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
  test('should run in the time zone where new Date() moves the API date one day back', () => {
    // Control: si la zona no quedo fijada, los tests de fechas no probarian nada
    expect(new Date(PLAN.fecha_inicio).toLocaleDateString('es-CO')).toBe('30/9/2026');
  });

  test('should show and save the plan dates of the API without moving them one day in Colombia', async () => {
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

describe('MiembrosPage: congelar la membresia', () => {
  test('should freeze the membership with the reason after the user confirms', async () => {
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

  test('should show the freeze error of the API', async () => {
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
  test('should copy the QR code and confirm it on the button', async () => {
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
  test('should open the chat with the message of the server and record it without opening the file', async () => {
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
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/notificaciones/enviado', { idMiembro: 2, canal: 'WHATSAPP', tipo: 'vencida' }));
    expect(within(filaDe('Carlos Ruiz')).getByRole('button', { name: 'Enviado' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
