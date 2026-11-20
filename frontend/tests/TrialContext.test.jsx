/**
 * Cobertura del front (Luis): TrialProvider convierte GET /api/billing/trial-status
 * en lo que leen AdminLayout y DashboardPage: status (el reason de lib/trial.js),
 * active, expired, daysLeft y endsAt, y un estado seguro si el API falla.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrialProvider, useTrial } from '../src/context/TrialContext';

let mockGet;
vi.mock('../src/api', () => ({ api: { get: (...a) => mockGet(...a) } }));

/** Muestra el estado de la prueba como lo leeria una pantalla. */
function EstadoDePrueba() {
  const { trial, refresh } = useTrial();
  return (
    <>
      <p>Estado: {trial.status}</p>
      <p>{trial.active ? 'Activa' : 'Inactiva'} · {trial.expired ? 'vencida' : 'vigente'} · días: {String(trial.daysLeft)} · vence: {String(trial.endsAt)}</p>
      <button type="button" onClick={refresh}>Actualizar</button>
    </>
  );
}

const abrir = () => {
  const user = userEvent.setup();
  render(<TrialProvider><EstadoDePrueba /></TrialProvider>);
  return { user };
};

beforeEach(() => {
  mockGet = vi.fn(async () => ({
    data: { gym: { id: 7, name: 'Gimnasio Central', active: true }, trial: { active: true, expired: false, reason: 'trial-activo', daysLeft: 9, endsAt: '2026-11-28T15:00:00.000Z' } },
  }));
});

describe('TrialProvider', () => {
  test('should show the trial of the API when it answers after loading', async () => {
    // Act
    abrir();

    // Assert
    expect(screen.getByText('Estado: loading')).toBeInTheDocument();
    expect(await screen.findByText('Estado: trial-activo')).toBeInTheDocument();
    expect(screen.getByText('Activa · vigente · días: 9 · vence: 2026-11-28T15:00:00.000Z')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/billing/trial-status');
  });

  test('should ask the API again and show the new state when a screen refreshes it', async () => {
    // Arrange
    const { user } = abrir();
    await screen.findByText('Estado: trial-activo');
    mockGet = vi.fn(async () => ({ data: { trial: { active: false, expired: true, reason: 'trial-vencido', daysLeft: 0, endsAt: '2026-11-18T15:00:00.000Z' } } }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));

    // Assert
    expect(await screen.findByText('Estado: trial-vencido')).toBeInTheDocument();
    expect(screen.getByText(/Inactiva · vencida · días: 0/)).toBeInTheDocument();
  });

  test('should say desconocido when the API does not send a reason', async () => {
    // Arrange
    mockGet = vi.fn(async () => ({ data: { trial: { active: true, expired: false, daysLeft: null, endsAt: null } } }));

    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Estado: desconocido')).toBeInTheDocument();
  });

  test.each([
    [401, 'sin-sesion'],
    [503, 'error'],
  ])('should fall back to a safe inactive state when the API answers %i', async (status, estado) => {
    // Arrange
    mockGet = vi.fn(async () => { throw { status, code: 'X', message: 'Fallo' }; });

    // Act
    abrir();

    // Assert
    expect(await screen.findByText(`Estado: ${estado}`)).toBeInTheDocument();
    expect(screen.getByText(/^Inactiva · vigente/)).toBeInTheDocument();
  });

  test('should explain the missing provider when a screen uses useTrial outside TrialProvider', () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act y Assert
    expect(() => render(<EstadoDePrueba />)).toThrow('useTrial debe usarse dentro de <TrialProvider>');
    console.error.mockRestore();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
