import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthPanel from '../components/AuthPanel';

const PHONE_RE = /^[3]\d{9}$/;

function strengthScore(pwd) {
  let s = 0;
  if (pwd.length >= 6) s++;
  if (pwd.length >= 10) s++;
  if (/[A-Z]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) s++;
  if (/\d/.test(pwd) && /[A-Za-z]/.test(pwd)) s++;
  return Math.min(s, 4);
}

export default function RegisterOwnerPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    gymName: '',
    gymPhone: '',
    gymEmail: '',
    ownerName: '',
    ownerEmail: '',
    password: '',
  });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const score = strengthScore(form.password);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const phoneDigits = form.gymPhone.replace(/\D/g, '');
    if (!PHONE_RE.test(phoneDigits)) {
      setError('El teléfono del gimnasio debe tener 10 dígitos y comenzar con 3.');
      return;
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        gymName: form.gymName.trim(),
        gymPhone: phoneDigits,
        gymEmail: form.gymEmail.trim() || undefined,
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        password: form.password,
      });
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el gimnasio. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthPanel
        eyebrow="REGISTRO"
        headline={<>Crea tu gimnasio en <em>2&nbsp;minutos</em>.</>}
        sub="Te regalamos 14 días con todo desbloqueado. Creas tu gimnasio, tu cuenta de admin y ya puedes empezar a invitar a tu equipo y agregar miembros."
        points={[
          { icon: 'check_circle', title: 'Sin tarjeta de crédito', text: 'Solo necesitas tu correo y un nombre para tu gimnasio.' },
          { icon: 'schedule',     title: '14 días con todo activo',  text: 'Cancelas cuando quieras, sin cláusulas, sin perder datos.' },
          { icon: 'support_agent',title: 'Soporte por WhatsApp',    text: 'Te guiamos paso a paso si te trabas en algo.' },
        ]}
        footNote="14 días gratis · Cancela cuando quieras"
      />

      <main className="auth-page__form">
        <section className="auth-form-card auth-form-card--wide" aria-labelledby="reg-title">
          <span className="auth-form-eyebrow">CREAR GIMNASIO</span>
          <h1 className="auth-form-title" id="reg-title">Crea tu gimnasio gratis</h1>
          <p className="auth-form-lead">
            Solo tú, como admin, puedes registrar un gimnasio aquí. ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="auth-form-link">Inicia sesión</Link>.
          </p>

          {error && (
            <div className="alert alert-error" role="alert">
              <span className="material-symbols-outlined icon">error</span>
              <span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <label className="field">
              <span className="field-label">Nombre del gimnasio</span>
              <input
                className="field-input"
                name="gymName" required
                value={form.gymName} onChange={onChange}
                placeholder="Ej: Power House"
              />
            </label>

            <div className="auth-form-row">
              <label className="field">
                <span className="field-label">Teléfono (10 dígitos, empieza con 3)</span>
                <input
                  className="field-input"
                  name="gymPhone" required
                  value={form.gymPhone} onChange={onChange}
                  inputMode="numeric"
                  placeholder="3001234567"
                />
              </label>
              <label className="field">
                <span className="field-label">Email del gimnasio (opcional)</span>
                <input
                  className="field-input"
                  name="gymEmail" type="email"
                  value={form.gymEmail} onChange={onChange}
                  placeholder="contacto@powerhouse.com"
                />
              </label>
            </div>

            <div className="auth-form-divider" style={{ margin: '6px 0 0' }}>TUS DATOS DE ADMIN</div>

            <label className="field">
              <span className="field-label">Tu nombre completo</span>
              <input
                className="field-input"
                name="ownerName" required
                value={form.ownerName} onChange={onChange}
                placeholder="Nombre y apellido"
              />
            </label>

            <label className="field">
              <span className="field-label">Tu correo (será tu usuario)</span>
              <input
                className="field-input"
                name="ownerEmail" type="email" required
                value={form.ownerEmail} onChange={onChange}
                placeholder="tu@correo.com"
                autoComplete="email"
              />
            </label>

            <label className="field">
              <span className="field-label">Contraseña (mín. 6 caracteres, al menos un número)</span>
              <div style={{ position: 'relative' }}>
                <input
                  className="field-input"
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  required minLength={6}
                  value={form.password} onChange={onChange}
                  placeholder="••••••••"
                  autoComplete="new-password"
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
              <div className={`strength l-${score}`} aria-hidden="true">
                <span /><span /><span /><span />
              </div>
            </label>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Creando...
                </>
              ) : (
                <>
                  Crear mi gimnasio
                  <span className="material-symbols-outlined icon">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <p className="auth-form-foot">
            ¿Ya tienes cuenta? <Link to="/login" className="auth-form-link">Inicia sesión</Link>
          </p>
        </section>
      </main>
    </div>
  );
}