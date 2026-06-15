import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import '../styles/dashboard.css';

// Etiqueta legible para el método de ingreso
const METODO_LABEL = {
  QR:           '📱 QR',
  CODIGOBARRAS: '🏷️ Código de barras',
  MANUAL:       '✍️ Manual',
};

// Formatea "2026-06-14T08:30:00" -> { fecha: '14/06/2026', hora: '08:30' }
function formatFechaHora(iso) {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora  = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return { fecha, hora };
}

export default function DashboardUsuario() {
  const { user, logout } = useAuth();

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
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header__brand">
          <span className="dash-header__logo">🏋️</span>
          <span className="dash-header__title">FitLoyalty</span>
        </div>
        <div className="dash-header__user">
          <div className="dash-header__info">
            <span className="dash-header__name">{user?.name}</span>
            <span className="dash-header__role">{user?.role === 'receptionist' ? 'Recepcionista' : 'Miembro'}</span>
          </div>
          <div className="dash-header__avatar">{user?.name?.charAt(0).toUpperCase()}</div>
          <button className="dash-header__logout" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      {/* Navegación entre secciones */}
      <nav className="dash-nav">
        <Link to="/dashboard/receptionist" className="dash-nav__link dash-nav__link--active">Historial de asistencia</Link>
        <Link to="/dashboard/vista-miembros" className="dash-nav__link">Miembros activos (Vista SQL)</Link>
      </nav>

      {/* Contenido */}
      <main className="dash-main">
        <h1 className="dash-h1">Historial de asistencia</h1>
        <p className="dash-sub">Registro de ingresos al gimnasio.</p>

        {/* Tarjetas de resumen */}
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

        {/* Tabla de asistencia */}
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
