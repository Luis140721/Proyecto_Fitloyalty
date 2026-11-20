/**
 * Bootcamp semana 3 (Front): ForgotPasswordPage como la usa quien olvido la
 * contrasena: correo, codigo de 6 digitos y contrasena nueva.
 *
 * El API se simula con vi.mock. Los errores tienen la forma normalizada de
 * src/api.js (status, code, message). Las respuestas son las de
 * routes/auth.js: forgot-password, verify-reset-code y reset-password.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import { renderWithProviders } from './renderWithProviders';

let mockPost;
vi.mock('../src/api', () => ({ api: { post: (...a) => mockPost(...a) } }));

const CORREO = 'ana@gym.co';

/** Doble del POST: cada paso responde como el backend. */
function apiQueResponde(respuestas = {}) {
  return vi.fn(async (url) => {
    if (respuestas[url]) return respuestas[url]();
    if (url === '/auth/forgot-password') return { data: { message: 'Si el correo está registrado, te enviamos un código.' } };
    if (url === '/auth/verify-reset-code') return { data: { resetToken: 'token-de-reseteo' } };
    if (url === '/auth/reset-password') return { data: { message: 'Contraseña actualizada.' } };
    throw new Error(`POST no simulado en el test: ${url}`);
  });
}

const abrir = () => renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });
const campoCorreo = () => screen.getByRole('textbox', { name: 'Tu correo registrado' });
const casilla = (n) => screen.getByRole('textbox', { name: `Dígito ${n} de 6` });
const valoresDelCodigo = () => [1, 2, 3, 4, 5, 6].map((n) => casilla(n).value).join('');

/** Paso 1 completo: escribe el correo y pide el codigo. */
async function pedirCodigo(user, correo = CORREO) {
  await user.type(campoCorreo(), correo);
  await user.click(screen.getByRole('button', { name: 'Enviar código' }));
  await screen.findByText('Paso 2 de 3 — Verifica');
}

beforeEach(() => {
  mockPost = apiQueResponde();
});
afterEach(() => vi.restoreAllMocks());

describe('ForgotPasswordPage: pedir el codigo', () => {
  test('should send the email and ask for the code when the person sends the email', async () => {
    // Arrange
    const { user } = abrir();

    // Act
    await pedirCodigo(user);

    // Assert
    expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', { email: CORREO });
    expect(screen.getByRole('status')).toHaveTextContent('Si el correo está registrado, te enviamos un código.');
    expect(casilla(1)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Tu correo registrado' })).not.toBeInTheDocument();
  });

  test('should show the API error and stay on the email step when the code cannot be sent', async () => {
    // Arrange
    mockPost = apiQueResponde({
      '/auth/forgot-password': async () => { throw { status: 429, code: 'RATE_LIMIT', message: 'Demasiadas solicitudes, espera un momento' }; },
    });
    const { user } = abrir();

    // Act
    await user.type(campoCorreo(), CORREO);
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas solicitudes, espera un momento');
    expect(campoCorreo()).toHaveValue(CORREO);
    expect(screen.queryByRole('textbox', { name: 'Dígito 1 de 6' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeEnabled();
  });

  test('should show the demo code when the backend could not deliver the email', async () => {
    // Arrange: Resend fallo y el backend manda el codigo para mostrarlo
    mockPost = apiQueResponde({
      '/auth/forgot-password': async () => ({ data: { message: 'No pudimos enviar el correo.', showCodeInUI: true, devCode: '482913', devCodeReason: 'resend-failed' } }),
    });
    const { user } = abrir();

    // Act
    await pedirCodigo(user);

    // Assert
    const aviso = screen.getByText(/Modo demo:/).closest('[role="status"]');
    expect(aviso).toHaveTextContent('Tu código es 482913 (visible porque Resend no pudo entregar)');
  });
});

describe('ForgotPasswordPage: el codigo de 6 digitos', () => {
  test('should spread a pasted code over the six boxes and verify it when the person pastes it', async () => {
    // Arrange
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));

    // Act y Assert: cada digito queda en su casilla
    await user.paste('48 29-13');
    expect(valoresDelCodigo()).toBe('482913');

    // Act
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));

    // Assert
    expect(mockPost).toHaveBeenLastCalledWith('/auth/verify-reset-code', { email: CORREO, code: '482913' });
    expect(await screen.findByText('Paso 3 de 3 — Nueva clave')).toBeInTheDocument();
  });

  test('should not ask the API and explain it when the code has less than 6 digits', async () => {
    // Arrange
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));
    await user.keyboard('482');

    // Act
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('El código debe tener 6 dígitos');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test('should erase the previous digit and go back to its box when Backspace is pressed on an empty box', async () => {
    // Arrange: dos digitos escritos; el foco queda en la tercera casilla
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));
    await user.keyboard('48');
    expect(casilla(3)).toHaveFocus();

    // Act
    await user.keyboard('{Backspace}');

    // Assert
    expect(valoresDelCodigo()).toBe('4');
    await waitFor(() => expect(casilla(2)).toHaveFocus());
  });

  test('should show the API error and keep the code step when the code is wrong or expired', async () => {
    // Arrange
    mockPost = apiQueResponde({
      '/auth/verify-reset-code': async () => { throw { status: 400, code: 'INVALID_CODE', message: 'Código inválido o vencido.' }; },
    });
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));
    await user.paste('000000');

    // Act
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido o vencido.');
    expect(screen.getByText('Paso 2 de 3 — Verifica')).toBeInTheDocument();
  });
});

