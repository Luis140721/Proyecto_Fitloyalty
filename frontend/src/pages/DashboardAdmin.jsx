import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import DashboardHeader, { adminNavLinks } from '../components/DashboardHeader';
import '../styles/dashboard.css';

export default function DashboardAdmin() {
  const { pathname } = useLocation();

  const [metrics, setMetrics] = useState({
    totalMiembros: 0,
    asistenciasHoy: 0,
    membresiasPorVencer: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let activo = true;
    api.get('/admin/metrics')
      .then(({ data }) => {
        if (activo) setMetrics(data);
      })
      .catch((err) => {
        if (activo) setError(err.response?.data?.error || 'No se pudieron cargar las métricas.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => { activo = false; };
  }, []);

  return (
    <div className="dash">
      <DashboardHeader navLinks={adminNavLinks(pathname)} />

      <main className="dash-main">
        <h1 className="dash-h1">Panel de Control</h1>
        <p className="dash-sub">Resumen de métricas operacionales de tu gimnasio.</p>

        {error && <div className="dash-alert">{error}</div>}

        {loading ? (
          <div className="dash-loading"><span className="spinner" /></div>
        ) : (
          <div className="dash-cards">
            <div className="dash-card">
              <span className="dash-card__icon">👥</span>
              <div>
                <div className="dash-card__value">{metrics.totalMiembros}</div>
                <div className="dash-card__label">Miembros activos</div>
              </div>
            </div>

            <div className="dash-card">
              <span className="dash-card__icon">🔥</span>
              <div>
                <div className="dash-card__value">{metrics.asistenciasHoy}</div>
                <div className="dash-card__label">Ingresos de hoy</div>
              </div>
            </div>

            <div className="dash-card">
              <span className="dash-card__icon">⚠️</span>
              <div>
                <div className="dash-card__value">{metrics.membresiasPorVencer}</div>
                <div className="dash-card__label">Vencimientos en 7 días</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
