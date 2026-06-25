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
  const [page, setPage]       = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    cargarPagina(page);
  }, [page]);

  async function cargarPagina(requestPage, overridePageSize = pageSize) {
    const currentPageSize = Number.isNaN(overridePageSize) ? 10 : overridePageSize;
    setLoading(true);
    setError('');
    setPage(requestPage);
    setPageSize(currentPageSize);

    try {
      const { data } = await api.get('/admin/reporte-asistencia', {
        params: {
          startDate: filtros.startDate,
          endDate: filtros.endDate,
          page: requestPage,
          pageSize: currentPageSize,
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

  async function manejarEnvioReporte(e) {
    e.preventDefault();
    await cargarPagina(0);
  }

  async function cambiarPageSize(value) {
    const amount = Number.parseInt(value, 10);
    if (Number.isNaN(amount) || amount < 1) return;
    await cargarPagina(0, amount);
  }

  return (
    <div className="dash">
      <DashboardHeader navLinks={adminNavLinks(pathname)} />

      <main className="dash-main">
        <h1 className="dash-h1">Reporte de Asistencia</h1>

        <form onSubmit={manejarEnvioReporte} className="dash-filters-form">
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
            <label className="form-label-inline" htmlFor="pageSize">Mostrar:</label>
            <select
              id="pageSize"
              className="form-input-inline"
              value={`${pageSize}`}
              onChange={(e) => cambiarPageSize(e.target.value)}
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="15">15</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span className="form-label-inline">filas</span>
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
              <div className="dash-table-meta">
                Mostrando <strong>{Math.min(total, page * pageSize + 1)}</strong> - <strong>{Math.min(total, page * pageSize + reporte.length)}</strong> de <strong>{total}</strong> registros.
              </div>
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
              <div className="dash-pagination">
                <span>Mostrando <strong>{Math.min(total, page * pageSize + 1)}</strong> - <strong>{Math.min(total, page * pageSize + reporte.length)}</strong> de <strong>{total}</strong> registros.</span>
                <div className="dash-pagination-controls">
                  <button
                    type="button"
                    className="dash-pagination-button"
                    onClick={() => cargarPagina(Math.max(0, page - 1))}
                    disabled={page === 0 || loading}
                  >Anterior</button>
                  <button
                    type="button"
                    className="dash-pagination-button"
                    onClick={() => cargarPagina(page + 1)}
                    disabled={page + 1 >= Math.ceil(total / pageSize) || loading}
                  >Siguiente</button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
