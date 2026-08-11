import { useEffect, useState } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitloyalty_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [form, setForm] = useState({ email: '', nombre: '', rol: 'RECEPCIONISTA' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError(err.response?.data?.error || 'No se pudo cargar la informacion de staff.');
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
      let msg = `Invitacion enviada a ${data.invitation.email}.`;
      if (!data.emailDelivered) {
        msg += ' (SMTP no configurado en este entorno; el receptor tendra que abrir el link devuelto).';
        if (data.devAcceptToken) {
          msg += ` Link dev: /accept-invite?token=${data.devAcceptToken}`;
        }
      }
      setInfo(msg);
      setForm({ email: '', nombre: '', rol: 'RECEPCIONISTA' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar la invitacion.');
    }
  };

  const onRevoke = async (id) => {
    if (!window.confirm('Revocar esta invitacion?')) return;
    try {
      await api.post(`/admin/staff/invitations/${id}/revoke`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo revocar.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Staff</h1>
        <p className="subtitle">Invita a recepcionistas o mas admins. Tu te registraste; ellos los invitas tu.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-info">{info}</div>}

      <form className="panel" onSubmit={onSend}>
        <div className="form-grid">
          <div className="field">
            <label>Nombre</label>
            <input name="nombre" required value={form.nombre} onChange={onChange} />
          </div>
          <div className="field">
            <label>Correo</label>
            <input name="email" type="email" required value={form.email} onChange={onChange} />
          </div>
          <div className="field">
            <label>Rol</label>
            <select name="rol" value={form.rol} onChange={onChange}>
              <option value="RECEPCIONISTA">Recepcionista</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" type="submit">Enviar invitacion</button>
      </form>

      <section className="panel">
        <div className="panel-header">
          <div className="panel-title">Invitaciones</div>
        </div>
        {loading && <div className="bar-loader" />}
        <table className="table">
          <thead>
            <tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Expira</th><th></th></tr>
          </thead>
          <tbody>
            {invitations.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>Aun no hay invitaciones.</td></tr>
            )}
            {invitations.map((i) => (
              <tr key={i.id_invitacion}>
                <td>{i.email}</td>
                <td>{i.nombre}</td>
                <td>{i.rol_asignado}</td>
                <td>
                  {i.fecha_aceptacion ? 'Aceptada' : i.fecha_revocado ? 'Revocada' : i.pendiente ? 'Pendiente' : 'Expirada'}
                </td>
                <td>{new Date(i.fecha_expiracion).toLocaleDateString('es-CO')}</td>
                <td>
                  {i.pendiente && (
                    <button className="btn btn-sm btn-secondary" onClick={() => onRevoke(i.id_invitacion)}>
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div className="panel-title">Usuarios del gimnasio</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Activo</th></tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id_usuario}>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>{u.rol}</td>
                <td>{u.activo ? 'Si' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
