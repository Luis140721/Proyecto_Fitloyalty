/**
 * components/Ripple.jsx
 *
 * Productor de handler para el efecto ripple (onda) al click.
 * Inyecta un <span class="ripple-wave"> en el punto exacto del click
 * dentro del elemento que dispara el evento (event.currentTarget).
 *
 * Sin librerias externas: usa getBoundingClientRect + clientX/Y y
 * la animacion CSS `rippleExpand` definida en styles/motion.css.
 *
 * El span se elimina automaticamente al terminar la animacion, con
 * fallback por temporizador en caso de que `animationend` no dispare
 * (p.ej. reduced-motion, tab inactivo, error de estilo).
 *
 * Uso:
 *   const onClick = Ripple({ opacity: 0.3 });
 *
 *   <button type="button" className="ripple-host" onClick={onClick}>
 *     Guardar
 *   </button>
 *
 * Convenciones:
 *   - El boton contenedor debe tener la clase `ripple-host` (de motion.css)
 *     para que `position: relative; overflow: hidden;` aplique.
 *   - Se respeta `disabled` del host: si el handler recibe un click de un
 *     elemento disabled, sale sin crear ripple.
 */
import { useCallback } from 'react';

const RIPPLE_DURATION_MS = 600;
const CLEANUP_FALLBACK_MS = RIPPLE_DURATION_MS + 100;

export default function Ripple(options = {}) {
  const { disabled = false, opacity = 0.35 } = options;

  return useCallback((event) => {
    const host = event && event.currentTarget;
    if (!host || disabled) return;
    // Respeta el atributo disabled del elemento.
    if (host.disabled) return;

    const rect = host.getBoundingClientRect();
    // Tamano: el diametro debe cubrir la diagonal del host para que
    // cualquier punto de click produzca un circulo que cubra el boton.
    const size = Math.max(rect.width, rect.height) * 2;
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const span = document.createElement('span');
    span.className = 'ripple-wave';
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    span.style.opacity = String(opacity);

    host.appendChild(span);

    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      if (span.parentNode === host) host.removeChild(span);
    };

    span.addEventListener('animationend', cleanup, { once: true });
    // Fallback por si animationend no dispara.
    const fallbackId = setTimeout(cleanup, CLEANUP_FALLBACK_MS);
    // Limpieza del timer si animationend dispara primero.
    span.addEventListener(
      'animationend',
      () => clearTimeout(fallbackId),
      { once: true }
    );
  }, [disabled, opacity]);
}