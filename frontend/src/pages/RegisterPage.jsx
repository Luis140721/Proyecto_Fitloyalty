import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]       = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.name || !form.email || !form.password) {
      return setError('Nombre, correo y contraseña son obligatorios.');
    }
    if (form.password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (form.password !== form.confirm) {
      return setError('Las contraseñas no coinciden.');
    }

    setLoading(true);
    try {
      await register(form.name, form.email, form.password, form.phone);
      navigate('/dashboard/member', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrarse. Intenta de nuevo.');
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
          <p className="login-brand__sub">Únete a tu gimnasio</p>
          <div className="login-features">
            <div className="login-feature"><span>✅</span><span>Lleva el registro de tus asistencias</span></div>
            <div className="login-feature"><span>🏆</span><span>Participa en retos y gana premios</span></div>
            <div className="login-feature"><span>📈</span><span>Ve tu progreso semana a semana</span></div>
          </div>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">Crear cuenta</h2>
            <p className="login-card__sub">Regístrate como socio del gimnasio</p>
          </div>

          {error && (
            <div className="login-alert login-alert--error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-group">
              <label className="form-label">Nombre completo</label>
              <input name="name" type="text" className="form-input"
                placeholder="Carlos Pérez" value={form.name}
                onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Correo electrónico</label>
              <input name="email" type="email" className="form-input"
                placeholder="tu@correo.com" value={form.email}
                onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Teléfono <span className="optional">(opcional)</span></label>
              <input name="phone" type="tel" className="form-input"
                placeholder="+57 300 123 4567" value={form.phone}
                onChange={handleChange} disabled={loading} />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input name="password" type="password" className="form-input"
                placeholder="Mínimo 6 caracteres" value={form.password}
                onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar contraseña</label>
              <input name="confirm" type="password" className="form-input"
                placeholder="Repite tu contraseña" value={form.confirm}
                onChange={handleChange} disabled={loading} required />
            </div>

            <button type="submit" className="btn-login" disabled={loading}>
              {loading
                ? <span className="btn-login__loading"><span className="spinner-sm" /> Creando cuenta...</span>
                : 'Crear cuenta'}
            </button>
          </form>

          <div className="login-divider"><span>¿Ya tienes cuenta?</span></div>
          <Link to="/login" className="btn-register">Iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
