import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../context/AuthContext';
import AuthPanel from '../components/AuthPanel';

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
  const [showPwd, setShowPwd]   = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = window.setInterval(() => {
      setResendTimer((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendTimer]);

  const fillFromDigits = (raw) => {
    const pasted = String(raw ?? '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = Array(6).fill('');
    for (let i = 0; i < pasted.length; i++) digits[i] = pasted[i];
    setCodeDigits(digits);
    queueMicrotask(() => codeInputs.current[Math.min(pasted.length, 5)]?.focus());
    if (error) setError('');
  };

  const handleCodePaste = (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    const pasted = text.replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    fillFromDigits(pasted);
  };

  const handleCodeChange = (index, value) => {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length > 1) {
      fillFromDigits(digits);
      return;
    }
    const onlyDigits = digits.slice(-1);
    setCodeDigits((prev) => {
      const next = [...prev];
      next[index] = onlyDigits;
      return next;
    });
    if (onlyDigits && index < 5) codeInputs.current[index + 1]?.focus();
    if (error) setError('');
  };

  const handleCodeKeyDown = (index, event) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      setCodeDigits((prev) => {
        const next = [...prev];
        if (next[index]) {
          next[index] = '';
        } else if (index > 0) {
          next[index - 1] = '';
          queueMicrotask(() => codeInputs.current[index - 1]?.focus());
        }
        return next;
      });
      if (error) setError('');
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      codeInputs.current[index - 1]?.focus();
      return;
    }
    if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      codeInputs.current[index + 1]?.focus();
      return;
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      setCodeDigits((prev) => {
        const next = [...prev];
        next[index] = event.key;
        return next;
      });
      if (index < 5) codeInputs.current[index + 1]?.focus();
      if (error) setError('');
    }
  };

  const handleResend = async () => {
    if (!email) { setError('Ingresa tu correo electrónico para reenviar el código.'); return; }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage('Código reenviado. Revisa tu bandeja de entrada.');
      setResendTimer(data.resendAfterSeconds || 60);
    } catch (err) {
      setError(err.message || 'No se pudo reenviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!email) return setError('Ingresa tu correo electrónico.');
    const currentCode = codeDigits.join('');
    if (currentCode.length !== 6) return setError('Ingresa los 6 dígitos del código.');
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/verify-reset-code', { email, code: currentCode });
      setResetToken(data.resetToken);
      setStep('reset');
      setMessage(data.message);
      setPassword('');
      setConfirm('');
      setCodeDigits(Array(6).fill(''));
    } catch (err) {
      setError(err.message || 'No se pudo verificar el código.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!password || password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    if (!resetToken) return setError('Debes verificar el código antes de restablecer la contraseña.');

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/reset-password', { resetToken, password });
      setMessage(data.message);
      setStep('done');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err.message || 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const title =
    step === 'verify' ? 'Verifica tu código' :
    step === 'reset'  ? 'Crea tu nueva contraseña' :
                        '¡Contraseña restablecida!';

  const stepIndex = step === 'verify' ? 1 : step === 'reset' ? 2 : 3;

  return (
    <div className="auth-page">
      <AuthPanel
        eyebrow="RECUPERACIÓN"
        headline={<>Recupera tu acceso en <em>3 pasos</em>.</>}
        sub="Verifica tu correo con un código de 6 dígitos y crea una contraseña nueva. El código vence en 15 minutos."
        points={[
          { icon: 'mark_email_read', title: 'Solo el dueño',         text: 'Solo el dueño del correo puede resetear la clave.' },
          { icon: 'lock_clock',      title: 'Códigos seguros',       text: 'Caducan en 15 min y se invalidan al usarse.' },
          { icon: 'shield_lock',     title: 'Sesión cifrada',        text: 'Tu nueva contraseña se guarda con hash bcrypt.' },
        ]}
        footNote="Códigos cifrados · Vencen en 15 minutos"
      />

      <main className="auth-page__form">
        <section className="auth-form-card auth-form-card--wide" aria-labelledby="reset-title">
          <span className="auth-form-eyebrow">RESTABLECER CONTRASEÑA</span>
          <h1 className="auth-form-title" id="reset-title">{title}</h1>
          <p className="auth-form-lead">
            {step === 'verify' && 'Ingresa el correo y el código de 6 dígitos que recibiste.'}
            {step === 'reset'  && 'Define una contraseña nueva y segura para tu cuenta.'}
            {step === 'done'   && 'Tu contraseña fue actualizada. Te redirigimos al inicio de sesión...'}
          </p>

          {/* Stepper */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <div style={{
              flex: 1, height: 4, borderRadius: 9999,
              background: stepIndex >= 1 ? 'var(--primary)' : 'var(--surface-container-high)',
              boxShadow: stepIndex === 1 ? '0 0 8px var(--primary)' : 'none',
              transition: 'background var(--dur) var(--ease-out)',
            }} />
            <div style={{
              flex: 1, height: 4, borderRadius: 9999,
              background: stepIndex >= 2 ? 'var(--primary)' : 'var(--surface-container-high)',
              boxShadow: stepIndex === 2 ? '0 0 8px var(--primary)' : 'none',
              transition: 'background var(--dur) var(--ease-out)',
            }} />
            <div style={{
              flex: 1, height: 4, borderRadius: 9999,
              background: stepIndex >= 3 ? 'var(--primary)' : 'var(--surface-container-high)',
              boxShadow: stepIndex === 3 ? '0 0 8px var(--primary)' : 'none',
              transition: 'background var(--dur) var(--ease-out)',
            }} />
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <span className="material-symbols-outlined icon">error</span>
              <span>{error}</span>
            </div>
          )}
          {message && step !== 'done' && (
            <div className="alert alert-info" role="status">
              <span className="material-symbols-outlined icon">info</span>
              <span>{message}</span>
            </div>
          )}

          {step === 'verify' && (
            <form className="auth-form" onSubmit={handleVerify} noValidate>
              <label className="field">
                <span className="field-label">Correo electrónico</span>
                <input
                  className="field-input"
                  name="email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                  disabled={loading}
                  required
                />
              </label>

              <label className="field">
                <span className="field-label">Código de verificación</span>
                <div className="pin-grid" onPaste={handleCodePaste}>
                  {codeDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(ref) => (codeInputs.current[index] = ref)}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      onPaste={handleCodePaste}
                      onFocus={(e) => e.target.select()}
                      className="pin-cell"
                      type="text"
                      inputMode="numeric"
                      maxLength={index === 0 ? 6 : 1}
                      disabled={loading}
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      aria-label={`Dígito ${index + 1} de 6`}
                    />
                  ))}
                </div>
              </label>

              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                {loading ? 'Verificando...' : 'Verificar código'}
                {!loading && <span className="material-symbols-outlined icon">arrow_forward</span>}
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={handleResend}
                disabled={loading || resendTimer > 0}
              >
                {resendTimer > 0 ? `Reenviar código en ${resendTimer}s` : 'Reenviar código'}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form className="auth-form" onSubmit={handlePasswordSubmit} noValidate>
              <label className="field">
                <span className="field-label">Nueva contraseña</span>
                <div style={{ position: 'relative' }}>
                  <input
                    className="field-input"
                    name="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                    disabled={loading}
                    required
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    style={{
                      position: 'absolute', top: '50%', right: 8,
                      transform: 'translateY(-50%)',
                      background: 'transparent', border: 'none', color: 'var(--on-surface-variant)',
                      width: 32, height: 32, display: 'grid', placeItems: 'center',
                      cursor: 'pointer', borderRadius: 'var(--radius)',
                    }}
                  >
                    <span className="material-symbols-outlined icon">{showPwd ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </label>

              <label className="field">
                <span className="field-label">Confirmar contraseña</span>
                <input
                  className="field-input"
                  name="confirm"
                  type="password"
                  placeholder="Repite tu nueva contraseña"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); if (error) setError(''); }}
                  disabled={loading}
                  required
                />
              </label>

              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
                {!loading && <span className="material-symbols-outlined icon">check</span>}
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="alert alert-success" role="status">
              <span className="material-symbols-outlined icon">celebration</span>
              <span>La contraseña fue restablecida. Te redirigimos al inicio de sesión.</span>
            </div>
          )}

          <p className="auth-form-foot">
            <Link to="/login" className="auth-form-link">← Volver al inicio de sesión</Link>
          </p>
        </section>
      </main>
    </div>
  );
}