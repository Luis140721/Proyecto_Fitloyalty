import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import AuthPanel from '../components/AuthPanel';

const CODE_LENGTH = 6;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const codeInputs = useRef([]);
  const [email, setEmail] = useState('');
  const [codeDigits, setCodeDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [step, setStep] = useState('email');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [devCode, setDevCode] = useState('');

  useEffect(() => {
    if (resendTimer <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setResendTimer((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendTimer]);

  const requestCode = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email: normalizedEmail });
      setEmail(normalizedEmail);
      setMessage(data.message || 'Si el correo está registrado, te enviamos un código para recuperar tu contraseña.');
      setResendTimer(data.resendAfterSeconds || 60);
      setDevCode(data.showCodeInUI ? data.devCode || '' : '');
      setStep('code');
    } catch (requestError) {
      setError(requestError.message || 'No se pudo enviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message || 'Si el correo está registrado, te enviamos un código para recuperar tu contraseña.');
      setResendTimer(data.resendAfterSeconds || 60);
      setDevCode(data.showCodeInUI ? data.devCode || '' : '');
    } catch (requestError) {
      setError(requestError.message || 'No se pudo reenviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const fillFromDigits = (raw) => {
    const pasted = String(raw ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    for (let index = 0; index < pasted.length; index += 1) next[index] = pasted[index];
    setCodeDigits(next);
    queueMicrotask(() => codeInputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus());
    setError('');
  };

  const handleCodePaste = (event) => {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/\d/.test(text)) return;
    event.preventDefault();
    fillFromDigits(text);
  };

  const handleCodeChange = (index, value) => {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length > 1) {
      fillFromDigits(digits);
      return;
    }
    const digit = digits.slice(-1);
    setCodeDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (digit && index < CODE_LENGTH - 1) codeInputs.current[index + 1]?.focus();
    setError('');
  };

  const handleCodeKeyDown = (index, event) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      setCodeDigits((current) => {
        const next = [...current];
        if (next[index]) {
          next[index] = '';
        } else if (index > 0) {
          next[index - 1] = '';
          queueMicrotask(() => codeInputs.current[index - 1]?.focus());
        }
        return next;
      });
      setError('');
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      codeInputs.current[index - 1]?.focus();
      return;
    }
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      codeInputs.current[index + 1]?.focus();
      return;
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      setCodeDigits((current) => {
        const next = [...current];
        next[index] = event.key;
        return next;
      });
      if (index < CODE_LENGTH - 1) codeInputs.current[index + 1]?.focus();
      setError('');
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    const code = codeDigits.join('');
    if (code.length !== CODE_LENGTH) {
      setError('Ingresa los 6 dígitos del código.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/verify-reset-code', { email, code });
      if (!data?.resetToken) {
        setError('El servidor no devolvió el token de restablecimiento. Solicita un nuevo código.');
        return;
      }
      navigate('/reset-password', { state: { email, resetToken: data.resetToken } });
    } catch (requestError) {
      setError(requestError.message || 'No se pudo verificar el código.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthPanel
        eyebrow="RECUPERACIÓN"
        headline={<>Recupera tu acceso en <em>3 pasos</em>.</>}
        sub="Verifica tu correo con un código de 6 dígitos y crea una contraseña nueva."
        points={[
          { icon: 'mark_email_read', title: 'Código por correo', text: 'Te enviaremos un código de verificación.' },
          { icon: 'lock_clock', title: 'Códigos seguros', text: 'El código vence en 15 minutos.' },
          { icon: 'shield_lock', title: 'Cuenta protegida', text: 'Solo podrás cambiar la contraseña al verificar el código.' },
        ]}
        footNote="Códigos de verificación · Vencen en 15 minutos"
      />

      <main className="auth-page__form">
        <section className="auth-form-card auth-form-card--wide" aria-labelledby="forgot-title">
          <span className="auth-form-eyebrow">RESTABLECER CONTRASEÑA</span>
          <h1 className="auth-form-title" id="forgot-title">
            {step === 'email' ? '¿Olvidaste tu contraseña?' : 'Ingresa tu código'}
          </h1>
          <p className="auth-form-lead">
            {step === 'email'
              ? 'Te enviaremos un código para verificar tu correo.'
              : `Ingresa el código de 6 dígitos enviado a ${email}.`}
          </p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && <div className="alert alert-info" role="status">{message}</div>}
          {devCode && (
            <div className="alert alert-info" role="status">
              Código de demostración: <strong>{devCode}</strong>
            </div>
          )}

          {step === 'email' ? (
            <form className="auth-form" onSubmit={requestCode} noValidate>
              <label className="field">
                <span className="field-label">Tu correo registrado</span>
                <input
                  className="field-input"
                  name="email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  autoComplete="email"
                  required
                />
              </label>
              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar código'}
              </button>
            </form>
          ) : (
            <>
              <form className="auth-form" onSubmit={verifyCode} noValidate>
                <label className="field">
                  <span className="field-label">Código de verificación</span>
                  <div className="pin-grid" onPaste={handleCodePaste}>
                    {codeDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(input) => { codeInputs.current[index] = input; }}
                        className="pin-cell"
                        type="text"
                        inputMode="numeric"
                        maxLength={index === 0 ? CODE_LENGTH : 1}
                        value={digit}
                        onChange={(event) => handleCodeChange(index, event.target.value)}
                        onKeyDown={(event) => handleCodeKeyDown(index, event)}
                        onPaste={handleCodePaste}
                        onFocus={(event) => event.target.select()}
                        disabled={loading}
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        aria-label={`Dígito ${index + 1} de 6`}
                      />
                    ))}
                  </div>
                </label>
                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                  {loading ? 'Verificando...' : 'Verificar código'}
                </button>
              </form>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={resendCode}
                disabled={loading || resendTimer > 0}
              >
                {resendTimer > 0 ? `Reenviar código en ${resendTimer}s` : 'Reenviar código'}
              </button>
            </>
          )}

          <p className="auth-form-foot">
            {step === 'code' && (
              <button
                type="button"
                className="auth-form-link"
                onClick={() => {
                  setStep('email');
                  setCodeDigits(Array(CODE_LENGTH).fill(''));
                  setError('');
                  setMessage('');
                  setDevCode('');
                }}
              >
                Cambiar correo
              </button>
            )}
            {' '}
            <Link to="/login" className="auth-form-link">← Volver al inicio de sesión</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
