import { useEffect, useState } from 'react';
import { api } from '../api';

const ROLE_LABELS = {
  ADMINISTRADOR:   { label: 'Admin',          cls: 'role-pill role-pill--admin'   },
  RECEPCIONISTA:   { label: 'Recepción',      cls: 'role-pill role-pill--recep'   },
  ENTRENADOR:      { label: 'Entrenador',     cls: 'role-pill role-pill--trainer' },
};

function estadoInvitacion(i) {
  if (i.fecha_aceptacion) return <span className="chip chip-status chip-status--active">Aceptada</span>;
  if (i.fecha_revocado)   return <span className="chip chip-status chip-status--expired">Revocada</span>;
  if (i.pendiente)        return <span className="chip chip-status chip-status--warning">Pendiente</span>;
  return <span className="chip chip-status chip-status--expired">Expirada</span>;
}

function initials(n) {
  return (n || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
}

export default function StaffPage() {
  const [staff, setStaff]           = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [form, setForm]             = useState({ email: '', nombre: '', rol: 'RECEPCIONISTA' });
  const [error, setError]           = useState('');
  const [info, setInfo]             = useState('');
  const [loading, setLoading]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, inv] = await Promise.all([
        api.get('/admin/staff'),
        api.get('/admin/staff/invitations'),
      ]);
      setStaff(s.data.staff);
      setInvitations(inv.data.invitations);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la información de staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSend = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    try {
      const { data } = await api.post('/admin/staff/invite', form);
      let msg = `Invitación enviada a ${data.invitation.email}.`;
      if (!data.emailDelivered) {
        msg += ' (SMTP no configurado en este entorno; el receptor tendrá que abrir el link devuelto).';
        if (data.devAcceptToken) msg += ` Link dev: /accept-invite?token=${data.devAcceptToken}`;
      }
      setInfo(msg);
      setForm({ email: '', nombre: '', rol: 'RECEPCIONISTA' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar la invitación.');
    }
  };

  const onRevoke = async (id) => {
    if (!window.confirm('¿Revocar esta invitación?')) return;
    try { await api.post(`/admin/staff/invitations/${id}/revoke`); load(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo revocar.'); }
  };

  const lastInvite = invitations[0];
  const recentInvites = invitations.slice(0, 5);

  return (
    <>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Equipo</h1>
          <p className="admin-page-head__lead">
            Invita a recepcionistas, entrenadores o más admins. Tú te registraste; ellos entran por tu invitación.
          </p>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-info" role="status">
          <span className="material-symbols-outlined icon">mark_email_read</span>
          <span>{info}</span>
        </div>
      )}

      <section className="staff-shell">
        {/* Columna izquierda: invitar + equipo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <article className="chart-card">
            <header className="chart-card__head">
              <div>
                <h3>Invitar a alguien</h3>
                <p>Le llega un correo con un link. Tiene 7 días para aceptarlo.</p>
              </div>
              <span className="chip chip-active">
                <span className="material-symbols-outlined icon" style={{ fontSize: 14 }}>mail</span>
                Link por correo
              </span>
            </header>
            <form className="auth-form" onSubmit={onSend} noValidate>
              <div className="auth-form-row">
                <label className="field">
                  <span className="field-label">Nombre</span>
                  <input
                    className="field-input"
                    name="nombre" required
                    value={form.nombre} onChange={onChange}
                    placeholder="Nombre y apellido"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Correo</span>
                  <input
                    className="field-input"
                    name="email" type="email" required
                    value={form.email} onChange={onChange}
                    placeholder="persona@correo.com"
                  />
                </label>
              </div>
              <div className="auth-form-row">
                <label className="field">
                  <span className="field-label">Rol que tendrá</span>
                  <select
                    className="field-input"
                    name="rol"
                    value={form.rol} onChange={onChange}
                  >
                    <option value="RECEPCIONISTA">Recepcionista</option>
                    <option value="ADMINISTRADOR">Administrador</option>
                    <option value="ENTRENADOR">Entrenador</option>
                  </select>
                </label>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary btn-block btn-lg">
                    <span className="material-symbols-outlined icon">send</span>
                    Enviar invitación
                  </button>
                </div>
              </div>
            </form>
          </article>

          <article className="table-card">
            <div style={{ padding: '20px 24px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
                Invitaciones enviadas
              </h3>
              <span style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                {invitations.length} en total
              </span>
            </div>
            {loading && <div className="bar-loader" />}
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Expira</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {invitations.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 32 }}>
                        Aún no has invitado a nadie.
                      </td>
                    </tr>
                  )}
                  {invitations.map((i) => (
                    <tr key={i.id_invitacion}>
                      <td><strong>{i.email}</strong></td>
                      <td>{i.nombre}</td>
                      <td>
                        <span className={ROLE_LABELS[i.rol_asignado]?.cls || 'role-pill'}>
                          {ROLE_LABELS[i.rol_asignado]?.label || i.rol_asignado}
                        </span>
                      </td>
                      <td>{estadoInvitacion(i)}</td>
                      <td>{new Date(i.fecha_expiracion).toLocaleDateString('es-CO')}</td>
                      <td className="row-actions">
                        {i.pendiente && (
                          <button className="btn btn-ghost btn-sm" onClick={() => onRevoke(i.id_invitacion)}>
                            <span className="material-symbols-outlined icon">delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="table-card">
            <div style={{ padding: '20px 24px 4px' }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
                Usuarios del gimnasio
              </h3>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                Quiénes tienen acceso actualmente a este gimnasio.
              </p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Activo</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((u) => (
                    <tr key={u.id_usuario}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="avatar avatar-primary">{initials(u.nombre)}</span>
                          <strong>{u.nombre}</strong>
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className={ROLE_LABELS[u.rol]?.cls || 'role-pill'}>
                          {ROLE_LABELS[u.rol]?.label || u.rol}
                        </span>
                      </td>
                      <td>
                        {u.activo
                          ? <span className="chip chip-status chip-status--active">Activo</span>
                          : <span className="chip chip-status chip-status--expired">Inactivo</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        {/* Columna derecha: timeline actividad reciente */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'flex-start' }}>
          <article className="staff-card">
            <h3>Actividad reciente</h3>
            {recentInvites.length === 0 ? (
              <p style={{ color: 'var(--on-surface-variant)', fontSize: 14 }}>
                Cuando alguien acepte una invitación o se una al equipo, lo verás aquí.
              </p>
            ) : (
              <div className="staff-timeline">
                {recentInvites.map((i) => (
                  <div className="timeline-item" key={i.id_invitacion}>
                    <strong>
                      {i.fecha_aceptacion ? `${i.nombre} aceptó la invitación` :
                       i.fecha_revocado   ? `Invitación a ${i.nombre} revocada` :
                       `Invitación enviada a ${i.nombre}`}
                    </strong>
                    <span>
                      {ROLE_LABELS[i.rol_asignado]?.label || i.rol_asignado} ·{' '}
                      {new Date(i.fecha_expiracion).toLocaleDateString('es-CO')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="staff-card">
            <h3>Última invitación</h3>
            {lastInvite ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="avatar avatar-primary avatar-lg">{initials(lastInvite.nombre)}</div>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 16 }}>
                    {lastInvite.nombre}
                  </strong>
                  <small style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                    {lastInvite.email}
                  </small>
                  <div style={{ marginTop: 6 }}>{estadoInvitacion(lastInvite)}</div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--on-surface-variant)', fontSize: 14 }}>
                Aún no has invitado a nadie. Usa el formulario de la izquierda para empezar.
              </p>
            )}
          </article>

          <article className="staff-card">
            <h3>Buenas prácticas</h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 0, margin: 0, listStyle: 'none' }}>
              {[
                { icon: 'badge',           text: 'Cada quien ve solo lo suyo, según su rol.' },
                { icon: 'lock_clock',      text: 'Las invitaciones expiran en 7 días.' },
                { icon: 'admin_panel_settings', text: 'Solo tú (admin) puedes invitar más gente.' },
              ].map((p, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--on-surface-variant)' }}>
                  <span className="material-symbols-outlined icon" style={{ color: 'var(--primary)', fontSize: 18 }}>{p.icon}</span>
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </section>
    </>
  );
}