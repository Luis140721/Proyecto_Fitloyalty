import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import NotFoundPage from '../src/pages/NotFoundPage';
import PoliticaDatosPage from '../src/pages/PoliticaDatosPage';
import PrivacidadPage from '../src/pages/PrivacidadPage';
import TerminosPage from '../src/pages/TerminosPage';
import ProtectedRoute from '../src/components/ProtectedRoute';

const authMock = vi.hoisted(() => ({ user: null, loading: false, ready: true }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => authMock }));

function Location() {
  const { pathname, state } = useLocation();
  return <p>Ruta actual: {pathname}{state?.from ? ` (desde ${state.from})` : ''}</p>;
}

function renderNotFound(entries = ['/ruta-inexistente']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/ruta-inexistente" element={<NotFoundPage />} />
        <Route path="/anterior" element={<Location />} />
        <Route path="/login" element={<Location />} />
        <Route path="/admin/dashboard" element={<Location />} />
        <Route path="/admin/checkin" element={<Location />} />
        <Route path="/" element={<Location />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  beforeEach(() => {
    authMock.user = null;
    authMock.loading = false;
    authMock.ready = true;
  });

  test('muestra la URL y vuelve al inicio', () => {
    renderNotFound();
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ruta solicitada')).toHaveTextContent('/ruta-inexistente');
    expect(screen.queryByRole('button', { name: 'Ir a mi panel' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(screen.getByText('Ruta actual: /')).toBeInTheDocument();
  });

  test('vuelve a la página previa cuando el historial del navegador tiene una entrada anterior', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);
    renderNotFound(['/anterior', '/ruta-inexistente']);
    fireEvent.click(screen.getByRole('button', { name: 'Volver atrás' }));
    expect(screen.getByText('Ruta actual: /anterior')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  test.each([
    [{ role: 'admin' }, '/admin/dashboard'],
    [{ role: 'receptionist' }, '/admin/checkin'],
  ])('envía el usuario autenticado al panel adecuado', (user, destination) => {
    authMock.user = user;
    renderNotFound();
    fireEvent.click(screen.getByRole('button', { name: 'Ir a mi panel' }));
    expect(screen.getByText(`Ruta actual: ${destination}`)).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  function renderProtected({ user, loading = false, ready = true, roles = ['admin'] }) {
    Object.assign(authMock, { user, loading, ready });
    return render(
      <MemoryRouter initialEntries={['/admin/miembros']}>
        <Routes>
          <Route path="/admin/miembros" element={<ProtectedRoute roles={roles}><h1>Privado</h1></ProtectedRoute>} />
          <Route path="/login" element={<Location />} />
          <Route path="/admin/checkin" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  test('mantiene el spinner mientras la sesión se revalida', () => {
    renderProtected({ user: null, loading: true, ready: false });
    expect(document.querySelector('.boot-shell .spinner')).toBeInTheDocument();
    expect(screen.queryByText(/Ruta actual/)).not.toBeInTheDocument();
  });

  test('redirige al login y recuerda la ruta solicitada si no hay sesión', () => {
    renderProtected({ user: null });
    expect(screen.getByText('Ruta actual: /login (desde /admin/miembros)')).toBeInTheDocument();
  });

  test.each([
    [{ role: 'admin' }, ['admin'], true],
    [{ rol: 'admin' }, ['admin'], true],
    [{ rol_nombre: 'admin' }, ['admin'], true],
    [{ role: 'receptionist' }, ['admin'], false],
    [{ role: 'trainer' }, null, true],
  ])('autoriza roles con las formas admitidas %#', (user, roles, allowed) => {
    renderProtected({ user, roles });
    if (allowed) expect(screen.getByRole('heading', { name: 'Privado' })).toBeInTheDocument();
    else expect(screen.getByText('Ruta actual: /admin/checkin')).toBeInTheDocument();
  });
});

describe('páginas legales', () => {
  test.each([
    [TerminosPage, 'Términos y condiciones', 'Aceptación de los términos'],
    [PrivacidadPage, 'Política de privacidad', 'Responsable del tratamiento'],
    [PoliticaDatosPage, 'Política de tratamiento de datos personales', 'Ámbito de aplicación'],
  ])('presenta el contenido legal de %s', (Page, heading, section) => {
    render(
      <MemoryRouter initialEntries={['/legal']}>
        <Page />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: new RegExp(section, 'i') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/legal/privacidad');
    expect(screen.getByRole('link', { name: 'Política de datos' })).toHaveAttribute('href', '/legal/datos');
  });
});
