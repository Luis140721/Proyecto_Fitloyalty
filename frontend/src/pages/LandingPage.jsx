import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div>
      <header className="landing-header">
        <div className="brand-row">
          <div className="brand-mark">FL</div>
          <div className="brand-name">FitLoyalty</div>
        </div>
        <nav className="landing-nav">
          <Link to="/login" className="btn btn-secondary btn-sm">Iniciar sesion</Link>
          <Link to="/register" className="btn btn-primary btn-sm">Empezar gratis</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <h1>El sistema operativo para gimnasios pequenos</h1>
        <p>
          Gestiona miembros, asistencias y staff desde un solo lugar.
          Empieza con 7 dias de prueba gratuita, sin tarjeta de credito.
        </p>
        <div className="landing-cta">
          <Link to="/register" className="btn btn-primary">Crear mi gimnasio</Link>
          <Link to="/login" className="btn btn-secondary">Ya tengo cuenta</Link>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-feature">
          <h3>Check-in rapido</h3>
          <p>Escanea el codigo QR del miembro o busca por documento. Aviso automatico si la membresia esta vencida.</p>
        </div>
        <div className="landing-feature">
          <h3>Staff con invitacion</h3>
          <p>Tu recepcionista no se registra solo: tu lo invitas por correo y define su propia contrasena.</p>
        </div>
        <div className="landing-feature">
          <h3>7 dias de prueba</h3>
          <p>Empiezas con todo desbloqueado. Si el gimnasio te funciona, activas tu plan; si no, no perdiste nada.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>FitLoyalty &middot; Hecho en Bogota por Santiago Salamanca</span>
      </footer>
    </div>
  );
}
