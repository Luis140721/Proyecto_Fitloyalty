import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../context/AuthContext';
import '../styles/login.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token'); // viene en el enlace ?token=...

  const [form, setForm]       = useState({ password: '', confirm: '' });
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!token) {
      return setError('El enlace no es válido. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".');
    }
    if (form.password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (form.password !== form.confirm) {
      return setError('Las contraseñas no coinciden.');
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/reset-password', { token, password: form.password });
      setMessage(data.message);
      // Tras 2 segundos llevamos al usuario al login.
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-brand">
        <div className="login-brand__content">
          <div className="login-logo">
            <span className="login-logo__icon">🏋️</span>
          </div>
          <h1 className="login-brand__title">FitLoyalty</h1>
          <p className="login-brand__sub">Crea tu nueva contraseña</p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">Restablecer contraseña</h2>
            <p className="login-card__sub">Ingresa y confirma tu nueva contraseña.</p>
          </div>

          {error && (
            <div className="login-alert login-alert--error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          {message && (
            <div className="login-alert login-alert--success" role="status">
              <span>✅</span> {message} Redirigiendo al inicio de sesión...
            </div>
          )}

          {!message && (
            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="form-group">
                <label className="form-label">Nueva contraseña</label>
                <input
                  name="password"
                  type="password"
                  className="form-input"
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={handleChange}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirmar contraseña</label>
                <input
                  name="confirm"
                  type="password"
                  className="form-input"
                  placeholder="Repite tu nueva contraseña"
                  value={form.confirm}
                  onChange={handleChange}
                  disabled={loading}
                  required
                />
              </div>

              <button type="submit" className="btn-login" disabled={loading}>
                {loading
                  ? <span className="btn-login__loading"><span className="spinner-sm" /> Guardando...</span>
                  : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}

          <div className="login-divider"><span>¿Necesitas otra cosa?</span></div>
          <Link to="/login" className="btn-register">Volver a iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
