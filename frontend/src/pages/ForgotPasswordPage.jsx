/**
 * ForgotPasswordPage.jsx
 *
 * Recuperación de contraseña con inputs de PIN de 6 dígitos.
 *
 * - Pegar (Ctrl+V / Cmd+V) un código de 6 dígitos lo distribuye en las casillas
 * - Backspace: borra el dígito actual; si está vacía, borra la anterior
 * - Flechas izquierda/derecha para navegar
 * - Tuteo exclusivo (tú, tu, tuya). Sin voseo.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthPanel from '../components/AuthPanel';
import { api } from '../api';

const STEPS = [
  { id: 1, title: 'Tu correo',     desc: 'Te enviaremos un código de 6 dígitos.' },
  { id: 2, title: 'Verifica',      desc: 'Ingresalo abajo. Vence en 15 minutos.' },
  { id: 3, title: 'Nueva clave',   desc: 'Mínimo 6 caracteres y un número.' },
];

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: '', password: '' });
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [devCodeShown, setDevCodeShown] = useState('');
  const [devCodeReason, setDevCodeReason] = useState('');

  const [codeDigits, setCodeDigits] = useState(Array(6).fill(''));
  const codeRefs = useRef([]);

  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => codeRefs.current[0]?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  const fillFromDigits = (raw) => {
    const pasted = String(raw ?? '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = Array(6).fill('');
    for (let i = 0; i < pasted.length; i++) digits[i] = pasted[i];
    setCodeDigits(digits);
    const focusIdx = Math.min(pasted.length, 5);
    queueMicrotask(() => codeRefs.current[focusIdx]?.focus());
    setError('');
  };

  const handleCodePaste = (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    const pasted = text.replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    fillFromDigits(pasted);
  };

  const handleCodeChange = (idx, value) => {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length > 1) {
      fillFromDigits(digits);
      return;
    }
    const v = digits.slice(-1);
    setCodeDigits((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
    if (v && idx < 5) codeRefs.current[idx + 1]?.focus();
    setError('');
  };

  const handleCodeKey = (idx, e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setCodeDigits((prev) => {
        const next = [...prev];
        if (next[idx]) {
          next[idx] = '';
        } else if (idx > 0) {
          next[idx - 1] = '';
          queueMicrotask(() => codeRefs.current[idx - 1]?.focus());
        }
        return next;
      });
      setError('');
      return;
    }
    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      codeRefs.current[idx - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight' && idx < 5) {
      e.preventDefault();
      codeRefs.current[idx + 1]?.focus();
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      setCodeDigits((prev) => {
        const next = [...prev];
        next[idx] = e.key;
        return next;
      });
      if (idx < 5) codeRefs.current[idx + 1]?.focus();
      setError('');
    }
  };

  const sendCode = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: form.email.trim() });
      setInfo(data.message || 'Si el correo está registrado, enviamos un código.');
      if (data.showCodeInUI && data.devCode) {
        setDevCodeShown(data.devCode);
        setDevCodeReason(data.devCodeReason || 'demo');
      }
      setStep(2);
      setCodeDigits(Array(6).fill(''));
    } catch (err) {
      setError(err.message || 'No se pudo enviar el código.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    const code = codeDigits.join('');
    if (code.length !== 6) { setError('El código debe tener 6 dígitos'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/verify-reset-code', {
        email: form.email.trim(),
        code,
      });
      setResetToken(data.resetToken);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Código inválido.');
    } finally {
      setSubmitting(false);
    }
  };

  const applyNew = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { resetToken, password: form.password });
      setStep(4);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar.');
    } finally {
      setSubmitting(false);
    }
  };

  const panelHeadline = (
    <>Recupera tu acceso en <em>3 pasos</em>.</>
  );

  return (
    <div className="auth-page">
      <AuthPanel
        eyebrow="RECUPERACIÓN"
        headline={panelHeadline}
        sub="Te enviaremos un código de 6 dígitos a tu correo. Es válido por 15 minutos y solo sirve una vez."
        points={[
          { icon: 'mark_email_read', title: 'Sin enredos',         text: 'Tres pasos claros: correo, código, nueva contraseña.' },
          { icon: 'lock_clock',      title: 'Códigos seguros',     text: 'Caducan en 15 min y se invalidan al usarse.' },
          { icon: 'verified_user',   title: 'Solo el dueño',       text: 'Solo el dueño del correo puede resetear la clave.' },
        ]}
        footNote="Códigos cifrados · Vencen en 15 minutos"
      />

      <main className="auth-page__form">
        <section className="auth-form-card auth-form-card--wide" aria-labelledby="forgot-title">
          <span className="auth-form-eyebrow">RECUPERAR CONTRASEÑA</span>
          <h1 className="auth-form-title" id="forgot-title">Restablecer contraseña</h1>
          <p className="auth-form-lead">
            Paso {Math.min(step, 3)} de 3 — {STEPS[step - 1]?.title}
          </p>

          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 24,
          }}>
            {STEPS.map((s) => {
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div
                  key={s.id}
                  aria-current={active ? 'step' : undefined}
                  style={{
                    flex: 1, height: 4, borderRadius: 9999,
                    background: done || active ? 'var(--primary)' : 'var(--surface-container-high)',
                    transition: 'background var(--dur) var(--ease-out)',
                    boxShadow: active ? '0 0 8px var(--primary)' : 'none',
                  }}
                />
              );
            })}
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <span className="material-symbols-outlined icon">error</span>
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="alert alert-info" role="status">
              <span className="material-symbols-outlined icon">info</span>
              <span>{info}</span>
            </div>
          )}

          {devCodeShown && (
            <div className="alert alert-warning" role="status" data-testid="dev-code-banner">
              <span className="material-symbols-outlined icon">visibility</span>
              <div>
                <strong>Modo demo:</strong> el envío por correo está limitado en este entorno.
                <br />
                Tu código es <code className="dev-code">{devCodeShown}</code>
                {devCodeReason === 'demo-mode' && <> (visible porque el backend está en modo demo)</>}
                {devCodeReason !== 'demo-mode' && <> (visible porque Resend no pudo entregar)</>}
              </div>
            </div>
          )}

          {step === 1 && (
            <form className="auth-form" onSubmit={sendCode} noValidate>
              <label className="field">
                <span className="field-label">Tu correo registrado</span>
                <input
                  className="field-input"
                  name="email" type="email" required
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="tunombre@fitgym.co"
                  autoComplete="email"
                />
              </label>
              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar código'}
              </button>
            </form>
          )}

          {step === 2 && (
            <form className="auth-form" onSubmit={verifyCode} noValidate>
              <label className="field">
                <span className="field-label">Código de 6 dígitos</span>
                <div className="pin-grid" onPaste={handleCodePaste}>
                  {codeDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { codeRefs.current[i] = el; }}
                      className="pin-cell"
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={i === 0 ? 6 : 1}
                      value={digit}
                      onChange={(e) => handleCodeChange(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKey(i, e)}
                      onPaste={handleCodePaste}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Dígito ${i + 1} de 6`}
                    />
                  ))}
                </div>
              </label>
              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting}>
                {submitting ? 'Verificando...' : 'Verificar código'}
              </button>
              <p className="auth-form-foot">
                ¿No te llegó?{' '}
                <button
                  type="button"
                  onClick={sendCode}
                  className="auth-form-link"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
                >
                  Reenviar código
                </button>
              </p>
            </form>
          )}

          {step === 3 && (
            <form className="auth-form" onSubmit={applyNew} noValidate>
              <label className="field">
                <span className="field-label">Nueva contraseña</span>
                <input
                  className="field-input"
                  name="password" type="password" required minLength={6}
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres y un número"
                  autoComplete="new-password"
                />
              </label>
              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}

          {step === 4 && (
            <div className="alert alert-success" role="status" style={{ marginTop: 8 }}>
              <span className="material-symbols-outlined icon">celebration</span>
              <span>
                ¡Contraseña actualizada! Ya puedes iniciar sesión. <Link to="/login" className="auth-form-link">Ir al login</Link>
              </span>
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
