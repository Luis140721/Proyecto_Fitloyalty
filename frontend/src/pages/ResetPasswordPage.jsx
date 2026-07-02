import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../context/AuthContext';
import '../styles/login.css';

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const codeInputs = useRef([]);

  const [email, setEmail]       = useState(location.state?.email || '');
  const [codeDigits, setCodeDigits] = useState(Array(6).fill(''));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [resetToken, setResetToken] = useState('');
  const [step, setStep]         = useState('verify');
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const code = useMemo(() => codeDigits.join(''), [codeDigits]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = window.setInterval(() => {
      setResendTimer((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendTimer]);

  const handleCodeChange = (index, value) => {
    const onlyDigits = value.replace(/\D/g, '').slice(0, 1);
    const nextDigits = [...codeDigits];
    nextDigits[index] = onlyDigits;
    setCodeDigits(nextDigits);
    if (onlyDigits && index < 5) {
      codeInputs.current[index + 1]?.focus();
    }
    if (error) setError('');
  };

  const handleCodeKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeInputs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Ingresa tu correo electrónico para reenviar el código.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage('Código reenviado. Revisa tu bandeja de entrada.');
      setResendTimer(data.resendAfterSeconds || 60);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo reenviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!email) return setError('Ingresa tu correo electrónico.');
    if (code.length !== 6) return setError('Ingresa los 6 dígitos del código.');

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data } = await api.post('/auth/verify-reset-code', { email, code });
      setResetToken(data.resetToken);
      setStep('reset');
      setMessage(data.message);
      setPassword('');
      setConfirm('');
      setCodeDigits(Array(6).fill(''));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo verificar el código.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!password || password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (password !== confirm) {
      return setError('Las contraseñas no coinciden.');
    }
    if (!resetToken) {
      return setError('Debes verificar el código antes de restablecer la contraseña.');
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data } = await api.post('/auth/reset-password', { resetToken, password });
      setMessage(data.message);
      setStep('done');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-brand">
        <div className="login-brand__content">
          <div className="login-logo">
            <span className="login-logo__icon">🏋️</span>
          </div>
          <h1 className="login-brand__title">FitLoyalty</h1>
          <p className="login-brand__sub">Recupera tu acceso con seguridad</p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">
              {step === 'verify' ? 'Verificar código' : step === 'reset' ? 'Crear nueva contraseña' : 'Contraseña restablecida'}
            </h2>
            <p className="login-card__sub">
              {step === 'verify'
                ? 'Ingresa el correo y el código de 6 dígitos que recibiste.'
                : step === 'reset'
                  ? 'Define una contraseña nueva y segura para tu cuenta.'
                  : 'Tu contraseña fue actualizada. Redirigiendo al inicio de sesión...'}
            </p>
          </div>

          {error && (
            <div className="login-alert login-alert--error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          {message && step !== 'done' && (
            <div className="login-alert login-alert--success" role="status">
              <span>✅</span> {message}
            </div>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerify} className="login-form" noValidate>
              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input
                  name="email"
                  type="email"
                  className="form-input"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Código de verificación</label>
                <div className="otp-group">
                  {codeDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(ref) => (codeInputs.current[index] = ref)}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      className="otp-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      disabled={loading}
                      autoComplete="one-time-code"
                      aria-label={`Digito ${index + 1}`}
                    />
                  ))}
                </div>
                <small style={{ color: '#475569', marginTop: '6px', display: 'block', fontSize: '0.82rem' }}>
                  Ingresa los 6 dígitos de tu código.
                </small>
              </div>

              <button type="submit" className="btn-login" disabled={loading}>
                {loading
                  ? <span className="btn-login__loading"><span className="spinner-sm" /> Verificando...</span>
                  : 'Verificar código'}
              </button>

              <button
                type="button"
                className="btn-login"
                style={{ marginTop: 12 }}
                onClick={handleResend}
                disabled={loading || resendTimer > 0}
              >
                {resendTimer > 0 ? `Reenviar en ${resendTimer}s` : 'Reenviar código'}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handlePasswordSubmit} className="login-form" noValidate>
              <div className="form-group">
                <label className="form-label">Nueva contraseña</label>
                <input
                  name="password"
                  type="password"
                  className="form-input"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
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
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); if (error) setError(''); }}
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

          {step === 'done' && (
            <div className="login-alert login-alert--success" role="status">
              <span>✅</span> La contraseña fue restablecida. Te redirigimos al inicio.
            </div>
          )}

          <div className="login-divider"><span>¿Necesitas otra cosa?</span></div>
          <Link to="/login" className="btn-register">Volver a iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
