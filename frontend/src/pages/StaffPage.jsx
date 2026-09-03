import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import PageTransition from '../components/PageTransition';
import Ripple from '../components/Ripple';
import Modal from '../components/Modal';

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

  // Feedback visual en el input email.
  const [emailState, setEmailState] = useState('idle'); // 'idle' | 'shake' | 'success'
  const emailRef = useRef(null);

  // Pulse badge: solo en la ultima invitacion al cargar (2s).
  const [pulseBadge, setPulseBadge] = useState(false);
  const lastInviteIdRef = useRef(null);

  // Modal de revocacion.
  const [confirmRevoke, setConfirmRevoke] = useState(null); // invitacion a revocar

  const load = async () => {
    setLoading(true);
    try {
      const [s, inv] = await Promise.all([
        api.get('/admin/staff'),
        api.get('/admin/staff/invitations'),
      ]);
      setStaff(s.data.staff);
      const invs = inv.data.invitations;
      setInvitations(invs);
      // Solo pulsa si aparece una invitacion MAS RECIENTE que la ultima vista.
      const top = invs[0];
      if (top && top.id_invitacion !== lastInviteIdRef.current) {
        lastInviteIdRef.current = top.id_invitacion;
        setPulseBadge(true);
        setTimeout(() => setPulseBadge(false), 2000);
      }
    } catch (err) {
      setError(err.message || 'No se pudo cargar la información de staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    // Cualquier edicion limpia el feedback visual previo del input.
    if (emailState !== 'idle') setEmailState('idle');
  };

  const onSend = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    setEmailState('idle');
    try {
      const { data } = await api.post('/admin/staff/invite', form);
      let msg = `Invitación enviada a ${data.invitation.email}.`;
      if (!data.emailDelivered) {
        msg += ' (SMTP no configurado en este entorno; el receptor tendrá que abrir el link devuelto).';
        if (data.devAcceptToken) msg += ` Link dev: /accept-invite?token=${data.devAcceptToken}`;
      }
      setInfo(msg);
      setForm({ email: '', nombre: '', rol: 'RECEPCIONISTA' });
      setEmailState('success');
      setTimeout(() => setEmailState('idle'), 1600);
      load();
    } catch (err) {
      setError(err.message || 'No se pudo enviar la invitación.');
      // Shake en el input email (re-aplica la clase via state para reiniciar anim).
      setEmailState('shake');
      setTimeout(() => setEmailState('idle'), 450);
    }
  };

  // Revocacion via Modal en vez de window.confirm.
  const askRevoke = (i) => setConfirmRevoke(i);

  const doRevoke = async () => {
    const i = confirmRevoke;
    if (!i) return;
    try {
      await api.post(`/admin/staff/invitations/${i.id_invitacion}/revoke`);
      setInfo('Invitación revocada.');
      setConfirmRevoke(null);
      load();
    } catch (err) {
      setError(err.message || 'No se pudo revocar.');
      setConfirmRevoke(null);
    }
  };

  const lastInvite = invitations[0];
  const recentInvites = invitations.slice(0, 5);

  // Ripple del boton enviar.
  const enviarRipple = Ripple({ opacity: 0.35 });

  return (
    <PageTransition>
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-head__title">Equipo</h1>
          <p className="admin-page-head__lead">
            Invita a recepcionistas, entrenadores o más admins. Tú te registraste; ellos entran por tu invitación.
          </p>
        </div>
      </header>

      {error && (
        <div className="alert alert-error anim-scale-in" role="alert">
          <span className="material-symbols-outlined icon">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="alert alert-info anim-scale-in" role="status">
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
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={emailRef}
                      className={
                        'field-input' +
                        (emailState === 'shake'  ? ' field-input--shake'   : '') +
                        (emailState === 'success' ? ' field-input--success' : '')
                      }
                      name="email" type="email" required
                      value={form.email} onChange={onChange}
                      placeholder="persona@correo.com"
                      aria-invalid={emailState === 'shake' ? 'true' : undefined}
                    />
                    {emailState === 'success' && (
                      <span
                        className="material-symbols-outlined anim-check-pop"
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          right: 12, top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--success)',
                          fontSize: 22,
                          pointerEvents: 'none',
                        }}
                      >
                        check_circle
                      </span>
                    )}
                  </div>
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
                  <button
                    type="submit"
                    className="btn btn-primary btn-block btn-lg ripple-host"
                    onClick={enviarRipple}
                  >
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
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => askRevoke(i)}
                            aria-label={`Revocar invitación a ${i.nombre}`}
                          >
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
                {recentInvites.map((i, idx) => (
                  <div
                    className={`timeline-item anim-fade-up anim-delay-${Math.min(idx + 1, 8)}`}
                    key={i.id_invitacion}
                  >
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
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 16 }}>
                    {lastInvite.nombre}
                  </strong>
                  <small style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                    {lastInvite.email}
                  </small>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {estadoInvitacion(lastInvite)}
                    {pulseBadge && (
                      <span
                        className="anim-badge-pulse"
                        title="Invitación reciente"
                        aria-label="Invitación reciente"
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: 'var(--success)',
                          boxShadow: '0 0 8px var(--success)',
                          display: 'inline-block',
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--on-surface-variant)', fontSize: 14 }}>
                Aún no has invitado a nadie. Usa el formulario «Invitar a alguien» para empezar.
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
                  <span className="material-symbols-outlined icon" style={{ color: 'var(--primary-accent)', fontSize: 18 }}>{p.icon}</span>
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </section>

      {/* Modal de confirmacion al revocar */}
      <Modal
        open={Boolean(confirmRevoke)}
        onClose={() => setConfirmRevoke(null)}
        variant="danger"
        title="Revocar invitación"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmRevoke(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger ripple-host"
              onClick={doRevoke}
            >
              <span className="material-symbols-outlined icon">delete</span>
              Sí, revocar
            </button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          ¿Revocar la invitación a{' '}
          <strong>{confirmRevoke?.nombre}</strong> ({confirmRevoke?.email})?
        </p>
        <p style={{ marginTop: 10, color: 'var(--on-surface-variant)', fontSize: 13 }}>
          El link de aceptación dejará de funcionar inmediatamente.
        </p>
      </Modal>
    </PageTransition>
  );
}