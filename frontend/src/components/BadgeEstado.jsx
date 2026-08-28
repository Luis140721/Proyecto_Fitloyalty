/**
 * components/BadgeEstado.jsx
 *
 * Badge de estado de un miembro (tema Ultraviolet / M3).
 * Muestra un icono de Material Symbols + etiqueta, con los colores
 * de estado definidos en global.css (--success, --error, --warning, ...).
 *
 * Estados soportados:
 *   activo        verde   check_circle   membresia al dia
 *   moroso        lila    payments       pago pendiente / vence pronto
 *   vencido       rojo    cancel         membresia vencida
 *   riesgo        lila    warning        sin asistir hace semanas (alerta abandono)
 *   congelado     azul    ac_unit        membresia congelada
 *
 * Props:
 *   estado    {string}  'activo' | 'moroso' | 'vencido' | 'riesgo' | 'congelado'
 *   children  {node}    Texto opcional para sobreescribir la etiqueta por defecto.
 *   className {string}  Clases extra.
 *
 * Uso:
 *   <BadgeEstado estado="vencido" />
 *   <BadgeEstado estado={estadoDeMiembro(m)} />
 *
 * El helper estadoDeMiembro(m) mapea los flags que devuelve la API
 * (m.vencido, m.vencePronto, m.enRiesgo, m.congelada) al estado del badge,
 * con la misma prioridad que usaba statusChip en MiembrosPage.
 */
import '../styles/badgeestado.css';

const ESTADOS = {
  activo:    { icono: 'check_circle', etiqueta: 'Al día',       clase: 'badge-estado--activo' },
  moroso:    { icono: 'payments',     etiqueta: 'Vence pronto', clase: 'badge-estado--moroso' },
  vencido:   { icono: 'cancel',       etiqueta: 'Vencido',      clase: 'badge-estado--vencido' },
  riesgo:    { icono: 'warning',      etiqueta: 'En riesgo',    clase: 'badge-estado--riesgo' },
  congelado: { icono: 'ac_unit',      etiqueta: 'Congelado',    clase: 'badge-estado--congelado' },
};

/** Mapea un miembro de la API al estado del badge (misma prioridad que statusChip). */
export function estadoDeMiembro(m) {
  if (!m) return 'activo';
  if (m.congelada)   return 'congelado';
  if (m.vencido)     return 'vencido';
  if (m.vencePronto) return 'moroso';
  if (m.enRiesgo)    return 'riesgo';
  return 'activo';
}

export default function BadgeEstado({ estado = 'activo', children, className = '', ...rest }) {
  const def = ESTADOS[estado] || ESTADOS.activo;
  const clases = ['badge-estado', def.clase, className].filter(Boolean).join(' ');

  return (
    <span className={clases} {...rest}>
      <span className="material-symbols-outlined badge-estado__icono" aria-hidden="true">
        {def.icono}
      </span>
      {children || def.etiqueta}
    </span>
  );
}
