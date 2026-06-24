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
    retentionRate: 0,
    enRiesgo: 0,
    flowByHour: [],
    weeklyAttendance: [],
    clientesRecuperar: [],
    proximasVencimientos: [],
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
              <div className="dash-card__content">
                <div className="dash-card__value">{metrics.totalMiembros}</div>
                <div className="dash-card__label">Miembros activos</div>
                <div className="dash-card-chart">
                  <div className="dash-card-chart__bar" style={{ width: `${Math.min(100, metrics.totalMiembros / 2)}%` }} />
                </div>
              </div>
            </div>

            <div className="dash-card">
              <span className="dash-card__icon">🔥</span>
              <div className="dash-card__content">
                <div className="dash-card__value">{metrics.asistenciasHoy}</div>
                <div className="dash-card__label">Ingresos de hoy</div>
                <div className="dash-card-chart">
                  <div className="dash-card-chart__bar" style={{ width: `${Math.min(100, metrics.asistenciasHoy)}%` }} />
                </div>
              </div>
            </div>

            <div className="dash-card">
              <span className="dash-card__icon">⚠️</span>
              <div className="dash-card__content">
                <div className="dash-card__value">{metrics.membresiasPorVencer}</div>
                <div className="dash-card__label">Vencimientos en 7 días</div>
                <div className="dash-card-chart">
                  <div className="dash-card-chart__bar" style={{ width: `${Math.min(100, metrics.membresiasPorVencer * 5)}%` }} />
                </div>
              </div>
            </div>

            <div className="dash-card">
              <span className="dash-card__icon">📈</span>
              <div className="dash-card__content">
                <div className="dash-card__value">{metrics.retentionRate}%</div>
                <div className="dash-card__label">Tasa de retención</div>
                <div className="dash-card-chart">
                  <div className="dash-card-chart__bar" style={{ width: `${Math.min(100, metrics.retentionRate)}%` }} />
                </div>
              </div>
            </div>

            <div className="dash-card">
              <span className="dash-card__icon">🚩</span>
              <div className="dash-card__content">
                <div className="dash-card__value">{metrics.enRiesgo}</div>
                <div className="dash-card__label">En riesgo de abandono</div>
                <div className="dash-card-chart">
                  <div className="dash-card-chart__bar" style={{ width: `${Math.min(100, metrics.enRiesgo * 4)}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Listados: clientes a recuperar y proximos vencimientos */}
        <section className="dash-section dash-row">
          <div className="dash-panel">
            <h3>Clientes a recuperar</h3>
            <ul className="list-compact">
              {metrics.clientesRecuperar.length === 0 && <li className="muted">No hay alertas pendientes</li>}
              {metrics.clientesRecuperar.map(c => (
                <li key={c.id_alerta}>
                  <strong>{c.nombre}</strong>
                  <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.90rem' }}>
                    {c.dias_inactivo} días inactivo · {c.nivel}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="dash-panel">
            <h3>Membresías por vencer</h3>
            <ul className="list-compact">
              {metrics.proximasVencimientos.length === 0 && <li className="muted">No hay membresías próximas a vencer</li>}
              {metrics.proximasVencimientos.map((m, i) => (
                <li key={i}>
                  <strong>{m.miembro}</strong>
                  <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.90rem' }}>
                    {m.plan} · {m.dias_restantes} días
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="dash-section">
          <h2>Crear Recepcionista</h2>
          <p className="dash-sub">Usa la opción de menú para crear un recepcionista desde una pantalla dedicada.</p>
          <a className="btn-login" href="/dashboard/crear-recepcionista">Ir a crear recepcionista</a>
        </section>
      </main>
    </div>
  );
