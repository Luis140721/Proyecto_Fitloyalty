/**
 * Render compartido para los tests de componentes (bootcamp semana 3).
 *
 * Monta el componente en un MemoryRouter, en la ruta `route`. Cualquier otra
 * ruta muestra "Ruta actual: <pathname>", asi un test puede comprobar a donde
 * navego la pantalla sin espiar useNavigate.
 *
 * `route` puede traer query string (/accept-invite?token=abc): el patron de la
 * ruta (`path`) es la misma URL sin query ni hash. Para parametros pasa los
 * dos: { route: '/admin/miembros/7', path: '/admin/miembros/:id' }.
 *
 * Solo monta el router: si la pagina usa useAuth o useTrial, simula su
 * contexto con vi.mock.
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

export function renderWithProviders(ui, { route = '/', path = route.split(/[?#]/)[0] } = {}) {
  const user = userEvent.setup();
  const resultado = render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
        <Route path="*" element={<RutaActual />} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...resultado };
}
