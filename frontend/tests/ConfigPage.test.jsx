/**
 * Cobertura del front (Luis): ConfigPage desde lo que hace el administrador:
 * ver los precios, recordatorios y umbrales de abandono del gimnasio, cambiar
 * y guardar, y los errores al cargar o guardar (RQF-14, RQF-08).
 *
 * El API se simula con vi.mock. Los precios llegan como texto ("90000.00"),
 * como los manda PostgreSQL por las columnas numeric. HitosConfig va dentro de
 * la pagina y aqui no tiene hitos (tiene su propio archivo de tests).
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import ConfigPage from '../src/pages/ConfigPage';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPut;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), put: (...a) => mockPut(...a), post: vi.fn() } }));

// GET /api/admin/config de un gimnasio con todo configurado.
const CONFIG = {
  id_gimnasio: 7,
  plan_mensual_valor: '90000.00',
  plan_trimestral_valor: '240000.00',
  plan_semestral_valor: '450000.00',
  plan_anual_valor: '850000.00',
  plan_clases_suelta_valor: '15000.00',
  plan_ilimitado_valor: '120000.00',
  recordatorio_cobro_activo: true,
  dias_recordatorio_default: 5,
  dias_aviso_vencimiento: 3,
  umbral_alerta_amarilla: 7,
  umbral_alerta_roja: 15,
  dias_prueba: 14,
};

let config;

function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/admin/config') return { data: { config } };
    if (url === '/admin/hitos') return { data: { hitos: [] } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const abrirConfig = () => renderWithProviders(<ConfigPage />, { route: '/admin/config' });
const cargada = () => screen.findByRole('heading', { name: 'Configuración del Gimnasio' });
const campo = (nombre) => screen.getByRole('spinbutton', { name: nombre });
const guardar = () => screen.getByRole('button', { name: 'Guardar Configuración' });

beforeEach(() => {
  config = { ...CONFIG };
  mockGet = apiQueResponde();
  mockPut = vi.fn(async (_url, cuerpo) => ({ data: { config: { ...CONFIG, ...cuerpo } } }));
});

describe('ConfigPage: ver la configuracion', () => {
  test('should show the prices, the reminders and the alert thresholds of the gym when the page loads', async () => {
    // Act
    abrirConfig();

    // Assert
    expect(screen.getByText('Cargando configuración...')).toBeInTheDocument();
    await cargada();
    expect(campo(/^Plan Mensual/)).toHaveValue(90000);
    expect(campo(/^Plan Trimestral/)).toHaveValue(240000);
    expect(campo(/^Plan Semestral/)).toHaveValue(450000);
    expect(campo(/^Plan Anual/)).toHaveValue(850000);
    expect(campo(/^Clases Sueltas/)).toHaveValue(15000);
    expect(campo(/^Plan Ilimitado/)).toHaveValue(120000);
    expect(screen.getByRole('checkbox', { name: 'Activar recordatorios de cobro' })).toBeChecked();
    expect(campo('Días antes del vencimiento')).toHaveValue(5);
    expect(campo(/^Aviso de vencimiento por WhatsApp/)).toHaveValue(3);
    expect(campo('Alerta amarilla (días sin venir)')).toHaveValue(7);
    expect(campo('Alerta roja (días sin venir)')).toHaveValue(15);
    expect(campo('Días de prueba para nuevos gimnasios')).toHaveValue(14);
    expect(mockGet).toHaveBeenCalledWith('/admin/config');
  });

  test('should show the API error when the configuration cannot be loaded', async () => {
    // Arrange
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => {
      if (url === '/admin/config') throw { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar la configuracion.' };
      return getNormal(url);
    });

    // Act
    abrirConfig();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la configuracion.');
  });

  test('should take the error away when Restablecer loads the configuration again', async () => {
    // Arrange: la primera carga falla y la segunda no
    const getNormal = apiQueResponde();
    let fallar = true;
    mockGet = vi.fn(async (url) => {
      if (url === '/admin/config' && fallar) throw { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar la configuracion.' };
      return getNormal(url);
    });
    const { user } = abrirConfig();
    await screen.findByRole('alert');
    fallar = false;

    // Act
    await user.click(screen.getByRole('button', { name: 'Restablecer' }));

    // Assert
    await waitFor(() => expect(campo(/^Plan Mensual/)).toHaveValue(90000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ConfigPage: guardar', () => {
  test('should not send and explain the rule when the red alert is not greater than the yellow one', async () => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();
    await user.clear(campo('Alerta roja (días sin venir)'));
    await user.type(campo('Alerta roja (días sin venir)'), '7');

    // Act
    await user.click(guardar());

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('La alerta roja debe ser mayor que la amarilla.');
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should send the new values and confirm when the configuration is valid', async () => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();
    await user.clear(campo(/^Plan Mensual/));
    await user.type(campo(/^Plan Mensual/), '95000');
    await user.clear(campo('Alerta amarilla (días sin venir)'));
    await user.type(campo('Alerta amarilla (días sin venir)'), '10');
    await user.clear(campo('Alerta roja (días sin venir)'));
    await user.type(campo('Alerta roja (días sin venir)'), '20');

    // Act
    await user.click(guardar());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Configuración guardada exitosamente.');
    expect(mockPut).toHaveBeenCalledWith('/admin/config', expect.objectContaining({
      plan_mensual_valor: 95000, plan_trimestral_valor: '240000.00', umbral_alerta_amarilla: 10, umbral_alerta_roja: 20, dias_prueba: 14,
    }));
  });

  test('should turn the reminder days off and send it when the reminders are deactivated', async () => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();

    // Act
    await user.click(screen.getByRole('checkbox', { name: 'Activar recordatorios de cobro' }));
    await user.click(guardar());

    // Assert
    expect(campo('Días antes del vencimiento')).toBeDisabled();
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/config', expect.objectContaining({ recordatorio_cobro_activo: false })));
  });

  test('should keep the WhatsApp notice at 30 days at most when the admin types more', async () => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();
    const aviso = campo(/^Aviso de vencimiento por WhatsApp/);

    // Act
    await user.clear(aviso);
    await user.type(aviso, '45');
    await user.click(guardar());

    // Assert
    expect(aviso).toHaveValue(30);
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/config', expect.objectContaining({ dias_aviso_vencimiento: 30 })));
  });

  test('should let the admin replace a days value and save its default when the field is left empty', async () => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();
    await user.clear(campo('Días antes del vencimiento'));
    await user.type(campo('Días antes del vencimiento'), '10');

    // Act: los dias de prueba se dejan vacios
    await user.clear(campo('Días de prueba para nuevos gimnasios'));
    await user.click(guardar());

    // Assert
    expect(campo('Días antes del vencimiento')).toHaveValue(10);
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/config', expect.objectContaining({ dias_recordatorio_default: 10, dias_prueba: 7 })));
  });

  test.each([
    ['Días antes del vencimiento', 'dias_recordatorio_default', 7],
    ['Alerta amarilla (días sin venir)', 'umbral_alerta_amarilla', 1],
  ])('should save the default of "%s" when the field is left empty', async (nombre, clave, defecto) => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();
    await user.clear(campo(nombre));

    // Act
    await user.click(guardar());

    // Assert
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/config', expect.objectContaining({ [clave]: defecto })));
  });

  test('should check the rule with the minimum 2 when the red alert is left empty', async () => {
    // Arrange: la amarilla vale 7 y la roja vacia se guardaria como 2
    const { user } = abrirConfig();
    await cargada();
    await user.clear(campo('Alerta roja (días sin venir)'));

    // Act
    await user.click(guardar());

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('La alerta roja debe ser mayor que la amarilla.');
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should turn off the WhatsApp notice when the field is left empty', async () => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();

    // Act
    await user.clear(campo(/^Aviso de vencimiento por WhatsApp/));
    await user.click(guardar());

    // Assert
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/config', expect.objectContaining({ dias_aviso_vencimiento: 0 })));
  });

  test('should send the six plan prices as numbers when the admin types them', async () => {
    // Arrange
    const { user } = abrirConfig();
    await cargada();
    const precios = [
      [/^Plan Mensual/, '95000', 'plan_mensual_valor'],
      [/^Plan Trimestral/, '250000', 'plan_trimestral_valor'],
      [/^Plan Semestral/, '470000', 'plan_semestral_valor'],
      [/^Plan Anual/, '880000', 'plan_anual_valor'],
      [/^Clases Sueltas/, '16000', 'plan_clases_suelta_valor'],
      [/^Plan Ilimitado/, '125000', 'plan_ilimitado_valor'],
    ];

    // Act
    for (const [nombre, valor] of precios) {
      await user.clear(campo(nombre));
      await user.type(campo(nombre), valor);
    }
    await user.click(guardar());

    // Assert
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/config', expect.objectContaining(
      Object.fromEntries(precios.map(([, valor, clave]) => [clave, Number(valor)])),
    )));
  });

  test('should show the API error and keep the values when saving fails', async () => {
    // Arrange
    mockPut = vi.fn(async () => { throw { status: 400, code: 'VALIDATION_ERROR', message: 'Los días de recordatorio deben estar entre 1 y 30.' }; });
    const { user } = abrirConfig();
    await cargada();

    // Act
    await user.click(guardar());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Los días de recordatorio deben estar entre 1 y 30.');
    expect(campo(/^Plan Mensual/)).toHaveValue(90000);
    expect(guardar()).toBeEnabled();
  });
});
