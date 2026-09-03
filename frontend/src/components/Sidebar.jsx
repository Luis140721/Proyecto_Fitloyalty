import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';
import Logo from './Logo';

const links = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'space_dashboard',  roles: ['admin'] },
  { to: '/admin/miembros',  label: 'Miembros',  icon: 'group',             roles: ['admin', 'receptionist'] },
  { to: '/admin/checkin',   label: 'Check-in',  icon: 'qr_code_scanner',   roles: ['admin', 'receptionist'] },
  { to: '/admin/staff',     label: 'Equipo',    icon: 'badge',             roles: ['admin'] },
  { to: '/admin/config',    label: 'Configuración', icon: 'settings',      roles: ['admin'] },
];

function roleName(r) {
  if (r === 'admin')      return 'Administrador';
  if (r === 'receptionist') return 'Recepción';
  if (r === 'trainer')      return 'Entrenador';
  return r || 'Sin rol';
}

export default function Sidebar({ open, onNavigate }) {
  const { user, logout } = useAuth();
  const role = user?.role || user?.rol || user?.rol_nombre || 'receptionist';
  const visible = links.filter((l) => l.roles.includes(role));

  const handleLogout = (e) => {
    e.preventDefault();
    if (onNavigate) onNavigate();
    logout();
  };

  return (
    <aside className={`admin-sidebar ${open ? 'open' : ''}`} aria-hidden={open ? 'false' : undefined}>
      <button
        type="button"
        className="admin-sidebar__close"
        aria-label="Cerrar menú"
        onClick={onNavigate}
      >
        <span className="material-symbols-outlined icon">close</span>
      </button>

      <NavLink to="/" className="admin-sidebar__brand" aria-label="Inicio FitLoyalty" onClick={onNavigate}>
        <Logo height={30} />
      </NavLink>

      <div>
        <div className="admin-nav-group__title">GENERAL</div>
        <nav className="admin-nav">
          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={onNavigate}
              className={({ isActive }) => `admin-nav__item${isActive ? ' admin-nav__item--active' : ''}`}
            >
              <span className="material-symbols-outlined icon">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="admin-sidebar__foot">
        <div className="admin-sidebar__user">
          <UserAvatar user={user} size={36} />
          <div className="admin-sidebar__user-meta">
            <strong>{user?.name || user?.nombre || 'Yo'}</strong>
            <span>{roleName(role)}</span>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          aria-label="Cerrar sesión"
          onClick={handleLogout}
          title="Cerrar sesión"
        >
          <span className="material-symbols-outlined icon">logout</span>
        </button>
      </div>
    </aside>
  );
}