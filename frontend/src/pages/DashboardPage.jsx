import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTrial } from '../context/TrialContext';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitloyalty_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function DashboardPage() {
  const { user } = useAuth();
  const { trial } = useTrial();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/admin/dashboard')
      .then(({ data }) => { if (alive) setData(data); })
      .catch((err) => { if (alive) setError(err.response?.data?.error || 'No se pudo cargar el dashboard.'); });
    return () => { alive = false; };
  }, []);

  const max = data?.weekly?.reduce((m, d) => Math.max(m, d.count), 0) || 1;

  return (
    <div>
      <div className="page-header">
        <h1>Hola, {user?.name}</h1>
        <p className="subtitle">Aqui tienes un resumen de hoy.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!data && !error && <div className="bar-loader" />}

      {data && (
        <>
          <section className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Miembros activos</div>
              <div className="kpi-value">{data.totalMiembros}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Asistencia hoy</div>
              <div className="kpi-value">{data.checkinsHoy}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Vencen en 7 dias</div>
              <div className="kpi-value">{data.vencen7}</div>
            </div>
            <div className="kpi-card risk">
              <div className="kpi-label">En riesgo</div>
              <div className="kpi-value">{data.enRiesgo}</div>
              <div className="kpi-trend">15+ dias sin ir</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Retencion 90d</div>
              <div className="kpi-value">{data.retention}<span className="kpi-suffix">%</span></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">Asistencia de la semana</div>
            </div>
            <div className="weekly">
              {data.weekly.map((d) => (
                <div key={d.day} className="weekly-column">
                  <div className="weekly-bar" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}>
                    <span className="weekly-count">{d.count}</span>
                  </div>
                  <div className="weekly-label">{d.day}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid-2">
            <section className="panel">
              <div className="panel-header">
                <div className="panel-title">Proximos vencimientos</div>
              </div>
              {data.proximos.length === 0 ? (
                <p className="subtitle">Nadie vence en los proximos 30 dias.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Miembro</th><th>Plan</th><th>Vence</th><th>Dias</th></tr>
                  </thead>
                  <tbody>
                    {data.proximos.map((r, i) => (
                      <tr key={i}>
                        <td>{r.miembro}</td>
                        <td>{r.plan}</td>
                        <td>{new Date(r.fecha_fin).toLocaleDateString('es-CO')}</td>
                        <td>{r.dias_restantes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <div className="panel-title">Ultimos check-ins</div>
              </div>
              {data.recientes.length === 0 ? (
                <p className="subtitle">Aun no hay check-ins.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Hora</th><th>Miembro</th><th>Metodo</th></tr>
                  </thead>
                  <tbody>
                    {data.recientes.map((r) => (
                      <tr key={r.id_checkin}>
                        <td>{new Date(r.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{r.nombre}</td>
                        <td>{r.metodo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
