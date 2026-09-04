import { useEffect, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTrial } from '../context/TrialContext';
import Sidebar from './Sidebar';
import Logo from './Logo';
import MenuPerfil from './MenuPerfil';
import MenuNotificaciones from './MenuNotificaciones';
import '../styles/admin.css';

const PAGE_META = {
  '/admin/dashboard': { title: 'Dashboard',  icon: 'space_dashboard' },
  '/admin/miembros':  { title: 'Miembros',   icon: 'group'            },
  '/admin/checkin':   { title: 'Check-in',   icon: 'qr_code_scanner'  },
  '/admin/staff':     { title: 'Equipo',     icon: 'badge'            },
  '/admin/config':    { title: 'Configuración', icon: 'settings'       },
};

/** Devuelve el saludo que corresponde a la hora que es. */
function saludoSegunHora(fecha) {
  const h = fecha.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Saludo con fecha y hora en vivo. Va aparte para que el tick del reloj
 * repinte solo esta linea y no el layout entero cada segundo.
 */
function SaludoConReloj({ nombre }) {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fecha = ahora.toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const hora = ahora.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  return (
    <div className="admin-header__saludo">
      <p className="admin-header__hola">
        {saludoSegunHora(ahora)}{nombre ? ', ' : ''}
        {nombre && <strong>{nombre}</strong>}
      </p>
      <p className="admin-header__fecha">
        <span className="material-symbols-outlined icon">calendar_today</span>
        <span className="admin-header__dia">{fecha}</span>
        <span className="admin-header__hora">{hora}</span>
      </p>
    </div>
  );
}

/**
 * AdminLayout: layout común para todas las pantallas del admin.
 * Sidebar fijo a la izquierda (drawer en mobile) + header sticky en main.
 */
export default function AdminLayout({ children }) {
  const { user, gym, loading, ready, logout } = useAuth();
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
            {/* En movil el sidebar es un drawer oculto, asi que la marca
                desaparece del encabezado. Este icono la mantiene visible. */}
            <Link to="/" className="admin-header__logo" aria-label="Inicio FitLoyalty">
              <Logo variant="icon" height={30} />
            </Link>
            <div className="admin-header__identidad">
              <p className="admin-header__gimnasio">
                <span className="material-symbols-outlined icon">exercise</span>
                <span>{gym?.name || 'Tu gimnasio'}</span>
              </p>
              <SaludoConReloj nombre={user?.name || user?.nombre} />
              <p className="admin-header__seccion">
                <span className="material-symbols-outlined icon">{meta.icon}</span>
                {meta.title}
              </p>
            </div>
          </div>

          <div className="admin-header__right">
            <div className="admin-header__actions">
              <MenuNotificaciones />
            </div>
            <div className="admin-header__user">
              <MenuPerfil />
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