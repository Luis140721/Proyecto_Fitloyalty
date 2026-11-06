import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPasswordPage from '../src/pages/ResetPasswordPage';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../src/context/AuthContext', () => ({ api: { post: mocks.post } }));

function renderReset(state) {
  const entry = state
    ? { pathname: '/reset-password', state }
    : '/reset-password';
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<h1>Iniciar sesión</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: { message: 'Contraseña actualizada.' } });
});

afterEach(cleanup);

describe('ResetPasswordPage', () => {
  test('valida el correo y el código antes de pedir la verificación', async () => {
    const user = userEvent.setup();
    renderReset();

    await user.click(screen.getByRole('button', { name: /verificar código/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/ingresa tu correo electrónico/i);

    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@example.test');
    await user.click(screen.getByRole('button', { name: /verificar código/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/ingresa los 6 dígitos/i);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  test('limpia el PIN pegado y avanza al formulario de contraseña', async () => {
    mocks.post.mockResolvedValueOnce({
      data: { resetToken: 'reset-token', message: 'Código verificado.' },
    });
    const user = userEvent.setup();
    renderReset();

    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@example.test');
    fireEvent.paste(screen.getByLabelText(/dígito 1 de 6/i), {
      clipboardData: { getData: () => '12-34-56-789' },
    });

    for (let index = 0; index < 6; index += 1) {
      expect(screen.getByLabelText(new RegExp(`dígito ${index + 1} de 6`, 'i'))).toHaveValue(String(index + 1));
    }
    await user.click(screen.getByRole('button', { name: /verificar código/i }));

    expect(await screen.findByRole('heading', { name: /crea tu nueva contraseña/i })).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('/auth/verify-reset-code', {
      email: 'ana@example.test',
      code: '123456',
    });
    expect(screen.getByRole('status')).toHaveTextContent(/código verificado/i);
  });

  test('reporta errores de verificación y permite reenviar el código', async () => {
    mocks.post
      .mockRejectedValueOnce(new Error('Código incorrecto.'))
      .mockResolvedValueOnce({ data: { resendAfterSeconds: 30 } });
    const user = userEvent.setup();
    renderReset();

    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@example.test');
    for (let index = 0; index < 6; index += 1) {
      fireEvent.keyDown(
        screen.getByLabelText(new RegExp(`dígito ${index + 1} de 6`, 'i')),
        { key: String(index + 1) }
      );
    }
    for (let index = 0; index < 6; index += 1) {
      expect(screen.getByLabelText(new RegExp(`dígito ${index + 1} de 6`, 'i'))).toHaveValue(String(index + 1));
    }
    await user.click(screen.getByRole('button', { name: /verificar código/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/código incorrecto/i);

    await user.click(screen.getByRole('button', { name: /reenviar código/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/código reenviado/i);
    expect(screen.getByRole('button', { name: /reenviar código en 30s/i })).toBeDisabled();
    expect(mocks.post).toHaveBeenLastCalledWith('/auth/forgot-password', { email: 'ana@example.test' });
  });

  test('valida la contraseña nueva y permite revelar su contenido', async () => {
    const user = userEvent.setup();
    renderReset({ email: 'ana@example.test', resetToken: 'reset-token' });

    await user.click(screen.getByRole('button', { name: /guardar nueva contraseña/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 6 caracteres/i);

    const password = screen.getByLabelText(/^nueva contraseña$/i);
    await user.type(password, 'Clave123');
    await user.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(password).toHaveAttribute('type', 'text');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'OtraClave123');
    await user.click(screen.getByRole('button', { name: /guardar nueva contraseña/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/no coinciden/i);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  test('guarda la contraseña y redirige al inicio de sesión', async () => {
    const user = userEvent.setup();
    renderReset({ email: 'ana@example.test', resetToken: 'reset-token' });
    await user.type(screen.getByLabelText(/^nueva contraseña$/i), 'Clave123');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Clave123');
    await user.click(screen.getByRole('button', { name: /guardar nueva contraseña/i }));

    expect(await screen.findByRole('heading', { name: /contraseña restablecida/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/fue restablecida/i);
    expect(mocks.post).toHaveBeenCalledWith('/auth/reset-password', {
      resetToken: 'reset-token',
      password: 'Clave123',
    });
    expect(await screen.findByRole('heading', { name: /iniciar sesión/i }, { timeout: 3000 })).toBeInTheDocument();
  });

  test('conserva el formulario e informa si falla el cambio de contraseña', async () => {
    mocks.post.mockRejectedValueOnce(new Error('No fue posible guardar.'));
    const user = userEvent.setup();
    renderReset({ email: 'ana@example.test', resetToken: 'reset-token' });
    await user.type(screen.getByLabelText(/^nueva contraseña$/i), 'Clave123');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Clave123');
    await user.click(screen.getByRole('button', { name: /guardar nueva contraseña/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no fue posible guardar/i);
    expect(screen.getByRole('heading', { name: /crea tu nueva contraseña/i })).toBeInTheDocument();
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  });
});
