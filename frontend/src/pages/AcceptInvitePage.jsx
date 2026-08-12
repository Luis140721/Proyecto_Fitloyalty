import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
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
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const score = strengthScore(password);

  useEffect(() => {
    if (!token) { setError('Token no proporcionado.'); return; }
    let alive = true;
    axios.get(`/api/auth/accept-invite/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (alive) setPreview(data); })
      .catch((err) => {
        if (alive) setError(err.response?.data?.error || 'Invitación no válida.');
      });
    return () => { alive = false; };
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setSubmitting(true);
    try {
      const user = await acceptInvite(token, password);
      const isAdmin = user?.rol === 'admin' || user?.id_rol === 1 || user?.role === 'admin';
      navigate(isAdmin ? '/admin/dashboard' : '/admin/checkin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo aceptar la invitación.');
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
                    className="field-input"
                    type={showPwd ? 'text' : 'password'}
                    required minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

              <label className="field">
                <span className="field-label">Confirma tu contraseña</span>
                <input
                  className="field-input"
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                />
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