import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import EmptyState from '../src/components/EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  test('expone el estado vacío con icono decorativo y título accesible', () => {
    render(<EmptyState titulo="Sin miembros" descripcion="Prueba otro filtro." />);

    expect(screen.getByRole('status')).toHaveTextContent('Sin miembros');
    expect(screen.getByText('Prueba otro filtro.')).toBeInTheDocument();
    expect(screen.getByText('inbox').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('no muestra la acción cuando falta un callback', () => {
    render(<EmptyState titulo="Sin resultados" ctaLabel="Crear miembro" />);

    expect(screen.queryByRole('button', { name: /crear miembro/i })).not.toBeInTheDocument();
  });

  test('ejecuta la acción accesible cuando se pulsa el CTA', async () => {
    const onCta = vi.fn();
    const user = userEvent.setup();
    render(<EmptyState titulo="Sin miembros" ctaLabel="Crear miembro" onCta={onCta} />);

    await user.click(screen.getByRole('button', { name: /crear miembro/i }));

    expect(onCta).toHaveBeenCalledOnce();
  });
});
