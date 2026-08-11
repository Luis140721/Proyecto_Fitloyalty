import { useEffect, useState } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitloyalty_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const empty = { nombre: '', documento: '', telefono: '', email: '' };

export default function MiembrosPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async (query = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/miembros', { params: { q: query, pageSize: 50 } });
      setItems(data.miembros);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar miembros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSearch = (e) => {
    e.preventDefault();
    load(q);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    try {
      const payload = { ...form };
      if (!payload.email) delete payload.email;
      const { data } = await api.post('/admin/miembros', payload);
      setInfo(`Miembro creado. Codigo QR: ${data.miembro.codigo_qr}`);
      setForm(empty);
      setOpen(false);
      load(q);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el miembro.');
    }
  };

  const onDelete = async (m) => {
    if (!window.confirm(`Desactivar a ${m.nombre}?`)) return;
    try {
      await api.delete(`/admin/miembros/${m.id_miembro}`);
      load(q);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Miembros</h1>
        <button className="btn btn-primary" onClick={() => setOpen((o) => !o)}>
          {open ? 'Cerrar' : 'Nuevo miembro'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}

      {open && (
        <form className="panel" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="field">
              <label>Documento</label>
              <input required value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            </div>
            <div className="field">
              <label>Telefono</label>
              <input required value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div className="field">
              <label>Email (opcional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit">Crear</button>
        </form>
      )}

      <form className="panel" onSubmit={onSearch} style={{ display: 'flex', gap: 8 }}>
        <input className="field" placeholder="Buscar por nombre, documento, correo o codigo QR"
               value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-secondary" type="submit">Buscar</button>
      </form>

      <div className="panel">
        {loading && <div className="bar-loader" />}
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th><th>Documento</th><th>Telefono</th><th>Email</th><th>QR</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>Aun no hay miembros.</td></tr>
            )}
            {items.map((m) => (
              <tr key={m.id_miembro}>
                <td>{m.nombre}</td>
                <td>{m.documento}</td>
                <td>{m.telefono}</td>
                <td>{m.email || '—'}</td>
                <td><code style={{ fontSize: 12 }}>{m.codigo_qr}</code></td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => onDelete(m)}>Desactivar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
