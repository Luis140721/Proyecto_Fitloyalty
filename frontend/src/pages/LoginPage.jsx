import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthPanel from '../components/AuthPanel';
import '../styles/login.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPwd, setShowPwd]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');

  const from = location.state?.from?.pathname || '/dashboard';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) { setError('Ingresa tu correo y contraseña'); return; }
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email.trim().toLowerCase(), password);
      if (!user) throw new Error('No se pudo iniciar sesión');
      const role = user.role || user.rol || user.rol_nombre;
      const isAdmin = role === 'admin' || role === 'ADMINISTRADOR' || user.id_rol === 1;
      const target = isAdmin ? '/admin/dashboard' : '/admin/checkin';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <AuthPanel
        eyebrow="DASHBOARD"
        headline={<>El motor de tu <em>gimnasio</em>, en un solo panel.</>}
        sub="Ingresa con tu correo y contraseña para ver hoy: miembros activos, vencimientos, accesos por QR y los cobros pendientes del mes."
        points={[
          { icon: 'bolt',        title: 'Empieza en segundos', text: 'Carga inicial en menos de 500 ms desde cualquier navegador.' },
          { icon: 'shield_lock',  title: 'Sesiones cifradas',   text: 'Token JWT por sesión, hash bcrypt para contraseñas.' },
          { icon: 'devices',      title: 'Funciona en tu celu', text: 'Cualquier celular moderno o computador con navegador.' },
        ]}
        footNote="Acceso seguro · Sesión cifrada · Hecho en Colombia"
      />

      <main className="auth-page__form">
        <section className="auth-form-card" aria-labelledby="login-title">
          <span className="auth-form-eyebrow">INICIAR SESIÓN</span>
          <h1 className="auth-form-title" id="login-title">Bienvenido de vuelta</h1>
          <p className="auth-form-lead">
            Ingresa con tu correo y contraseña. Si eres nuevo, <Link className="auth-form-link" to="/register-owner">crea una cuenta gratuita</Link>.
          </p>

          {error && (
            <div className="alert alert-error" role="alert">
              <span className="material-symbols-outlined icon">error</span>
              <span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span className="field-label">Correo electrónico</span>
              <input
                type="email"
                className="field-input"
                placeholder="tunombre@fitgym.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Contraseña</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="field-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                  required
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

            <div className="auth-form-actions">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Recordarme en este equipo
              </label>
              <Link to="/forgot-password" className="auth-form-link">
                ¿Olvidaste tu clave?
              </Link>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar a mi panel
                  <span className="material-symbols-outlined icon">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <div className="auth-form-divider">o</div>

          <p className="auth-form-foot">
            ¿Aún no tienes gimnasio? <Link className="auth-form-link" to="/register-owner">Crea tu cuenta gratis</Link>
          </p>
        </section>
      </main>
    </div>
  );
}