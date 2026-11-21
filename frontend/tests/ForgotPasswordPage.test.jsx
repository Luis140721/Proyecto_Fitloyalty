import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import { renderWithProviders } from './renderWithProviders';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../src/api', () => ({ api: { post: (...args) => mocks.post(...args) } }));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.post.mockReset();
  });

  test('envía correo, verifica el código pegado y cambia la contraseña', async () => {
    mocks.post
      .mockResolvedValueOnce({
        data: {
          message: 'Código enviado.',
          showCodeInUI: true,
          devCode: '123456',
          devCodeReason: 'demo-mode',
        },
      })
      .mockResolvedValueOnce({ data: { resetToken: 'reset-token' } })
      .mockResolvedValueOnce({ data: { message: 'Clave actualizada' } });
    const { user } = renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });

    await user.type(screen.getByLabelText('Tu correo registrado'), ' ana@example.com ');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByText('Código enviado.')).toBeInTheDocument();
    expect(screen.getByTestId('dev-code-banner')).toHaveTextContent('123456');
    expect(mocks.post).toHaveBeenNthCalledWith(1, '/auth/forgot-password', { email: 'ana@example.com' });

    const firstDigit = screen.getByRole('textbox', { name: 'Dígito 1 de 6' });
    fireEvent.paste(firstDigit, {
      clipboardData: { getData: () => '12-34 56' },
    });
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));
    await waitFor(() => expect(mocks.post).toHaveBeenNthCalledWith(2, '/auth/verify-reset-code', {
      email: 'ana@example.com',
      code: '123456',
    }));

    await user.type(screen.getByLabelText('Nueva contraseña'), 'clave123');
    await user.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));
    expect(await screen.findByText(/¡Contraseña actualizada!/)).toBeInTheDocument();
    expect(mocks.post).toHaveBeenNthCalledWith(3, '/auth/reset-password', {
      resetToken: 'reset-token',
      password: 'clave123',
    });
  });

  test('rechaza un código incompleto y muestra errores del API', async () => {
    mocks.post
      .mockRejectedValueOnce(new Error('Servicio no disponible'))
      .mockResolvedValueOnce({ data: { message: 'Código enviado.' } })
      .mockRejectedValueOnce(new Error('Código vencido'));
    const { user } = renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });
    await user.type(screen.getByLabelText('Tu correo registrado'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible');

    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByText(/Paso 2 de 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El código debe tener 6 dígitos');

    fireEvent.paste(screen.getByRole('textbox', { name: 'Dígito 1 de 6' }), {
      clipboardData: { getData: () => '123456' },
    });
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código vencido');
  });
});
