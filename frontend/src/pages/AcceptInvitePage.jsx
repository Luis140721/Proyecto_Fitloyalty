import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthPanel from '../components/AuthPanel';

const ROL_LABEL = {
  admin: 'administrador',
  entrenador: 'entrenador',
  recepcionista: 'recepcionista',
};

function strengthScore(pwd) {
  let s = 0;
  if (pwd.length >= 6) s++;
  if (/[A-Z]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) s++;
  if (/\d/.test(pwd) && /[A-Za-z]/.test(pwd)) s++;
  return Math.min(s, 4);
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const score = strengthScore(password);

  // Verificacion del token contra el backend. Se usa el cliente `api` (no axios
  // directo) para que respete VITE_API_BASE: en Vercel el backend vive en otro
  // dominio (Render) y una ruta relativa /api/... daria 404.
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api.get(`/auth/accept-invite/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (alive) { setPreview(data); setError(''); } })
      .catch((err) => {
        if (!alive) return;
        // err viene normalizado por el interceptor de api.js: { status, code, message }
        if (err.isNetwork) {
          setError('No pudimos contactar al servidor. Revisa tu conexión e intenta de nuevo.');
        } else if (err.status === 404) {
          setError('Esta invitación no existe o ya fue usada. Pídele al dueño que te envíe una nueva.');
        } else if (err.status === 410 || err.code === 'INVITE_EXPIRED') {
          setError('Esta invitación expiró. Pídele al dueño que te envíe una nueva.');
        } else {
          setError(err.message || 'Invitación no válida.');
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  // Validacion por campo: devuelve { password?, confirm? } con el mensaje concreto.
  const validate = () => {
    const next = {};
    if (!password) next.password = 'Escribe una contraseña.';
    else if (password.length < 6) next.password = `Te faltan ${6 - password.length} caracteres (mínimo 6).`;
    else if (!/\d/.test(password)) next.password = 'Debe incluir al menos un número.';

    if (!confirm) next.confirm = 'Repite la contraseña para confirmarla.';
    else if (password !== confirm) next.confirm = 'Las contraseñas no coinciden.';

    return next;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validate();
    setFieldErrors(found);
    if (Object.keys(found).length > 0) {
      // Enfoca el primer campo con problema para no dejar al usuario buscando.
      const first = document.querySelector('.field-input--error');
      if (first) first.focus();
      return;
    }
    setSubmitting(true);
    try {
      const user = await acceptInvite(token, password);
      const isAdmin = user?.rol === 'admin' || user?.id_rol === 1 || user?.role === 'admin';
      navigate(isAdmin ? '/admin/dashboard' : '/admin/checkin', { replace: true });
    } catch (err) {
      if (err.isNetwork) {
        setError('No pudimos contactar al servidor. Revisa tu conexión e intenta de nuevo.');
      } else if (err.status === 409) {
        setError('Ya existe una cuenta con este correo. Inicia sesión en vez de aceptar la invitación.');
      } else {
        setError(err.message || 'No se pudo aceptar la invitación.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthPanel
        eyebrow="INVITACIÓN"
        headline={<>Únete al equipo en <em>1 minuto</em>.</>}
        sub="Te invitaron a hacer parte del equipo de un gimnasio. Crea tu contraseña personal y entra directo a tu panel."
        points={[
          { icon: 'badge',     title: 'Rol asignado',         text: 'Entrarás como entrenador, recepcionista o admin según te invitó el dueño.' },
          { icon: 'lock_open', title: 'Solo el dueño decide', text: 'Cada quien ve solo lo suyo, sin perder control operativo.' },
          { icon: 'rocket',    title: 'Listo al instante',    text: 'Creas tu clave, entras y empiezas. Sin instalar nada.' },
        ]}
        footNote="Invitación cifrada · Expira en 7 días"
      />

      <main className="auth-page__form">
        <section className="auth-form-card auth-form-card--wide" aria-labelledby="accept-title">
          <span className="auth-form-eyebrow">ACEPTAR INVITACIÓN</span>
          <h1 className="auth-form-title" id="accept-title">Bienvenido al equipo</h1>
          <p className="auth-form-lead">
            Confirma la invitación y crea tu contraseña para empezar.
          </p>

          {error && (
            <div className="alert alert-error" role="alert">
              <span className="material-symbols-outlined icon">error</span>
              <span>{error}</span>
            </div>
          )}

          {!token && (
            <div className="alert alert-warning">
              <span className="material-symbols-outlined icon">warning</span>
              <span>Esta URL no incluye un token de invitación. Pídele al dueño que te reenvíe el link.</span>
            </div>
          )}

          {token && loading && (
            <div className="alert alert-info" role="status">
              <span className="material-symbols-outlined icon">hourglass_top</span>
              <span>
                Verificando tu invitación…
                <br />
                <span className="field-hint">
                  La primera carga puede tardar hasta un minuto mientras despierta el servidor.
                </span>
              </span>
            </div>
          )}

          {preview && (
            <div className="alert alert-info" role="status" style={{ alignItems: 'center' }}>
              <div className="avatar avatar-primary" style={{ flexShrink: 0 }}>
                {preview.gym?.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ lineHeight: 1.5 }}>
                Te invitaron a <strong>{preview.gym}</strong> como{' '}
                <strong>{ROL_LABEL[preview.rol] || preview.rol}</strong>.
                <br />
                <span style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                  {preview.email} · expira {new Date(preview.expiresAt).toLocaleString('es-CO')}
                </span>
              </span>
            </div>
          )}

          {preview && (
            <form className="auth-form" onSubmit={onSubmit} noValidate>
              <label className="field">
                <span className="field-label">Crea tu contraseña (mín. 6 caracteres, al menos un número)</span>
                <div style={{ position: 'relative' }}>
                  <input
                    className={`field-input${fieldErrors.password ? ' field-input--error' : ''}`}
                    type={showPwd ? 'text' : 'password'}
                    required minLength={6}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                    }}
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
                  <span className="field-error" id="err-password" role="alert">
                    <span className="material-symbols-outlined icon">error</span>
                    {fieldErrors.password}
                  </span>
                ) : password.length >= 6 && /\d/.test(password) ? (
                  <span className="field-ok">
                    <span className="material-symbols-outlined icon">check_circle</span>
                    Contraseña válida.
                  </span>
                ) : (
                  <span className="field-hint">Mínimo 6 caracteres e incluir al menos un número.</span>
                )}
              </label>

              <label className="field">
                <span className="field-label">Confirma tu contraseña</span>
                <input
                  className={`field-input${fieldErrors.confirm ? ' field-input--error' : ''}`}
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (fieldErrors.confirm) setFieldErrors((f) => ({ ...f, confirm: undefined }));
                  }}
                  aria-invalid={fieldErrors.confirm ? 'true' : undefined}
                  aria-describedby={fieldErrors.confirm ? 'err-confirm' : undefined}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                />
                {fieldErrors.confirm ? (
                  <span className="field-error" id="err-confirm" role="alert">
                    <span className="material-symbols-outlined icon">error</span>
                    {fieldErrors.confirm}
                  </span>
                ) : confirm && password === confirm ? (
                  <span className="field-ok">
                    <span className="material-symbols-outlined icon">check_circle</span>
                    Coinciden.
                  </span>
                ) : null}
              </label>

              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Aceptando...
                  </>
                ) : (
                  <>
                    Crear cuenta y entrar
                    <span className="material-symbols-outlined icon">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          )}

          <p className="auth-form-foot">
            ¿Tienes cuenta propia? <Link to="/login" className="auth-form-link">Inicia sesión</Link>
          </p>
        </section>
      </main>
    </div>
  );
}