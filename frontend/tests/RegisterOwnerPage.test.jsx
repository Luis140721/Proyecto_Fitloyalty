/**
 * Bootcamp semana 3 (Front, Luis): RegisterOwnerPage como la usa el dueño.
 *
 * useAuth se reemplaza con vi.mock, igual que en LoginPage.test.jsx: el test
 * decide qué responde register() sin AuthProvider ni API. Los errores simulados
 * tienen la forma normalizada de src/api.js (status, code, message, details,
 * isNetwork). La navegación se comprueba con la ruta que muestra
 * renderWithProviders. Las reglas finas de cada campo ya están en
 * validateRegisterOwnerForm.test.js; aquí se prueba lo que ve la persona.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import RegisterOwnerPage from '../src/pages/RegisterOwnerPage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo en cada test, igual que en LoginPage.test.jsx: ningún test
// hereda la respuesta simulada del anterior.
let mockRegister;
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ register: (...a) => mockRegister(...a) }) }));

const abrirRegistro = () => renderWithProviders(<RegisterOwnerPage />, { route: '/register-owner' });

// Cada campo por su etiqueta visible (la contraseña no tiene rol textbox, así
// que se usa getByLabelText para todos). La etiqueta envuelve también el
// mensaje de error y la ayuda del campo, por eso se busca por el inicio con ^.
const campos = {
  gymName: () => screen.getByLabelText(/^Nombre del gimnasio/),
  gymPhone: () => screen.getByLabelText(/^Teléfono/),
  gymEmail: () => screen.getByLabelText(/^Email del gimnasio/),
  ownerName: () => screen.getByLabelText(/^Tu nombre completo/),
  ownerEmail: () => screen.getByLabelText(/^Tu correo/),
  password: () => screen.getByLabelText(/^Contraseña/),
};
const botonCrear = () => screen.getByRole('button', { name: /Crear mi gimnasio/ });

const DATOS_VALIDOS = {
  gymName: 'Power House',
  gymPhone: '3001234567',
  gymEmail: '',
  ownerName: 'Ana Pérez',
  ownerEmail: 'ana@gym.co',
  password: 'clave123',
};

// Escribe en cada campo como lo haría la persona; los vacíos se dejan sin tocar.
async function llenarFormulario(user, cambios = {}) {
  const datos = { ...DATOS_VALIDOS, ...cambios };
  for (const [nombre, valor] of Object.entries(datos)) {
    if (valor) await user.type(campos[nombre](), valor);
  }
}

beforeEach(() => { mockRegister = vi.fn(); });

describe('RegisterOwnerPage', () => {
  it('should send the cleaned data and open the dashboard when the form is valid', async () => {
    // Arrange
    mockRegister.mockResolvedValue({ id: 1, role: 'admin' });
    const { user } = abrirRegistro();

    // Act
    await llenarFormulario(user, { gymName: '  Power House  ', gymPhone: '300 123-4567', ownerName: '  Ana Pérez ' });
    await user.click(botonCrear());

    // Assert: nombres sin espacios, teléfono solo con dígitos y sin correo del gimnasio
    expect(await screen.findByText('Ruta actual: /admin/dashboard')).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith({
      gymName: 'Power House',
      gymPhone: '3001234567',
      gymEmail: undefined,
      ownerName: 'Ana Pérez',
      ownerEmail: 'ana@gym.co',
      password: 'clave123',
    });
  });

  it('should show one alert per required field and not call the API when the form is empty', async () => {
    // Arrange
    const { user } = abrirRegistro();

    // Act
    await user.click(botonCrear());

    // Assert
    const alertas = screen.getAllByRole('alert');
    expect(alertas).toHaveLength(5);
    expect(alertas[0]).toHaveTextContent('Escribe el nombre de tu gimnasio.');
    expect(alertas[1]).toHaveTextContent('Escribe el teléfono del gimnasio.');
    expect(alertas[2]).toHaveTextContent('Escribe tu nombre.');
    expect(alertas[3]).toHaveTextContent('Escribe tu correo.');
    expect(alertas[4]).toHaveTextContent('Crea una contraseña.');
    expect(campos.gymName()).toHaveAttribute('aria-invalid', 'true');
    expect(campos.gymName()).toHaveAccessibleDescription(/Escribe el nombre de tu gimnasio\./);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('should show the phone error and not call the API when the phone has 9 digits', async () => {
    // Arrange
    const { user } = abrirRegistro();

    // Act
    await llenarFormulario(user, { gymPhone: '300123456' });
    await user.click(botonCrear());

    // Assert: solo falla el teléfono y el resto de campos sigue limpio
    expect(screen.getByRole('alert')).toHaveTextContent('Debe tener 10 dígitos (escribiste 9).');
    expect(campos.gymPhone()).toHaveAttribute('aria-invalid', 'true');
    expect(campos.ownerEmail()).not.toHaveAttribute('aria-invalid');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('should clear the phone error when the person edits the phone again', async () => {
    // Arrange
    const { user } = abrirRegistro();
    await llenarFormulario(user, { gymPhone: '300123456' });
    await user.click(botonCrear());

    // Act
    await user.type(campos.gymPhone(), '7');

    // Assert
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(campos.gymPhone()).not.toHaveAttribute('aria-invalid');
  });

  it.each([
    ['USER_EMAIL_TAKEN', 'Ya existe un usuario con ese correo.', 'Ya existe una cuenta con ese correo.', 'ownerEmail', /Este correo ya tiene una cuenta\. Inicia sesión o usa otro\./],
    ['GYM_EMAIL_TAKEN', 'Ya existe un gimnasio registrado con ese correo.', 'Ese correo de gimnasio ya está registrado.', 'gymEmail', /Ya hay un gimnasio con este correo\. Usa otro o déjalo vacío\./],
  ])('should show a banner and mark the field when the API answers 409 %s', async (code, mensajeApi, banner, campo, mensajeCampo) => {
    // Arrange
    mockRegister.mockImplementation(() => Promise.reject({ status: 409, code, message: mensajeApi, details: null, isNetwork: false }));
    const { user } = abrirRegistro();

    // Act
    await llenarFormulario(user, { gymEmail: 'contacto@powerhouse.com' });
    await user.click(botonCrear());

    // Assert: el banner general y el campo concreto, sin salir del registro
    expect(await screen.findByText(banner)).toBeInTheDocument();
    expect(campos[campo]()).toHaveAttribute('aria-invalid', 'true');
    expect(campos[campo]()).toHaveAccessibleDescription(mensajeCampo);
    expect(screen.queryByText(/Ruta actual/)).not.toBeInTheDocument();
  });

  it('should map the API validation issues to their fields when the API answers 400', async () => {
    // Arrange
    const issues = [{ path: ['gymName'], message: 'El nombre del gimnasio es muy largo' }];
    mockRegister.mockImplementation(() => Promise.reject({ status: 400, code: 'VALIDATION_ERROR', message: 'El nombre del gimnasio es muy largo', details: { issues }, isNetwork: false }));
    const { user } = abrirRegistro();

    // Act
    await llenarFormulario(user);
    await user.click(botonCrear());

    // Assert
    expect(await screen.findByText('Revisa los campos marcados.')).toBeInTheDocument();
    expect(campos.gymName()).toHaveAccessibleDescription(/El nombre del gimnasio es muy largo/);
  });

  it('should show the connection message and enable the button again when the network fails', async () => {
    // Arrange
    mockRegister.mockImplementation(() => Promise.reject({ status: 0, code: 'NETWORK', message: 'Sin conexion con el servidor.', details: null, isNetwork: true }));
    const { user } = abrirRegistro();

    // Act
    await llenarFormulario(user);
    await user.click(botonCrear());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos contactar al servidor. Revisa tu conexión e intenta de nuevo.');
    expect(botonCrear()).toBeEnabled();
  });

  it('should show the API message when the error has no known code', async () => {
    // Arrange
    mockRegister.mockImplementation(() => Promise.reject({ status: 500, code: null, message: 'Error interno del servidor, intenta de nuevo', details: null, isNetwork: false }));
    const { user } = abrirRegistro();

    // Act
    await llenarFormulario(user);
    await user.click(botonCrear());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor, intenta de nuevo');
  });

  it('should disable the button and show "Creando..." while the gym is being created', async () => {
    // Arrange: register() no responde hasta que el test lo decide
    let responder;
    mockRegister.mockImplementation(() => new Promise((resolve) => { responder = resolve; }));
    const { user } = abrirRegistro();
    await llenarFormulario(user);

    // Act
    await user.click(botonCrear());

    // Assert: mientras espera no se puede enviar dos veces
    const boton = screen.getByRole('button', { name: /Creando\.\.\./ });
    expect(boton).toBeDisabled();
    await user.click(boton);
    expect(mockRegister).toHaveBeenCalledTimes(1);

    responder({ id: 1, role: 'admin' });
    expect(await screen.findByText('Ruta actual: /admin/dashboard')).toBeInTheDocument();
  });

  it('should show and hide the password with the eye button', async () => {
    // Arrange
    const { user } = abrirRegistro();
    await user.type(campos.password(), 'clave123');

    // Act
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));

    // Assert
    expect(campos.password()).toHaveAttribute('type', 'text');

    // Act
    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));

    // Assert
    expect(campos.password()).toHaveAttribute('type', 'password');
  });
});
