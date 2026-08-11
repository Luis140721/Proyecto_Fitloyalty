import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PHONE_RE = /^[3]\d{9}$/;

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
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const phoneDigits = form.gymPhone.replace(/\D/g, '');
    if (!PHONE_RE.test(phoneDigits)) {
      setError('El telefono del gimnasio debe tener 10 digitos y comenzar con 3.');
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
      <aside className="auth-side">
        <div className="brand-row">
          <div className="brand-mark">FL</div>
          <div className="brand-name">FitLoyalty</div>
        </div>
        <h1>Empieza tu prueba gratuita</h1>
        <p>7 dias con todo desbloqueado. Creas tu gimnasio, tu cuenta de admin y ya puedes empezar a invitar a tu equipo.</p>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h2>Crear gimnasio</h2>
          <p className="subtitle">Solo tu (como admin) puedes registrar un gimnasio aqui.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label>Nombre del gimnasio</label>
            <input name="gymName" required value={form.gymName} onChange={onChange} placeholder="Ej: Power House" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Telefono (10 digitos, empieza con 3)</label>
              <input name="gymPhone" required value={form.gymPhone} onChange={onChange} inputMode="numeric" placeholder="3001234567" />
            </div>
            <div className="field">
              <label>Email del gimnasio (opcional)</label>
              <input name="gymEmail" type="email" value={form.gymEmail} onChange={onChange} placeholder="contacto@powerhouse.com" />
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
          <p className="subtitle" style={{ marginTop: 0 }}>Tus datos de admin</p>

          <div className="field">
            <label>Tu nombre</label>
            <input name="ownerName" required value={form.ownerName} onChange={onChange} placeholder="Nombre completo" />
          </div>
          <div className="field">
            <label>Tu correo (sera tu usuario)</label>
            <input name="ownerEmail" type="email" required value={form.ownerEmail} onChange={onChange} placeholder="tu@correo.com" />
          </div>
          <div className="field">
            <label>Contrasena (min 6 caracteres, al menos un numero)</label>
            <input name="password" type="password" required minLength={6} value={form.password} onChange={onChange} placeholder="******" />
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', marginTop: 8 }}>
            {submitting ? 'Creando...' : 'Crear mi gimnasio'}
          </button>

          <p className="helper">Ya tienes cuenta? <Link to="/login">Inicia sesion</Link></p>
        </form>
      </main>
    </div>
  );
}
