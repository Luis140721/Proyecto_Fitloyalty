/**
 * MiembrosPage: el alta de un miembro empieza siempre en blanco.
 *
 * Antes, «Cerrar» solo ocultaba el asistente: lo escrito y lo marcado para una
 * persona (su contrato, el tratamiento de datos, los datos sensibles y los
 * mensajes comerciales) seguia en el formulario, y el siguiente «Nuevo
 * miembro» abria en el mismo paso con todo eso. Bastaba escribir encima el
 * nombre, el documento y el telefono para crear a otra persona con
 * autorizaciones que nunca dio (RQNF-16 y RQNF-17).
 *
 * Ahora abrir el alta la deja en blanco y en el paso 1, y cerrarla descarta lo
 * escrito; si habia algo escrito o marcado, antes pregunta.
 *
 * El API, useAuth y qrcode se simulan con vi.mock; window.confirm es un espia.
 * La fecha se fija (solo Date; los timers siguen reales para user-event): el
 * alta propone la fecha de hoy y calcula el vencimiento.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { screen, within } from '@testing-library/react';
import MiembrosPage from '../src/pages/MiembrosPage';
import { renderWithProviders } from './renderWithProviders';

// Un vi.fn nuevo por test, como en LoginPage.test.jsx.
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

const ANA = { id_miembro: 1, nombre: 'Ana Pérez', documento: '1020304050', telefono: '3001234567', email: 'ana@correo.co', codigo_qr: 'QR-ANA', activo: true, whatsapp: null };
const CREADO = { id_miembro: 3, nombre: 'María Rojas', documento: '52999111', telefono: '3209998877', codigo_qr: 'QR-MARIA', activo: true };
const PREGUNTA = '¿Cerrar sin crear el miembro? Se descarta lo que escribiste: el siguiente registro empieza en blanco.';

let miembros;

const abrirMiembros = () => renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
const campo = (etiqueta) => screen.getByLabelText(etiqueta);
const nombre = () => campo(/^Nombre completo/);
const documento = () => campo(/^Número documento/);
const telefono = () => campo(/^Teléfono \/ WhatsApp/);
const siguiente = () => screen.getByRole('button', { name: 'Siguiente →' });
const anterior = () => screen.getByRole('button', { name: '← Anterior' });
const nuevoMiembro = () => screen.getByRole('button', { name: 'Nuevo miembro' });
const cerrar = () => screen.getByRole('button', { name: 'Cerrar' });
const paso = (n) => screen.queryByText(`Paso ${n} de 5`);
const contrato = () => screen.getByRole('checkbox', { name: /^Contrato y términos/ });
const tratamiento = () => screen.getByRole('checkbox', { name: /^Tratamiento de datos/ });
const sensibles = () => screen.getByRole('checkbox', { name: /^Datos sensibles \(salud\)/ });
const comerciales = () => screen.getByRole('switch', { name: /^Mensajes comerciales \(opcional\)/ });
const canal = (etiqueta) => within(screen.getByRole('group', { name: 'Canales autorizados' })).getByRole('checkbox', { name: etiqueta });

/** Abre el asistente con la lista ya cargada. */
async function abrirAlta() {
  const pantalla = abrirMiembros();
  await screen.findByRole('row', { name: /Ana Pérez/ });
  await pantalla.user.click(nuevoMiembro());
  return pantalla;
}
/** Escribe los tres datos obligatorios del paso 1. */
async function escribirDatos(user, persona) {
  await user.type(nombre(), persona.nombre);
  await user.type(documento(), persona.documento);
  await user.type(telefono(), persona.telefono);
}
const avanzar = async (user, veces) => { for (let i = 0; i < veces; i += 1) await user.click(siguiente()); };
const retroceder = async (user, veces) => { for (let i = 0; i < veces; i += 1) await user.click(anterior()); };
const PEDRO = { nombre: 'Pedro Gil', documento: '80123456', telefono: '3101112233' };
const MARIA = { nombre: 'María Rojas', documento: '52999111', telefono: '3209998877' };

