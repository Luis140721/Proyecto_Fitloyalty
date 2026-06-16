import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import DashboardHeader, { adminNavLinks } from '../components/DashboardHeader';
import '../styles/dashboard.css';

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (iso.length <= 10) {
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
  }
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatHora(h) {
  if (!h) return '—';
  return h.substring(0, 5);
}

const METODO_LABEL = {
  QR:           '📱 QR',
  CODIGOBARRAS: '🏷️ Código de barras',
  MANUAL:       '✍️ Manual',
};

export default function ReporteAsistencia() {
  const { pathname } = useLocation();

  const hoyStr = new Date().toISOString().substring(0, 10);
  const hace7Dias = new Date();
  hace7Dias.setDate(hace7Dias.getDate() - 7);
  const hace7DiasStr = hace7Dias.toISOString().substring(0, 10);

  const [filtros, setFiltros] = useState({
    startDate: hace7DiasStr,
    endDate: hoyStr,
  });

  const [reporte, setReporte] = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    ejecutarReporte();
  }, []);

  async function ejecutarReporte(e) {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.get('/admin/reporte-asistencia', {
        params: {
          startDate: filtros.startDate,
          endDate: filtros.endDate,
        },
      });
      setReporte(data.reporte);
      setTotal(data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo generar el reporte.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dash">
      <DashboardHeader navLinks={adminNavLinks(pathname)} />

      <main className="dash-main">
        <h1 className="dash-h1">Reporte de Asistencia</h1>
        <p className="dash-sub">
          Resultados generados ejecutando el procedimiento almacenado{' '}
          <code>sp_reporte_asistencia</code>.
        </p>

        <form onSubmit={ejecutarReporte} className="dash-filters-form">
          <div className="dash-filters-group">
            <div className="form-group-inline">
              <label htmlFor="startDate" className="form-label-inline">Desde:</label>
              <input
                id="startDate"
                type="date"
                className="form-input-inline"
                value={filtros.startDate}
                onChange={(e) => setFiltros((prev) => ({ ...prev, startDate: e.target.value }))}
                required
              />
            </div>
            <div className="form-group-inline">
              <label htmlFor="endDate" className="form-label-inline">Hasta:</label>
              <input
                id="endDate"
                type="date"
                className="form-input-inline"
                value={filtros.endDate}
                onChange={(e) => setFiltros((prev) => ({ ...prev, endDate: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className="btn-filter" disabled={loading}>
              {loading ? 'Consultando...' : '🔍 Generar Reporte'}
            </button>
          </div>
        </form>

        {error && <div className="dash-alert">{error}</div>}

        <div className="dash-table-wrap">
          {loading ? (
            <div className="dash-loading"><span className="spinner" /></div>
          ) : reporte.length === 0 ? (
            <div className="dash-empty">No se encontraron asistencias en el rango de fechas seleccionado.</div>
          ) : (
            <>
              <p className="dash-table-meta">
                Total registros encontrados: <strong>{total}</strong>
              </p>
              <div className="dash-table-scroll">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Miembro</th>
                      <th>Documento</th>
                      <th>Fecha</th>
                      <th>Hora</th>
                      <th>Método de Ingreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.map((r, i) => (
                      <tr key={i}>
                        <td>{r.miembro}</td>
                        <td>{r.documento}</td>
                        <td>{formatFecha(r.fecha)}</td>
                        <td>{formatHora(r.hora)}</td>
                        <td>{METODO_LABEL[r.metodo] || r.metodo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
