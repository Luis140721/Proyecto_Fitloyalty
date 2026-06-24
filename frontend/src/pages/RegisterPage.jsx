import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]       = useState({ gymName: '', gymPhone: '', gymEmail: '', ownerName: '', ownerEmail: '', password: '', confirm: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.gymName || !form.gymPhone || !form.ownerName || !form.ownerEmail || !form.password) {
      return setError('Todos los campos marcados son obligatorios.');
    }
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden.');

    setLoading(true);
    try {
      await register(form.gymName, form.gymPhone, form.ownerName, form.ownerEmail, form.password);
      // redirigir al onboarding/dashboard
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear la cuenta. Intenta de nuevo.');
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
          <p className="login-brand__sub">Crea tu gimnasio — prueba gratis 7 días</p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">Crear cuenta de administrador (dueño)</h2>
            <p className="login-card__sub">Regístrate como dueño y obtén 7 días de prueba gratuita.</p>
          </div>

          {error && (
            <div className="login-alert login-alert--error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-group">
              <label className="form-label">Nombre del gimnasio</label>
              <input name="gymName" type="text" className="form-input" placeholder="Iron House Gym" value={form.gymName} onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Teléfono del gimnasio</label>
              <input name="gymPhone" type="tel" className="form-input" placeholder="+57 300 123 4567" value={form.gymPhone} onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Nombre del administrador</label>
              <input name="ownerName" type="text" className="form-input" placeholder="Carlos Pérez" value={form.ownerName} onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Correo del administrador</label>
              <input name="ownerEmail" type="email" className="form-input" placeholder="dueño@mi-gym.com" value={form.ownerEmail} onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input name="password" type="password" className="form-input" placeholder="Mínimo 6 caracteres" value={form.password} onChange={handleChange} disabled={loading} required />
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar contraseña</label>
              <input name="confirm" type="password" className="form-input" placeholder="Repite tu contraseña" value={form.confirm} onChange={handleChange} disabled={loading} required />
            </div>

            <button type="submit" className="btn-login" disabled={loading}>{loading ? <span className="btn-login__loading"><span className="spinner-sm" /> Creando cuenta...</span> : 'Crear gimnasio y cuenta (7 días gratis)'}</button>
          </form>

          <div className="login-divider"><span>¿Ya tienes cuenta?</span></div>
          <Link to="/login" className="btn-register">Iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
