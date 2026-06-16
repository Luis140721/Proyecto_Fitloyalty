import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import DashboardHeader, { userNavLinks } from '../components/DashboardHeader';
import '../styles/dashboard.css';

const METODO_LABEL = {
  QR:           '📱 QR',
  CODIGOBARRAS: '🏷️ Código de barras',
  MANUAL:       '✍️ Manual',
};

function formatFechaHora(iso) {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora  = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return { fecha, hora };
}

export default function DashboardUsuario() {
  const { pathname } = useLocation();

  const [data, setData]       = useState({ asistencias: [], total: 0, hoy: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let activo = true;
    api.get('/asistencia')
      .then(({ data }) => { if (activo) setData(data); })
      .catch((err) => {
        if (activo) setError(err.response?.data?.error || 'No se pudo cargar el historial de asistencia.');
      })
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, []);

  return (
    <div className="dash">
      <DashboardHeader navLinks={userNavLinks(pathname)} />

      <main className="dash-main">
        <h1 className="dash-h1">Historial de asistencia</h1>
        <p className="dash-sub">Registro de ingresos al gimnasio.</p>

        <div className="dash-cards">
          <div className="dash-card">
            <span className="dash-card__icon">📊</span>
            <div>
              <div className="dash-card__value">{loading ? '—' : data.total}</div>
              <div className="dash-card__label">Asistencias totales</div>
            </div>
          </div>
          <div className="dash-card">
            <span className="dash-card__icon">📅</span>
            <div>
              <div className="dash-card__value">{loading ? '—' : data.hoy}</div>
              <div className="dash-card__label">Asistencias de hoy</div>
            </div>
          </div>
        </div>

        <div className="dash-table-wrap">
          {error && <div className="dash-alert">{error}</div>}

          {loading ? (
            <div className="dash-loading"><span className="spinner" /></div>
          ) : data.asistencias.length === 0 ? (
            <div className="dash-empty">Aún no hay asistencias registradas.</div>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Miembro</th>
                  <th>Documento</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Método</th>
                </tr>
              </thead>
              <tbody>
                {data.asistencias.map((a, i) => {
                  const { fecha, hora } = formatFechaHora(a.fecha_hora);
                  return (
                    <tr key={i}>
                      <td>{a.miembro}</td>
                      <td>{a.documento}</td>
                      <td>{fecha}</td>
                      <td>{hora}</td>
                      <td>{METODO_LABEL[a.metodo] || a.metodo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
