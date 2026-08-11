import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setError('Token no proporcionado.'); return; }
    let alive = true;
    axios.get(`/api/auth/accept-invite/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (alive) setPreview(data); })
      .catch((err) => {
        if (alive) setError(err.response?.data?.error || 'Invitacion no valida.');
      });
    return () => { alive = false; };
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await acceptInvite(token, password);
      navigate(user?.role === 'admin' ? '/admin/dashboard' : '/admin/checkin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo aceptar la invitacion.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <div className="brand-row">
          <div className="brand-mark">FL</div>
          <div className="brand-name">FitLoyalty</div>
        </div>
        <h1>Te invitaron a FitLoyalty</h1>
        <p>Estas a un paso de unirte al equipo de trabajo.</p>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h2>Aceptar invitacion</h2>
          {error && <div className="alert alert-error">{error}</div>}

          {preview && (
            <div className="alert alert-info">
              Te invitaron a <strong>{preview.gym}</strong> como <strong>{preview.rol}</strong>.
              <br />
              Correo: <strong>{preview.email}</strong>
              <br />
              Expira: {new Date(preview.expiresAt).toLocaleString('es-CO')}
            </div>
          )}

          {preview && (
            <form onSubmit={onSubmit}>
              <div className="field">
                <label>Crea tu contrasena (min 6 caracteres, al menos un numero)</label>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Aceptando...' : 'Crear cuenta y entrar'}
              </button>
            </form>
          )}
        </form>
      </main>
    </div>
  );
}
