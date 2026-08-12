import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/admin.css';
import '../styles/notfound.css';

/**
 * Pantalla 404 — FitLoyalty Ultraviolet.
 *
 * - Cifra 404 enorme en Anybody 800 con glow púrpura.
 * - Muestra la ruta que el usuario intentó abrir (truncada si hace falta).
 * - Acciones:
 *     1) Volver al inicio  (btn-primary)
 *     2) Volver atrás      (btn-secondary, navigate(-1))
 *     3) Si hay sesión, "Ir a mi panel" según rol:
 *          admin          → /admin/dashboard
 *          resto          → /admin/checkin (recepción)
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Panel de destino según rol. El AuthContext ya normaliza a 'admin'
  // | 'receptionist' | 'trainer'.
  const panelHref = user?.role === 'admin' ? '/admin/dashboard' : '/admin/checkin';

  const handleBack = () => {
    // Si solo hay 1 entrada en el history (caso típico: enlace externo o
    // pegado en barra de direcciones), caer al home en vez de quedarnos
    // en la nada.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <main className="notfound" role="main">
      <section className="notfound__card" aria-labelledby="notfound-title">
        <span
          className="notfound__icon material-symbols-outlined"
          aria-hidden="true"
        >
          search_off
        </span>

        <h1 className="notfound__code" aria-hidden="true">404</h1>

        <h2 id="notfound-title" className="notfound__title">
          Página no encontrada
        </h2>

        <p className="notfound__copy">
          No pudimos encontrar lo que buscabas. Verifica la URL o vuelve al
          inicio para seguir navegando.
        </p>

        <code className="notfound__path" aria-label="Ruta solicitada">
          {location.pathname}
        </code>

        <div className="notfound__actions">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => navigate('/', { replace: true })}
          >
            Volver al inicio
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={handleBack}
          >
            Volver atrás
          </button>

          {user && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => navigate(panelHref, { replace: true })}
            >
              Ir a mi panel
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
