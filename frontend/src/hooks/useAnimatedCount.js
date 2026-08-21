/**
 * hooks/useAnimatedCount.js
 *
 * Anima un numero hacia un `target` con rAF + easing (out-cubic por defecto).
 * Disenado para counters de dashboard (miembros activos, check-ins hoy, etc.)
 *
 * Caracteristicas:
 *   - Tween entre el valor previo (no siempre 0) y el nuevo target.
 *   - Respeto de prefers-reduced-motion: salta directo al target.
 *   - Cancelacion limpia en unmount o cambio de target.
 *   - Sin dependencias externas.
 *
 * Uso:
 *   function MembersCounter({ value }) {
 *     const ref = useAnimatedCount(value, { duration: 900 });
 *     return <span ref={ref}>0</span>;
 *   }
 */
import { useEffect, useRef } from 'react';

const defaultEasing = (t) => 1 - Math.pow(1 - t, 3); // out-cubic

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatValue(n) {
  // Entera para counters; el caller puede envolver si quiere decimales.
  return Math.round(n).toLocaleString('es-CO');
}

export default function useAnimatedCount(target, options = {}) {
  const { duration = 800, easing = defaultEasing } = options;
  const ref = useRef(null);
  // Mantiene el ultimo valor animado entre renders para hacer tween continuo.
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const to = Number(target);
    const safeTarget = Number.isFinite(to) ? to : 0;

    // Reduced motion o duracion invalida: snapshot directo.
    if (prefersReducedMotion() || duration <= 0) {
      node.textContent = formatValue(safeTarget);
      fromRef.current = safeTarget;
      return undefined;
    }

    const from = fromRef.current;
    // Si el delta es 0 o casi 0, evitamos el rAF y pintamos directo.
    if (Math.abs(safeTarget - from) < 0.5) {
      node.textContent = formatValue(safeTarget);
      fromRef.current = safeTarget;
      return undefined;
    }

    const start = performance.now();
    const delta = safeTarget - from;

    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easing(t);
      const value = from + delta * eased;
      node.textContent = formatValue(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Snap al target exacto y persiste como nuevo "from".
        node.textContent = formatValue(safeTarget);
        fromRef.current = safeTarget;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Al cancelar, dejamos "from" en el ultimo valor visible para que
      // un re-mount o cambio posterior continue desde ahi.
      const last = node.textContent;
      const parsed = Number(String(last).replace(/[^\d-]/g, ''));
      if (Number.isFinite(parsed)) fromRef.current = parsed;
    };
  }, [target, duration, easing]);

  return ref;
}