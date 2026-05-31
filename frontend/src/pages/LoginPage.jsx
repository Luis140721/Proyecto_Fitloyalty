import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

// Ruta del dashboard según rol
function getDashboardPath(role) {
  switch (role) {
    case 'admin':        return '/dashboard/admin';
    case 'receptionist': return '/dashboard/receptionist';
    case 'member':       return '/dashboard/member';
    default:             return '/dashboard';
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [form, setForm]     = useState({ email: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const from = location.state?.from?.pathname || null;

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Por favor completa todos los campos.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      const dest = from || getDashboardPath(user.role);
      navigate(dest, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al iniciar sesión. Intenta de nuevo.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      {/* Panel izquierdo — branding */}
      <div className="login-brand">
        <div className="login-brand__content">
          <div className="login-logo">
            <span className="login-logo__icon">🏋️</span>
          </div>
          <h1 className="login-brand__title">FitLoyalty</h1>
          <p className="login-brand__sub">CRM para gimnasios de barrio</p>

          <div className="login-features">
            <div className="login-feature">
              <span>📊</span>
              <span>Reportes de asistencia en tiempo real</span>
            </div>
            <div className="login-feature">
              <span>🔔</span>
              <span>Alertas de abandono automáticas</span>
            </div>
            <div className="login-feature">
              <span>🎯</span>
              <span>Retos y gamificación para tus socios</span>
            </div>
            <div className="login-feature">
              <span>📱</span>
              <span>Registro por código QR y código de barras</span>
            </div>
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">Bienvenido de vuelta</h2>
            <p className="login-card__sub">Ingresa tus datos para continuar</p>
          </div>

          {error && (
            <div className="login-alert login-alert--error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                name="email"
                className="form-input"
                placeholder="tu@correo.com"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Contraseña
              </label>
              <div className="input-password-wrapper">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="btn-show-pass"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="login-form__options">
              <label className="remember-label">
                <input type="checkbox" /> Recordarme
              </label>
              <Link to="/forgot-password" className="link-forgot">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <button
              type="submit"
              className="btn-login"
              disabled={loading}
            >
              {loading ? (
                <span className="btn-login__loading">
                  <span className="spinner-sm" /> Ingresando...
                </span>
              ) : 'Ingresar'}
            </button>
          </form>

          <div className="login-divider"><span>¿Eres nuevo?</span></div>

          <Link to="/register" className="btn-register">
            Crear cuenta de socio
          </Link>

          {/* Usuarios de prueba — solo para desarrollo */}
          <details className="dev-hint">
            <summary>🧪 Usuarios de prueba (dev)</summary>
            <table className="dev-hint__table">
              <thead>
                <tr><th>Email</th><th>Contraseña</th><th>Rol</th></tr>
              </thead>
              <tbody>
                <tr><td>admin@fitloyalty.com</td><td>admin123</td><td>Admin</td></tr>
                <tr><td>recepcion@fitloyalty.com</td><td>recep123</td><td>Recepcionista</td></tr>
                <tr><td>carlos@gmail.com</td><td>miembro123</td><td>Miembro</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
  );
}
