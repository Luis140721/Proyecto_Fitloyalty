import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: '', code: '', password: '' });
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const sendCode = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    setSubmitting(true);
    try {
      const { data } = await axios.post('/api/auth/forgot-password', { email: form.email.trim() });
      setInfo(data.message || 'Si el correo esta registrado, enviamos un codigo.');
      if (data.devCode) setInfo((prev) => `${prev} (codigo dev: ${data.devCode})`);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el codigo.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    setSubmitting(true);
    try {
      const { data } = await axios.post('/api/auth/verify-reset-code', {
        email: form.email.trim(),
        code: form.code.trim(),
      });
      setResetToken(data.resetToken);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Codigo invalido.');
    } finally {
      setSubmitting(false);
    }
  };

  const applyNew = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    setSubmitting(true);
    try {
      await axios.post('/api/auth/reset-password', {
        resetToken,
        password: form.password,
      });
      setInfo('Contrasena actualizada. Ya puedes iniciar sesion.');
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <div className="brand-row">
          <div className="brand-mark">FL</div>
          <div className="brand-name">FitLoyalty</div>
        </div>
        <h1>Recuperar contrasena</h1>
        <p>Te enviaremos un codigo de 6 digitos a tu correo. Es valido por 15 minutos.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h2>Restablecer contrasena</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {info && <div className="alert alert-info">{info}</div>}

          {step === 1 && (
            <form onSubmit={sendCode}>
              <div className="field">
                <label>Tu correo</label>
                <input name="email" type="email" required value={form.email} onChange={onChange} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Enviando...' : 'Enviar codigo'}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyCode}>
              <div className="field">
                <label>Codigo de 6 digitos</label>
                <input name="code" required value={form.code} onChange={onChange} maxLength={6} inputMode="numeric" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Verificando...' : 'Verificar codigo'}
              </button>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={applyNew}>
              <div className="field">
                <label>Nueva contrasena</label>
                <input name="password" type="password" required minLength={6} value={form.password} onChange={onChange} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Guardando...' : 'Guardar nueva contrasena'}
              </button>
            </form>
          )}

          {step === 4 && (
            <div className="alert alert-success">
              Contrasena actualizada. <Link to="/login">Inicia sesion</Link>.
            </div>
          )}

          <p className="helper"><Link to="/login">Volver al inicio de sesion</Link></p>
        </div>
      </main>
    </div>
  );
}
