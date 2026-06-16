import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';

const ROLE_LABEL = {
  admin:        'Administrador',
  receptionist: 'Recepcionista',
  member:       'Miembro',
};

/**
 * Header reutilizable para todos los dashboards (C5 — nombre + foto de perfil).
 */
export default function DashboardHeader({ navLinks = [] }) {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="dash-header">
        <div className="dash-header__brand">
          <span className="dash-header__logo">🏋️</span>
          <span className="dash-header__title">FitLoyalty</span>
        </div>
        <div className="dash-header__user">
          <div className="dash-header__info">
            <span className="dash-header__name">{user?.name}</span>
            <span className="dash-header__role">{ROLE_LABEL[user?.role] || user?.role}</span>
          </div>
          <UserAvatar name={user?.name} photoUrl={user?.photoUrl} />
          <button type="button" className="dash-header__logout" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {navLinks.length > 0 && (
        <nav className="dash-nav">
          {navLinks.map(({ to, label, active }) => (
            <Link
              key={to}
              to={to}
              className={`dash-nav__link${active ? ' dash-nav__link--active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

/** Navegación del panel de administrador */
export function adminNavLinks(activePath) {
  return [
    { to: '/dashboard/admin',        label: 'Resumen General',           active: activePath === '/dashboard/admin' },
    { to: '/dashboard/reporte-sp',   label: 'Reporte Asistencia (SP)',   active: activePath === '/dashboard/reporte-sp' },
    { to: '/dashboard/vista-miembros', label: 'Miembros activos (Vista SQL)', active: activePath === '/dashboard/vista-miembros' },
  ];
}

/** Navegación del dashboard de usuario estándar (recepcionista / miembro) */
export function userNavLinks(activePath) {
  return [
    {
      to: '/dashboard/receptionist',
      label: 'Historial de asistencia',
      active: activePath === '/dashboard/receptionist' || activePath === '/dashboard/member',
    },
    {
      to: '/dashboard/vista-miembros',
      label: 'Miembros activos (Vista SQL)',
      active: activePath === '/dashboard/vista-miembros',
    },
  ];
}
