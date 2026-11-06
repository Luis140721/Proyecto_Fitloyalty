import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import ResetPasswordPage from '../src/pages/ResetPasswordPage';
import { api } from '../src/api';

vi.mock('../src/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
});

function renderRecoveryFlow() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('muestra el formulario para solicitar el código', () => {
    renderRecoveryFlow();

    expect(screen.getByLabelText(/tu correo registrado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar código/i })).toBeInTheDocument();
  });

  test('muestra un error cuando falla el envío del código', async () => {
    api.post.mockRejectedValueOnce(new Error('No se pudo enviar el código.'));
    const user = userEvent.setup();
    renderRecoveryFlow();

    await user.type(screen.getByLabelText(/tu correo registrado/i), 'error@fitgym.co');
    await user.click(screen.getByRole('button', { name: /enviar código/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo enviar el código/i);
  });

  test('valida el correo vacío sin llamar al API', async () => {
    const user = userEvent.setup();
    renderRecoveryFlow();

    await user.click(screen.getByRole('button', { name: /enviar código/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/ingresa tu correo electrónico/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('muestra la entrada del PIN después de enviar el código', async () => {
    api.post.mockResolvedValueOnce({
      data: { message: 'Código enviado con éxito', resendAfterSeconds: 60 },
    });
    const user = userEvent.setup();
    renderRecoveryFlow();

    await user.type(screen.getByLabelText(/tu correo registrado/i), 'daniel@fitgym.co');
    await user.click(screen.getByRole('button', { name: /enviar código/i }));

    expect(await screen.findByLabelText(/dígito 1 de 6/i)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'daniel@fitgym.co' });
  });

  test('verifica el PIN y abre el formulario de nueva contraseña', async () => {
    api.post
      .mockResolvedValueOnce({ data: { message: 'Código enviado', resendAfterSeconds: 60 } })
      .mockResolvedValueOnce({ data: { resetToken: 'reset-token' } });
    const user = userEvent.setup();
    renderRecoveryFlow();

    await user.type(screen.getByLabelText(/tu correo registrado/i), 'daniel@fitgym.co');
    await user.click(screen.getByRole('button', { name: /enviar código/i }));
    await screen.findByLabelText(/dígito 1 de 6/i);

    for (let index = 0; index < 6; index += 1) {
      await user.type(
        screen.getByLabelText(new RegExp(`dígito ${index + 1} de 6`, 'i')),
        String(index + 1)
      );
    }
    await user.click(screen.getByRole('button', { name: /verificar código/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/auth/verify-reset-code',
      { email: 'daniel@fitgym.co', code: '123456' }
    ));
    expect(await screen.findByPlaceholderText('Mínimo 6 caracteres')).toBeInTheDocument();
  });

  test('rechaza un PIN incompleto sin verificarlo', async () => {
    api.post.mockResolvedValueOnce({
      data: { message: 'Código enviado', resendAfterSeconds: 60 },
    });
    const user = userEvent.setup();
    renderRecoveryFlow();

    await user.type(screen.getByLabelText(/tu correo registrado/i), 'daniel@fitgym.co');
    await user.click(screen.getByRole('button', { name: /enviar código/i }));
    await screen.findByLabelText(/dígito 1 de 6/i);
    await user.click(screen.getByRole('button', { name: /verificar código/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/ingresa los 6 dígitos/i);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  test('muestra error si la verificación no devuelve resetToken', async () => {
    api.post
      .mockResolvedValueOnce({ data: { message: 'Código enviado', resendAfterSeconds: 60 } })
      .mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    renderRecoveryFlow();

    await user.type(screen.getByLabelText(/tu correo registrado/i), 'daniel@fitgym.co');
    await user.click(screen.getByRole('button', { name: /enviar código/i }));
    await screen.findByLabelText(/dígito 1 de 6/i);
    for (let index = 0; index < 6; index += 1) {
      await user.type(
        screen.getByLabelText(new RegExp(`dígito ${index + 1} de 6`, 'i')),
        String(index + 1)
      );
    }
    await user.click(screen.getByRole('button', { name: /verificar código/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no devolvió el token/i);
    expect(screen.getByRole('heading', { name: /ingresa tu código/i })).toBeInTheDocument();
  });
});
