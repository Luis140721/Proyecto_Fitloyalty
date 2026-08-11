import { useEffect, useState } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitloyalty_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function CheckinPage() {
  const [codigo, setCodigo] = useState('');
  const [documento, setDocumento] = useState('');
  const [metodo, setMetodo] = useState('QR');
  const [recent, setRecent] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');

  const loadRecent = async () => {
    try {
      const { data } = await api.get('/admin/checkin', { params: { limit: 20 } });
      setRecent(data.checkins);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el historial.');
    }
  };

  useEffect(() => { loadRecent(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setFeedback(null);
    const payload = { metodo };
    if (codigo) payload.codigo = codigo.trim();
    else if (documento) payload.documento = documento.trim();
    else { setError('Escribe el codigo QR o el documento.'); return; }

    try {
      const { data } = await api.post('/admin/checkin', payload);
      setFeedback({ type: data.advertencia ? 'warning' : 'success',
                    msg: data.message, miembro: data.miembro, advertencia: data.advertencia });
      setCodigo(''); setDocumento('');
      loadRecent();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el check-in.');
    }
  };

  const onScan = (e) => {
    // Permitir pegar el valor del lector QR: lo separa por enter
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(e);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Check-in</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {feedback && (
        <div className={`alert alert-${feedback.type}`}>
          <strong>{feedback.msg}</strong><br />
          {feedback.miembro?.nombre} ({feedback.miembro?.documento})
        </div>
      )}

      <form className="panel" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Codigo QR (escaneado)</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={onScan}
                   placeholder="FL-1-XXXXXX" autoFocus />
          </div>
          <div className="field">
            <label>o Documento</label>
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="79123456" />
          </div>
          <div className="field">
            <label>Metodo</label>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="QR">QR</option>
              <option value="MANUAL">Manual</option>
              <option value="CODIGOBARRAS">Codigo de barras</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" type="submit">Registrar ingreso</button>
      </form>

      <section className="panel">
        <div className="panel-header">
          <div className="panel-title">Ultimos 20 ingresos</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>Hora</th><th>Miembro</th><th>Doc</th><th>Metodo</th><th>QR</th></tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>Aun no hay check-ins.</td></tr>
            )}
            {recent.map((c) => (
              <tr key={c.id_checkin}>
                <td>{new Date(c.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{c.nombre}</td>
                <td>{c.documento}</td>
                <td>{c.metodo}</td>
                <td><code style={{ fontSize: 12 }}>{c.codigo_qr}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