// jsdom no implementa scrollIntoView, y el asistente lo usa para llevarte al primer campo con error.
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterAll(() => { delete Element.prototype.scrollIntoView; });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 19, 10, 0, 0));
  miembros = [ANA];
  mockGet = vi.fn(async (url) => (url === '/admin/config' ? { data: { config: {} } } : { data: { miembros } }));
  mockPost = vi.fn(async () => { miembros = [...miembros, CREADO]; return { data: { miembro: CREADO } }; });
  mockPut = vi.fn(async () => ({ data: {} }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MiembrosPage: el alta que se cierra sin crear', () => {
  // La secuencia del hallazgo. Teclea dos altas casi completas: con toda la suite en paralelo pasa de los 5 s por defecto.
  test('should open the next sign-up blank on step 1 and create that member with nothing of the discarded one when a sign-up with everything marked was closed', async () => {
    // Arrange: el alta de Pedro llega al paso 5 con el contrato, el tratamiento de datos, WhatsApp y los
    // mensajes comerciales marcados. Pedro se arrepiente y se cierra el asistente.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await user.type(campo('Email'), 'pedro@correo.co');
    await user.type(campo('Dirección completa'), 'Carrera 9 # 10-11');
    await user.click(siguiente());
    await user.type(campo('Contacto de emergencia'), 'Luz Gil');
    await user.click(siguiente());
    await user.type(campo('Referencia / comprobante'), 'TRX-PEDRO');
    await user.click(siguiente());
    await user.type(campo('Observaciones / notas del entrenador'), 'Viene de noche');
    await user.click(siguiente());
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(canal('WhatsApp'));
    await user.click(comerciales());
    expect(comerciales()).toBeChecked();
    await user.click(cerrar());
    expect(paso(5)).not.toBeInTheDocument();

    // Act: llega Maria y se abre un alta nueva
    await user.click(nuevoMiembro());

    // Assert: paso 1 y en blanco
    expect(paso(1)).toBeInTheDocument();
    expect(nombre()).toHaveValue('');
    expect(documento()).toHaveValue('');
    expect(telefono()).toHaveValue('');
    expect(campo('Email')).toHaveValue('');
    expect(campo('Dirección completa')).toHaveValue('');

    // Act: se escriben los datos de Maria y se llega a los terminos
    await escribirDatos(user, MARIA);
    await avanzar(user, 4);

    // Assert: nada de lo que acepto Pedro esta marcado
    expect(paso(5)).toBeInTheDocument();
    expect(contrato()).not.toBeChecked();
    expect(tratamiento()).not.toBeChecked();
    expect(comerciales()).not.toBeChecked();
    expect(comerciales()).toBeDisabled();
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(canal('Correo')).not.toBeChecked();

    // Act: se intenta crear a Maria sin que ella acepte nada
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert: con las casillas de Pedro esto se habria creado; ahora no
    expect(screen.getByText('Debes aceptar los términos para registrar al miembro.')).toBeInTheDocument();
    expect(screen.getByText('Falta la autorización de tratamiento de datos.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    // Act: Maria acepta el contrato y el tratamiento de datos, no los mensajes comerciales
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert: el POST es el de Maria, sin aceptacion comercial y sin un solo dato de Pedro
    expect(await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, cuerpo] = mockPost.mock.calls[0];
    expect(url).toBe('/admin/miembros');
    expect(cuerpo).toMatchObject({
      nombre: 'María Rojas', documento: '52999111', telefono: '3209998877', acepto_terminos: true, autorizo_datos: true,
      acepta_mensajes_comerciales: false, canales_comerciales: [], autorizo_datos_sensibles: false,
      direccion: '', contacto_emergencia: '', referencia_pago: '', observaciones: '',
    });
    expect(cuerpo).not.toHaveProperty('email');
    expect(JSON.stringify(cuerpo)).not.toMatch(/Pedro|80123456|3101112233|pedro@correo\.co|Carrera 9|Luz Gil|TRX-PEDRO|Viene de noche/);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(PREGUNTA);
  }, 30000);

  test('should not carry the health data nor the sensitive data authorization of the discarded sign-up to the next one when it was closed', async () => {
    // Arrange: en el alta de Pedro se autorizan los datos sensibles y se escriben; se cierra sin crear
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await user.click(siguiente());
    await user.click(sensibles());
    await user.type(campo('Condiciones médicas / lesiones'), 'Asma');
    await user.type(campo('Alergias'), 'Polen');
    await user.click(cerrar());

    // Act: se registra a Maria
    await user.click(nuevoMiembro());
    await escribirDatos(user, MARIA);
    await user.click(siguiente());

    // Assert: el paso de salud esta como al principio
    expect(paso(2)).toBeInTheDocument();
    expect(sensibles()).not.toBeChecked();
    expect(campo('Condiciones médicas / lesiones')).toHaveValue('');
    expect(campo('Condiciones médicas / lesiones')).toBeDisabled();
    expect(campo('Alergias')).toHaveValue('');

    // Act
    await avanzar(user, 3);
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert
    expect(await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeInTheDocument();
    const cuerpo = mockPost.mock.calls[0][1];
    expect(cuerpo).toMatchObject({ nombre: 'María Rojas', autorizo_datos_sensibles: false, condiciones_medicas: '', alergias: '' });
    expect(JSON.stringify(cuerpo)).not.toMatch(/Asma|Polen|Pedro/);
  }, 20000);

  test('should keep the sign-up open on the same step with everything as it was when the person clicks Cerrar and says no', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, 4);
    await user.click(contrato());
    await user.click(canal('WhatsApp'));
    await user.click(comerciales());

    // Act
    await user.click(cerrar());

    // Assert: se pregunto una vez, y como la respuesta fue no, nada cambio
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(PREGUNTA);
    expect(paso(5)).toBeInTheDocument();
    expect(contrato()).toBeChecked();
    expect(tratamiento()).not.toBeChecked();
    expect(comerciales()).toBeChecked();
    expect(canal('WhatsApp')).toBeChecked();
    expect(cerrar()).toBeInTheDocument();
    await retroceder(user, 4);
    expect(paso(1)).toBeInTheDocument();
    expect(nombre()).toHaveValue('Pedro Gil');
    expect(documento()).toHaveValue('80123456');
    expect(telefono()).toHaveValue('3101112233');
    expect(mockPost).not.toHaveBeenCalled();
  }, 15000);

  test('should close without asking when nothing was typed nor marked', async () => {
    // Arrange: el formulario solo tiene lo que se calcula solo (la fecha de hoy, el plan mensual)
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    expect(paso(1)).toBeInTheDocument();

    // Act
    await user.click(cerrar());

    // Assert
    expect(window.confirm).not.toHaveBeenCalled();
    expect(paso(1)).not.toBeInTheDocument();
    expect(nuevoMiembro()).toBeInTheDocument();
  });

  test('should close without asking when only spaces were typed', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await user.type(nombre(), '   ');
    await user.type(campo('Dirección completa'), ' ');

    // Act
    await user.click(cerrar());

    // Assert: no hay nada que perder
    expect(window.confirm).not.toHaveBeenCalled();
    expect(paso(1)).not.toBeInTheDocument();
    expect(nuevoMiembro()).toBeInTheDocument();
  });

  // Una casilla marcada tambien es algo que se pierde: aunque se borren los textos, se pregunta.
  test.each([
    ['the contract box', 4, async (user) => { await user.click(contrato()); }],
    ['the data treatment box', 4, async (user) => { await user.click(tratamiento()); }],
    ['the commercial messages switch', 4, async (user) => { await user.click(canal('Correo')); await user.click(comerciales()); }],
    ['the sensitive data box', 1, async (user) => { await user.click(sensibles()); }],
  ])('should ask before closing when only %s is marked', async (_caso, pasos, marcar) => {
    // Arrange: se marca la casilla y despues se borran los tres textos del paso 1
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, pasos);
    await marcar(user);
    await retroceder(user, pasos);
    await user.clear(nombre());
    await user.clear(documento());
    await user.clear(telefono());

    // Act
    await user.click(cerrar());

    // Assert
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(PREGUNTA);
    expect(paso(1)).toBeInTheDocument();
  }, 15000);

  // Teclea tambien los datos del representante y despues los borra.
  test('should ask before closing when only the authorization of the legal representative is marked', async () => {
    // Arrange: alta de un menor (tarjeta de identidad sin fecha de nacimiento) hasta marcar la casilla del representante
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await user.selectOptions(campo(/^Tipo documento/), 'TI');
    await user.type(campo(/^Nombre del representante legal/), 'Marta Ruiz');
    await user.selectOptions(campo(/^Tipo de documento/), 'CC');
    await user.type(campo(/^Número de documento/), '52111222');
    await user.selectOptions(campo(/^Parentesco/), 'Madre');
    await user.type(campo(/^Teléfono del representante/), '3104445566');
    await avanzar(user, 4);
    await user.click(screen.getByRole('checkbox', { name: /^Representante legal/ }));
    await retroceder(user, 4);
    // Se borra todo lo escrito: solo queda la casilla
    await user.clear(nombre());
    await user.clear(documento());
    await user.clear(telefono());
    await user.clear(campo(/^Nombre del representante legal/));
    await user.selectOptions(campo(/^Tipo de documento/), '');
    await user.clear(campo(/^Número de documento/));
    await user.selectOptions(campo(/^Parentesco/), '');
    await user.clear(campo(/^Teléfono del representante/));

    // Act
    await user.click(cerrar());

    // Assert
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(PREGUNTA);
    expect(paso(1)).toBeInTheDocument();
  }, 20000);

  test('should not show the validation errors of the discarded sign-up when the next one opens', async () => {
    // Arrange: se pulsa Siguiente con el alta vacia (marca los obligatorios) y se cierra
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await abrirAlta();
    await user.click(siguiente());
    expect(screen.getByText('Escribe el nombre del miembro.')).toBeInTheDocument();
    expect(nombre()).toHaveAttribute('aria-invalid', 'true');
    await user.click(cerrar());

    // Act
    await user.click(nuevoMiembro());

    // Assert
    expect(paso(1)).toBeInTheDocument();
    expect(screen.queryByText('Escribe el nombre del miembro.')).not.toBeInTheDocument();
    expect(screen.queryByText('Escribe el número de documento.')).not.toBeInTheDocument();
    expect(screen.queryByText('Escribe el teléfono.')).not.toBeInTheDocument();
    expect(nombre()).not.toHaveAttribute('aria-invalid');
  });
});

