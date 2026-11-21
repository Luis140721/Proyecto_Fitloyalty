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
    ['there is no member', null, 'activo'],
    ['the member has no flags', {}, 'activo'],
    ['the member is frozen even if expired', { congelada: true, vencido: true }, 'congelado'],
    ['the member is expired even if about to expire', { vencido: true, vencePronto: true }, 'vencido'],
    ['the member is about to expire even if at risk', { vencePronto: true, enRiesgo: true }, 'moroso'],
    ['the member is only at risk', { enRiesgo: true }, 'riesgo'],
  ])('should return the right state when %s', (_caso, miembro, esperado) => {
    // Arrange: sin dobles, funcion pura; el caso viene de la tabla.

    // Act
    const estado = estadoDeMiembro(miembro);

    // Assert
    expect(estado).toBe(esperado);
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
