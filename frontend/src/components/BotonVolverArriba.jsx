import { useEffect, useState } from 'react';

/**
 * components/BotonVolverArriba.jsx
 *
 * Boton flotante que devuelve al inicio de la pagina. Aparece solo cuando se
 * ha bajado lo suficiente para que haga falta (por defecto, una pantalla).
 *
 * Detalles que importan:
 *  - El listener de scroll es pasivo: no bloquea el hilo de desplazamiento.
 *  - Respeta `prefers-reduced-motion`: si el usuario pidio menos animacion, el
 *    salto es instantaneo en vez de suave.
 *  - Se oculta de los lectores de pantalla mientras no es visible, para que no
 *    aparezca un boton "fantasma" en el recorrido por teclado.
 */
export default function BotonVolverArriba({ desde = 600 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alScroll = () => setVisible(window.scrollY > desde);
    alScroll();                                    // estado inicial correcto al montar
    window.addEventListener('scroll', alScroll, { passive: true });
    return () => window.removeEventListener('scroll', alScroll);
  }, [desde]);

  const subir = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      className={`volver-arriba ${visible ? 'volver-arriba--visible' : ''}`}
      onClick={subir}
      aria-label="Volver arriba"
      title="Volver arriba"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
    >
      <span className="material-symbols-outlined icon">arrow_upward</span>
    </button>
  );
}
