import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarTelefonoColombiano(phone) {
  const digits = (phone || '').toString().replace(/\D/g, '');
  return /^[3]\d{9}$/.test(digits);
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]       = useState({ gymName: '', gymPhone: '', gymEmail: '', ownerName: '', ownerEmail: '', password: '', confirm: '' });
  const [error, setError]     = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    let value = e.target.value;
    if (e.target.name === 'gymPhone') {
      value = value.toString().replace(/\D/g, '').slice(0, 10);
      if (value.length > 0 && value[0] !== '3') {
        setPhoneError('El teléfono debe comenzar con 3.');
      } else {
        setPhoneError('');
      }
      if (error) {
        setError('');
      }
    } else if (error) {
      setError('');
    }

    setForm(prev => ({ ...prev, [e.target.name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.gymName || !form.gymPhone || !form.ownerName || !form.ownerEmail || !form.password || !form.confirm) {
      return setError('Todos los campos marcados son obligatorios.');
    }
    if (!validarEmail(form.ownerEmail)) {
      return setError('Ingresa un correo electrónico válido para el administrador.');
    }
    if (form.gymEmail && !validarEmail(form.gymEmail)) {
      return setError('Ingresa un correo electrónico válido para el gimnasio.');
    }
    if (!validarTelefonoColombiano(form.gymPhone)) {
      return setError('El teléfono debe tener 10 dígitos colombianos y comenzar con 3.');
    }
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (form.password.includes(' ')) return setError('La contraseña no puede contener espacios.');
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
              <div className="form-input-row">
                <input
                  name="gymPhone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input"
                  placeholder="3001234567"
                  value={form.gymPhone}
                  onChange={handleChange}
                  disabled={loading}
                  required
                />
                <span className={`input-note ${phoneError ? 'error' : ''}`} role="status" aria-live="polite">
                  {phoneError || '10 dígitos, comienza con 3'}
                </span>
              </div>
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
              <div className="form-help">La contraseña debe tener al menos 6 caracteres y no puede contener espacios.</div>
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
