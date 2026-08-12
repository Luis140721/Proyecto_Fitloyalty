import { useState, useEffect } from 'react';
import { useAuth, api } from '../context/AuthContext';
import '../styles/admin.css';

const METODO_LABEL = {
  QR: 'QR',
  CODIGOBARRAS: 'Código de barras',
  MANUAL: 'Manual',
};

const METODO_ICON = {
  QR: 'qr_code_scanner',
  CODIGOBARRAS: 'barcode_scanner',
  MANUAL: 'edit_note',
};

function formatFechaHora(iso) {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora:  d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function DashboardUsuario() {
  const { user } = useAuth();
  const [data, setData]       = useState({ asistencias: [], total: 0, hoy: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/asistencia')
      .then(({ data }) => { if (alive) setData(data); })
      .catch((err) => { if (alive) setError(err.response?.data?.error || 'No se pudo cargar el historial.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Mi historial de asistencia</h1>
          <p className="admin-page-head__lead">
            Tus ingresos al gimnasio. Ve cuándo vienes y cuántos días llevas.
          </p>
        </div>
      </header>

      <section className="kpi-grid">
        <article className="kpi">
          <div className="kpi-head">
            <span className="kpi-label">Asistencias totales</span>
            <span className="kpi-icon"><span className="material-symbols-outlined icon">calendar_month</span></span>
          </div>
          <span className="kpi-value">{loading ? '—' : data.total}</span>
          <span className="kpi-meta">Desde que te uniste</span>
        </article>
        <article className="kpi">
          <div className="kpi-head">
            <span className="kpi-label">Asistencias de hoy</span>
            <span className="kpi-icon"><span className="material-symbols-outlined icon">bolt</span></span>
          </div>
          <span className="kpi-value">{loading ? '—' : data.hoy}</span>
          <span className="kpi-meta">{data.hoy > 0 ? '¡Excelente!' : 'Aún no vienes hoy'}</span>
        </article>
        <article className="kpi">
          <div className="kpi-head">
            <span className="kpi-label">Tu nombre</span>
            <span className="kpi-icon"><span className="material-symbols-outlined icon">person</span></span>
          </div>
          <span className="kpi-value" style={{ fontSize: 18 }}>{user?.name || user?.nombre || 'Invitado'}</span>
          <span className="kpi-meta">{user?.email}</span>
        </article>
      </section>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 24 }}>
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}

      <section className="table-card">
        <div style={{ padding: '20px 24px 4px' }}>
          <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
            Todos mis ingresos
          </h3>
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            {data.asistencias.length} registros
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
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
              {loading && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 32 }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              )}
              {!loading && data.asistencias.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 32 }}>
                    Aún no hay asistencias registradas.
                  </td>
                </tr>
              )}
              {!loading && data.asistencias.map((a, i) => {
                const { fecha, hora } = formatFechaHora(a.fecha_hora);
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="avatar avatar-primary">
                          {(a.miembro || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                        <strong>{a.miembro}</strong>
                      </div>
                    </td>
                    <td>{a.documento}</td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                    <td>
                      <span className="chip">
                        <span className="material-symbols-outlined icon" style={{ fontSize: 14 }}>
                          {METODO_ICON[a.metodo] || 'input'}
                        </span>
                        {METODO_LABEL[a.metodo] || a.metodo}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}