import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import DashboardHeader, { adminNavLinks, userNavLinks } from '../components/DashboardHeader';
import '../styles/dashboard.css';

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

const val = (v) => (v === null || v === undefined || v === '' ? '—' : v);

export default function VistaMiembrosActivos() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const [miembros, setMiembros] = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const navLinks = user.role === 'admin'
    ? adminNavLinks(pathname)
    : userNavLinks(pathname);

  useEffect(() => {
    let activo = true;

    api.get('/vista/miembros-activos', {
      params: { page, pageSize },
    })
      .then(({ data }) => {
        if (activo) {
          setMiembros(data.miembros);
          setTotal(data.total);
        }
      })
      .catch((err) => {
        if (activo) setError(err.response?.data?.error || 'No se pudo cargar la vista.');
      })
      .finally(() => { if (activo) setLoading(false); });

    return () => { activo = false; };
  }, [page, pageSize]);

  function cambiarPageSize(value) {
    const amount = Number.parseInt(value, 10);
    if (Number.isNaN(amount) || amount < 1) return;
    setPageSize(amount);
    setPage(0);
  }

  return (
    <div className="dash">
      <DashboardHeader navLinks={navLinks} />

      <main className="dash-main">
        <h1 className="dash-h1">Miembros activos</h1>
        <div className="dash-sub dash-sub-flex">
          <span>{!loading && `${total} miembros activos.`}</span>
          <label className="form-label-inline" htmlFor="miembrosPageSize">Mostrar:</label>
          <select
            id="miembrosPageSize"
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
        </div>

        <div className="dash-table-wrap">
          {error && <div className="dash-alert">{error}</div>}

          {loading ? (
            <div className="dash-loading"><span className="spinner" /></div>
          ) : miembros.length === 0 ? (
            <div className="dash-empty">No hay miembros activos.</div>
          ) : (
            <>
              <div className="dash-table-meta">
                Mostrando <strong>{Math.min(total, page * pageSize + 1)}</strong> - <strong>{Math.min(total, page * pageSize + miembros.length)}</strong> de <strong>{total}</strong> miembros.
              </div>
              <div className="dash-table-scroll">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Documento</th>
                      <th>Teléfono</th>
                      <th>Email</th>
                      <th>Código QR</th>
                      <th>Estado</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miembros.map((m, i) => (
                      <tr key={i}>
                        <td>{val(m.nombre)}</td>
                        <td>{val(m.documento)}</td>
                        <td>{val(m.telefono)}</td>
                        <td>{val(m.email)}</td>
                        <td>{val(m.codigo_qr)}</td>
                        <td>{val(m.estado_membresia)}</td>
                        <td>{formatFecha(m.fecha_inicio)}</td>
                        <td>{formatFecha(m.fecha_fin)}</td>
                        <td>{val(m.plan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dash-pagination">
                <span>Page {page + 1} de {Math.max(1, Math.ceil(total / pageSize))}</span>
                <div className="dash-pagination-controls">
                  <button
                    type="button"
                    className="dash-pagination-button"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={page === 0 || loading}
                  >Anterior</button>
                  <button
                    type="button"
                    className="dash-pagination-button"
                    onClick={() => setPage((current) => current + 1)}
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
