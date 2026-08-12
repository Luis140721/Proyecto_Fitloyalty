import { useEffect, useState } from 'react';
import { api } from '../api';

const COP = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

function Avatar({ name, danger = false }) {
  const initials = (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return <span className={`avatar ${danger ? 'avatar-error' : 'avatar-primary'}`}>{initials}</span>;
}

export default function CheckinPage() {
  const [codigo, setCodigo]     = useState('');
  const [documento, setDocumento] = useState('');
  const [metodo, setMetodo]     = useState('QR');
  const [recent, setRecent]     = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadRecent = async () => {
    try {
      const { data } = await api.get('/admin/checkin', { params: { limit: 20 } });
      setRecent(data.checkins);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el historial.');
    }
  };

  useEffect(() => { loadRecent(); const t = setInterval(loadRecent, 15000); return () => clearInterval(t); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setFeedback(null);
    const payload = { metodo };
    if (codigo) payload.codigo = codigo.trim();
    else if (documento) payload.documento = documento.trim();
    else { setError('Escribe el código QR o el documento.'); return; }

    setSubmitting(true);
    try {
      const { data } = await api.post('/admin/checkin', payload);
      setFeedback({
        type: data.advertencia ? 'warning' : 'success',
        msg: data.message,
        miembro: data.miembro,
        advertencia: data.advertencia,
      });
      setCodigo(''); setDocumento('');
      loadRecent();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el check-in.');
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Ingreso denegado', advertencia: true });
    } finally {
      setSubmitting(false);
    }
  };

  const onScan = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(e); }
  };

  return (
    <>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Check-in</h1>
          <p className="admin-page-head__lead">
            Escanea el QR o digita el documento. Si está al día, dejamos entrar; si no, mostramos la advertencia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={loadRecent}>
            <span className="material-symbols-outlined icon">refresh</span>
            Actualizar
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 24 }}>
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}

      <section className="checkin-shell">
        {/* Columna izquierda: scanner + form manual */}
        <div>
          <article className="checkin-scanner">
            <header className="checkin-scanner__head">
              <div>
                <h2>Escáner de acceso</h2>
                <p>Apunta el lector al QR del miembro o pega el código abajo.</p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                  className="field-input"
                  style={{ width: 160, padding: '8px 12px', fontSize: 13 }}
                  aria-label="Método de check-in"
                >
                  <option value="QR">Método: QR</option>
                  <option value="MANUAL">Método: Manual</option>
                  <option value="CODIGOBARRAS">Método: Código barras</option>
                </select>
              </div>
            </header>

            <div className="checkin-frame" aria-hidden="true">
              <i className="left" /><i className="right" />
              <span className="checkin-frame__scan" />
              <div className="checkin-frame__qr">
                <span className="material-symbols-outlined icon">qr_code_2</span>
              </div>
            </div>

            <form className="checkin-manual" onSubmit={submit} noValidate>
              <input
                className="field-input"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={onScan}
                placeholder="Escanea o pega el código QR aquí"
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <span className="material-symbols-outlined icon">login</span>
                {submitting ? 'Validando...' : 'Registrar'}
              </button>
            </form>

            <div style={{
              marginTop: 12,
              paddingTop: 16,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'var(--font-label)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
            }}>
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>TIP</span>
              <span>O escribe el documento si el miembro no tiene QR a mano.</span>
            </div>

            <div className="auth-form-row" style={{ marginTop: 18 }}>
              <label className="field">
                <span className="field-label">O por documento</span>
                <input
                  className="field-input"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="79123456"
                  inputMode="numeric"
                />
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => { setCodigo(''); setDocumento(''); setFeedback(null); setError(''); }}
                >
                  <span className="material-symbols-outlined icon">cleaning_services</span>
                  Limpiar
                </button>
              </div>
            </div>
          </article>

          {feedback && (
            <div
              className={`alert ${feedback.type === 'error' ? 'alert-error' : feedback.type === 'warning' ? 'alert-warning' : 'alert-success'}`}
              role="status"
              style={{ marginTop: 18 }}
            >
              <span className="material-symbols-outlined icon">
                {feedback.type === 'error' ? 'block' : feedback.type === 'warning' ? 'warning' : 'check_circle'}
              </span>
              <span style={{ lineHeight: 1.5 }}>
                <strong style={{ display: 'block' }}>{feedback.msg}</strong>
                {feedback.miembro?.nombre && (
                  <small style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                    {feedback.miembro.nombre} ({feedback.miembro.documento})
                    {feedback.advertencia && ' — revisar antes de dejar entrar'}
                  </small>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Columna derecha: feed de ingresos */}
        <article className="table-card" style={{ padding: 0, alignSelf: 'flex-start' }}>
          <div style={{ padding: '20px 24px 8px' }}>
            <div className="checkin-feed__head">
              <h3>Ingresos de hoy</h3>
              <span className="checkin-feed__live">EN VIVO</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 6 }}>
              {recent.length} ingresos en las últimas horas
            </p>
          </div>
          <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recent.length === 0 && (
              <div style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 32 }}>
                Aún no hay check-ins hoy.
              </div>
            )}
            {recent.map((c) => {
              const initials = (c.nombre || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
              const denied = c.advertencia || c.denegado;
              return (
                <div className={`checkin-tile ${denied ? 'checkin-tile--denied' : ''}`} key={c.id_checkin}>
                  <span className={`avatar ${denied ? 'avatar-error' : 'avatar-primary'}`}>{initials}</span>
                  <div className="checkin-tile__meta">
                    <strong>{c.nombre}</strong>
                    <span>{c.metodo} · {c.documento}</span>
                  </div>
                  <div className="checkin-tile__time">
                    {new Date(c.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    <small>{denied ? 'REVISAR' : 'OK'}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </>
  );
}