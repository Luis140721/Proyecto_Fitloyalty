/**
 * Bootcamp semana 4 (Front, Luis): Modal, el dialogo de las fichas y
 * confirmaciones de MiembrosPage y StaffPage. Se prueba con un formulario que,
 * como esas paginas, le pasa un onClose nuevo en cada render.
 *
 * Al abrir, el foco entra al dialogo; mientras se escribe no se mueve; con
 * Escape o un click fuera se cierra y el foco vuelve al boton que lo abrio.
 */
import { describe, expect, test } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../src/components/Modal';

function NotaEnModal() {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState('');
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>Abrir nota</button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Editar nota">
        <label>
          Nota
          <input value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
      </Modal>
    </>
  );
}

/** Abre el dialogo y espera a que el foco entre en el. */
async function abrirNota(opciones) {
  const user = userEvent.setup(opciones);
  render(<NotaEnModal />);
  await user.click(screen.getByRole('button', { name: 'Abrir nota' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus());
  return user;
}

describe('Modal', () => {
  test('should take the focus into the dialog when it opens', async () => {
    // Act
    await abrirNota();

    // Assert
    expect(screen.getByRole('dialog', { name: 'Editar nota' })).toHaveAttribute('aria-modal', 'true');
  });

  test('should keep the focus in the field while the user types at the pace of a person', async () => {
    // Arrange: 60 ms entre teclas, mas que los 32 ms con los que el dialogo toma el foco al abrir
    const user = await abrirNota({ delay: 60 });
    const nota = screen.getByRole('textbox', { name: 'Nota' });

    // Act
    await user.type(nota, 'Viaje');

    // Assert
    expect(nota).toHaveValue('Viaje');
    expect(nota).toHaveFocus();
  });

  test('should close with Escape and give the focus back to the button that opened it', async () => {
    // Arrange
    const user = await abrirNota();

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir nota' })).toHaveFocus();
  });

  test('should close when the user clicks outside the dialog but not inside it', async () => {
    // Arrange
    const user = await abrirNota();

    // Act y Assert: dentro no cierra
    await user.click(screen.getByRole('textbox', { name: 'Nota' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Act y Assert: en el fondo cierra
    await user.click(screen.getByRole('presentation'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
