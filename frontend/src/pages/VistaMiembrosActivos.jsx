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
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const navLinks = user.role === 'admin'
    ? adminNavLinks(pathname)
    : userNavLinks(pathname);

  useEffect(() => {
    let activo = true;
    api.get('/vista/miembros-activos')
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
  }, []);

  return (
    <div className="dash">
      <DashboardHeader navLinks={navLinks} />

      <main className="dash-main">
        <h1 className="dash-h1">Miembros activos</h1>
        <p className="dash-sub">
          Listado generado desde la <strong>vista SQL</strong>{' '}
          <code>vista_miembros_activos</code>
          {!loading && ` · ${total} miembros`}.
        </p>

        <div className="dash-table-wrap">
          {error && <div className="dash-alert">{error}</div>}

          {loading ? (
            <div className="dash-loading"><span className="spinner" /></div>
          ) : miembros.length === 0 ? (
            <div className="dash-empty">No hay miembros activos.</div>
          ) : (
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
          )}
        </div>
      </main>
    </div>
  );
}
