/**
 * components/CardGlass.jsx
 *
 * Tarjeta "glass" del tema Ultraviolet (Material 3).
 *
 * Aplica las tres capas visuales que pide el design system:
 *   - background: superficie tonal translucida + backdrop-filter (efecto vidrio)
 *   - border:     1px outline-variant + top highlight blanco al 5%
 *   - hover:      elevacion translateY(-2px) + glow purpura del brand
 *
 * Todos los colores salen de las variables de styles/global.css
 * (--surface-container, --outline-variant, --primary-glow, ...), asi que
 * la tarjeta se adapta sola si se cambia la paleta en :root.
 *
 * Props:
 *   as          {string}  Etiqueta HTML a renderizar. Default 'div'.
 *                         Usar 'article', 'li' o 'section' segun el contexto
 *                         semantico, o 'button' si la tarjeta es clickeable.
 *   interactive {boolean} Activa hover (elevacion + glow) y cursor pointer.
 *                         Default false. Si se pasa onClick se activa solo.
 *   padding     {string}  'none' | 'sm' | 'md' | 'lg'. Default 'md'.
 *   className   {string}  Clases extra que se concatenan a las del componente.
 *   children    {node}    Contenido de la tarjeta.
 *   ...rest               Cualquier otro atributo (onClick, role, style, etc.)
 *                         se reenvia al elemento raiz.
 *
 * Uso:
 *   <CardGlass interactive onClick={() => abrir(m.id)}>
 *     <h3>{m.nombre}</h3>
 *     <p>{m.email}</p>
 *   </CardGlass>
 *
 * Accesibilidad:
 *   Si la tarjeta es interactiva pero NO se renderiza como <button>, se le
 *   agrega tabIndex=0 y role="button" y se dispara onClick con Enter/Espacio,
 *   para que sea usable con teclado.
 */
import '../styles/cardglass.css';

const PADDINGS = {
  none: 'card-glass--p-none',
  sm:   'card-glass--p-sm',
  md:   'card-glass--p-md',
  lg:   'card-glass--p-lg',
};

export default function CardGlass({
  as: Tag = 'div',
  interactive = false,
  padding = 'md',
  className = '',
  children,
  onClick,
  onKeyDown,
  ...rest
}) {
  // Una tarjeta con onClick es interactiva aunque no lo declaren.
  const esInteractiva = interactive || typeof onClick === 'function';
  const esBotonNativo = Tag === 'button' || Tag === 'a';

  const clases = [
    'card-glass',
    PADDINGS[padding] || PADDINGS.md,
    esInteractiva ? 'card-glass--interactive' : '',
    className,
  ].filter(Boolean).join(' ');

  // Enter / Espacio activan la tarjeta cuando no es un boton nativo.
  const manejarTecla = (evento) => {
    if (typeof onKeyDown === 'function') onKeyDown(evento);
    if (evento.defaultPrevented) return;
    if (!esInteractiva || esBotonNativo || typeof onClick !== 'function') return;
    if (evento.key === 'Enter' || evento.key === ' ' || evento.key === 'Spacebar') {
      evento.preventDefault();
      onClick(evento);
    }
  };

  const propsAccesibilidad =
    esInteractiva && !esBotonNativo
      ? { tabIndex: 0, role: 'button' }
      : {};

  return (
    <Tag
      className={clases}
      onClick={onClick}
      onKeyDown={manejarTecla}
      {...propsAccesibilidad}
      {...rest}
    >
      {children}
    </Tag>
  );
}
