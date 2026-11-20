/**
 * Cobertura del front (Luis): HitosConfig, los hitos que se otorgan solos en el
 * check-in (RQF-11): la lista con su tipo y meta, crear uno, activarlo o
 * desactivarlo, y los errores del API.
 *
 * El API se simula con vi.mock; las filas tienen la forma de GET /api/admin/hitos.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import HitosConfig from '../src/components/HitosConfig';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPost, mockPut;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a), put: (...a) => mockPut(...a) } }));

const SEMANA = { id_hito: 1, nombre: 'Primera semana', tipo_hito: 'RACHA', valor_objetivo: 7, mensaje: '¡7 días seguidos!', activo: true };
const DIEZ = { id_hito: 2, nombre: 'Diez visitas', tipo_hito: 'TOTAL_ASISTENCIAS', valor_objetivo: 10, mensaje: 'Ya vas 10', activo: false };

let hitos;

const abrirHitos = () => renderWithProviders(<HitosConfig />, { route: '/admin/config' });
const filaDe = (nombre) => screen.getByText(nombre).closest('div');
const agregar = () => screen.getByRole('button', { name: 'Agregar hito' });

beforeEach(() => {
  hitos = [SEMANA, DIEZ];
  mockGet = vi.fn(async () => ({ data: { hitos } }));
  mockPost = vi.fn(async () => ({ data: { hito: { id_hito: 3 } } }));
  mockPut = vi.fn(async () => ({ data: {} }));
});

describe('HitosConfig: la lista', () => {
  test('should list each milestone with its type, goal and message and offer the opposite state', async () => {
    // Act
    abrirHitos();

    // Assert
    expect(await screen.findByText('Primera semana')).toBeInTheDocument();
    expect(filaDe('Primera semana')).toHaveTextContent('Racha (días seguidos): 7 · ¡7 días seguidos!');
    expect(within(filaDe('Primera semana')).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    expect(filaDe('Diez visitas')).toHaveTextContent('Total de asistencias: 10 · Ya vas 10');
    expect(within(filaDe('Diez visitas')).getByRole('button', { name: 'Activar' })).toBeInTheDocument();
  });

  test('should invite to create the first one when the gym has no milestones', async () => {
    // Arrange
    hitos = [];

    // Act
    abrirHitos();

    // Assert
    expect(await screen.findByText('Todavía no hay hitos. Crea el primero abajo.')).toBeInTheDocument();
  });

  test('should show the API error when the milestones cannot be loaded', async () => {
    // Arrange
    mockGet = vi.fn(async () => { throw { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos cargar los hitos. Intenta de nuevo.' }; });

    // Act
    abrirHitos();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los hitos. Intenta de nuevo.');
  });

  test('should send the opposite state and reload the list when a milestone is deactivated', async () => {
    // Arrange
    const { user } = abrirHitos();
    await screen.findByText('Primera semana');

    // Act
    await user.click(within(filaDe('Primera semana')).getByRole('button', { name: 'Desactivar' }));

    // Assert
    expect(mockPut).toHaveBeenCalledWith('/admin/hitos/1', { activo: false });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  test('should show the API error when the state cannot be changed', async () => {
    // Arrange
    mockPut = vi.fn(async () => { throw { status: 404, code: 'NOT_FOUND', message: 'Ese hito ya no existe.' }; });
    const { user } = abrirHitos();
    await screen.findByText('Diez visitas');

    // Act
    await user.click(within(filaDe('Diez visitas')).getByRole('button', { name: 'Activar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese hito ya no existe.');
    expect(mockPut).toHaveBeenCalledWith('/admin/hitos/2', { activo: true });
  });
});

describe('HitosConfig: crear un hito', () => {
  test('should keep Agregar hito disabled until the name and the message have text', async () => {
    // Arrange
    const { user } = abrirHitos();
    await screen.findByText('Primera semana');

    // Act y Assert
    expect(agregar()).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), '   ');
    await user.type(screen.getByRole('textbox', { name: 'Mensaje que ve el miembro' }), 'Bien');
    expect(agregar()).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Un mes');
    expect(agregar()).toBeEnabled();
  });

  test('should send the goal as a number, reload the list and empty the form when the milestone is created', async () => {
    // Arrange
    const { user } = abrirHitos();
    await screen.findByText('Primera semana');
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Veinte visitas');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'Total de asistencias');
    await user.clear(screen.getByRole('spinbutton', { name: 'Meta' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Meta' }), '20');
    await user.type(screen.getByRole('textbox', { name: 'Mensaje que ve el miembro' }), '¡20 visitas!');

    // Act
    await user.click(agregar());

    // Assert
    expect(mockPost).toHaveBeenCalledWith('/admin/hitos', {
      nombre: 'Veinte visitas', tipo_hito: 'TOTAL_ASISTENCIAS', valor_objetivo: 20, mensaje: '¡20 visitas!',
    });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue(''));
    expect(screen.getByRole('spinbutton', { name: 'Meta' })).toHaveValue(7);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  test('should show the API error and keep what was typed when the milestone already exists', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 409, code: 'HITO_DUPLICADO', message: 'Ya existe un hito de ese tipo con ese valor.' }; });
    const { user } = abrirHitos();
    await screen.findByText('Primera semana');
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Otra semana');
    await user.type(screen.getByRole('textbox', { name: 'Mensaje que ve el miembro' }), 'Repetido');

    // Act
    await user.click(agregar());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un hito de ese tipo con ese valor.');
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Otra semana');
    expect(agregar()).toBeEnabled();
  });
});
