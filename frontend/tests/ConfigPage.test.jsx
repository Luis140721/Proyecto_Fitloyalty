import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ConfigPage from '../src/pages/ConfigPage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../src/api', () => ({ api: mocks }));

const config = {
  plan_mensual_valor: 99000,
  plan_trimestral_valor: 270000,
  plan_semestral_valor: 500000,
  plan_anual_valor: 900000,
  plan_clases_suelta_valor: 12000,
  plan_ilimitado_valor: 1500000,
  recordatorio_cobro_activo: true,
  dias_recordatorio_default: 5,
  dias_prueba: 14,
};

function renderConfigPage() {
  return render(<ConfigPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: { config: { ...config } } });
  mocks.put.mockImplementation((_path, updated) => Promise.resolve({ data: { config: updated } }));
});

afterEach(cleanup);

describe('ConfigPage', () => {
  test('carga los precios y la configuración inicial de recordatorios', async () => {
    renderConfigPage();

    expect(await screen.findByRole('heading', { name: /configuración del gimnasio/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/plan mensual/i)).toHaveValue(99000);
    expect(screen.getByLabelText(/plan anual/i)).toHaveValue(900000);
    expect(screen.getByLabelText(/activar recordatorios de cobro/i)).toBeChecked();
    expect(screen.getByLabelText(/días antes del vencimiento/i)).toHaveValue(5);
    expect(mocks.get).toHaveBeenCalledWith('/admin/config');
  });

  test('actualiza valores y confirma que la configuración fue guardada', async () => {
    const user = userEvent.setup();
    renderConfigPage();
    await screen.findByRole('heading', { name: /configuración del gimnasio/i });

    await user.clear(screen.getByLabelText(/plan mensual/i));
    await user.type(screen.getByLabelText(/plan mensual/i), '105000');
    await user.click(screen.getByRole('button', { name: /guardar configuración/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/configuración guardada exitosamente/i);
    expect(mocks.put).toHaveBeenCalledWith('/admin/config', {
      ...config,
      plan_mensual_valor: 105000,
    });
  });

  test('deshabilita los días de recordatorio y conserva valores mínimos al limpiar campos', async () => {
    const user = userEvent.setup();
    renderConfigPage();
    await screen.findByRole('heading', { name: /configuración del gimnasio/i });

    const enabled = screen.getByLabelText(/activar recordatorios de cobro/i);
    const days = screen.getByLabelText(/días antes del vencimiento/i);
    expect(days).toBeEnabled();
    await user.clear(days);
    expect(days).toHaveValue(7);
    await user.click(enabled);
    expect(days).toBeDisabled();
    expect(screen.getByLabelText(/días de prueba para nuevos gimnasios/i)).toHaveValue(14);
  });

  test('restablece los valores cargándolos otra vez y muestra errores del servidor', async () => {
    const user = userEvent.setup();
    renderConfigPage();
    await screen.findByRole('heading', { name: /configuración del gimnasio/i });

    await user.clear(screen.getByLabelText(/plan mensual/i));
    await user.type(screen.getByLabelText(/plan mensual/i), '1');
    await user.click(screen.getByRole('button', { name: /restablecer/i }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText(/plan mensual/i)).toHaveValue(99000);

    mocks.put.mockRejectedValueOnce(new Error('No se pudo guardar en el servidor.'));
    await user.click(screen.getByRole('button', { name: /guardar configuración/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo guardar en el servidor/i);
  });

  test('expone el error de carga si no se puede recuperar la configuración', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Configuración no disponible.'));
    renderConfigPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/configuración no disponible/i);
    expect(screen.getByRole('heading', { name: /configuración del gimnasio/i })).toBeInTheDocument();
  });
});
