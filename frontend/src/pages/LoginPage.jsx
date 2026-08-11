import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form.email.trim(), form.password);
      const from = location.state?.from;
      if (user?.role === 'admin') {
        navigate(from && from.startsWith('/admin') ? from : '/admin/dashboard', { replace: true });
      } else {
        navigate(from && from.startsWith('/admin') ? from : '/admin/checkin', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesion.');
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
        <h1>Bienvenido de vuelta</h1>
        <p>Gestiona miembros, staff y asistencia en un solo lugar. Tu prueba gratuita sigue corriendo mientras estes activo.</p>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h2>Iniciar sesion</h2>
          <p className="subtitle">Usa el correo con el que te registraste.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label>Correo</label>
            <input name="email" type="email" required value={form.email} onChange={onChange} />
          </div>
          <div className="field">
            <label>Contrasena</label>
            <input name="password" type="password" required value={form.password} onChange={onChange} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="helper">
            <Link to="/forgot-password">Olvide mi contrasena</Link>
            {' · '}
            <Link to="/register">No tengo cuenta</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
