import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTrial } from '../context/TrialContext';
import Sidebar from './Sidebar';

/**
 * AdminLayout: layout comun para todas las pantallas del admin.
 * - Protegido: solo admin y recepcionista.
 * - Si el trial esta vencido, muestra un banner bloqueante encima del contenido.
 */
export default function AdminLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const { trial, refresh } = useTrial();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) {
    return <div className="boot-shell"><div className="spinner" /></div>;
  }

  const trialVencido = trial.expired === true;
  const trialUrgente  = trial.active && Number.isFinite(trial.daysLeft) && trial.daysLeft <= 3;

  return (
    <div className="admin-shell">
      <Sidebar current={location.pathname} onNavigate={() => setSidebarOpen(false)} open={sidebarOpen} />

      <div className="admin-main">
        <header className="admin-header">
          <button className="hamburger" onClick={() => setSidebarOpen((o) => !o)} aria-label="Abrir menu">{'\\u2630'}</button>
          <div className="admin-header-title">FitLoyalty</div>
          <div className="admin-header-right">
            <span className="user-chip">{user?.name}</span>
            <span className="role-chip">{user?.role}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>Cerrar sesion</button>
          </div>
        </header>

        {trialVencido && (
          <div className="trial-banner trial-banner-danger">
            <strong>Tu prueba gratuita ha finalizado.</strong>
            <span> Activa tu plan para seguir usando FitLoyalty.</span>
          </div>
        )}
        {trialUrgente && (
          <div className="trial-banner trial-banner-warning">
            <strong>Te quedan {trial.daysLeft} {trial.daysLeft === 1 ? 'dia' : 'dias'} de prueba.</strong>
            <span> Empieza a configurar tus miembros para aprovecharla.</span>
          </div>
        )}

        <main className="admin-content">
          {trialVencido ? (
            <div className="trial-empty">
              <h2>Acceso bloqueado</h2>
              <p>Tu periodo de prueba vencio el {new Date(trial.endsAt).toLocaleDateString('es-CO')}.</p>
              <p>Para continuar, contacta al equipo de FitLoyalty para activar tu plan.</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
