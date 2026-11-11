import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MiembrosPage from '../src/pages/MiembrosPage';
import { api } from '../src/api';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr'),
  user: { role: 'admin' },
}));

vi.mock('../src/api', () => ({
  api: {
    get: (...args) => mocks.get(...args),
    post: (...args) => mocks.post(...args),
    put: (...args) => mocks.put(...args),
    delete: (...args) => mocks.delete(...args),
  },
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: (...args) => mocks.toDataURL(...args) },
  toDataURL: (...args) => mocks.toDataURL(...args),
}));

vi.mock('react-datepicker', () => ({
  default: (props) => <input {...props} />,
  registerLocale: vi.fn(),
}));

vi.mock('../src/components/Ripple', () => ({
  default: () => () => {},
}));

const memberRows = [
  {
    id_miembro: 1,
    nombre: 'Ana Activa',
    documento: 'CC10001',
    telefono: '3001234567',
    email: 'ana@example.com',
    codigo_qr: 'FL-42-ANA123',
    activo: true,
  },
  {
    id_miembro: 2,
    nombre: 'Bruno Congelado',
    documento: 'CC10002',
    telefono: '3001234568',
    codigo_qr: 'FL-42-BRU123',
    activo: true,
    congelada: true,
  },
  {
    id_miembro: 3,
    nombre: 'Carla Inactiva',
    documento: 'CC10003',
    telefono: '3001234569',
    codigo_qr: 'FL-42-CAR123',
    activo: false,
  },
];

function respondToReads({ isFrozen = () => false } = {}) {
  mocks.get.mockImplementation((path) => {
    if (path === '/admin/config') return Promise.resolve({ data: { config: {} } });
    if (path === '/admin/miembros') {
      return Promise.resolve({ data: { miembros: memberRows, total: memberRows.length } });
    }
    if (path === '/admin/miembros/1') {
      return Promise.resolve({
        data: {
          miembro: {
            ...memberRows[0],
            tipo_documento: 'CC',
            fecha_nacimiento: '1990-05-10',
            ciudad: 'Bogotá',
            app_acceso: true,
          },
        },
      });
    }
    if (path === '/admin/miembros/1/plan') {
      return Promise.resolve({
        data: {
          plan: {
            tipo_plan: 'MENSUAL',
            fecha_inicio: '2026-11-01',
            fecha_fin: '2026-12-01',
            valor_total: 50000,
            valor_pagado: 0,
            metodo_pago: 'EFECTIVO',
            estado_pago: 'PENDIENTE',
            congelado_desde: isFrozen() ? '2026-11-01' : null,
            dias_congelado: isFrozen() ? 9 : 0,
          },
          congelaciones: [],
        },
      });
    }
    return Promise.reject(new Error(`GET inesperado: ${path}`));
  });
}

