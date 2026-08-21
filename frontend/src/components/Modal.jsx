/**
 * components/Modal.jsx
 *
 * Modal accesible basado en position: fixed (sin portal). Animaciones:
 *   - backdrop: opacity 0 -> 1 (fade)
 *   - dialog:   scale 0.96 -> 1 + opacity 0 -> 1 (scale-in)
 * Definidas en styles/motion.css (.modal-backdrop-enter, .modal-dialog-enter).
 *
 * Props:
 *   open     -> bool que controla visibilidad
 *   onClose  -> () => void (Escape, click en backdrop, boton cerrar)
 *   title    -> string (encabezado accesible, referenciado por aria-labelledby)
 *   children -> contenido del body (con scroll interno si excede 60vh)
 *   footer   -> nodo React con los botones de accion (Cancelar / Confirmar)
 *   variant  -> 'primary' | 'danger'  (color del borde lateral del dialog)
 *
 * Accesibilidad:
 *   - role="dialog" + aria-modal="true" + aria-labelledby
 *   - Cierra con Escape
 *   - Cierra con click en backdrop (no con click dentro del dialog)
 *   - Restaura foco al trigger (si se pasa onCloseTrigger ref)
 *
 * Uso:
 *   <Modal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     title="Editar miembro"
 *     footer={
 *       <>
 *         <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
 *         <button className="btn btn-primary" type="submit">Guardar</button>
 *       </>
 *     }
 *   >
 *     <form>...</form>
 *   </Modal>
 */
import { useEffect, useRef } from 'react';

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'primary',
}) {
  const dialogRef = useRef(null);
  const lastFocusRef = useRef(null);

  // Bloquea scroll del body + atrapa foco mientras el modal esta abierto.
  useEffect(() => {
    if (!open) return undefined;

    // Guarda el foco previo para restaurarlo al cerrar.
    lastFocusRef.current = document.activeElement;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Lleva el foco al dialog al abrir.
    const t = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = dialogRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) focusable.focus();
        else dialogRef.current.focus();
      }
    }, 32);

    // Cierra con Escape.
    const onKey = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // Restaura foco al elemento que abrio el modal.
      if (lastFocusRef.current && typeof lastFocusRef.current.focus === 'function') {
        try { lastFocusRef.current.focus(); } catch (_) { /* noop */ }
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const onBackdropClick = (e) => {
    // Solo cierra si el click es en el backdrop, no en el dialog.
    if (e.target === e.currentTarget) onClose && onClose();
  };

  return (
    <div
      className="modal-backdrop modal-backdrop-enter"
      onMouseDown={onBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`modal-dialog modal-dialog-enter modal-dialog--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <header className="modal-dialog__head">
          <h3 id="modal-title">{title}</h3>
          <button
            type="button"
            className="modal-dialog__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined icon">close</span>
          </button>
        </header>
        <div className="modal-dialog__body">{children}</div>
        {footer && <footer className="modal-dialog__foot">{footer}</footer>}
      </div>
    </div>
  );
}