describe('MiembrosPage: abrir el alta', () => {
  test('should open blank and on step 1 when Nuevo miembro is clicked after a member was created', async () => {
    // Arrange: se crea a Maria, que acepta tambien los mensajes comerciales, y se cierra su aviso
    const { user } = await abrirAlta();
    await escribirDatos(user, MARIA);
    await avanzar(user, 4);
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(canal('WhatsApp'));
    await user.click(comerciales());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
    const aviso = await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    await user.click(within(aviso).getAllByRole('button', { name: 'Cerrar' }).at(-1));
    expect(mockPost.mock.calls[0][1]).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });

    // Act
    await user.click(nuevoMiembro());

    // Assert: antes abria en el paso 5, donde se quedo el alta anterior
    expect(paso(1)).toBeInTheDocument();
    expect(nombre()).toHaveValue('');
    expect(documento()).toHaveValue('');
    expect(telefono()).toHaveValue('');
    await escribirDatos(user, PEDRO);
    await avanzar(user, 4);
    expect(contrato()).not.toBeChecked();
    expect(tratamiento()).not.toBeChecked();
    expect(comerciales()).not.toBeChecked();
    expect(canal('WhatsApp')).not.toBeChecked();
  }, 20000);

  // La lista sin filas ofrece su propio «Nuevo miembro» dentro de la tabla.
  const botonDeLaListaVacia = () => within(screen.getByRole('table')).findByRole('button', { name: 'Nuevo miembro' });

  test('should open blank and on step 1 when the Nuevo miembro button of the empty list is clicked in a gym with no members', async () => {
    // Arrange
    miembros = [];
    const { user } = abrirMiembros();

    // Act
    await user.click(await botonDeLaListaVacia());

    // Assert
    expect(paso(1)).toBeInTheDocument();
    expect(nombre()).toHaveValue('');
    expect(documento()).toHaveValue('');
    expect(telefono()).toHaveValue('');
    expect(cerrar()).toBeInTheDocument();
    await escribirDatos(user, MARIA);
    await avanzar(user, 4);
    expect(contrato()).not.toBeChecked();
    expect(tratamiento()).not.toBeChecked();
    expect(comerciales()).not.toBeChecked();
  }, 15000);

  test('should open blank and on step 1 when the Nuevo miembro button of an empty filter is clicked after a member was created', async () => {
    // Arrange: se crea a Maria, se cierra su aviso y se mira un filtro en el que no hay nadie
    const { user } = await abrirAlta();
    await escribirDatos(user, MARIA);
    await avanzar(user, 4);
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
    const aviso = await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    await user.click(within(aviso).getAllByRole('button', { name: 'Cerrar' }).at(-1));
    await user.click(screen.getByRole('tab', { name: /^Desactivados/ }));
    const boton = await botonDeLaListaVacia();

    // Act
    await user.click(boton);

    // Assert: antes este boton solo mostraba el asistente, que seguia en el paso 5 del alta anterior
    expect(paso(1)).toBeInTheDocument();
    expect(paso(5)).not.toBeInTheDocument();
    expect(nombre()).toHaveValue('');
    expect(documento()).toHaveValue('');
    expect(telefono()).toHaveValue('');
  }, 20000);
});
