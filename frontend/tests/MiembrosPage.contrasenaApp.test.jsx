/**
 * RQF-15: la contrasena de la app del miembro en MiembrosPage. El miembro entra
 * a la app FitLoyalty con su telefono y esta contrasena, y hasta ahora el panel
 * no tenia donde asignarla: el backend la aceptaba (createSchema y updateSchema
 * de routes/miembros.js), pero ninguna pantalla la enviaba.
 *
 * Se prueba el alta (paso 1 del asistente) y la ficha (editar). El API, useAuth
 * y qrcode se simulan con vi.mock, como en MiembrosPage.test.jsx y
 * MiembrosPage.ficha.test.jsx. El usuario simulado es un administrador.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { screen, within } from '@testing-library/react';
import MiembrosPage from '../src/pages/MiembrosPage';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPost, mockPut, mockDelete;
vi.mock('../src/api', () => ({
  api: {
    get: (...a) => mockGet(...a),
    post: (...a) => mockPost(...a),
    put: (...a) => mockPut(...a),
    delete: (...a) => mockDelete(...a),
  },
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,UVI=' } }));

// Fila de la lista y registro completo de GET /api/admin/miembros/:id.
const ANA = { id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', telefono: '3001234567', email: 'ana@correo.co', codigo_qr: 'QR-ANA', activo: true };
const anaCompleta = (cambios = {}) => ({
  ...ANA, tipo_documento: 'CC', fecha_nacimiento: '1990-05-17T00:00:00.000Z', genero: 'Femenino', codigo_pais_telefono: '57',
  ciudad: 'Medellín', direccion: 'Calle 10 # 20-30', contacto_emergencia: 'Luz Pérez', telefono_emergencia: '3110000000',
  condiciones_medicas: '', alergias: '', objetivo: '', nivel_experiencia: '', observaciones: '',
  app_acceso: true, password_asignada: false,
  ...cambios,
});
const PLAN = {
  id_plan_cobro: 9, tipo_plan: 'MENSUAL', fecha_inicio: '2026-10-01T00:00:00.000Z', fecha_fin: '2026-10-31T00:00:00.000Z',
  valor_total: '90000.00', valor_pagado: '45000.00', metodo_pago: 'EFECTIVO', referencia_pago: '', estado_pago: 'PARCIAL',
  congelado_desde: null, dias_congelado: 0,
};
const SOFIA = { id_miembro: 3, nombre: 'Sofía Gómez', documento: '1033444555', telefono: '3201112233', codigo_qr: 'QR-SOFIA', activo: true };
const AVISO_TELEFONO = 'Con este teléfono no podrá entrar: la app pide 10 dígitos que empiecen por 3.';

let fichaDeAna, miembros, desplazados;

/** Doble del GET: configuracion, lista, ficha de Ana y su plan. */
function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/admin/config') return { data: { config: { plan_mensual_valor: '90000.00' } } };
    if (url === '/admin/miembros') return { data: { miembros } };
    if (url === '/admin/miembros/1') return { data: { miembro: fichaDeAna } };
    if (url === '/admin/miembros/1/plan') return { data: { plan: PLAN, congelaciones: [] } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const ficha = () => screen.getByRole('dialog', { name: 'Editar Ana Pérez' });
const campoClaveFicha = () => within(ficha()).getByLabelText('Contraseña de la app');
const campoClaveAlta = () => screen.getByLabelText('Contraseña de la app');
const botonSiguiente = () => screen.getByRole('button', { name: 'Siguiente →' });

/** Abre la ficha de Ana desde la lista y espera a que cargue completa. */
async function abrirFichaDeAna(user) {
  await user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));
  await within(ficha()).findByRole('heading', { name: 'Plan y cobro' });
}

/** Abre la pagina y la ficha de Ana. */
async function abrirPaginaYFichaDeAna() {
  const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
  await abrirFichaDeAna(pantalla.user);
  return pantalla;
}

/** Abre el alta y llena los campos obligatorios del paso 1. */
async function abrirAltaConDatos(telefono = '3201112233') {
  const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
  await screen.findByRole('row', { name: /Ana Pérez/ });
  await pantalla.user.click(screen.getByRole('button', { name: 'Nuevo miembro' }));
  await pantalla.user.type(screen.getByLabelText(/^Nombre completo/), 'Sofía Gómez');
  await pantalla.user.type(screen.getByLabelText(/^Número documento/), '1033444555');
  await pantalla.user.type(screen.getByLabelText(/^Teléfono \/ WhatsApp/), telefono);
  return pantalla;
}

