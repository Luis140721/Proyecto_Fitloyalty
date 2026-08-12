/**
 * components/ErrorBanner.jsx
 *
 * Banner global para mostrar errores de la API sin que la app "se caiga feo".
 *
 * El AuthContext expone un mini-store de errores: cualquier llamada a
 * `pushApiError(err)` desde una pagina lo agrega aqui, y este componente
 * lo pinta arriba de todo. Los errores se autocerrran despues de 6s,
 * o el usuario puede cerrarlos con la X.
 *
 * Codigos de color segun severidad:
 *   - NETWORK / 0          -> rojo, "Sin conexion"
 *   - 401                   -> amarillo, "Sesion expirada" (con boton login)
 *   - 402 (trial vencido)   -> amarillo, "Tu periodo de prueba expiro"
 *   - 4xx                   -> rojo tenue, mensaje user-facing
 *   - 5xx                   -> rojo fuerte, "Error interno, reintenta"
 */
import { useEffect, useState, useCallback } from 'react';
import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearToken } from '../api';

const ErrorContext = createContext(null);
const AUTO_DISMISS_MS = 6000;

export function ErrorProvider({ children }) {
  const [items, setItems] = useState([]);

  const pushApiError = useCallback((err, opts = {}) => {
    const id = Date.now() + Math.random();
    const item = {
      id,
      status: err?.status ?? 0,
      code:   err?.code   ?? 'UNKNOWN',
      message: err?.message || 'Error desconocido',
      details: err?.details || null,
      persistent: Boolean(opts.persistent),
    };
    setItems((prev) => [...prev, item].slice(-4)); // max 4 visibles
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return (
    <ErrorContext.Provider value={{ items, pushApiError, dismiss, clear }}>
      {children}
      <ErrorBannerContainer items={items} dismiss={dismiss} />
    </ErrorContext.Provider>
  );
}

export function useApiError() {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error('useApiError debe usarse dentro de <ErrorProvider>');
  return ctx;
}

function ErrorBannerContainer({ items, dismiss }) {
  return (
    <div className="error-banner-stack" role="region" aria-live="polite" aria-label="Notificaciones de error">
      {items.map((it) => (
        <ErrorBanner key={it.id} item={it} onDismiss={() => dismiss(it.id)} />
      ))}
    </div>
  );
}

function ErrorBanner({ item, onDismiss }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (item.persistent) return undefined;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [item, onDismiss]);

  const { status, message } = item;

  let tone = 'error';
  let title = 'Error';
  let action = null;

  if (status === 0) { tone = 'net'; title = 'Sin conexion'; }
  else if (status === 401) {
    tone = 'warn'; title = 'Sesion expirada';
    action = (
      <button
        type="button"
        className="error-banner__action"
        onClick={() => {
          clearToken();
          sessionStorage.setItem('fitloyalty_after_login_redirect', window.location.pathname);
          navigate('/login');
        }}
      >
        Iniciar sesion
      </button>
    );
  }
  else if (status === 402) { tone = 'warn'; title = 'Tu periodo de prueba expiro'; }
  else if (status === 403) { tone = 'warn'; title = 'Sin permiso'; }
  else if (status === 404) { tone = 'error'; title = 'No encontrado'; }
  else if (status === 409) { tone = 'warn'; title = 'Conflicto'; }
  else if (status === 429) { tone = 'warn'; title = 'Demasiadas solicitudes'; }
  else if (status >= 500)  { tone = 'error'; title = 'Error del servidor'; }

  return (
    <div className={`error-banner error-banner--${tone}`} role="alert">
      <span className="error-banner__icon" aria-hidden="true">
        <span className="material-symbols-outlined">
          {tone === 'warn' ? 'warning' : tone === 'net' ? 'wifi_off' : 'error'}
        </span>
      </span>
      <div className="error-banner__body">
        <strong className="error-banner__title">{title}</strong>
        <p className="error-banner__msg">{message}</p>
      </div>
      {action}
      <button
        type="button"
        className="error-banner__close"
        onClick={onDismiss}
        aria-label="Cerrar notificacion"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
}