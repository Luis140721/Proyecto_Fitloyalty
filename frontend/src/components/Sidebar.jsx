import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/admin/dashboard',  label: 'Dashboard',  roles: ['admin'] },
  { to: '/admin/miembros',  label: 'Miembros',   roles: ['admin', 'receptionist'] },
  { to: '/admin/checkin',   label: 'Check-in',   roles: ['admin', 'receptionist'] },
  { to: '/admin/staff',     label: 'Staff',      roles: ['admin'] },
];

export default function Sidebar({ open, onNavigate }) {
  const { user } = useAuth();
  const role = user?.role || 'unknown';
  const visible = links.filter((l) => l.roles.includes(role));

  return (
    <aside className={`admin-sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">FL</div>
        <div className="brand-name">FitLoyalty</div>
      </div>
      <nav className="admin-nav">
        {visible.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            onClick={onNavigate}
            className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
