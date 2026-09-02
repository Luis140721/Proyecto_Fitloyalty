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

/** Mensaje de error bajo un campo. No renderiza nada si no hay error. */
function FieldMsg({ id, msg }) {
  if (!msg) return null;
  return (
    <span className="field-error" id={id} role="alert">
      <span className="material-symbols-outlined icon">error</span>
      {msg}
    </span>
  );
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Al escribir se limpia el error de ESE campo, no el del formulario entero.
  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setFieldErrors((fe) => (fe[name] ? { ...fe, [name]: undefined } : fe));
  };
  const score = strengthScore(form.password);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Valida todo el formulario de una pasada y devuelve un mensaje por campo,
  // en vez de detenerse en el primer problema.
  const validate = () => {
    const e = {};
    if (!form.gymName.trim()) e.gymName = 'Escribe el nombre de tu gimnasio.';

    const phoneDigits = form.gymPhone.replace(/\D/g, '');
    if (!phoneDigits) e.gymPhone = 'Escribe el teléfono del gimnasio.';
    else if (phoneDigits.length !== 10) e.gymPhone = `Debe tener 10 dígitos (escribiste ${phoneDigits.length}).`;
    else if (!PHONE_RE.test(phoneDigits)) e.gymPhone = 'Un celular colombiano empieza por 3.';

    if (form.gymEmail.trim() && !EMAIL_RE.test(form.gymEmail.trim())) {
      e.gymEmail = 'Este correo no tiene un formato válido.';
    }

    if (!form.ownerName.trim()) e.ownerName = 'Escribe tu nombre.';

    if (!form.ownerEmail.trim()) e.ownerEmail = 'Escribe tu correo.';
    else if (!EMAIL_RE.test(form.ownerEmail.trim())) e.ownerEmail = 'Este correo no tiene un formato válido.';

    if (!form.password) e.password = 'Crea una contraseña.';
    else if (form.password.length < 6) e.password = `Te faltan ${6 - form.password.length} caracteres (mínimo 6).`;
    else if (!/\d/.test(form.password)) e.password = 'Debe incluir al menos un número.';

    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const found = validate();
    setFieldErrors(found);
    if (Object.keys(found).length > 0) {
      // Lleva el foco al primer campo con problema.
      const first = document.querySelector('.field-input--error');
      if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }

    const phoneDigits = form.gymPhone.replace(/\D/g, '');
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
      // El backend distingue cual de los dos correos choca (409). Lo señalamos
      // en el campo concreto en vez de dejar solo un banner generico.
      if (err.code === 'USER_EMAIL_TAKEN') {
        setFieldErrors((fe) => ({ ...fe, ownerEmail: 'Este correo ya tiene una cuenta. Inicia sesión o usa otro.' }));
        setError('Ya existe una cuenta con ese correo.');
      } else if (err.code === 'GYM_EMAIL_TAKEN') {
        setFieldErrors((fe) => ({ ...fe, gymEmail: 'Ya hay un gimnasio con este correo. Usa otro o déjalo vacío.' }));
        setError('Ese correo de gimnasio ya está registrado.');
      } else if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details?.issues)) {
        // Mapea los issues de zod al campo correspondiente.
        const mapped = {};
        err.details.issues.forEach((i) => {
          const key = Array.isArray(i.path) ? i.path[0] : null;
          if (key) mapped[key] = i.message;
        });
        setFieldErrors((fe) => ({ ...fe, ...mapped }));
        setError('Revisa los campos marcados.');
      } else if (err.isNetwork) {
        setError('No pudimos contactar al servidor. Revisa tu conexión e intenta de nuevo.');
      } else {
        setError(err.message || 'No se pudo crear el gimnasio. Intenta de nuevo.');
      }
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
                className={`field-input${fieldErrors.gymName ? ' field-input--error' : ''}`}
                name="gymName" required
                value={form.gymName} onChange={onChange}
                aria-invalid={fieldErrors.gymName ? 'true' : undefined}
                aria-describedby={fieldErrors.gymName ? 'err-gymName' : undefined}
                placeholder="Ej: Power House"
              />
              <FieldMsg id="err-gymName" msg={fieldErrors.gymName} />
            </label>

            <div className="auth-form-row">
              <label className="field">
                <span className="field-label">Teléfono (10 dígitos, empieza con 3)</span>
                <input
                  className={`field-input${fieldErrors.gymPhone ? ' field-input--error' : ''}`}
                  name="gymPhone" required
                  value={form.gymPhone} onChange={onChange}
                  inputMode="numeric"
                  aria-invalid={fieldErrors.gymPhone ? 'true' : undefined}
                  aria-describedby={fieldErrors.gymPhone ? 'err-gymPhone' : undefined}
                  placeholder="3001234567"
                />
                <FieldMsg id="err-gymPhone" msg={fieldErrors.gymPhone} />
              </label>
              <label className="field">
                <span className="field-label">Email del gimnasio (opcional)</span>
                <input
                  className={`field-input${fieldErrors.gymEmail ? ' field-input--error' : ''}`}
                  name="gymEmail" type="email"
                  value={form.gymEmail} onChange={onChange}
                  aria-invalid={fieldErrors.gymEmail ? 'true' : undefined}
                  aria-describedby={fieldErrors.gymEmail ? 'err-gymEmail' : undefined}
                  placeholder="contacto@powerhouse.com"
                />
                {fieldErrors.gymEmail
                  ? <FieldMsg id="err-gymEmail" msg={fieldErrors.gymEmail} />
                  : <span className="field-hint">Puedes dejarlo vacío.</span>}
              </label>
            </div>

            <div className="auth-form-divider" style={{ margin: '6px 0 0' }}>TUS DATOS DE ADMIN</div>

            <label className="field">
              <span className="field-label">Tu nombre completo</span>
              <input
                className={`field-input${fieldErrors.ownerName ? ' field-input--error' : ''}`}
                name="ownerName" required
                value={form.ownerName} onChange={onChange}
                aria-invalid={fieldErrors.ownerName ? 'true' : undefined}
                aria-describedby={fieldErrors.ownerName ? 'err-ownerName' : undefined}
                placeholder="Nombre y apellido"
              />
              <FieldMsg id="err-ownerName" msg={fieldErrors.ownerName} />
            </label>

            <label className="field">
              <span className="field-label">Tu correo (será tu usuario)</span>
              <input
                className={`field-input${fieldErrors.ownerEmail ? ' field-input--error' : ''}`}
                name="ownerEmail" type="email" required
                value={form.ownerEmail} onChange={onChange}
                aria-invalid={fieldErrors.ownerEmail ? 'true' : undefined}
                aria-describedby={fieldErrors.ownerEmail ? 'err-ownerEmail' : undefined}
                placeholder="tu@correo.com"
                autoComplete="email"
              />
              <FieldMsg id="err-ownerEmail" msg={fieldErrors.ownerEmail} />
            </label>

            <label className="field">
              <span className="field-label">Contraseña (mín. 6 caracteres, al menos un número)</span>
              <div style={{ position: 'relative' }}>
                <input
                  className={`field-input${fieldErrors.password ? ' field-input--error' : ''}`}
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  required minLength={6}
                  value={form.password} onChange={onChange}
                  aria-invalid={fieldErrors.password ? 'true' : undefined}
                  aria-describedby={fieldErrors.password ? 'err-password' : undefined}
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
              {fieldErrors.password ? (
                <FieldMsg id="err-password" msg={fieldErrors.password} />
              ) : form.password.length >= 6 && /\d/.test(form.password) ? (
                <span className="field-ok">
                  <span className="material-symbols-outlined icon">check_circle</span>
                  Contraseña válida.
                </span>
              ) : (
                <span className="field-hint">Mínimo 6 caracteres e incluir al menos un número.</span>
              )}
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