import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTrial } from '../context/TrialContext';
import Sidebar from './Sidebar';
import UserAvatar from './UserAvatar';
import '../styles/admin.css';

const PAGE_META = {
  '/admin/dashboard': { title: 'Dashboard',  icon: 'space_dashboard' },
  '/admin/miembros':  { title: 'Miembros',   icon: 'group'            },
  '/admin/checkin':   { title: 'Check-in',   icon: 'qr_code_scanner'  },
  '/admin/staff':     { title: 'Equipo',     icon: 'badge'            },
};

/**
 * AdminLayout: layout común para todas las pantallas del admin.
 * Sidebar fijo a la izquierda (drawer en mobile) + header sticky en main.
 */
export default function AdminLayout({ children }) {
  const { user, loading, ready, logout } = useAuth();
  const { trial, refresh } = useTrial();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading || !ready) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid', placeItems: 'center',
        background: 'var(--bg)',
      }}>
        <div className="spinner" />
      </div>
    );
  }

  const trialVencido = trial.expired === true;
  const trialUrgente  = trial.active && Number.isFinite(trial.daysLeft) && trial.daysLeft <= 3;
  const meta = PAGE_META[location.pathname] || { title: 'Panel', icon: 'space_dashboard' };

  return (
    <div className="admin-shell">
      <div
        className={`admin-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__left">
            <button
              className="admin-header__hamburger"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="Abrir menú"
            >
              <span className="material-symbols-outlined icon">menu</span>
            </button>
            <div className="admin-header__greeting">
              <small>{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</small>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined icon" style={{ color: 'var(--primary)', fontSize: 22 }}>
                  {meta.icon}
                </span>
                {meta.title}
              </strong>
            </div>
          </div>

          <div className="admin-header__right">
            <div className="admin-header__actions">
              <button className="admin-header__action" aria-label="Buscar" title="Buscar">
                <span className="material-symbols-outlined icon">search</span>
              </button>
              <button className="admin-header__action admin-header__action--badge" aria-label="Notificaciones" title="Notificaciones">
                <span className="material-symbols-outlined icon">notifications</span>
              </button>
              <button className="admin-header__action" aria-label="Ayuda" title="Ayuda">
                <span className="material-symbols-outlined icon">help</span>
              </button>
            </div>
            <div className="admin-header__user">
              <UserAvatar user={user} size={36} />
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                <span className="material-symbols-outlined icon">logout</span>
                <span className="admin-header__label">Salir</span>
              </button>
            </div>
          </div>
        </header>

        <div className="admin-main__inner">
          {trialVencido && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: 24 }}>
              <span className="material-symbols-outlined icon">block</span>
              <span>
                <strong>Tu prueba gratuita ha finalizado.</strong> Activa tu plan para seguir usando FitLoyalty.
              </span>
            </div>
          )}
          {trialUrgente && !trialVencido && (
            <div className="trial-banner">
              <div className="trial-banner__icon">
                <span className="material-symbols-outlined icon">schedule</span>
              </div>
              <div className="trial-banner__text">
                <strong>Te quedan {trial.daysLeft} {trial.daysLeft === 1 ? 'día' : 'días'} de prueba</strong>
                <span>Empieza a configurar tus miembros para aprovecharla al máximo.</span>
              </div>
              <button className="btn btn-primary">Activar plan</button>
            </div>
          )}

          {trialVencido ? (
            <article className="chart-card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
              <header className="chart-card__head" style={{ justifyContent: 'center' }}>
                <div>
                  <h3 style={{ color: 'var(--error)' }}>Acceso bloqueado</h3>
                  <p>
                    Tu período de prueba venció el{' '}
                    {trial.endsAt ? new Date(trial.endsAt).toLocaleDateString('es-CO') : 'recientemente'}.
                  </p>
                </div>
              </header>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: 14, marginBottom: 20 }}>
                Para continuar, contacta al equipo de FitLoyalty para activar tu plan.
              </p>
              <a className="btn btn-primary btn-lg" href="mailto:fitloyaltysaas@gmail.com">
                <span className="material-symbols-outlined icon">mail</span>
                Contactar al equipo
              </a>
            </article>
          ) : (
            (children !== undefined ? children : <Outlet />)
          )}
        </div>
      </div>
    </div>
  );
}