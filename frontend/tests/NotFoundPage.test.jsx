/**
 * Bootcamp semana 4 (Front, Luis): NotFoundPage desde quien abre una ruta que
 * no existe: ve la ruta que pidio y tiene tres salidas. «Volver atrás» regresa
 * a la pagina anterior o, si no hay historial (enlace externo), al inicio; «Ir
 * a mi panel» solo sale con sesion y depende del rol.
 *
 * useAuth se simula con vi.mock. El historial del navegador que mira la pagina
 * es window.history: su length se fija en cada test.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import NotFoundPage from '../src/pages/NotFoundPage';
import { renderWithProviders } from './renderWithProviders';

let sesion;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => sesion }));

const RUTA_INEXISTENTE = '/admin/reportes-viejos';

/** Fija window.history.length, que en jsdom siempre es 1. */
function historialDelNavegador(entradas) {
  Object.defineProperty(window.history, 'length', { value: entradas, configurable: true });
}

const abrir404 = () => renderWithProviders(<NotFoundPage />, { route: RUTA_INEXISTENTE });

beforeEach(() => {
  sesion = { user: null };
  historialDelNavegador(1);
});
afterEach(() => { delete window.history.length; });

describe('NotFoundPage', () => {
  test('should show the path that the user tried to open', () => {
    // Act
    abrir404();

    // Assert
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ruta solicitada')).toHaveTextContent(RUTA_INEXISTENTE);
  });

  test('should go to the home page when the user clicks Volver al inicio', async () => {
    // Arrange
    const { user } = abrir404();

    // Act
    await user.click(screen.getByRole('button', { name: 'Volver al inicio' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /')).toBeInTheDocument();
  });

  test('should go to the home page when the user clicks Volver atrás and there is no history', async () => {
    // Arrange: llego por un enlace externo, sin pagina anterior
    const { user } = abrir404();

    // Act
    await user.click(screen.getByRole('button', { name: 'Volver atrás' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /')).toBeInTheDocument();
  });

  test('should return to the previous page when the user clicks Volver atrás and there is history', async () => {
    // Arrange: venia de Miembros; el router guarda las dos entradas
    historialDelNavegador(2);
    function RutaActual() { return <p>Ruta actual: {useLocation().pathname}</p>; }
    render(
      <MemoryRouter initialEntries={['/admin/miembros', RUTA_INEXISTENTE]} initialIndex={1}>
        <Routes>
          <Route path={RUTA_INEXISTENTE} element={<NotFoundPage />} />
          <Route path="*" element={<RutaActual />} />
        </Routes>
      </MemoryRouter>,
    );

    // Act
    await userEvent.setup().click(screen.getByRole('button', { name: 'Volver atrás' }));

    // Assert
    expect(await screen.findByText('Ruta actual: /admin/miembros')).toBeInTheDocument();
  });

  test.each([
    ['admin', '/admin/dashboard'],
    ['receptionist', '/admin/checkin'],
  ])('should take a %s to the panel of the role when the user clicks Ir a mi panel', async (rol, panel) => {
    // Arrange
    sesion = { user: { id: 1, name: 'Ana', role: rol } };
    const { user } = abrir404();

    // Act
    await user.click(screen.getByRole('button', { name: 'Ir a mi panel' }));

    // Assert
    expect(await screen.findByText(`Ruta actual: ${panel}`)).toBeInTheDocument();
  });

  test('should not offer Ir a mi panel when nobody is signed in', () => {
    // Act
    abrir404();

    // Assert
    expect(screen.queryByRole('button', { name: 'Ir a mi panel' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Volver al inicio', 'Volver atrás']);
  });
});
