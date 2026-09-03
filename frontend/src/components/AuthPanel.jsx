import { Link } from 'react-router-dom';
import Logo from './Logo';

export default function AuthPanel({ eyebrow = 'FitLoyalty', headline, sub, points, footNote }) {
  return (
    <aside className="auth-page__panel">
      <Link to="/" className="auth-panel-brand" aria-label="Inicio FitLoyalty">
        <Logo height={34} />
      </Link>

      <div>
        <span className="auth-form-eyebrow" style={{ marginBottom: 20 }}>{eyebrow}</span>
        <h2 className="auth-panel-headline">{headline}</h2>
        {sub && <p className="auth-panel-sub">{sub}</p>}
        {points && points.length > 0 && (
          <ul className="auth-panel-points">
            {points.map((p, i) => (
              <li key={i}>
                <span className="material-symbols-outlined icon">{p.icon}</span>
                <span>
                  <strong>{p.title}</strong>
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="auth-panel-foot">
        <span>{footNote || 'Diseñado para gimnasios pequeños de Colombia'}</span>
        <div className="dots">
          <span className="active" /><span /><span />
        </div>
      </div>
    </aside>
  );
}