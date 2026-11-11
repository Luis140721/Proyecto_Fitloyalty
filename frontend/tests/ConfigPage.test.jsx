import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ConfigPage from '../src/pages/ConfigPage';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../src/api', () => ({
  api: {
    get: (...args) => mocks.get(...args),
    put: (...args) => mocks.put(...args),
  },
}));

vi.mock('../src/components/Ripple', () => ({ default: () => () => {} }));
vi.mock('../src/components/HitosConfig', () => ({ default: () => <div>Hitos de gamificación</div> }));

const config = {
  plan_mensual_valor: 50000,
  plan_trimestral_valor: 135000,
  plan_semestral_valor: 250000,
  plan_anual_valor: 450000,
  plan_clases_suelta_valor: 10000,
  plan_ilimitado_valor: 80000,
  recordatorio_cobro_activo: true,
  dias_recordatorio_default: 7,
  dias_aviso_vencimiento: 3,
  umbral_alerta_amarilla: 7,
  umbral_alerta_roja: 15,
  dias_prueba: 7,
};

describe('ConfigPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.get.mockReset().mockResolvedValue({ data: { config: { ...config } } });
    mocks.put.mockReset();
  });

  test('carga precios, recordatorios y valores de alertas', async () => {
    const { user } = renderWithProviders(<ConfigPage />, { route: '/admin/config' });

    expect(await screen.findByRole('heading', { name: 'Configuración del Gimnasio' })).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/admin/config');
    expect(screen.getByDisplayValue('50000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('450000')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Activar recordatorios de cobro/ })).toBeChecked();
    expect(screen.getByLabelText('Alerta amarilla (días sin venir)')).toHaveValue(7);
    expect(screen.getByLabelText('Alerta roja (días sin venir)')).toHaveValue(15);
    expect(screen.getByText('Hitos de gamificación')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Activar recordatorios de cobro/ }));
    expect(screen.getByRole('checkbox', { name: /Activar recordatorios de cobro/ })).not.toBeChecked();
  });

  test('rechaza umbral rojo menor o igual al amarillo sin enviar cambios', async () => {
    const { user } = renderWithProviders(<ConfigPage />, { route: '/admin/config' });
    await screen.findByRole('heading', { name: 'Configuración del Gimnasio' });
    fireEvent.change(screen.getByLabelText('Alerta roja (días sin venir)'), { target: { value: '7' } });

    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La alerta roja debe ser mayor que la amarilla.');
    expect(mocks.put).not.toHaveBeenCalled();
  });

  test('guarda configuración válida y presenta el mensaje de éxito', async () => {
    mocks.put.mockResolvedValue({ data: { config: { ...config, plan_mensual_valor: 60000 } } });
    const { user } = renderWithProviders(<ConfigPage />, { route: '/admin/config' });
    await screen.findByRole('heading', { name: 'Configuración del Gimnasio' });
    fireEvent.change(screen.getByDisplayValue('50000'), { target: { value: '60000' } });

    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(
      '/admin/config',
      expect.objectContaining({ plan_mensual_valor: 60000 }),
    ));
    expect(await screen.findByRole('alert')).toHaveTextContent('Configuración guardada exitosamente.');
    expect(screen.getByDisplayValue('60000')).toBeInTheDocument();
  });

  test('muestra errores al cargar o guardar la configuración', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Servicio no disponible'));
    const { user } = renderWithProviders(<ConfigPage />, { route: '/admin/config' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible');

    mocks.put.mockRejectedValueOnce(new Error('No se pudo guardar'));
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
  });
});
