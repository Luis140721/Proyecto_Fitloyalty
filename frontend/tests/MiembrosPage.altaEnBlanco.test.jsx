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
import { act, screen, waitFor, within } from '@testing-library/react';
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
  // El gimnasio tiene precios por plan: al elegir un plan, el formulario propone su valor.
  mockGet = vi.fn(async (url) => (url === '/admin/config'
    ? { data: { config: { plan_mensual_valor: '90000.00', plan_anual_valor: '900000.00' } } }
    : { data: { miembros } }));
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
    // Se borra todo lo escrito y el tipo de documento vuelve a ser la cedula: lo unico distinto de un
    // formulario en blanco es la casilla, que sigue marcada aunque con la cedula ya no se vea
    await user.clear(nombre());
    await user.clear(documento());
    await user.clear(telefono());
    await user.clear(campo(/^Nombre del representante legal/));
    await user.selectOptions(campo(/^Tipo de documento/), '');
    await user.clear(campo(/^Número de documento/));
    await user.selectOptions(campo(/^Parentesco/), '');
    await user.clear(campo(/^Teléfono del representante/));
    await user.selectOptions(campo(/^Tipo documento/), 'CC');
    expect(screen.queryByLabelText(/^Nombre del representante legal/)).not.toBeInTheDocument();

    // Act
    await user.click(cerrar());

    // Assert
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(PREGUNTA);
    expect(paso(1)).toBeInTheDocument();
  }, 20000);

  // Lo que la persona elige tambien se pierde al cerrar: el tipo de documento, el plan, lo pagado, el metodo
  // de pago, el recordatorio y los canales. Con solo eso cambiado (y los textos borrados), se pregunta.
  test.each([
    ['the document type', 0, async (user) => { await user.selectOptions(campo(/^Tipo documento/), 'CE'); }],
    ['the plan type', 2, async (user) => { await user.selectOptions(campo(/^Tipo de plan/), 'ANUAL'); }],
    ['the amount paid today', 2, async (user) => { await user.clear(campo('Valor pagado hoy')); await user.type(campo('Valor pagado hoy'), '50000'); }],
    ['the payment method', 2, async (user) => { await user.selectOptions(campo(/^Método de pago/), 'NEQUI'); }],
    ['the reminder box', 2, async (user) => {
      // La etiqueta envuelve la casilla y el numero de dias: la casilla se busca por su rol
      await user.click(screen.getByRole('checkbox', { name: /^Activar recordatorio/ }));
      expect(screen.getByRole('checkbox', { name: /^Activar recordatorio/ })).toBeChecked();
    }],
    ['a channel for commercial messages', 4, async (user) => { await user.click(canal('WhatsApp')); }],
  ])('should ask before closing when only %s was changed', async (_caso, pasos, cambiar) => {
    // Arrange: se cambia ese campo y despues se borran los tres textos del paso 1
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, pasos);
    await cambiar(user);
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

  // Lo mismo con cada dato que se escribe o se elige: con solo ese (y los tres textos del paso 1 borrados), se
  // pregunta. Las condiciones medicas y las alergias se escriben con la casilla de datos sensibles marcada y
  // despues se desmarca: el campo se ve vacio, pero el texto sigue en el formulario (reaparece al marcarla).
  test.each([
    ['the email', 0, async (user) => { await user.type(campo('Email'), 'pedro@correo.co'); }],
    ['the address', 0, async (user) => { await user.type(campo('Dirección completa'), 'Carrera 9 # 10-11'); }],
    // RQF-15 (#122): la contrasena de la app tambien es algo que la persona escribio.
    ['the app password', 0, async (user) => { await user.type(campo('Contraseña de la app'), 'clave123'); }],
    ['the birth date', 0, async (user) => { await user.type(campo('Fecha nacimiento'), '01011990'); }],
    ['the gender', 0, async (user) => { await user.selectOptions(campo('Género'), 'Masculino'); }],
    ['the emergency contact', 1, async (user) => { await user.type(campo('Contacto de emergencia'), 'Luz Gil'); }],
    ['the emergency phone', 1, async (user) => { await user.type(campo('Teléfono emergencia'), '3110000000'); }],
    ['the medical conditions', 1, async (user) => {
      await user.click(sensibles());
      await user.type(campo('Condiciones médicas / lesiones'), 'Asma');
      await user.click(sensibles());
      expect(sensibles()).not.toBeChecked();
    }],
    ['the allergies', 1, async (user) => {
      await user.click(sensibles());
      await user.type(campo('Alergias'), 'Polen');
      await user.click(sensibles());
      expect(sensibles()).not.toBeChecked();
    }],
    ['the payment reference', 2, async (user) => { await user.type(campo('Referencia / comprobante'), 'TRX-PEDRO'); }],
    ['the goal', 3, async (user) => { await user.selectOptions(campo('Objetivo principal'), 'Resistencia'); }],
    ['the experience level', 3, async (user) => { await user.selectOptions(campo('Nivel de experiencia'), 'Avanzado'); }],
    ['the notes of the trainer', 3, async (user) => { await user.type(campo('Observaciones / notas del entrenador'), 'Viene de noche'); }],
  ])('should ask before closing when only %s was filled in', async (_caso, pasos, llenar) => {
    // Arrange: se llena ese campo y despues se borran los tres textos del paso 1
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, pasos);
    await llenar(user);
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

  // Los datos del representante solo se ven con un menor (aqui, la tarjeta de identidad). Para que lo unico
  // distinto sea ese dato, despues de escribirlo el tipo de documento vuelve a la cedula: el dato sigue en el
  // formulario aunque ya no se vea.
  test.each([
    ['the name', async (user) => { await user.type(campo(/^Nombre del representante legal/), 'Marta Ruiz'); }],
    ['the document type', async (user) => { await user.selectOptions(campo(/^Tipo de documento/), 'CC'); }],
    ['the document', async (user) => { await user.type(campo(/^Número de documento/), '52111222'); }],
    ['the relationship', async (user) => { await user.selectOptions(campo(/^Parentesco/), 'Madre'); }],
    ['the phone', async (user) => { await user.type(campo(/^Teléfono del representante/), '3104445566'); }],
  ])('should ask before closing when only %s of the legal representative was filled in', async (_caso, llenar) => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await user.selectOptions(campo(/^Tipo documento/), 'TI');
    await llenar(user);
    await user.selectOptions(campo(/^Tipo documento/), 'CC');
    expect(screen.queryByLabelText(/^Nombre del representante legal/)).not.toBeInTheDocument();

    // Act
    await user.click(cerrar());

    // Assert
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(PREGUNTA);
    expect(paso(1)).toBeInTheDocument();
  });

  test('should close without asking when the form only has what it computes by itself: the suggested price of the plan and the dates', async () => {
    // Arrange: se elige el plan anual y se vuelve al mensual. Queda el valor que el formulario propone para
    // ese plan, con las fechas que calcula; de lo que elige la persona, todo esta como al abrir
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, 2);
    await user.selectOptions(campo(/^Tipo de plan/), 'ANUAL');
    expect(campo(/^Valor total del plan/)).toHaveValue(900000);
    await user.selectOptions(campo(/^Tipo de plan/), 'MENSUAL');
    expect(campo(/^Valor total del plan/)).toHaveValue(90000);
    expect(campo(/^Fecha inicio/)).toHaveValue('19/11/2026');
    expect(campo(/^Fecha fin/)).toHaveValue('19/12/2026');
    expect(campo('Estado del pago')).toHaveValue('PENDIENTE');
    await retroceder(user, 2);
    await user.clear(nombre());
    await user.clear(documento());
    await user.clear(telefono());

    // Act
    await user.click(cerrar());

    // Assert
    expect(window.confirm).not.toHaveBeenCalled();
    expect(paso(1)).not.toBeInTheDocument();
    expect(nuevoMiembro()).toBeInTheDocument();
  }, 15000);

  test('should close without asking when a channel for commercial messages was marked and unmarked again', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, 4);
    await user.click(canal('WhatsApp'));
    await user.click(canal('WhatsApp'));
    expect(canal('WhatsApp')).not.toBeChecked();
    await retroceder(user, 4);
    await user.clear(nombre());
    await user.clear(documento());
    await user.clear(telefono());

    // Act
    await user.click(cerrar());

    // Assert: no quedo ningun canal marcado
    expect(window.confirm).not.toHaveBeenCalled();
    expect(paso(1)).not.toBeInTheDocument();
  }, 15000);

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

  // El aviso general sale arriba de la pagina, fuera del asistente: si no se retira, queda sobre el alta siguiente.
  test('should not show the general notice of the discarded sign-up when it was closed after trying to create without the boxes', async () => {
    // Arrange: se pulsa «Crear miembro» sin aceptar nada y sale el aviso general
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, 4);
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
    expect(screen.getByText('Revisa los campos marcados antes de guardar.')).toBeInTheDocument();
    expect(screen.getByText('Debes aceptar los términos para registrar al miembro.')).toBeInTheDocument();

    // Act
    await user.click(cerrar());

    // Assert: el aviso se va con el alta descartada...
    expect(screen.queryByText('Revisa los campos marcados antes de guardar.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Act
    await user.click(nuevoMiembro());

    // Assert: ...y no esta en la siguiente
    expect(paso(1)).toBeInTheDocument();
    expect(screen.queryByText('Revisa los campos marcados antes de guardar.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  }, 15000);

  test('should not show the error of the server of the discarded sign-up when it was closed after the creation was rejected', async () => {
    // Arrange: el servidor rechaza el alta de Pedro porque el documento ya existe
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost = vi.fn(async () => { throw { status: 409, code: 'DUPLICATE_DOCUMENT', message: 'Ya existe un miembro con ese documento.' }; });
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await avanzar(user, 4);
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un miembro con ese documento.');

    // Act
    await user.click(cerrar());

    // Assert
    expect(screen.queryByText('Ya existe un miembro con ese documento.')).not.toBeInTheDocument();

    // Act
    await user.click(nuevoMiembro());

    // Assert
    expect(paso(1)).toBeInTheDocument();
    expect(screen.queryByText('Ya existe un miembro con ese documento.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(documento()).toHaveValue('');
  }, 15000);

  // RQNF-17: la autorizacion del representante legal es de ese representante y para ese menor.
  test('should not carry the legal representative nor the authorization of the representative to the next sign-up when the sign-up of a minor was closed', async () => {
    // Arrange: alta de Pedro, menor (tarjeta de identidad), con los cinco datos de su representante y la
    // casilla de la representante marcada. Se cierra sin crear
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    expect(screen.getByRole('checkbox', { name: /^Representante legal/ })).toBeChecked();
    await user.click(cerrar());

    // Act: llega Maria, que tambien es menor
    await user.click(nuevoMiembro());

    // Assert: el tipo de documento vuelve a ser la cedula y no hay nada del representante de Pedro
    expect(paso(1)).toBeInTheDocument();
    expect(campo(/^Tipo documento/)).toHaveValue('CC');
    await escribirDatos(user, MARIA);
    await user.selectOptions(campo(/^Tipo documento/), 'TI');
    expect(campo(/^Nombre del representante legal/)).toHaveValue('');
    expect(campo(/^Tipo de documento/)).toHaveValue('');
    expect(campo(/^Número de documento/)).toHaveValue('');
    expect(campo(/^Parentesco/)).toHaveValue('');
    expect(campo(/^Teléfono del representante/)).toHaveValue('');

    // Act: se intenta seguir sin representante
    await user.click(siguiente());

    // Assert: no deja; con los datos de la representante de Pedro habria pasado
    expect(paso(1)).toBeInTheDocument();
    expect(screen.getByText('Escribe el nombre completo del representante legal.')).toBeInTheDocument();
    expect(screen.getByText('Elige el tipo de documento.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el documento del representante.')).toBeInTheDocument();
    expect(screen.getByText('Indica el parentesco con el menor.')).toBeInTheDocument();
    expect(screen.getByText('Debe tener entre 7 y 15 dígitos.')).toBeInTheDocument();

    // Act: se escriben los datos del representante de Maria y se llega a los terminos
    await user.type(campo(/^Nombre del representante legal/), 'Rosa Rojas');
    await user.selectOptions(campo(/^Tipo de documento/), 'CE');
    await user.type(campo(/^Número de documento/), '41222333');
    await user.selectOptions(campo(/^Parentesco/), 'Padre');
    await user.type(campo(/^Teléfono del representante/), '3157778899');
    await avanzar(user, 4);

    // Assert: la casilla del representante no viene marcada, y sin ella no se crea
    expect(paso(5)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Representante legal/ })).not.toBeChecked();
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
    expect(screen.getByText('El miembro es menor de edad: falta la autorización de su representante legal.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    // Act: el representante de Maria autoriza
    await user.click(screen.getByRole('checkbox', { name: /^Representante legal/ }));
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert: el POST lleva al representante de Maria y nada del de Pedro
    expect(await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeInTheDocument();
    const cuerpo = mockPost.mock.calls[0][1];
    expect(cuerpo).toMatchObject({
      nombre: 'María Rojas', tipo_documento: 'TI', autoriza_representante: true,
      representante_nombre: 'Rosa Rojas', representante_tipo_documento: 'CE', representante_documento: '41222333',
      representante_parentesco: 'Padre', representante_telefono: '3157778899',
    });
    expect(JSON.stringify(cuerpo)).not.toMatch(/Marta|52111222|3104445566|Madre|Pedro/);
  }, 30000);

  test('should not carry the plan, the amounts, the payment method, the reminder nor the other choices of the discarded sign-up to the next one', async () => {
    // Arrange: en el alta de Pedro se eligen la fecha de nacimiento, el genero, el telefono de emergencia, el
    // plan anual (el formulario propone su valor), lo pagado, el metodo, el recordatorio, el objetivo y el nivel
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await abrirAlta();
    await escribirDatos(user, PEDRO);
    await user.type(campo('Fecha nacimiento'), '01011990');
    await user.selectOptions(campo('Género'), 'Masculino');
    await user.click(siguiente());
    await user.type(campo('Teléfono emergencia'), '3110000000');
    await user.click(siguiente());
    await user.selectOptions(campo(/^Tipo de plan/), 'ANUAL');
    expect(campo(/^Valor total del plan/)).toHaveValue(900000);
    await user.clear(campo('Valor pagado hoy'));
    await user.type(campo('Valor pagado hoy'), '50000');
    await user.selectOptions(campo(/^Método de pago/), 'NEQUI');
    await user.click(screen.getByRole('checkbox', { name: /^Activar recordatorio/ }));
    await user.click(siguiente());
    await user.selectOptions(campo('Objetivo principal'), 'Resistencia');
    await user.selectOptions(campo('Nivel de experiencia'), 'Avanzado');
    await user.click(cerrar());

    // Act: se abre el alta de Maria y se recorre paso a paso
    await user.click(nuevoMiembro());

    // Assert: cada eleccion esta como en un formulario recien abierto
    expect(paso(1)).toBeInTheDocument();
    expect(campo('Fecha nacimiento')).toHaveValue('');
    expect(campo('Género')).toHaveValue('');
    await escribirDatos(user, MARIA);
    await user.click(siguiente());
    expect(campo('Teléfono emergencia')).toHaveValue('');
    await user.click(siguiente());
    expect(campo(/^Tipo de plan/)).toHaveValue('MENSUAL');
    expect(campo(/^Valor total del plan/)).toHaveValue(null);
    expect(campo('Valor pagado hoy')).toHaveValue(0);
    expect(campo(/^Método de pago/)).toHaveValue('EFECTIVO');
    expect(screen.getByRole('checkbox', { name: /^Activar recordatorio/ })).not.toBeChecked();
    expect(campo(/^Fecha fin/)).toHaveValue('19/12/2026');
    await user.click(siguiente());
    expect(campo('Objetivo principal')).toHaveValue('');
    expect(campo('Nivel de experiencia')).toHaveValue('');

    // Act: se crea a Maria sin elegir nada de eso
    await user.click(siguiente());
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert: el POST lleva los valores de un formulario en blanco, no los de Pedro
    expect(await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeInTheDocument();
    const cuerpo = mockPost.mock.calls[0][1];
    expect(cuerpo).toMatchObject({
      nombre: 'María Rojas', tipo_plan: 'MENSUAL', valor_total: '', valor_pagado: '0', metodo_pago: 'EFECTIVO',
      activar_recordatorio: false, fecha_nacimiento: '', genero: '', telefono_emergencia: '', objetivo: '', nivel_experiencia: '',
    });
    expect(JSON.stringify(cuerpo)).not.toMatch(/ANUAL|900000|50000|NEQUI|1990|Masculino|3110000000|Resistencia|Avanzado/);
  }, 30000);
});

/*
 * Con el POST del alta en camino, el miembro se va a crear igual: cerrar en ese momento no descarta nada, y la
 * respuesta caeria sobre el alta que hubiera abierta al llegar. Mientras se crea, «Cerrar» queda deshabilitado
 * y no hace nada.
 */
describe('MiembrosPage: «Cerrar» mientras se crea el miembro', () => {
  /** Llena el alta de Maria y pulsa «Crear miembro»; el POST queda sin responder. */
  async function crearConElPostEnCamino() {
    let responder, fallar;
    mockPost = vi.fn(() => new Promise((resolve, reject) => { responder = resolve; fallar = reject; }));
    const pantalla = await abrirAlta();
    const { user } = pantalla;
    await escribirDatos(user, MARIA);
    await avanzar(user, 4);
    await user.click(contrato());
    await user.click(tratamiento());
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    return {
      user,
      responder: (respuesta) => act(async () => { responder(respuesta); }),
      fallar: (error) => act(async () => { fallar(error); }),
    };
  }

  test('should keep Cerrar disabled, without asking nor closing, while the member is being created, and close as usual when the answer arrives', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, responder } = await crearConElPostEnCamino();
    expect(screen.getByRole('button', { name: 'Creando miembro...' })).toBeDisabled();

    // Assert: con el POST en camino, «Cerrar» esta deshabilitado
    expect(cerrar()).toBeDisabled();

    // Act: aun asi se pulsa
    await user.click(cerrar());

    // Assert: ni pregunta ni cierra; el alta sigue como estaba
    expect(window.confirm).not.toHaveBeenCalled();
    expect(paso(5)).toBeInTheDocument();
    expect(contrato()).toBeChecked();
    expect(tratamiento()).toBeChecked();

    // Act: llega la respuesta del servidor
    miembros = [...miembros, CREADO];
    await responder({ data: { miembro: CREADO } });

    // Assert: el miembro queda creado y el alta cerrada, como siempre
    const aviso = await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    await user.click(within(aviso).getAllByRole('button', { name: 'Cerrar' }).at(-1));
    expect(paso(5)).not.toBeInTheDocument();
    expect(nuevoMiembro()).toBeEnabled();
    expect(await screen.findByRole('row', { name: /María Rojas/ })).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][1]).toMatchObject({ nombre: 'María Rojas', documento: '52999111' });
    expect(window.confirm).not.toHaveBeenCalled();
  }, 20000);

  test('should enable Cerrar again and ask before closing when the creation fails and Cerrar is clicked afterwards', async () => {
    // Arrange: con el POST en camino «Cerrar» esta deshabilitado (pulsarlo no hace nada); despues el POST falla
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, fallar } = await crearConElPostEnCamino();
    expect(cerrar()).toBeDisabled();
    await user.click(cerrar());
    expect(window.confirm).not.toHaveBeenCalled();
    await fallar({ status: 0, code: 'NETWORK', message: 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.' });
    expect(await screen.findByText(/Sin conexion con el servidor\./)).toBeInTheDocument();
    expect(paso(5)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear miembro' })).toBeEnabled();
    expect(cerrar()).toBeEnabled();

    // Act: el miembro no se creo; ahora cerrar si descarta lo escrito
    await user.click(cerrar());

    // Assert
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(PREGUNTA);
    expect(paso(5)).not.toBeInTheDocument();
    expect(nuevoMiembro()).toBeInTheDocument();
  }, 20000);
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

  test('should leave the sign-up as it is, without asking, when the Nuevo miembro button of the empty list is clicked with a sign-up half written', async () => {
    // Arrange: gimnasio sin miembros; el alta esta abierta en el paso 2, con datos y una casilla marcada
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    miembros = [];
    const { user } = abrirMiembros();
    await user.click(await botonDeLaListaVacia());
    await escribirDatos(user, PEDRO);
    await user.click(siguiente());
    await user.click(sensibles());
    await user.type(campo('Contacto de emergencia'), 'Luz Gil');

    // Act: debajo del alta sigue el boton de la lista vacia, y se pulsa
    await user.click(await botonDeLaListaVacia());

    // Assert: no reinicia el alta ni pregunta
    expect(window.confirm).not.toHaveBeenCalled();
    expect(paso(2)).toBeInTheDocument();
    expect(sensibles()).toBeChecked();
    expect(campo('Contacto de emergencia')).toHaveValue('Luz Gil');
    await user.click(anterior());
    expect(nombre()).toHaveValue('Pedro Gil');
    expect(documento()).toHaveValue('80123456');
    expect(telefono()).toHaveValue('3101112233');
  }, 15000);
});
