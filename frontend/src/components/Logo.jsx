/**
 * components/Logo.jsx
 *
 * Marca de FitLoyalty. Centraliza los activos para que un cambio de logo sea
 * un solo archivo y no haya <img> sueltos repartidos por las paginas.
 *
 * Por que el SVG va EN LINEA y no como <img src="...">:
 * el lockup incluye <text> real con la tipografia Sora. Un SVG cargado como
 * <img> se renderiza aislado, sin acceso a las fuentes ni al CSS de la pagina,
 * asi que Sora no se aplicaria y la palabra saldria con la fuente de reemplazo.
 * En linea si hereda las fuentes del documento.
 *
 * Por que la palabra usa currentColor:
 * el lockup se usa sobre lavanda (sidebar), sobre gris claro (landing, legales)
 * y sobre superficies oscuras. Con un color fijo habria que mantener una copia
 * por fondo; heredando el color, cada contenedor decide y nunca queda invisible.
 *
 * Variantes:
 *   - "lockup" (por defecto): icono morado + palabra en currentColor.
 *   - "icon": solo el cuadrado morado. Para espacios estrechos (header movil).
 *   - "icon-gray": cuadrado gris con acento morado, para fondos morados donde
 *     el solido no contrastaria.
 */

const RATIOS = { lockup: 420 / 100, icon: 1, 'icon-gray': 1 };

/** Simbolo suelto, sin cuadro de fondo. */
function Simbolo({ acento }) {
  return (
    <g>
      <path
        d="M24 16H86L77 32H40V84H24Z"
        fill="#F5F4F8" stroke="#F5F4F8" strokeWidth="4" strokeLinejoin="round"
      />
      <path
        d="M45 44H72L63 60H45Z"
        fill={acento} stroke={acento} strokeWidth="4" strokeLinejoin="round"
      />
    </g>
  );
}

/** Cuadro redondeado con el simbolo dentro. */
function Cuadro({ fondo, acento }) {
  return (
    <>
      <rect width="100" height="100" rx="24" fill={fondo} />
      <g transform="translate(12 12) scale(.76)">
        <Simbolo acento={acento} />
      </g>
    </>
  );
}

export default function Logo({ variant = 'lockup', height = 32, className = '', ...rest }) {
  const ratio = RATIOS[variant] ?? RATIOS.lockup;
  const comun = {
    height,
    width: Math.round(height * ratio),
    role: 'img',
    'aria-label': 'FitLoyalty',
    className: `logo logo--${variant} ${className}`.trim(),
    xmlns: 'http://www.w3.org/2000/svg',
    ...rest,
  };

  if (variant === 'icon' || variant === 'icon-gray') {
    const morado = variant === 'icon';
    return (
      <svg viewBox="0 0 100 100" {...comun}>
        <Cuadro fondo={morado ? '#7C5CE6' : '#3F444B'} acento={morado ? '#F5F4F8' : '#A78BFA'} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 420 100" {...comun}>
      <Cuadro fondo="#7C5CE6" acento="#F5F4F8" />
      <text
        x="118" y="66"
        fontFamily="Sora, system-ui, sans-serif"
        fontSize="48"
        letterSpacing="-1.5"
        fill="currentColor"
      >
        <tspan fontWeight="400">Fit</tspan><tspan fontWeight="700">Loyalty</tspan>
      </text>
    </svg>
  );
}
