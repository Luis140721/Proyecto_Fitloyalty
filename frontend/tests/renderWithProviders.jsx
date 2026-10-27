/**
 * Render compartido para los tests de componentes (bootcamp semana 3).
 *
 * Monta el componente en un MemoryRouter, en la ruta `route`. Cualquier otra
 * ruta muestra "Ruta actual: <pathname>", asi un test puede comprobar a donde
 * navego la pantalla sin espiar useNavigate.
 *
 * Devuelve lo mismo que render() mas `user`, una sesion de user-event.
 *
 *   const { user } = renderWithProviders(<LoginPage />, { route: '/login' });
 */
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

function RutaActual() {
  const { pathname } = useLocation();
  return <p>Ruta actual: {pathname}</p>;
}

export function renderWithProviders(ui, { route = '/' } = {}) {
  const user = userEvent.setup();
  const resultado = render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={route} element={ui} />
        <Route path="*" element={<RutaActual />} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...resultado };
}
