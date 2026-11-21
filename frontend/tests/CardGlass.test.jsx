/**
 * Cobertura del front (Luis): CardGlass, la tarjeta de las listas (las
 * tarjetas moviles de MiembrosPage). Con onClick es interactiva: se puede
 * activar con el teclado como un boton; como <button> nativo no se le agrega
 * nada; sin onClick es solo una caja.
 */
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CardGlass from '../src/components/CardGlass';

describe('CardGlass', () => {
  test.each([['{Enter}'], [' ']])('should open the card with the keyboard (%s) when it has onClick', async (tecla) => {
    // Arrange
    const abrir = vi.fn();
    const user = userEvent.setup();
    render(<CardGlass onClick={abrir} padding="sm">Ana Pérez</CardGlass>);
    const tarjeta = screen.getByRole('button', { name: 'Ana Pérez' });

    // Act
    tarjeta.focus();
    await user.keyboard(tecla);

    // Assert
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(tarjeta).toHaveAttribute('tabindex', '0');
    expect(tarjeta).toHaveClass('card-glass', 'card-glass--p-sm', 'card-glass--interactive');
  });

  test('should not open the card when the onKeyDown of the page cancels the key', async () => {
    // Arrange
    const abrir = vi.fn();
    const user = userEvent.setup();
    render(<CardGlass onClick={abrir} onKeyDown={(e) => e.preventDefault()}>Carlos Ruiz</CardGlass>);

    // Act
    screen.getByRole('button', { name: 'Carlos Ruiz' }).focus();
    await user.keyboard('{Enter}');

    // Assert
    expect(abrir).not.toHaveBeenCalled();
  });

  test('should not open the card when another key is pressed', async () => {
    // Arrange
    const abrir = vi.fn();
    const user = userEvent.setup();
    render(<CardGlass onClick={abrir}>Luisa Gómez</CardGlass>);

    // Act
    screen.getByRole('button', { name: 'Luisa Gómez' }).focus();
    await user.keyboard('a');

    // Assert
    expect(abrir).not.toHaveBeenCalled();
  });

  test('should not add role nor tabindex and not fire twice when it is a native button', async () => {
    // Arrange
    const abrir = vi.fn();
    const user = userEvent.setup();
    render(<CardGlass as="button" type="button" onClick={abrir}>Nuevo miembro</CardGlass>);
    const boton = screen.getByRole('button', { name: 'Nuevo miembro' });

    // Act
    boton.focus();
    await user.keyboard('{Enter}');

    // Assert
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(boton).not.toHaveAttribute('tabindex');
    expect(boton).not.toHaveAttribute('role');
  });

  test('should be a plain box with the medium padding when it has no onClick and an unknown padding', () => {
    // Act
    render(<CardGlass as="article" padding="xl" className="extra" aria-label="Resumen">Resumen</CardGlass>);

    // Assert
    const caja = screen.getByRole('article', { name: 'Resumen' });
    expect(caja).toHaveClass('card-glass', 'card-glass--p-md', 'extra');
    expect(caja).not.toHaveClass('card-glass--interactive');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