describe('MiembrosPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.put.mockReset();
    mocks.delete.mockReset();
    mocks.toDataURL.mockReset().mockResolvedValue('data:image/png;base64,qr');
    mocks.user = { role: 'admin' };
    respondToReads();
  });

  test('carga miembros, filtra por estado y envía la búsqueda a la API', async () => {
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    expect(await screen.findByRole('heading', { name: 'Miembros' })).toBeInTheDocument();
    expect(screen.getAllByText('Ana Activa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bruno Congelado').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: /Congelado/ }));
    expect(screen.getAllByText('Bruno Congelado').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ana Activa')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Todos/ }));
    await user.type(screen.getByRole('textbox', { name: 'Buscar miembros' }), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/admin/miembros', {
      params: { q: 'Ana', pageSize: 100, includeInactive: false },
    }));
    expect(screen.getAllByRole('tab').length).toBe(7);
  });

  test('valida el alta por secciones y crea un miembro con fechas y términos válidos', async () => {
    mocks.post.mockResolvedValue({
      data: {
        miembro: {
          id_miembro: 44,
          nombre: 'Daniel Nuevo',
          documento: 'CC45678',
          telefono: '3001234567',
          codigo_qr: 'FL-42-NEW123',
        },
      },
    });
    mocks.put.mockResolvedValue({ data: { ok: true } });
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('heading', { name: 'Miembros' });
    await user.click(screen.getAllByRole('button', { name: /Nuevo miembro/ })[0]);

    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Escribe el nombre del miembro.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el número de documento.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el teléfono.')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Nombre y apellido'), 'Daniel Nuevo');
    await user.type(screen.getByPlaceholderText('123456789'), 'CC45678');
    await user.type(screen.getByPlaceholderText('3001234567'), '3001234567');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByRole('heading', { name: 'Salud y emergencia' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Contacto de emergencia'), 'Contacto');
    await user.type(screen.getByLabelText('Teléfono emergencia'), '3001111222');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByRole('heading', { name: /Plan y COBROS/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Valor total del plan *'));
    await user.type(screen.getByLabelText('Valor total del plan *'), '80000');
    await user.clear(screen.getByLabelText('Valor pagado hoy'));
    await user.type(screen.getByLabelText('Valor pagado hoy'), '25000');
    expect(screen.getByLabelText('Estado del pago')).toHaveValue('PARCIAL');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByRole('heading', { name: 'Información adicional' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Objetivo principal'), 'Ganar músculo');
    await user.selectOptions(screen.getByLabelText('Nivel de experiencia'), 'Principiante');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByRole('heading', { name: 'Términos y condiciones' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Acepto los términos y condiciones/ }));
    await user.click(screen.getByRole('checkbox', { name: /Autorizo el uso de mis datos/ }));
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/miembros', expect.objectContaining({
      nombre: 'Daniel Nuevo',
      documento: 'CC45678',
      estado_pago: 'PARCIAL',
      valor_total: '80000',
      valor_pagado: '25000',
      fecha_inicio: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      fecha_fin: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      contacto_emergencia: 'Contacto',
      telefono_emergencia: '3001111222',
      objetivo: 'Ganar músculo',
      nivel_experiencia: 'Principiante',
      acepto_terminos: true,
      autorizo_datos: true,
    })));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith('/admin/miembros/44', {
      qr_imagen: 'data:image/png;base64,qr',
    }));

    const successDialog = within(await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' }));
    expect(successDialog.getByText('Daniel Nuevo')).toBeInTheDocument();
    expect(successDialog.getByRole('img', { name: 'Código QR del miembro' })).toHaveAttribute('src', 'data:image/png;base64,qr');
  });

  test('muestra errores al cargar y al crear, y permite cancelar la creación', async () => {
    mocks.get.mockRejectedValue(new Error('API no disponible'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    expect(await screen.findByRole('alert')).toHaveTextContent('API no disponible');
    await user.click(screen.getAllByRole('button', { name: /Nuevo miembro/ })[0]);
    expect(screen.getByRole('heading', { name: 'Nuevo miembro' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cerrar/ }));
    expect(screen.queryByRole('heading', { name: 'Nuevo miembro' })).not.toBeInTheDocument();
  });

  test('abre la ficha completa, guarda datos personales y actualiza el plan de cobro', async () => {
    mocks.put.mockResolvedValue({ data: { ok: true } });
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('heading', { name: 'Miembros' });
    await user.click(screen.getAllByText('Ana Activa')[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Editar Ana Activa' });
    expect(within(dialog).getByRole('img', { name: 'Código QR de Ana Activa' })).toHaveAttribute(
      'src',
      'data:image/png;base64,qr',
    );
    expect(within(dialog).getByText(/Cambia el plan, renueva el vencimiento/)).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Ciudad'));
    await user.type(within(dialog).getByLabelText('Ciudad'), 'Medellín');
    await user.click(within(dialog).getByRole('button', { name: /Guardar cambios/ }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(
      '/admin/miembros/1',
      expect.objectContaining({ nombre: 'Ana Activa', ciudad: 'Medellín' }),
    ));

    await user.click(screen.getAllByText('Ana Activa')[0]);
    const reopened = await screen.findByRole('dialog', { name: 'Editar Ana Activa' });
    fireEvent.change(within(reopened).getByLabelText('Valor del plan'), { target: { value: '90000' } });
    fireEvent.change(within(reopened).getByLabelText('Valor pagado'), { target: { value: '90000' } });
    expect(await within(reopened).findByText('PAGADO')).toBeInTheDocument();
    await user.click(within(reopened).getByRole('button', { name: /Guardar plan/ }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(
      '/admin/miembros/1/plan',
      expect.objectContaining({
        tipo_plan: 'MENSUAL',
        valor_total: 90000,
        valor_pagado: 90000,
        metodo_pago: 'EFECTIVO',
      }),
    ));
  });

  test('confirma el congelamiento de membresía y permite descongelar cuando el usuario es admin', async () => {
    let frozen = false;
    respondToReads({ isFrozen: () => frozen });
    mocks.post.mockImplementation(async (path) => {
      frozen = path.endsWith('/congelar');
      return { data: { message: frozen ? 'Membresía congelada.' : 'Membresía descongelada.' } };
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await screen.findByRole('heading', { name: 'Miembros' });
    await user.click(screen.getAllByText('Ana Activa')[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Editar Ana Activa' });

    await user.type(within(dialog).getByLabelText('Motivo del congelamiento'), 'Viaje');
    await user.click(within(dialog).getByRole('button', { name: /Congelar membresía/ }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/miembros/1/congelar', { motivo: 'Viaje' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(await within(dialog).findByText(/Congelada desde el/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Descongelar membresía/ }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/miembros/1/descongelar', {}));
    expect(await within(dialog).findByRole('button', { name: /Congelar membresía/ })).toBeInTheDocument();
  });
});
