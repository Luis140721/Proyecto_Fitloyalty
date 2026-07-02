import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import DashboardHeader, { adminNavLinks } from '../components/DashboardHeader';
import '../styles/dashboard.css';

export default function CrearRecepcionistaPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
    if (success) setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.name || !form.email || !form.password) {
      return setError('Todos los campos son obligatorios.');
    }
    if (form.password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }

    setLoading(true);
    try {
      await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      setSuccess('Recepcionista creado correctamente.');
      setForm({ name: '', email: '', password: '' });
      setTimeout(() => navigate('/dashboard/admin'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear recepcionista.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dash">
      <DashboardHeader navLinks={adminNavLinks('/dashboard/crear-recepcionista')} />
      <main className="dash-main">
        <h1 className="dash-h1">Crear recepcionista</h1>
        <p className="dash-sub">Este formulario permite crear una nueva cuenta de recepción para tu gimnasio.</p>

        <section className="dash-section max-width-500">
          {error && <div className="dash-alert dash-alert--error">{error}</div>}
          {success && <div className="dash-alert dash-alert--success">{success}</div>}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Nombre completo</label>
              <input
                name="name"
                type="text"
                className="form-input"
                placeholder="Ej. Laura Gómez"
                value={form.name}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Correo electrónico</label>
              <input
                name="email"
                type="email"
                className="form-input"
                placeholder="recepcion@tugym.com"
                value={form.email}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                name="password"
                type="password"
                className="form-input"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </div>

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? 'Creando recepcionista...' : 'Crear recepcionista'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
