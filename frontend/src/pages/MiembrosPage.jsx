import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const empty = { nombre: '', documento: '', telefono: '', email: '' };
const FILTROS = [
  { id: 'todos',  label: 'Todos' },
  { id: 'al-dia', label: 'Al día' },
  { id: 'vence',  label: 'Vence pronto' },
  { id: 'vencido',label: 'Vencido' },
  { id: 'riesgo', label: 'En riesgo' },
];

function statusChip(m) {
  if (m.vencido)  return <span className="chip chip-status chip-status--expired">Vencido</span>;
  if (m.vencePronto) return <span className="chip chip-status chip-status--warning">Vence pronto</span>;
  if (m.enRiesgo) return <span className="chip chip-status chip-status--warning">En riesgo</span>;
  return <span className="chip chip-status chip-status--active">Al día</span>;
}

export default function MiembrosPage() {
  const [items, setItems]   = useState([]);
  const [q, setQ]           = useState('');
  const [open, setOpen]     = useState(false);
  const [form, setForm]     = useState(empty);
  const [error, setError]   = useState('');
  const [info, setInfo]     = useState('');
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  const load = async (query = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/miembros', { params: { q: query, pageSize: 100 } });
      setItems(data.miembros);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar miembros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSearch = (e) => { e.preventDefault(); load(q); };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    try {
      const payload = { ...form };
      if (!payload.email) delete payload.email;
      const { data } = await api.post('/admin/miembros', payload);
      setInfo(`Miembro creado. Código QR: ${data.miembro.codigo_qr}`);
      setForm(empty);
      setOpen(false);
      load(q);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el miembro.');
    }
  };

  const onDelete = async (m) => {
    if (!window.confirm(`Desactivar a ${m.nombre}?`)) return;
    try { await api.delete(`/admin/miembros/${m.id_miembro}`); load(q); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar.'); }
  };

  const filtrados = useMemo(() => {
    if (filtro === 'todos') return items;
    return items.filter((m) => {
      if (filtro === 'al-dia')    return !m.vencido && !m.vencePronto && !m.enRiesgo;
      if (filtro === 'vence')     return !!m.vencePronto;
      if (filtro === 'vencido')   return !!m.vencido;
      if (filtro === 'riesgo')    return !!m.enRiesgo;
      return true;
    });
  }, [items, filtro]);

  const counts = useMemo(() => ({
    todos: items.length,
    'al-dia': items.filter((m) => !m.vencido && !m.vencePronto && !m.enRiesgo).length,
    vence: items.filter((m) => m.vencePronto).length,
    vencido: items.filter((m) => m.vencido).length,
    riesgo: items.filter((m) => m.enRiesgo).length,
  }), [items]);

  return (
    <>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Miembros</h1>
          <p className="admin-page-head__lead">Agrega, busca y gestiona a todos los miembros de tu gimnasio.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => load(q)} disabled={loading}>
            <span className="material-symbols-outlined icon">refresh</span>
            Actualizar
          </button>
          <button className="btn btn-primary" onClick={() => setOpen((o) => !o)}>
            <span className="material-symbols-outlined icon">{open ? 'close' : 'person_add'}</span>
            {open ? 'Cerrar' : 'Nuevo miembro'}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-success" role="status">
          <span className="material-symbols-outlined icon">check_circle</span>
          <span>{info}</span>
        </div>
      )}

      {open && (
        <section className="chart-card" style={{ marginBottom: 24 }}>
          <header className="chart-card__head">
            <div>
              <h3>Nuevo miembro</h3>
              <p>Le generaremos un QR único. También lo agregamos al plan vigente de tu gimnasio.</p>
            </div>
          </header>
          <form className="auth-form" onSubmit={onSubmit} noValidate style={{ maxWidth: 720 }}>
            <div className="auth-form-row">
              <label className="field">
                <span className="field-label">Nombre completo</span>
                <input
                  className="field-input"
                  required value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Nombre y apellido"
                />
              </label>
              <label className="field">
                <span className="field-label">Documento</span>
                <input
                  className="field-input"
                  required value={form.documento}
                  onChange={(e) => setForm({ ...form, documento: e.target.value })}
                  placeholder="Cédula"
                />
              </label>
            </div>
            <div className="auth-form-row">
              <label className="field">
                <span className="field-label">Teléfono</span>
                <input
                  className="field-input"
                  required value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  placeholder="3001234567"
                  inputMode="numeric"
                />
              </label>
              <label className="field">
                <span className="field-label">Email (opcional)</span>
                <input
                  className="field-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary btn-lg">
                <span className="material-symbols-outlined icon">save</span>
                Crear miembro
              </button>
              <button type="button" className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="filter-bar">
        <form onSubmit={onSearch} className="search-input filter-bar__search" role="search">
          <span className="material-symbols-outlined icon">search</span>
          <input
            placeholder="Buscar por nombre, documento, correo o código QR"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar miembros"
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={loading}>
            Buscar
          </button>
        </form>

        <div className="filter-bar__chips" role="tablist" aria-label="Filtros">
          {FILTROS.map((f) => (
            <button
              type="button"
              key={f.id}
              role="tab"
              aria-selected={filtro === f.id}
              className={`chip${filtro === f.id ? ' chip-active' : ''}`}
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
              <span className="chip-count">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="table-card">
        {loading && <div className="bar-loader" />}
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Documento</th>
                <th>Contacto</th>
                <th>QR</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 40 }}>
                    No hay miembros que coincidan con el filtro actual.
                  </td>
                </tr>
              )}
              {filtrados.map((m) => {
                const initials = (m.nombre || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <tr key={m.id_miembro}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="avatar avatar-primary">{initials}</span>
                        <div>
                          <strong style={{ display: 'block' }}>{m.nombre}</strong>
                          {m.email && (
                            <small style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>
                              {m.email}
                            </small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{m.documento}</td>
                    <td>{m.telefono}</td>
                    <td>
                      <code style={{
                        fontFamily: 'var(--font-label)',
                        fontSize: 12,
                        padding: '4px 8px',
                        background: 'var(--surface-container-lowest)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-subtle)',
                      }}>
                        {m.codigo_qr}
                      </code>
                    </td>
                    <td>{statusChip(m)}</td>
                    <td className="row-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onDelete(m)}
                        aria-label={`Desactivar a ${m.nombre}`}
                      >
                        <span className="material-symbols-outlined icon">person_remove</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-card__foot">
          <span>Mostrando {filtrados.length} de {items.length} miembros</span>
          <span>{items.filter((m) => m.vencido).length} con membresía vencida</span>
        </div>
      </section>
    </>
  );
}