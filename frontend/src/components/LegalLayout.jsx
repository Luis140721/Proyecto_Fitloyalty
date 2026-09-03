import { Link } from 'react-router-dom';
import Logo from './Logo';
import '../styles/legal.css';

export default function LegalLayout({ title, subtitle, updated, children }) {
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <Link to="/" className="legal-brand">
          <Logo height={30} />
        </Link>
      </header>

      <div className="legal-hero">
        <div className="legal-hero__inner">
          <h1 className="legal-hero__title">{title}</h1>
          {subtitle && <p className="legal-hero__lead">{subtitle}</p>}
          {updated && (
            <span className="legal-hero__updated">
              Última actualización: {updated}
            </span>
          )}
        </div>
      </div>

      <main className="legal-body">
        <article className="legal-content anim-fade-up">
          {children}
        </article>
      </main>

      <footer className="legal-footer">
        <div className="legal-footer__inner">
          <Link to="/" className="legal-brand legal-brand--sm">
            <Logo height={24} />
          </Link>
          <nav className="legal-footer__nav">
            <Link to="/legal/terminos">Términos</Link>
            <Link to="/legal/privacidad">Privacidad</Link>
            <Link to="/legal/datos">Política de datos</Link>
            <Link to="/legal/eliminar-cuenta">Eliminar cuenta</Link>
          </nav>
          <span className="legal-footer__copy">
            © {new Date().getFullYear()} FitLoyalty
          </span>
        </div>
      </footer>
    </div>
  );
}