describe('ForgotPasswordPage: la contrasena nueva', () => {
  test('should save the new password with the reset token and offer the login when the code was valid', async () => {
    // Arrange
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));
    await user.paste('482913');
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));
    await screen.findByText('Paso 3 de 3 — Nueva clave');

    // Act
    await user.type(screen.getByLabelText('Nueva contraseña'), 'clave2026');
    await user.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));

    // Assert
    expect(mockPost).toHaveBeenLastCalledWith('/auth/reset-password', { resetToken: 'token-de-reseteo', password: 'clave2026' });
    expect(await screen.findByRole('link', { name: 'Ir al login' })).toHaveAttribute('href', '/login');
  });
});

// Semana 8 (angulo Front): ramas que el reporte de cobertura marcaba sin cubrir.
describe('ForgotPasswordPage: ramas sin cubrir de la semana 8', () => {
  test('should say the backend is in demo mode when the code is shown for that reason', async () => {
    // Arrange: SHOW_DEV_CODE_IN_UI=true en el backend (routes/auth.js)
    mockPost = apiQueResponde({
      '/auth/forgot-password': async () => ({ data: { message: 'Si el correo está registrado, te enviamos un código.', showCodeInUI: true, devCode: '771204', devCodeReason: 'demo-mode' } }),
    });
    const { user } = abrir();

    // Act
    await pedirCodigo(user);

    // Assert
    const aviso = screen.getByText(/Modo demo:/).closest('[role="status"]');
    expect(aviso).toHaveTextContent('Tu código es 771204 (visible porque el backend está en modo demo)');
    expect(aviso).not.toHaveTextContent('Resend no pudo entregar');
  });

  test('should show the API error and keep the new password step when the password cannot be saved', async () => {
    // Arrange: el token de reseteo vencio entre el paso 2 y el 3
    mockPost = apiQueResponde({
      '/auth/reset-password': async () => { throw { status: 400, code: 'RESET_TOKEN_INVALID', message: 'El enlace de recuperación venció. Pide un código nuevo.' }; },
    });
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));
    await user.paste('482913');
    await user.click(screen.getByRole('button', { name: 'Verificar código' }));
    await screen.findByText('Paso 3 de 3 — Nueva clave');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'clave2026');

    // Act
    await user.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de recuperación venció. Pide un código nuevo.');
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir al login' })).not.toBeInTheDocument();
  });

  test('should move between the boxes with the arrows and stop at the ends when the person uses the keyboard', async () => {
    // Arrange
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));

    // Act y Assert: en la primera casilla la flecha izquierda no sale del codigo
    await user.keyboard('{ArrowLeft}');
    expect(casilla(1)).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(casilla(3)).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(casilla(2)).toHaveFocus();

    // Act y Assert: en la ultima casilla la flecha derecha se queda ahi
    await user.click(casilla(6));
    await user.keyboard('{ArrowRight}');
    expect(casilla(6)).toHaveFocus();
  });

  test('should leave the boxes empty and not fail when the pasted text has no digits', async () => {
    // Arrange: un fallo dentro del handler del pegado solo se ve en la consola
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = abrir();
    await pedirCodigo(user);
    await user.click(casilla(1));

    // Act
    await user.paste('código: ABCDEF');

    // Assert
    expect(valoresDelCodigo()).toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(errores).not.toHaveBeenCalled();
  });
  // En Android el teclado suele mandar key 'Unidentified': el digito llega por
  // onChange y no por onKeyDown. user-event siempre manda teclas, asi que aqui
  // se usa fireEvent.change, como el autollenado del navegador.
  test('should spread the code over the boxes when the phone autofills it into the first box', async () => {
    // Arrange: el primer campo tiene autocomplete=one-time-code y admite 6 caracteres
    const { user } = abrir();
    await pedirCodigo(user);
    await waitFor(() => expect(casilla(1)).toHaveFocus());

    // Act
    fireEvent.change(casilla(1), { target: { value: '482913' } });

    // Assert
    expect(valoresDelCodigo()).toBe('482913');
    await waitFor(() => expect(casilla(6)).toHaveFocus());
  });

  test('should move to the next box when a phone keyboard writes a digit without key events', async () => {
    // Arrange: al abrir el paso 2 la pagina enfoca la primera casilla
    const { user } = abrir();
    await pedirCodigo(user);
    await waitFor(() => expect(casilla(1)).toHaveFocus());

    // Act
    fireEvent.change(casilla(2), { target: { value: '7' } });

    // Assert
    expect(casilla(2)).toHaveValue('7');
    expect(casilla(3)).toHaveFocus();
  });
});

