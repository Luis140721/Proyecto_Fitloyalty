/**
 * components/EmptyState.jsx
 *
 * Estado vacio M3 para pantallas sin datos (tema Ultraviolet).
 * Estructura: icono + titulo + descripcion + CTA opcional.
 *
 * Props:
 *   icono       {string}  Nombre del icono de Material Symbols. Default 'inbox'.
 *   titulo      {string}  Titulo corto ("Aun no hay check-ins hoy").
 *   descripcion {string}  Texto secundario con el siguiente paso sugerido.
 *   ctaLabel    {string}  Texto del boton de accion (opcional).
 *   onCta       {func}    Handler del boton. El CTA solo se muestra si
 *                         hay ctaLabel Y onCta.
 *   className   {string}  Clases extra.
 *
 * Uso:
 *   <EmptyState
 *     icono="group_off"
 *     titulo="Sin miembros que mostrar"
 *     descripcion="No hay miembros que coincidan con el filtro actual."
 *     ctaLabel="Nuevo miembro"
 *     onCta={() => setOpen(true)}
 *   />
 *
 * Accesibilidad: role="status" para que los lectores de pantalla anuncien
 * el estado vacio cuando aparece; el icono es decorativo (aria-hidden).
 */
import '../styles/emptystate.css';

export default function EmptyState({
  icono = 'inbox',
  titulo,
  descripcion,
  ctaLabel,
  onCta,
  className = '',
}) {
  const clases = ['empty-state', className].filter(Boolean).join(' ');

  return (
    <div className={clases} role="status">
      <span className="empty-state__halo" aria-hidden="true">
        <span className="material-symbols-outlined empty-state__icono">{icono}</span>
      </span>
      {titulo && <h4 className="empty-state__titulo">{titulo}</h4>}
      {descripcion && <p className="empty-state__desc">{descripcion}</p>}
      {ctaLabel && typeof onCta === 'function' && (
        <button type="button" className="btn btn-primary btn-sm empty-state__cta" onClick={onCta}>
          <span className="material-symbols-outlined icon" aria-hidden="true">add</span>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
