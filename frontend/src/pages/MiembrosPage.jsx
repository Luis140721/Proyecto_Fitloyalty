import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import CardGlass from '../components/CardGlass';
import BadgeEstado, { estadoDeMiembro } from '../components/BadgeEstado';
import EmptyState from '../components/EmptyState';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import Ripple from '../components/Ripple';

const empty = { nombre: '', documento: '', telefono: '', email: '', activo: true };
const FILTROS = [
  { id: 'todos',  label: 'Todos' },
  { id: 'al-dia', label: 'Al día' },
  { id: 'vence',  label: 'Vence pronto' },
  { id: 'vencido',label: 'Vencido' },
  { id: 'riesgo', label: 'En riesgo' },
];

// Nota: el antiguo statusChip() se reemplazo por el componente <BadgeEstado />.

function SkeletonRows({ cols, rows = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={`sk-${i}`} aria-hidden="true">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j}>
              <span
                className="skeleton"
                style={{ display: 'block', height: 14, width: j === 0 ? '60%' : '85%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
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

  // Edicion
  const [editing, setEditing]   = useState(null);   // miembro en edicion
  const [editForm, setEditForm] = useState(empty);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Confirm desactivar
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // miembro a desactivar

  // Ripple handlers.
  const crearRipple = Ripple({ opacity: 0.30 });
  const guardarRipple = Ripple({ opacity: 0.30 });
  const desactivarRipple = Ripple({ opacity: 0.30 });

  const load = async (query = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/miembros', { params: { q: query, pageSize: 100 } });
      setItems(data.miembros);
    } catch (err) {
      setError(err.message || 'Error al cargar miembros.');
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
      setError(err.message || 'No se pudo crear el miembro.');
    }
  };

  // Abre modal de edicion con el form prellenado.
  const openEdit = (m) => {
    setEditing(m);
    setEditForm({
      nombre:   m.nombre   || '',
      documento: m.documento || '',
      telefono: m.telefono || '',
      email:    m.email    || '',
      activo:   m.activo !== false,
    });
    setEditError('');
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditing(null);
    setEditForm(empty);
    setEditError('');
  };

  const onSaveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setEditError('');
    setEditSaving(true);
    try {
      const payload = { ...editForm };
      if (!payload.email) delete payload.email;
      await api.put(`/admin/miembros/${editing.id_miembro}`, payload);
      setEditing(null);
      setEditForm(empty);
      setInfo('Miembro actualizado.');
      load(q);
    } catch (err) {
      setEditError(err.message || 'No se pudo actualizar.');
    } finally {
      setEditSaving(false);
    }
  };

  // Reemplaza window.confirm por Modal.
  const askDeactivate = (m) => setConfirmDeactivate(m);

  const doDeactivate = async () => {
    const m = confirmDeactivate;
    if (!m) return;
    try {
      await api.delete(`/admin/miembros/${m.id_miembro}`);
      setInfo(`Miembro ${m.nombre} desactivado.`);
      setConfirmDeactivate(null);
      load(q);
    } catch (err) {
      setError(err.message || 'No se pudo eliminar.');
      setConfirmDeactivate(null);
    }
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
    <PageTransition>
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
        <div className="alert alert-error anim-scale-in" role="alert">
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-success anim-scale-in" role="status">
          <span className="material-symbols-outlined icon">check_circle</span>
          <span>{info}</span>
        </div>
      )}

      {open && (
        <section className="chart-card anim-scale-in" style={{ marginBottom: 24 }}>
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
              <button type="submit" className="btn btn-primary btn-lg ripple-host" onClick={crearRipple}>
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

      <section className="table-card miembros-table">
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
              {loading && items.length === 0 && <SkeletonRows cols={6} rows={6} />}

              {!loading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 24 }}>
                    <EmptyState
                      icono="group_off"
                      titulo="Sin miembros que mostrar"
                      descripcion="No hay miembros que coincidan con el filtro actual."
                      ctaLabel="Nuevo miembro"
                      onCta={() => setOpen(true)}
                    />
                  </td>
                </tr>
              )}

              {filtrados.map((m, idx) => {
                const initials = (m.nombre || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                const delayClass = `anim-delay-${(idx % 8) + 1}`;
                return (
                  <tr
                    key={m.id_miembro}
                    className={`member-row-clickable anim-fade-up ${delayClass}`}
                    onClick={() => openEdit(m)}
                  >
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
                    <td><BadgeEstado estado={estadoDeMiembro(m)} /></td>
                    <td className="row-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => { e.stopPropagation(); askDeactivate(m); }}
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
        {/* Vista movil (<900px): cada miembro es una CardGlass (tarea 21-ago).
            En escritorio se muestra la tabla original; CSS decide cual se ve. */}
        <div className="miembros-cards">
          {filtrados.length === 0 && !loading && (
            <EmptyState
              icono="group_off"
              titulo="Sin miembros que mostrar"
              descripcion="No hay miembros que coincidan con el filtro actual."
              ctaLabel="Nuevo miembro"
              onCta={() => setOpen(true)}
            />
          )}
          {filtrados.map((m) => {
            const initials = (m.nombre || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <CardGlass as="article" key={m.id_miembro} className="miembro-card">
                <header className="miembro-card__head">
                  <span className="avatar avatar-primary">{initials}</span>
                  <div className="miembro-card__id">
                    <strong>{m.nombre}</strong>
                    {m.email && <small>{m.email}</small>}
                  </div>
                  <BadgeEstado estado={estadoDeMiembro(m)} />
                </header>
                <dl className="miembro-card__data">
                  <div>
                    <dt>Documento</dt>
                    <dd>{m.documento}</dd>
                  </div>
                  <div>
                    <dt>Telefono</dt>
                    <dd>{m.telefono}</dd>
                  </div>
                  <div className="miembro-card__qr">
                    <dt>QR</dt>
                    <dd><code>{m.codigo_qr}</code></dd>
                  </div>
                </dl>
                <footer className="miembro-card__actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onDelete(m)}
                    aria-label={`Desactivar a ${m.nombre}`}
                  >
                    <span className="material-symbols-outlined icon">person_remove</span>
                    Desactivar
                  </button>
                </footer>
              </CardGlass>
            );
          })}
        </div>
        <div className="table-card__foot">
          <span>Mostrando {filtrados.length} de {items.length} miembros</span>
          <span>{items.filter((m) => m.vencido).length} con membresía vencida</span>
        </div>
      </section>

      {/* Modal de edicion */}
      <Modal
        open={Boolean(editing)}
        onClose={closeEdit}
        title={editing ? `Editar ${editing.nombre}` : 'Editar miembro'}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeEdit}
              disabled={editSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="miembros-edit-form"
              className="btn btn-primary ripple-host"
              onClick={guardarRipple}
              disabled={editSaving}
            >
              <span className="material-symbols-outlined icon">save</span>
              {editSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </>
        }
      >
        <form id="miembros-edit-form" className="auth-form" onSubmit={onSaveEdit} noValidate>
          {editError && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined icon">error</span>
              <span>{editError}</span>
            </div>
          )}
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Nombre completo</span>
              <input
                className="field-input"
                required
                value={editForm.nombre}
                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                placeholder="Nombre y apellido"
              />
            </label>
            <label className="field">
              <span className="field-label">Documento</span>
              <input
                className="field-input"
                required
                value={editForm.documento}
                onChange={(e) => setEditForm({ ...editForm, documento: e.target.value })}
                placeholder="Cédula"
              />
            </label>
          </div>
          <div className="auth-form-row">
            <label className="field">
              <span className="field-label">Teléfono</span>
              <input
                className="field-input"
                required
                value={editForm.telefono}
                onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                placeholder="3001234567"
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="field-input"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </label>
          </div>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={Boolean(editForm.activo)}
              onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })}
            />
            <span className="field-label" style={{ margin: 0 }}>Miembro activo</span>
          </label>
        </form>
      </Modal>

      {/* Modal de confirmacion al desactivar */}
      <Modal
        open={Boolean(confirmDeactivate)}
        onClose={() => setConfirmDeactivate(null)}
        variant="danger"
        title="Desactivar miembro"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmDeactivate(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger ripple-host"
              onClick={(e) => { desactivarRipple(e); doDeactivate(); }}
            >
              <span className="material-symbols-outlined icon">person_remove</span>
              Sí, desactivar
            </button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          ¿Seguro que quieres desactivar a{' '}
          <strong>{confirmDeactivate?.nombre}</strong>?
        </p>
        <p style={{ marginTop: 10, color: 'var(--on-surface-variant)', fontSize: 13 }}>
          No podrá ingresar al gimnasio hasta que lo reactives. Esta acción puede
          revertirse editando al miembro.
        </p>
      </Modal>
    </PageTransition>
  );
}