import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/landing.css';

function getDashboardPath(role) {
  switch (role) {
    case 'admin': return '/dashboard/admin';
    case 'receptionist': return '/dashboard/receptionist';
    case 'member': return '/dashboard/member';
    default: return '/login';
  }
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={getDashboardPath(user.role)} replace />;

  return (
    <div className="landing-page">
      <div className="landing-topbar">
        <Link to="/" className="landing-logo">FitLoyalty</Link>
        <div className="landing-actions">
          <Link className="landing-link" to="/login">Iniciar sesión</Link>
          <Link className="btn-primary btn-primary--small" to="/register">Crear cuenta</Link>
        </div>
      </div>

      <header className="landing-hero">
        <div className="landing-hero__content">
          <span className="eyebrow">CRM para gimnasios</span>
          <h1>Controla tu gimnasio, fideliza clientes y acelera tus ventas con datos claros.</h1>
          <p>
            FitLoyalty reúne asistencias, membresías y alertas de abandono en un panel moderno que hace que administrar un gimnasio sea más fácil, rápido y rentable.
          </p>
          <div className="landing-hero__actions">
            <Link className="btn-primary" to="/register">Comenzar gratis</Link>
            <Link className="btn-secondary" to="/login">Ver demo</Link>
          </div>
          <div className="landing-highlights">
            <div>
              <strong>99%</strong>
              <span>Visibilidad operativa</span>
            </div>
            <div>
              <strong>+30%</strong>
              <span>Retención de socios</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>Control de membresías</span>
            </div>
          </div>
        </div>

        <div className="landing-hero__visual">
          <div className="hero-card">
            <div className="hero-card__badge">Panel KPI</div>
            <div className="hero-card__header">
              <div>
                <strong>Resumen de métricas</strong>
                <p>Desempeño en un solo vistazo</p>
              </div>
              <span>🏋️</span>
            </div>
            <div className="hero-card__chart">
              <div className="graph-line graph-line--wide" />
              <div className="graph-line graph-line--tall" />
              <div className="graph-line graph-line--medium" />
              <div className="graph-line graph-line--short" />
            </div>
            <div className="hero-card__stats">
              <div>
                <small>Socios activos</small>
                <strong>128</strong>
              </div>
              <div>
                <small>Asistencias hoy</small>
                <strong>52</strong>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="landing-feature-grid">
        <article className="feature-card feature-card--accent">
          <h3>Fideliza a tus socios</h3>
          <p>Detecta señales de abandono y actúa antes de que cancelen su membresía.</p>
        </article>
        <article className="feature-card">
          <h3>Reportes y datos claros</h3>
          <p>Visualiza flujo de clientes, membresías y resultados del día sin perder tiempo.</p>
        </article>
        <article className="feature-card">
          <h3>Equipo conectado</h3>
          <p>Gestiona recepcionistas y permisos desde un mismo panel.</p>
        </article>
      </section>

      <section className="landing-process">
        <div className="section-header">
          <p className="section-eyebrow">Cómo funciona</p>
          <h2>Tres pasos para poner tu gimnasio en orden.</h2>
        </div>
        <div className="process-grid">
          <div className="process-step">
            <span>1</span>
            <h4>Registra tu gimnasio</h4>
            <p>Crea tu cuenta y configura recepcionistas en minutos.</p>
          </div>
          <div className="process-step">
            <span>2</span>
            <h4>Monitorea asistencias</h4>
            <p>Sigue los ingresos diarios y las tendencias de comportamiento.</p>
          </div>
          <div className="process-step">
            <span>3</span>
            <h4>Actúa con información</h4>
            <p>Recibe alertas y ayuda a tus clientes antes de que abandonen.</p>
          </div>
        </div>
      </section>

      <section className="landing-testimonials">
        <div className="section-header">
          <p className="section-eyebrow">Clientes felices</p>
          <h2>Gimnasios que ya mejoraron su operación.</h2>
        </div>
        <div className="testimonial-grid">
          <article>
            <p>“FitLoyalty nos ayudó a reducir las bajas en un 20% y ahora tenemos una visión clara de quién necesita seguimiento.”</p>
            <strong>María, dueña de FitPlus</strong>
          </article>
          <article>
            <p>“Con un solo tablero veo qué miembros no vienen y qué planes vencen esta semana. Todo más simple.”</p>
            <strong>Lucas, gerente de gimnasio</strong>
          </article>
          <article>
            <p>“La interfaz es elegante y rápida, ideal para el equipo de recepción. Ya no dependemos de hojas de cálculo.”</p>
            <strong>Sofía, administradora</strong>
          </article>
        </div>
      </section>

      <section className="landing-contact">
        <div className="section-header">
          <p className="section-eyebrow">Contacto</p>
          <h2>Estamos listos para ayudarte a transformar tu gimnasio.</h2>
        </div>
        <div className="contact-grid">
          <div>
            <h4>Escríbenos</h4>
            <p>hola@fitloyalty.com</p>
          </div>
          <div>
            <h4>WhatsApp</h4>
            <p>+57 300 123 4567</p>
          </div>
          <div>
            <h4>Soporte</h4>
            <p>Disponibilidad de lunes a viernes, 8am - 6pm</p>
          </div>
        </div>
      </section>

      <section className="landing-cta-strip landing-cta-strip--wide">
        <div>
          <p>Empieza hoy sin compromiso.</p>
          <h2>Transforma tu gimnasio con un CRM pensado para tu equipo.</h2>
        </div>
        <Link className="btn-primary btn-primary--small" to="/register">Empieza ahora</Link>
      </section>

      <footer className="landing-footer landing-footer--simple">
        <div>
          <strong>FitLoyalty</strong>
          <p>Una plataforma diseñada para gimnasios que quieren crecer, retener y operar con más claridad.</p>
        </div>
      </footer>
    </div>
  );
}
