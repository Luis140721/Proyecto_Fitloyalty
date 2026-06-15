import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../context/AuthContext';
import '../styles/login.css';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [devUrl, setDevUrl]   = useState('');   // Solo desarrollo: enlace de prueba
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setDevUrl('');

    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
      // En desarrollo el backend devuelve el enlace para poder probar sin correo real.
      if (data.devResetUrl) setDevUrl(data.devResetUrl);
    } catch (err) {
      setError(err.response?.data?.error || 'Ocurrió un error. Intenta de nuevo.');
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
          <p className="login-brand__sub">Recupera el acceso a tu cuenta</p>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">¿Olvidaste tu contraseña?</h2>
            <p className="login-card__sub">
              Ingresa tu correo y te enviaremos un enlace para restablecerla.
            </p>
          </div>

          {error && (
            <div className="login-alert login-alert--error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          {message && (
            <div className="login-alert login-alert--success" role="status">
              <span>✅</span> {message}
            </div>
          )}

          {/* Enlace de prueba (solo desarrollo, mientras no haya correo real) */}
          {devUrl && (
            <div className="login-alert login-alert--success" role="status">
              <span>🔗</span>{' '}
              <a href={devUrl}>Abrir enlace de recuperación (modo prueba)</a>
            </div>
          )}

          {!message && (
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
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                  autoComplete="email"
                  disabled={loading}
                  required
                />
              </div>

              <button type="submit" className="btn-login" disabled={loading}>
                {loading
                  ? <span className="btn-login__loading"><span className="spinner-sm" /> Enviando...</span>
                  : 'Enviar enlace de recuperación'}
              </button>
            </form>
          )}

          <div className="login-divider"><span>¿Ya la recordaste?</span></div>
          <Link to="/login" className="btn-register">Volver a iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
