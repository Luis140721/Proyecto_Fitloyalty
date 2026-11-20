/**
 * Semana 8 (Front, Santiago): BadgeEstado salia con 50 % de ramas. El estado de
 * un miembro decide lo que ve recepcion en la lista (al dia, vencido, congelado),
 * asi que cada rama de estadoDeMiembro y el respaldo del badge tienen su test.
 */
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import BadgeEstado, { estadoDeMiembro } from '../src/components/BadgeEstado';

describe('estadoDeMiembro', () => {
  test.each([
    ['sin miembro', null, 'activo'],
    ['sin banderas', {}, 'activo'],
    ['congelado aunque este vencido', { congelada: true, vencido: true }, 'congelado'],
    ['vencido aunque venza pronto', { vencido: true, vencePronto: true }, 'vencido'],
    ['por vencer aunque este en riesgo', { vencePronto: true, enRiesgo: true }, 'moroso'],
    ['solo en riesgo', { enRiesgo: true }, 'riesgo'],
  ])('should map a member %s', (_caso, miembro, esperado) => {
    expect(estadoDeMiembro(miembro)).toBe(esperado);
  });
});

describe('BadgeEstado', () => {
  test('should show the label of the state', () => {
    render(<BadgeEstado estado="vencido" />);

    expect(screen.getByText('Vencido')).toHaveClass('badge-estado', 'badge-estado--vencido');
  });

  test('should fall back to "Al día" for an unknown state', () => {
    render(<BadgeEstado estado="inventado" />);

    expect(screen.getByText('Al día')).toHaveClass('badge-estado--activo');
  });

  test('should show the custom text and extra classes', () => {
    render(<BadgeEstado estado="congelado" className="extra">Hasta el lunes</BadgeEstado>);

    const badge = screen.getByText('Hasta el lunes');
    expect(badge).toHaveClass('badge-estado--congelado', 'extra');
    expect(screen.queryByText('Congelado')).not.toBeInTheDocument();
  });
});
