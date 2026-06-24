import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import '../styles/login.css';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail]         = useState('');
  const [error, setError]         = useState('');
  const [message, setMessage]     = useState('');
  const [devCode, setDevCode]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = window.setInterval(() => {
      setResendTimer((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendTimer]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setDevCode('');

    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
      if (data.devCode) setDevCode(data.devCode);
      setResendTimer(data.resendAfterSeconds || 60);
    } catch (err) {
      setError(err.response?.data?.error || 'Ocurrió un error. Intenta de nuevo.');
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
          <p className="login-brand__sub">Recupera el acceso a tu cuenta</p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">¿Olvidaste tu contraseña?</h2>
            <p className="login-card__sub">
              Ingresa tu correo y te enviaremos un código para restablecerla.
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
              <div style={{ marginTop: 8, fontSize: '0.88rem', color: '#065f46' }}>
                Usa el código en la página de restablecer contraseña. Revisa tu bandeja de entrada o spam.
              </div>
            </div>
          )}

          {devCode && (
            <div className="login-alert login-alert--success" role="status">
              <span>🔢</span>{' '}
              Código de prueba: <strong>{devCode}</strong>
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
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>

            <button type="submit" className="btn-login" disabled={loading || resendTimer > 0}>
              {loading
                ? <span className="btn-login__loading"><span className="spinner-sm" /> Enviando...</span>
                : resendTimer > 0
                  ? `Reenviar código en ${resendTimer}s`
                  : 'Enviar código de recuperación'}
            </button>
          </form>

          {message && (
            <button
              type="button"
              className="btn-login"
              style={{ marginTop: 12 }}
              onClick={() => navigate('/reset-password', { state: { email } })}
            >
              Ir a restablecer contraseña
            </button>
          )}

          <div className="login-divider"><span>¿Ya la recordaste?</span></div>
          <Link to="/login" className="btn-register">Volver a iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