/** Del paso 1 hasta crear el miembro con los terminos aceptados. */
async function terminarAlta(user) {
  for (let paso = 2; paso <= 5; paso += 1) {
    await user.click(botonSiguiente());
    expect(screen.getByText(`Paso ${paso} de 5`)).toBeInTheDocument();
  }
  await user.click(screen.getByRole('checkbox', { name: /^Contrato y términos/ }));
  await user.click(screen.getByRole('checkbox', { name: /^Tratamiento de datos/ }));
  await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Miembro creado exitosamente.');
}

// jsdom no implementa scrollIntoView: se simula y se anota a que elemento se llevo la vista.
beforeAll(() => { Element.prototype.scrollIntoView = function desplazar() { desplazados.push(this); }; });
afterAll(() => { delete Element.prototype.scrollIntoView; });

beforeEach(() => {
  fichaDeAna = anaCompleta();
  miembros = [ANA];
  desplazados = [];
  mockGet = apiQueResponde();
  mockPost = vi.fn(async () => { miembros = [...miembros, SOFIA]; return { data: { miembro: SOFIA } }; });
  mockPut = vi.fn(async () => ({ data: {} }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});

describe('MiembrosPage: la contraseña de la app en la ficha', () => {
  test('should show a hidden field and say the member cannot enter the app yet when it has no password', async () => {
    // Arrange: fichaDeAna sin contrasena (beforeEach)

    // Act
    await abrirPaginaYFichaDeAna();

    // Assert: el campo no deja ver lo que se escribe y no propone una guardada
    const campo = campoClaveFicha();
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveAttribute('autocomplete', 'new-password');
    expect(campo).toHaveValue('');
    expect(campo).toHaveAccessibleDescription('Aún no tiene contraseña: no puede entrar a la app hasta que le asignes una.');
  });

  test('should send the new password when the admin writes one of six characters or more', async () => {
    // Arrange
    const { user } = await abrirPaginaYFichaDeAna();

    // Act
    await user.type(campoClaveFicha(), 'gimnasio2026');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('Miembro actualizado.');
    const [url, cuerpo] = mockPut.mock.calls[0];
    expect(url).toBe('/admin/miembros/1');
    expect(cuerpo.password).toBe('gimnasio2026');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should keep the saved password when the member already has one and the field is left empty', async () => {
    // Arrange
    fichaDeAna = anaCompleta({ password_asignada: true });
    const { user } = await abrirPaginaYFichaDeAna();
    expect(campoClaveFicha()).toHaveAccessibleDescription('Ya tiene contraseña para la app. Escribe una nueva solo si quieres cambiarla.');

    // Act: se cambia otro dato y la contrasena se deja vacia
    const telefono = within(ficha()).getByRole('textbox', { name: 'Teléfono' });
    await user.clear(telefono);
    await user.type(telefono, '3007654321');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('Miembro actualizado.');
    expect(mockPut.mock.calls[0][1]).toMatchObject({ telefono: '3007654321' });
    expect(mockPut.mock.calls[0][1]).not.toHaveProperty('password');
  });

  test('should not save, should mark the field and should take the view to it when the password is shorter than six characters', async () => {
    // Arrange
    const { user } = await abrirPaginaYFichaDeAna();

    // Act
    await user.type(campoClaveFicha(), 'abc');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert: «Guardar cambios» esta en el pie del modal; el aviso y el foco van al campo
    expect(within(ficha()).getByRole('alert')).toHaveTextContent('Debe tener al menos 6 caracteres (escribiste 3).');
    expect(campoClaveFicha()).toHaveAttribute('aria-invalid', 'true');
    expect(campoClaveFicha()).toHaveFocus();
    expect(desplazados).toContain(campoClaveFicha());
    expect(mockPut).not.toHaveBeenCalled();
    expect(ficha()).toBeInTheDocument();
  });

  test('should clear the error and save when the admin completes the password after the warning', async () => {
    // Arrange
    const { user } = await abrirPaginaYFichaDeAna();
    await user.type(campoClaveFicha(), 'abc');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(within(ficha()).getByRole('alert')).toHaveTextContent('Debe tener al menos 6 caracteres (escribiste 3).');

    // Act
    await user.type(campoClaveFicha(), 'def');
    const sinAviso = within(ficha()).queryByText(/Debe tener al menos 6 caracteres/);
    const invalidoAlCorregir = campoClaveFicha().getAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert: al escribir se retira el aviso, y ya se puede guardar
    expect(sinAviso).not.toBeInTheDocument();
    expect(invalidoAlCorregir).toBeNull();
    expect(await screen.findByRole('status')).toHaveTextContent('Miembro actualizado.');
    expect(mockPut.mock.calls[0][1].password).toBe('abcdef');
  });

  test('should open the file with the password field empty when it was written and the file was closed without saving', async () => {
    // Arrange
    const { user } = await abrirPaginaYFichaDeAna();
    await user.type(campoClaveFicha(), 'gimnasio2026');
    await user.click(within(ficha()).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Act
    await abrirFichaDeAna(user);

    // Assert: lo escrito no se queda guardado en la pantalla para la siguiente ficha
    expect(campoClaveFicha()).toHaveValue('');
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('should warn that the member cannot enter the app when its phone does not start with 3 and its access is off', async () => {
    // Arrange: la app solo acepta celulares de 10 digitos que empiecen por 3
    fichaDeAna = anaCompleta({ telefono: '6012345678', password_asignada: true, app_acceso: false });

    // Act
    await abrirPaginaYFichaDeAna();

    // Assert
    expect(campoClaveFicha()).toHaveAccessibleDescription(
      'Ya tiene contraseña para la app. Escribe una nueva solo si quieres cambiarla. '
      + `Su acceso a la app está desactivado. ${AVISO_TELEFONO}`,
    );
  });
});

describe('MiembrosPage: la contraseña de la app en el alta', () => {
  test('should create the member with the app password when one is written in step 1', async () => {
    // Arrange
    const { user } = await abrirAltaConDatos();
    expect(campoClaveAlta()).toHaveAttribute('type', 'password');
    expect(campoClaveAlta()).toHaveAttribute('autocomplete', 'new-password');

    // Act
    await user.type(campoClaveAlta(), 'clave123');
    await terminarAlta(user);

    // Assert
    expect(mockPost).toHaveBeenCalledWith('/admin/miembros', expect.objectContaining({
      nombre: 'Sofía Gómez', telefono: '3201112233', password: 'clave123',
    }));
  });

  test('should create the member without an app password when the field is left empty', async () => {
    // Arrange
    const { user } = await abrirAltaConDatos();

    // Act
    await terminarAlta(user);

    // Assert: sin contrasena no viaja el campo, y el miembro queda sin ella
    expect(mockPost.mock.calls[0][1]).not.toHaveProperty('password');
  });

  test('should stay on step 1 and say how many characters there are when the app password is too short', async () => {
    // Arrange
    const { user } = await abrirAltaConDatos();

    // Act
    await user.type(campoClaveAlta(), 'abc');
    await user.click(botonSiguiente());

    // Assert
    expect(screen.getByText('Debe tener al menos 6 caracteres (escribiste 3).')).toBeInTheDocument();
    expect(campoClaveAlta()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('should warn that the member cannot enter the app when a password is written and the phone does not start with 3', async () => {
    // Arrange: un fijo de 10 digitos pasa la validacion del alta, pero no el login de la app
    const { user } = await abrirAltaConDatos('6012345678');
    expect(campoClaveAlta()).not.toHaveAccessibleDescription(new RegExp(AVISO_TELEFONO));

    // Act
    await user.type(campoClaveAlta(), 'clave123');

    // Assert
    expect(campoClaveAlta()).toHaveAccessibleDescription(new RegExp(AVISO_TELEFONO));
  });

  test('should open the next sign-up with the app password empty when a member was created with one', async () => {
    // Arrange
    const { user } = await abrirAltaConDatos();
    await user.type(campoClaveAlta(), 'clave123');
    await terminarAlta(user);
    const aviso = await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    await user.click(within(aviso).getAllByRole('button', { name: 'Cerrar' }).at(-1));

    // Act
    await user.click(screen.getByRole('button', { name: 'Nuevo miembro' }));

    // Assert
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    expect(campoClaveAlta()).toHaveValue('');
  });
});
