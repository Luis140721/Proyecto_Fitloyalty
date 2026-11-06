import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from '../src/pages/LoginPage';
import RegisterOwnerPage from '../src/pages/RegisterOwnerPage';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ login: auth.login, register: auth.register }),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/dashboard" element={<h1>Panel de administración</h1>} />
        <Route path="/admin/checkin" element={<h1>Registro de entradas</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register-owner']}>
      <Routes>
        <Route path="/register-owner" element={<RegisterOwnerPage />} />
        <Route path="/admin/dashboard" element={<h1>Panel de administración</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fillValidRegistration(user) {
  await user.type(screen.getByLabelText(/nombre del gimnasio/i), '  Power House  ');
  await user.type(screen.getByLabelText(/teléfono/i), '300 123 4567');
  await user.type(screen.getByLabelText(/tu nombre completo/i), '  Ana Torres  ');
  await user.type(screen.getByLabelText(/tu correo/i), ' ANA@EXAMPLE.COM ');
  await user.type(screen.getByLabelText(/contraseña \(mín\./i), 'Clave123');
}

describe('LoginPage', () => {
  test('valida campos vacíos antes de intentar autenticar', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /entrar a mi panel/i }));

    expect(screen.getByText(/ingresa tu correo y contraseña/i)).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  test('normaliza credenciales y dirige al administrador al panel', async () => {
    auth.login.mockResolvedValueOnce({ role: 'ADMINISTRADOR' });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/correo electrónico/i), '  ADMIN@EXAMPLE.COM ');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'Clave123');
    await user.click(screen.getByRole('button', { name: /entrar a mi panel/i }));

    expect(await screen.findByRole('heading', { name: /panel de administración/i })).toBeInTheDocument();
    expect(auth.login).toHaveBeenCalledWith('admin@example.com', 'Clave123');
  });

  test('dirige al personal a check-in y muestra fallos de autenticación', async () => {
    auth.login.mockResolvedValueOnce({ role: 'ENTRENADOR' });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/correo electrónico/i), 'staff@example.com');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'Clave123');
    await user.click(screen.getByRole('button', { name: /entrar a mi panel/i }));

    expect(await screen.findByRole('heading', { name: /registro de entradas/i })).toBeInTheDocument();
    cleanup();

    auth.login.mockRejectedValueOnce(new Error('Credenciales incorrectas.'));
    renderLogin();
    await user.type(screen.getByLabelText(/correo electrónico/i), 'staff@example.com');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'incorrecta');
    await user.click(screen.getByRole('button', { name: /entrar a mi panel/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/credenciales incorrectas/i);
  });

  test('permite mostrar y ocultar la contraseña', async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText(/^contraseña$/i);

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /ocultar contraseña/i }));
    expect(password).toHaveAttribute('type', 'password');
  });
});

describe('RegisterOwnerPage', () => {
  test('muestra errores de validación por campo y enfoca el primer error', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('button', { name: /crear mi gimnasio/i }));

    expect(screen.getByText(/escribe el nombre de tu gimnasio/i)).toBeInTheDocument();
    expect(screen.getByText(/escribe el teléfono del gimnasio/i)).toBeInTheDocument();
    expect(screen.getByText(/crea una contraseña/i)).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/nombre del gimnasio/i)).toHaveAttribute('aria-invalid', 'true');
  });

  test('envía los datos normalizados y lleva al nuevo administrador al panel', async () => {
    auth.register.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderRegister();
    await fillValidRegistration(user);
    await user.click(screen.getByRole('button', { name: /crear mi gimnasio/i }));

    await screen.findByRole('heading', { name: /panel de administración/i });
    expect(auth.register).toHaveBeenCalledWith({
      gymName: 'Power House',
      gymPhone: '3001234567',
      gymEmail: undefined,
      ownerName: 'Ana Torres',
      ownerEmail: 'ANA@EXAMPLE.COM',
      password: 'Clave123',
    });
  });

  test('asocia un correo duplicado del dueño al campo correcto', async () => {
    auth.register.mockRejectedValueOnce(Object.assign(
      new Error('Correo ocupado'),
      { code: 'USER_EMAIL_TAKEN' }
    ));
    const user = userEvent.setup();
    renderRegister();
    await fillValidRegistration(user);
    await user.click(screen.getByRole('button', { name: /crear mi gimnasio/i }));

    expect(await screen.findByText(/ya existe una cuenta/i)).toBeInTheDocument();
    expect(screen.getByText(/este correo ya tiene una cuenta/i)).toBeInTheDocument();
  });

  test('mapea errores de validación del servidor a los campos', async () => {
    auth.register.mockRejectedValueOnce(Object.assign(
      new Error('Datos inválidos'),
      { code: 'VALIDATION_ERROR', details: { issues: [{ path: ['ownerName'], message: 'Nombre no válido.' }] } }
    ));
    const user = userEvent.setup();
    renderRegister();
    await fillValidRegistration(user);
    await user.click(screen.getByRole('button', { name: /crear mi gimnasio/i }));

    await waitFor(() => expect(screen.getByText(/revisa los campos marcados/i)).toBeInTheDocument());
    expect(screen.getByText('Nombre no válido.')).toBeInTheDocument();
  });

  test('informa falta de conexión y conserva el aviso hasta otro envío', async () => {
    auth.register.mockRejectedValueOnce(Object.assign(new Error('offline'), { isNetwork: true }));
    const user = userEvent.setup();
    renderRegister();
    await fillValidRegistration(user);
    await user.click(screen.getByRole('button', { name: /crear mi gimnasio/i }));
    expect(await screen.findByText(/revisa tu conexión/i)).toBeInTheDocument();

    const gymName = screen.getByLabelText(/nombre del gimnasio/i);
    await user.clear(gymName);
    await user.type(gymName, 'Nuevo gimnasio');
    expect(screen.getByText(/revisa tu conexión/i)).toBeInTheDocument();
  });

  test('valida longitud y número en la contraseña y permite alternar su visibilidad', async () => {
    const user = userEvent.setup();
    renderRegister();
    const password = screen.getByLabelText(/contraseña \(mín\./i);

    await user.type(password, 'abc');
    await user.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByText(/mínimo 6 caracteres/i)).toBeInTheDocument();

    await user.clear(password);
    await user.type(password, 'abcdef');
    await user.click(screen.getByRole('button', { name: /crear mi gimnasio/i }));
    expect(screen.getByText(/debe incluir al menos un número/i)).toBeInTheDocument();
  });
});
