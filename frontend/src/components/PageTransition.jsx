/**
 * components/PageTransition.jsx
 *
 * Wrapper que aplica la transicion de entrada de pagina
 * (.page-enter -> .page-enter-active definidas en styles/motion.css).
 *
 * Estrategia:
 *   - Render inicial con clase `page-enter` (estado oculto).
 *   - Tras 16 ms (1 frame) cambia a `page-enter-active` para disparar
 *     la transicion CSS. Sin librerias externas.
 *   - Si el usuario prefiere reduced-motion, el media query del CSS
 *     acorta la transicion a 0.01ms y el efecto se ve instantaneo.
 *
 * Uso:
 *   export default function DashboardPage() {
 *     return (
 *       <PageTransition>
 *         <h1>Dashboard</h1>
 *         ...
 *       </PageTransition>
 *     );
 *   }
 */
import { useEffect, useState } from 'react';

const FRAME_MS = 16;

export default function PageTransition({ children, className = '' }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setActive(true), FRAME_MS);
    return () => clearTimeout(id);
  }, []);

  const baseClass = active ? 'page-enter-active' : 'page-enter';
  const composed = className ? `${baseClass} ${className}` : baseClass;

  return (
    <div className={composed}>
      {children}
    </div>
  );
}