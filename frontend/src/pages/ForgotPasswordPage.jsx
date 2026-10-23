import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './renderWithProviders';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import { api } from '../src/api';

// Mock de la API para simular las respuestas del backend sin llamadas reales
jest.mock('../src/api', () => ({
  api: {
    post: jest.fn(),
  },
}));

describe('ForgotPasswordPage Component - Semana 3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Verificación de elementos iniciales usando getByLabelText y getByRole
  test('debe renderizar el paso 1 con el campo de correo y el botón de envío', () => {
    renderWithProviders(<ForgotPasswordPage />);
    
    const emailInput = screen.getByLabelText(/tu correo registrado/i);
    const submitButton = screen.getByRole('button', { name: /enviar código/i });

    expect(emailInput).toBeInTheDocument();
    expect(submitButton).toBeInTheDocument();
  });

  // Test 2: Estado no feliz (Error cuando la API falla o el correo no existe)
  test('estado no feliz: debe mostrar un mensaje de error si la API rechaza el correo', async () => {
    api.post.mockRejectedValueOnce(new Error('No se pudo enviar el código.'));
    const user = userEvent.setup();

    renderWithProviders(<ForgotPasswordPage />);

    const emailInput = screen.getByLabelText(/tu correo registrado/i);
    await user.type(emailInput, 'error@fitgym.co');

    const submitButton = screen.getByRole('button', { name: /enviar código/i });
    await user.click(submitButton);

    const errorMessage = await screen.findByText(/no se pudo enviar el código/i);
    expect(errorMessage).toBeInTheDocument();
  });

  // Test 3: Interacción exitosa que avanza al Paso 2 (Ingreso de PIN de 6 dígitos)
  test('debe avanzar al paso 2 y renderizar las casillas del PIN al enviar un correo válido', async () => {
    api.post.mockResolvedValueOnce({ data: { message: 'Código enviado con éxito' } });
    const user = userEvent.setup();

    renderWithProviders(<ForgotPasswordPage />);

    const emailInput = screen.getByLabelText(/tu correo registrado/i);
    await user.type(emailInput, 'daniel@fitgym.co');

    const submitButton = screen.getByRole('button', { name: /enviar código/i });
    await user.click(submitButton);

    // Comprobamos que avanza al paso 2 buscando el input del primer dígito del PIN
    const firstPinInput = await screen.findByLabelText(/dígito 1 de 6/i);
    expect(firstPinInput).toBeInTheDocument();
  });

});