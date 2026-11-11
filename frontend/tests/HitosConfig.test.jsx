import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import HitosConfig from '../src/components/HitosConfig';
import { api } from '../src/api';
import { renderWithProviders } from './renderWithProviders';

describe('HitosConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('lista hitos y crea uno con meta numérica antes de recargar', async () => {
    const get = vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ data: { hitos: [{ id_hito: 3, nombre: 'Racha', tipo_hito: 'RACHA', valor_objetivo: 7, mensaje: 'Bien', activo: true }] } })
      .mockResolvedValueOnce({ data: { hitos: [] } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    const { user } = renderWithProviders(<HitosConfig />);

    expect(await screen.findByText('Racha')).toBeInTheDocument();
    expect(screen.getByText('Racha (días seguidos): 7 · Bien')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'Asistencia');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'TOTAL_ASISTENCIAS');
    await user.clear(screen.getByLabelText('Meta'));
    await user.type(screen.getByLabelText('Meta'), '12');
    await user.type(screen.getByLabelText('Mensaje que ve el miembro'), 'Sigue así');
    await user.click(screen.getByRole('button', { name: /Agregar hito/ }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/hitos', {
      nombre: 'Asistencia',
      tipo_hito: 'TOTAL_ASISTENCIAS',
      valor_objetivo: 12,
      mensaje: 'Sigue así',
    }));
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Todavía no hay hitos. Crea el primero abajo.')).toBeInTheDocument();
  });

  test('expone errores de actualización y creación y permite activar hitos inactivos', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { hitos: [{ id_hito: 9, nombre: 'Total', tipo_hito: 'OTRO', valor_objetivo: 20, mensaje: 'Meta', activo: false }] } });
    const put = vi.spyOn(api, 'put').mockRejectedValue(new Error('No se pudo activar'));
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('No se pudo crear'));
    const { user } = renderWithProviders(<HitosConfig />);

    expect(await screen.findByText('Total')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element.tagName === 'SMALL' && element.textContent.includes('20 · Meta'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Activar' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/hitos/9', { activo: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo activar');

    await user.type(screen.getByLabelText('Nombre'), 'Otro');
    await user.type(screen.getByLabelText('Mensaje que ve el miembro'), 'Prueba');
    await user.click(screen.getByRole('button', { name: /Agregar hito/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo crear');
    expect(post).toHaveBeenCalledOnce();
  });

  test('muestra el error al cargar los hitos', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('No disponible'));
    renderWithProviders(<HitosConfig />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No disponible');
  });

  test('mantiene deshabilitado el envío hasta que nombre y mensaje tengan contenido', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { hitos: [] } });
    const post = vi.spyOn(api, 'post');
    const { user } = renderWithProviders(<HitosConfig />);
    const submit = screen.getByRole('button', { name: /Agregar hito/ });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Nombre'), '  Hito  ');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Mensaje que ve el miembro'), 'Mensaje');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(post).toHaveBeenCalledWith('/admin/hitos', expect.objectContaining({ valor_objetivo: 7 }));
  });
});
