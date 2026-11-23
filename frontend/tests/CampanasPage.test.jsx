/**
 * CampanasPage (RQF-10) desde lo que hace el administrador: ver las campañas,
 * la vista previa del segmento, crear una campaña (con mensaje escrito o con
 * una plantilla, para enviar ya o programada), editarla, enviarla, cancelarla,
 * ver sus destinatarios y enviar a mano por WhatsApp, y las plantillas.
 *
 * Sale de la sincronizacion de la rama de la semana con develop (#100 y #104):
 * la pagina entro sin tests y la cobertura de lineas del front bajo de 80.
 *
 * RQNF-16 (Ley 2300 de 2023, #108): la pagina muestra el horario permitido, la
 * vista previa cuenta a quienes aceptaron mensajes comerciales por el canal,
 * fuera de horario «Enviar ahora» deja la campaña programada, los omitidos
 * salen con su motivo, «Reintentar» procesa los pendientes y el WhatsApp a
 * mano pide la constancia al servidor ANTES de abrir el chat.
 *
 * El API se simula con vi.mock. window.confirm, window.open y window.scrollTo
 * son espias. window.open devuelve una pestaña falsa: la pagina la abre en
 * blanco con el clic y despues la lleva a wa.me (src/lib/contactoWhatsapp.js).
 * La vista previa del segmento espera 250 ms con un setTimeout real: los
 * findBy la esperan. Nada depende del reloj: el horario lo dice el servidor.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import CampanasPage from '../src/pages/CampanasPage';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPost, mockPut;
vi.mock('../src/api', () => ({
  api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a), put: (...a) => mockPut(...a) },
}));

const SEGMENTOS = [
  { valor: 'TODOS', etiqueta: 'Todos los miembros activos', dias: null },
  { valor: 'INACTIVOS', etiqueta: 'Inactivos', dias: 7 },
  { valor: 'NUEVOS', etiqueta: 'Nuevos', dias: 30 },
  { valor: 'PROXIMOS_A_VENCER', etiqueta: 'Próximos a vencer', dias: 7 },
];
const MENSAJE = 'Hola {primer_nombre}, llevas {dias_sin_venir} días sin venir a {gimnasio}.';
const CAMPANA = {
  id_campana: 4, nombre: 'Te extrañamos', segmento: 'INACTIVOS', mensaje: MENSAJE, id_plantilla: null, canal: 'WHATSAPP',
  tipo_disparo: 'MANUAL', dias_inactividad: 10, estado: 'PROGRAMADA', activa: true, fecha_programada: null, fecha_ejecucion: null,
  destinatarios: 0, enviados: 0, fallidos: 0, pendientes: 0, omitidos: 0,
};
const ENVIADA = {
  ...CAMPANA, id_campana: 5, nombre: 'Vuelve en diciembre', estado: 'ENVIADA', canal: 'WHATSAPP',
  fecha_ejecucion: '2026-11-20T09:00', destinatarios: 3, enviados: 1, fallidos: 1, pendientes: 1, omitidos: 0,
};
// RQNF-16: el horario de la Ley 2300 como lo manda GET /admin/campanas (horarioAhora, backend/src/routes/campanas.js).
const TEXTO_HORARIO = 'de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos';
const EN_HORARIO = { permitido: true, texto: TEXTO_HORARIO, siguiente: null, siguiente_texto: null };
// Un domingo: lo siguiente permitido es el lunes a las 7:00 a. m. de Colombia.
const FUERA_DE_HORARIO = {
  permitido: false, texto: TEXTO_HORARIO, siguiente: '2026-11-23T12:00:00.000Z', siguiente_texto: 'lunes 23 de noviembre a las 7:00 a. m.',
};
// El pie que el servidor le agrega a cada mensaje comercial (backend/src/lib/baja-mensajes.js).
const PIE_BAJA = '\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: https://panel.fitloyalty.test/baja/41.7.firma';
const PLANTILLAS = [
  { id_plantilla: 3, nombre: 'Regreso', contenido: 'Hola {primer_nombre}, en {gimnasio} te esperamos.', activa: true },
  { id_plantilla: 6, nombre: 'Vieja', contenido: 'Texto viejo de la plantilla', activa: false },
];
const destinatario = (id, nombre, estado, telefono, mensaje, motivo = null) => ({
  id_campana_destinatario: 90 + id, id_miembro: id, nombre, estado_envio: estado, motivo, fecha_envio: null, telefono, email: null, mensaje,
});
const DESTINATARIOS = [
  destinatario(41, 'Ana Ruiz', 'PENDIENTE', '573001234567', 'Hola Ana, te esperamos.'),
  destinatario(42, 'Beto Gil', 'FALLIDO', null, 'Hola Beto, te esperamos.'),
  destinatario(43, 'Carla Paz', 'ENVIADO', '573109876543', 'Hola Carla, te esperamos.'),
];

let campanas;
let plantillas;
let previa;
let destinatarios;
let horario;
let ventana;

/** La pestaña en blanco que abre el clic, como la usa src/lib/contactoWhatsapp.js. */
const pestanaEnBlanco = () => ({ closed: false, opener: window, location: { replace: vi.fn() }, close: vi.fn() });

function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/admin/campanas') return { data: { campanas, segmentos: SEGMENTOS, variables: [], horario } };
    if (url === '/admin/plantillas') return { data: { plantillas } };
    if (url.startsWith('/admin/campanas/segmento?')) {
      if (previa instanceof Error) throw previa;
      return { data: previa };
    }
    const m = /^\/admin\/campanas\/(\d+)\/destinatarios$/.exec(url);
    if (m) return { data: { campana: campanas.find((c) => c.id_campana === Number(m[1])), horario, destinatarios } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const abrirCampanas = () => renderWithProviders(<CampanasPage />, { route: '/admin/campanas' });
const tarjeta = async (nombre) => (await screen.findByText(nombre, { selector: 'strong' })).closest('article');
const boton = (nombre, dentro = document.body) => within(dentro).getByRole('button', { name: new RegExp(`${nombre}$`) });
const nombre = () => screen.getByRole('textbox', { name: 'Nombre' });
const mensaje = () => screen.getByRole('textbox', { name: 'Mensaje' });
const llamadasGet = (patron) => mockGet.mock.calls.map(([url]) => url).filter((url) => patron.test(url));

/*
 * RQNF-16: la pagina tiene siempre un role="status" con el horario de la Ley
 * 2300, asi que la confirmacion de lo que se acaba de hacer ya no es el unico.
 * Ninguno de los dos tiene nombre accesible: se distinguen por el color de la
 * alerta (la confirmacion es la verde).
 */
const esConfirmacion = (el) => el.classList.contains('alert-success');
const confirmacion = () => waitFor(() => {
  const verdes = screen.getAllByRole('status').filter(esConfirmacion);
  expect(verdes).toHaveLength(1);
  return verdes[0];
});
const avisoHorario = () => {
  const avisos = screen.getAllByRole('status').filter((el) => !esConfirmacion(el));
  expect(avisos).toHaveLength(1);
  return avisos[0];
};

beforeEach(() => {
  campanas = [CAMPANA, ENVIADA];
  plantillas = PLANTILLAS;
  // 3 en el segmento y 2 con telefono, pero solo 1 acepto mensajes comerciales por WhatsApp.
  previa = { segmento: 'INACTIVOS', dias: 7, total: 3, con_telefono: 2, con_correo: 1, aceptan_whatsapp: 1, aceptan_correo: 0, muestra: [] };
  destinatarios = DESTINATARIOS;
  horario = EN_HORARIO;
  ventana = pestanaEnBlanco();
  mockGet = apiQueResponde();
  mockPost = vi.fn(async () => ({ data: {} }));
  mockPut = vi.fn(async () => ({ data: {} }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockImplementation(() => ventana);
});

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('CampanasPage: la lista de campañas', () => {
  test('should show each campaign with its state, segment, channel and dates and the actions it allows when the page loads', async () => {
    // Arrange
    campanas = [
      { ...CAMPANA, tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00' },
      { ...ENVIADA, canal: 'EMAIL' },
      { ...CAMPANA, id_campana: 6, nombre: 'Cancelada', estado: 'CANCELADA', segmento: 'ETIQUETA', dias_inactividad: null },
    ];

    // Act
    abrirCampanas();

    // Assert
    const programada = await tarjeta('Te extrañamos');
    expect(within(programada).getByText('Por enviar')).toHaveClass('badge--warn');
    expect(programada).toHaveTextContent('Inactivos (10 días) · WhatsApp · programada 2026-11-25 08:00');
    expect(boton('Enviar ahora', programada)).toBeInTheDocument();
    expect(boton('Editar', programada)).toBeInTheDocument();
    expect(boton('Cancelar', programada)).toBeInTheDocument();

    const enviada = await tarjeta('Vuelve en diciembre');
    expect(within(enviada).getByText('Enviada')).toHaveClass('badge--ok');
    expect(enviada).toHaveTextContent('Inactivos (10 días) · Correo · enviada 2026-11-20 09:00');
    expect(enviada).toHaveTextContent('3 destinatarios · 1 enviados · 1 por enviar · 1 fallidos · 0 omitidos (Ley 2300)');
    expect(boton('Destinatarios', enviada)).toBeInTheDocument();
    // RQNF-16: le queda un pendiente, asi que se puede reintentar.
    expect(boton('Reintentar', enviada)).toBeInTheDocument();
    expect(within(enviada).queryByRole('button', { name: /Enviar ahora|Editar|Cancelar/ })).not.toBeInTheDocument();

    // Un segmento que la pagina no conoce se muestra tal cual, y sin dias.
    const cancelada = await tarjeta('Cancelada');
    expect(within(cancelada).getByText('Cancelada', { selector: 'span' })).toHaveClass('badge--err');
    expect(cancelada).toHaveTextContent('ETIQUETA · WhatsApp');
    expect(cancelada).not.toHaveTextContent('días');
    expect(within(cancelada).queryByRole('button')).not.toBeInTheDocument();
    expect(cancelada).toHaveStyle({ opacity: '0.6' });
  });

  test('should say there are no campaigns nor templates yet when the gym has none', async () => {
    // Arrange
    campanas = [];
    plantillas = [];

    // Act
    abrirCampanas();

    // Assert
    expect(await screen.findByText('Todavía no hay campañas.')).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay plantillas.')).toBeInTheDocument();
  });

  test.each([
    ['the message of the API', { message: 'No pudimos cargar las campañas.' }, 'No pudimos cargar las campañas.'],
    ['a generic message', {}, 'No se pudieron cargar las campañas.'],
  ])('should show %s when the campaigns cannot be loaded', async (_caso, error, texto) => {
    // Arrange
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => {
      if (url === '/admin/campanas') throw error;
      return getNormal(url);
    });

    // Act
    abrirCampanas();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
  });
});

// ---------------------------------------------------------------------------
describe('CampanasPage: la vista previa del segmento', () => {
  // RQNF-16: antes decia cuantos tenian telefono y correo; ahora, cuantos aceptaron
  // mensajes comerciales por el canal de la campaña, que son los unicos que la reciben.
  test('should say how many members are in the segment and how many accepted commercial messages by WhatsApp when the page loads', async () => {
    // Act
    abrirCampanas();

    // Assert: tener telefono no basta (2 lo tienen); cuenta quien acepto por WhatsApp (1)
    expect(await screen.findByText('En el segmento hay 3 miembros; aceptaron mensajes comerciales por WhatsApp 1. Solo a ellos les llega.')).toBeInTheDocument();
    expect(llamadasGet(/segmento\?/)).toEqual(['/admin/campanas/segmento?segmento=INACTIVOS']);
    expect(screen.getByRole('spinbutton', { name: 'Días sin venir' })).toHaveAttribute('placeholder', '7');
  });

  test('should count the members who accepted commercial messages by email when the channel of the campaign is Correo', async () => {
    // Arrange: todos los numeros son distintos, para saber cual se muestra
    previa = { segmento: 'INACTIVOS', dias: 7, total: 6, con_telefono: 5, con_correo: 4, aceptan_whatsapp: 3, aceptan_correo: 2, muestra: [] };
    const { user } = abrirCampanas();
    expect(await screen.findByText('En el segmento hay 6 miembros; aceptaron mensajes comerciales por WhatsApp 3. Solo a ellos les llega.')).toBeInTheDocument();

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: 'Canal' }), 'EMAIL');

    // Assert: el canal no cambia el segmento, asi que no se vuelve a pedir
    expect(screen.getByText('En el segmento hay 6 miembros; aceptaron mensajes comerciales por correo 2. Solo a ellos les llega.')).toBeInTheDocument();
    expect(llamadasGet(/segmento\?/)).toEqual(['/admin/campanas/segmento?segmento=INACTIVOS']);
  });

  test('should count nobody as accepted, not the ones with phone or email, when the server does not say how many accepted', async () => {
    // Arrange: la respuesta de un backend anterior a RQNF-16 (el panel y el servidor se despliegan por separado)
    previa = { segmento: 'INACTIVOS', dias: 7, total: 3, con_telefono: 2, con_correo: 1, muestra: [] };
    const { user } = abrirCampanas();

    // Assert
    expect(await screen.findByText('En el segmento hay 3 miembros; aceptaron mensajes comerciales por WhatsApp 0. Solo a ellos les llega.')).toBeInTheDocument();

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: 'Canal' }), 'EMAIL');

    // Assert
    expect(screen.getByText('En el segmento hay 3 miembros; aceptaron mensajes comerciales por correo 0. Solo a ellos les llega.')).toBeInTheDocument();
  });

  test.each([
    ['NUEVOS', 'Registrados hace (días)', '30'],
    ['PROXIMOS_A_VENCER', 'Vence en (días)', '7'],
  ])('should ask the days with its own label and send them when the segment is %s', async (segmento, etiqueta, porDefecto) => {
    // Arrange
    previa = { total: 1, con_telefono: 1, con_correo: 0, aceptan_whatsapp: 1, aceptan_correo: 0 };
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: 'Segmento' }), segmento);
    const dias = screen.getByRole('spinbutton', { name: etiqueta });
    await user.type(dias, '15');

    // Assert
    expect(dias).toHaveAttribute('placeholder', porDefecto);
    expect(await screen.findByText('En el segmento hay 1 miembro; aceptaron mensajes comerciales por WhatsApp 1. Solo a ellos les llega.')).toBeInTheDocument();
    await waitFor(() => expect(llamadasGet(/segmento\?/)).toContain(`/admin/campanas/segmento?segmento=${segmento}&dias=15`));
  });

  test('should not ask the days when the campaign goes to every member', async () => {
    // Arrange
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: 'Segmento' }), 'TODOS');

    // Assert
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    await waitFor(() => expect(llamadasGet(/segmento\?/)).toContain('/admin/campanas/segmento?segmento=TODOS'));
  });

  test('should ask to choose the recipients when the preview cannot be calculated', async () => {
    // Arrange
    previa = new Error('sin conexion');

    // Act
    abrirCampanas();

    // Assert
    await waitFor(() => expect(llamadasGet(/segmento\?/)).toHaveLength(1));
    expect(screen.getByText('Elige a quién va dirigida.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('CampanasPage: crear y editar una campaña', () => {
  test('should fill the message from an active template, preview it with sample data and save a manual campaign', async () => {
    // Arrange
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');
    const plantilla = screen.getByRole('combobox', { name: 'Plantilla' });
    // Las plantillas inactivas no se ofrecen.
    expect(within(plantilla).getAllByRole('option').map((o) => o.textContent)).toEqual(['— Escribir el mensaje —', 'Regreso']);

    // Act
    await user.type(nombre(), 'Regreso de noviembre');
    await user.selectOptions(plantilla, '3');
    await user.click(boton('Guardar campaña'));

    // Assert
    expect(await confirmacion()).toHaveTextContent('Campaña guardada. Pulsa «Enviar ahora» cuando quieras lanzarla.');
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas', {
      nombre: 'Regreso de noviembre', segmento: 'INACTIVOS', dias: null, canal: 'WHATSAPP', id_plantilla: 3,
      mensaje: 'Hola {primer_nombre}, en {gimnasio} te esperamos.', tipo_disparo: 'MANUAL', fecha_programada: null,
    });
    expect(nombre()).toHaveValue('');
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/campanas')).toHaveLength(2);
  });

  test('should show the message with sample data while the admin writes it and keep it when going back to writing', async () => {
    // Arrange
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');

    // Act
    await user.type(mensaje(), 'Hola {{primer_nombre}, vence el {{fecha_vencimiento} y {{otra}');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Plantilla' }), '');

    // Assert
    expect(screen.getByLabelText('Vista previa del mensaje')).toHaveTextContent('Hola Ana, vence el 30/11/2026 y {otra}');
    expect(mensaje()).toHaveValue('Hola {primer_nombre}, vence el {fecha_vencimiento} y {otra}');
  });

  test('should schedule an email campaign with its days, date and time when the admin chooses Programado', async () => {
    // Arrange
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');
    await user.type(nombre(), 'Inactivos de diciembre');
    await user.type(screen.getByRole('spinbutton', { name: 'Días sin venir' }), '10');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Canal' }), 'EMAIL');
    await user.type(mensaje(), 'Te esperamos en {{gimnasio}');

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: 'Envío' }), 'PROGRAMADO');
    fireEvent.change(screen.getByLabelText('Fecha y hora (Colombia)'), { target: { value: '2026-12-01T08:00' } });
    await user.click(boton('Programar'));

    // Assert
    expect(await confirmacion()).toHaveTextContent('Campaña programada. El servidor la envía a la hora indicada.');
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas', {
      nombre: 'Inactivos de diciembre', segmento: 'INACTIVOS', dias: 10, canal: 'EMAIL', id_plantilla: null,
      mensaje: 'Te esperamos en {gimnasio}', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-12-01T08:00',
    });
  });

  test('should not let the admin save until the name has 3 characters and the message 5', async () => {
    // Arrange
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');

    // Act
    await user.type(nombre(), 'Abc');
    await user.type(mensaje(), 'Hola');

    // Assert
    expect(boton('Guardar campaña')).toBeDisabled();
    await user.type(mensaje(), '!');
    expect(boton('Guardar campaña')).toBeEnabled();
  });

  test.each([
    ['the message of the API', { message: 'La fecha de envío debe ser futura.' }, 'La fecha de envío debe ser futura.'],
    ['a generic message', {}, 'No se pudo guardar la campaña.'],
  ])('should keep what was written and show %s when the campaign cannot be saved', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');
    await user.type(nombre(), 'Regreso');
    await user.type(mensaje(), 'Te esperamos');

    // Act
    await user.click(boton('Guardar campaña'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(nombre()).toHaveValue('Regreso');
  });

  test('should fill the form with the campaign and save the changes with PUT when the admin edits it', async () => {
    // Arrange
    campanas = [{ ...CAMPANA, tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00', id_plantilla: 3 }];
    const { user } = abrirCampanas();
    await user.click(boton('Editar', await tarjeta('Te extrañamos')));
    expect(screen.getByRole('heading', { name: 'Editar campaña' })).toBeInTheDocument();
    expect(nombre()).toHaveValue('Te extrañamos');
    expect(screen.getByRole('spinbutton', { name: 'Días sin venir' })).toHaveValue(10);
    expect(screen.getByLabelText('Fecha y hora (Colombia)')).toHaveValue('2026-11-25T08:00');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    // Act
    await user.clear(nombre());
    await user.type(nombre(), 'Te extrañamos mucho');
    await user.click(boton('Guardar cambios'));

    // Assert
    expect(await confirmacion()).toHaveTextContent('Campaña programada.');
    expect(mockPut).toHaveBeenCalledWith('/admin/campanas/4', {
      nombre: 'Te extrañamos mucho', segmento: 'INACTIVOS', dias: 10, canal: 'WHATSAPP', id_plantilla: 3,
      mensaje: MENSAJE, tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00',
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Nueva campaña' })).toBeInTheDocument();
  });

  test('should edit a campaign without days nor template as manual and go back to a new one when the edition is cancelled', async () => {
    // Arrange
    campanas = [{ ...CAMPANA, segmento: 'TODOS', dias_inactividad: null, tipo_disparo: 'AUTOMATICO' }];
    const { user } = abrirCampanas();
    await user.click(boton('Editar', await tarjeta('Te extrañamos')));
    expect(screen.getByRole('combobox', { name: 'Envío' })).toHaveValue('MANUAL');
    expect(screen.getByRole('combobox', { name: 'Plantilla' })).toHaveValue('');

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancelar edición' }));

    // Assert
    expect(screen.getByRole('heading', { name: 'Nueva campaña' })).toBeInTheDocument();
    expect(nombre()).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Segmento' })).toHaveValue('INACTIVOS');
  });
});

// ---------------------------------------------------------------------------
describe('CampanasPage: enviar y cancelar una campaña', () => {
  // El resumen como lo arma resumenCampana (backend/src/lib/campanas.js), con los omitidos de la Ley 2300.
  const resumen = (r) => ({ omitidos: 0, omitidosPorMotivo: {}, canal: 'WHATSAPP', cerroFranja: false, ...r });

  test('should send the campaign, show the summary and open the recipients when some are left to send by hand', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: { resumen: resumen({ destinatarios: 3, enviados: 1, pendientes: 1, fallidos: 1 }) } }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Enviar ahora', await tarjeta('Te extrañamos')));

    // Assert
    const aviso = await confirmacion();
    expect(aviso).toHaveTextContent('«Te extrañamos»: 3 destinatarios · 1 enviados · 1 por enviar a mano · 1 fallidos · 0 omitidos por la Ley 2300.');
    expect(aviso).not.toHaveTextContent('Se cerró el horario permitido');
    expect(window.confirm).toHaveBeenCalledWith('¿Enviar ahora «Te extrañamos»? Se calcula el segmento en este momento.');
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/4/ejecutar');
    expect(await screen.findByRole('dialog', { name: 'Destinatarios de «Te extrañamos»' })).toBeInTheDocument();
  });

  test('should not open the recipients when every message went out', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: { resumen: resumen({ destinatarios: 2, enviados: 2, pendientes: 0, fallidos: 0 }) } }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Enviar ahora', await tarjeta('Te extrañamos')));

    // Assert
    expect(await confirmacion()).toHaveTextContent('2 destinatarios · 2 enviados · 0 por enviar a mano · 0 fallidos · 0 omitidos por la Ley 2300.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(llamadasGet(/destinatarios/)).toHaveLength(0);
  });

  test('should count the omitted members and open the recipients to see why when the law left some out', async () => {
    // Arrange: nadie queda por enviar a mano, pero a 2 no se les envio por la ley
    mockPost = vi.fn(async () => ({
      data: { resumen: resumen({ destinatarios: 3, enviados: 1, pendientes: 0, fallidos: 0, omitidos: 2, omitidosPorMotivo: { NO_AUTORIZA: 2 } }) },
    }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Enviar ahora', await tarjeta('Te extrañamos')));

    // Assert
    expect(await confirmacion()).toHaveTextContent('«Te extrañamos»: 3 destinatarios · 1 enviados · 0 por enviar a mano · 0 fallidos · 2 omitidos por la Ley 2300.');
    expect(await screen.findByRole('dialog', { name: 'Destinatarios de «Te extrañamos»' })).toBeInTheDocument();
    expect(llamadasGet(/destinatarios/)).toEqual(['/admin/campanas/4/destinatarios']);
  });

  test('should explain that the pending ones go out in the next slot when the allowed schedule closed during the sending', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({
      data: { resumen: resumen({ destinatarios: 3, enviados: 1, pendientes: 2, fallidos: 0, cerroFranja: true }) },
    }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Enviar ahora', await tarjeta('Te extrañamos')));

    // Assert
    expect(await confirmacion()).toHaveTextContent(
      '«Te extrañamos»: 3 destinatarios · 1 enviados · 2 por enviar a mano · 0 fallidos · 0 omitidos por la Ley 2300. Se cerró el horario permitido: los pendientes salen en la siguiente franja.',
    );
  });

  test('should say that the campaign was left scheduled and not open the recipients when Enviar ahora is pressed outside the schedule', async () => {
    // Arrange: el 202 de POST /admin/campanas/:id/ejecutar un domingo
    const MENSAJE_202 = `Ahora no se puede enviar. La Ley 2300 de 2023 solo permite enviar mensajes ${TEXTO_HORARIO}. `
      + 'El siguiente horario permitido es el lunes 23 de noviembre a las 7:00 a. m. '
      + 'La campaña quedó programada para el lunes 23 de noviembre a las 7:00 a. m.';
    horario = FUERA_DE_HORARIO;
    mockPost = vi.fn(async () => ({ data: { programada: true, message: MENSAJE_202, siguiente: '2026-11-23T12:00:00.000Z', campana: CAMPANA } }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Enviar ahora', await tarjeta('Te extrañamos')));

    // Assert
    expect(within(await confirmacion()).getByText(MENSAJE_202)).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/4/ejecutar');
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/campanas')).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(llamadasGet(/destinatarios/)).toHaveLength(0);
  });

  test.each([
    ['send', 'Enviar ahora'],
    ['cancel', 'Cancelar'],
  ])('should not %s anything when the admin does not confirm', async (_accion, nombreBoton) => {
    // Arrange
    window.confirm.mockReturnValue(false);
    const { user } = abrirCampanas();

    // Act
    await user.click(boton(nombreBoton, await tarjeta('Te extrañamos')));

    // Assert
    expect(window.confirm).toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test.each([
    ['Enviar ahora', { message: 'La campaña ya se envió.' }, 'La campaña ya se envió.'],
    ['Enviar ahora', {}, 'No se pudo enviar la campaña.'],
    ['Cancelar', { message: 'Solo se puede cancelar una campaña que no se ha enviado.' }, 'Solo se puede cancelar una campaña que no se ha enviado.'],
    ['Cancelar', {}, 'No se pudo cancelar la campaña.'],
  ])('should show the error when "%s" fails: %j', async (nombreBoton, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirCampanas();

    // Act
    await user.click(boton(nombreBoton, await tarjeta('Te extrañamos')));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
  });

  test('should cancel the campaign and reload the list when the admin confirms', async () => {
    // Arrange
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Cancelar', await tarjeta('Te extrañamos')));

    // Assert
    await waitFor(() => expect(mockGet.mock.calls.filter(([url]) => url === '/admin/campanas')).toHaveLength(2));
    expect(window.confirm).toHaveBeenCalledWith('¿Cancelar «Te extrañamos»?');
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/4/cancelar');
  });
});

// ---------------------------------------------------------------------------
describe('CampanasPage: el horario de la Ley 2300 (RQNF-16)', () => {
  test('should remind the allowed schedule and that only who accepted receives the campaigns when messages can be sent now', async () => {
    // Act
    abrirCampanas();
    await tarjeta('Te extrañamos');

    // Assert
    expect(avisoHorario()).toHaveTextContent(
      'Las campañas solo salen de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos, '
      + 'y solo a quienes aceptaron mensajes comerciales por ese canal (Ley 2300 de 2023).',
    );
    expect(avisoHorario()).toHaveClass('alert-info');
  });

  test('should warn that nothing can be sent now and say when Enviar ahora would leave the campaign scheduled when it is outside the schedule', async () => {
    // Arrange
    horario = FUERA_DE_HORARIO;

    // Act
    abrirCampanas();
    await tarjeta('Te extrañamos');

    // Assert: el texto completo. Termina en el «a. m.» de siguiente_texto, sin otro punto detras
    // (antes la pagina agregaba uno y quedaba «a. m..»).
    await waitFor(() => expect(avisoHorario()).toHaveClass('alert-warning'));
    expect(within(avisoHorario()).getByText(
      'Ahora no se pueden enviar mensajes: la Ley 2300 de 2023 solo lo permite de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados '
      + 'de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos. Si pulsas «Enviar ahora», la campaña queda programada para el '
      + 'lunes 23 de noviembre a las 7:00 a. m.',
    )).toBeInTheDocument();
    expect(avisoHorario()).not.toHaveTextContent('a. m..');
    expect(avisoHorario()).not.toHaveTextContent('Las campañas solo salen');
  });

  test('should keep the general reminder of the schedule when the server does not say whether messages can be sent now', async () => {
    // Arrange: la respuesta de un backend anterior a RQNF-16
    horario = undefined;

    // Act
    abrirCampanas();
    await tarjeta('Te extrañamos');

    // Assert
    expect(avisoHorario()).toHaveClass('alert-info');
    expect(avisoHorario()).toHaveTextContent(`Las campañas solo salen ${TEXTO_HORARIO}, y solo a quienes aceptaron mensajes comerciales por ese canal (Ley 2300 de 2023).`);
  });
});

// ---------------------------------------------------------------------------
describe('CampanasPage: reintentar los pendientes (RQNF-16)', () => {
  test('should offer Reintentar only when a sent campaign still has pending recipients', async () => {
    // Arrange
    campanas = [CAMPANA, ENVIADA, { ...ENVIADA, id_campana: 8, nombre: 'Ya salió toda', enviados: 2, pendientes: 0 }];

    // Act
    abrirCampanas();

    // Assert
    expect(boton('Reintentar', await tarjeta('Vuelve en diciembre'))).toBeInTheDocument();
    expect(within(await tarjeta('Ya salió toda')).queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument();
    expect(within(await tarjeta('Te extrañamos')).queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument();
  });

  test('should process the pending recipients again, show the answer of the server and reload the list when Reintentar is pressed', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({
      data: { message: 'Reintento hecho: 1 enviados, 0 pendientes, 0 fallidos y 0 omitidos.', campana: ENVIADA },
    }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Reintentar', await tarjeta('Vuelve en diciembre')));

    // Assert
    expect(await confirmacion()).toHaveTextContent('«Vuelve en diciembre»: Reintento hecho: 1 enviados, 0 pendientes, 0 fallidos y 0 omitidos.');
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/5/reintentar');
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/campanas')).toHaveLength(2);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  // El 409 FUERA_DE_HORARIO de POST /admin/campanas/:id/reintentar.
  const FUERA_409 = `Ahora no se puede enviar. La Ley 2300 de 2023 solo permite enviar mensajes ${TEXTO_HORARIO}. `
    + 'El siguiente horario permitido es el lunes 23 de noviembre a las 7:00 a. m.';

  test.each([
    ['the message of the API', { status: 409, code: 'FUERA_DE_HORARIO', message: FUERA_409 }, FUERA_409],
    ['a generic message', {}, 'No se pudo reintentar la campaña.'],
  ])('should show %s when the campaign cannot be retried', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Reintentar', await tarjeta('Vuelve en diciembre')));

    // Assert
    expect(within(await screen.findByRole('alert')).getByText(texto)).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('CampanasPage: los destinatarios y el envío a mano por WhatsApp', () => {
  const abrirDestinatarios = async () => {
    const r = abrirCampanas();
    await r.user.click(boton('Destinatarios', await tarjeta('Vuelve en diciembre')));
    return { ...r, modal: await screen.findByRole('dialog', { name: 'Destinatarios de «Vuelve en diciembre»' }) };
  };
  const fila = (modal, nombreMiembro) => within(modal).getByText(nombreMiembro).closest('.tarjeta-fila');

  test('should show the state and the message of each recipient and the WhatsApp button only for the ones left to send', async () => {
    // Act
    const { modal } = await abrirDestinatarios();

    // Assert
    const ana = fila(modal, 'Ana Ruiz');
    expect(within(ana).getByText('Por enviar')).toHaveClass('badge--warn');
    expect(ana).toHaveTextContent('Hola Ana, te esperamos.');
    expect(within(ana).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    const beto = fila(modal, 'Beto Gil');
    expect(within(beto).getByText('Falló')).toHaveClass('badge--err');
    expect(within(beto).getByText('Sin teléfono')).toBeInTheDocument();
    const carla = fila(modal, 'Carla Paz');
    expect(within(carla).getByText('Enviado')).toHaveClass('badge--ok');
    expect(within(carla).queryByRole('button')).not.toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/campanas/5/destinatarios');
  });

  /** Despues del envio a mano, la lista vuelve del servidor con Ana en `estado` (y su motivo). */
  const despuesDelEnvio = (estado, motivo = null) => {
    const getNormal = apiQueResponde();
    mockGet.mockImplementation(async (url) => {
      if (url === '/admin/campanas/5/destinatarios') {
        return { data: { campana: ENVIADA, horario, destinatarios: [{ ...DESTINATARIOS[0], estado_envio: estado, motivo }] } };
      }
      return getNormal(url);
    });
  };
  // 201 de POST /admin/campanas/:id/destinatarios/:idMiembro/enviado (registrarEnvioManual).
  const constancia = (extra = {}) => ({
    duplicado: false,
    destinatario: { id_campana_destinatario: 131, estado_envio: 'ENVIADO', fecha_envio: '2026-11-20T15:00:00.000Z' },
    mensaje: `Hola Ana, te esperamos.${PIE_BAJA}`,
    telefono: '573001234567',
    ...extra,
  });

  // RQNF-16: antes el chat se abria con el texto de la lista y la constancia iba despues. Ahora el
  // clic abre una pestaña en blanco, se pide la constancia y solo entonces la pestaña va a wa.me,
  // con el telefono y el texto (con el enlace de baja) que devuelve el servidor.
  test('should record the delivery first and then open WhatsApp with the phone and the message of the server when the admin sends one by hand', async () => {
    // Arrange: el servidor contesta con otro telefono y con el pie de baja, para saber de donde sale lo que se abre
    mockPost = vi.fn(async () => ({ data: constancia({ telefono: '573005550000' }) }));
    const { user, modal } = await abrirDestinatarios();
    despuesDelEnvio('ENVIADO');

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(await within(modal).findByText('Enviado')).toHaveClass('badge--ok');
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    // El cuerpo va vacio: el texto lo arma el servidor, no el panel.
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/5/destinatarios/41/enviado', {});
    expect(ventana.location.replace).toHaveBeenCalledTimes(1);
    expect(ventana.location.replace).toHaveBeenCalledWith(
      `https://wa.me/573005550000?text=${encodeURIComponent(`Hola Ana, te esperamos.${PIE_BAJA}`)}`,
    );
    // La constancia va antes de llevar la pestaña a WhatsApp, y WhatsApp no puede tocar el panel.
    expect(mockPost.mock.invocationCallOrder[0]).toBeLessThan(ventana.location.replace.mock.invocationCallOrder[0]);
    expect(ventana.opener).toBeNull();
    expect(ventana.close).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  // RQNF-16: el escenario viejo («se abrio WhatsApp pero no quedo constancia», con el boton en
  // «Abierto») ya no existe: sin constancia no se abre el chat. Este es el equivalente.
  test.each([
    ['the message of the API', { status: 404, code: 'NOT_FOUND', message: 'Ese miembro no es destinatario de la campaña.' }, 'Ese miembro no es destinatario de la campaña.'],
    ['a generic message', {}, 'No se pudo dejar constancia del envío; no se abrió WhatsApp.'],
  ])('should close the blank tab without opening WhatsApp and show %s when the delivery cannot be recorded', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user, modal } = await abrirDestinatarios();

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(within(await screen.findByRole('alert')).getByText(texto)).toBeInTheDocument();
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    // El boton sigue ofreciendo el envio: no dice «Abierto» porque no se abrio nada.
    expect(await within(fila(modal, 'Ana Ruiz')).findByRole('button', { name: 'WhatsApp' })).toBeEnabled();
    expect(within(modal).queryByRole('button', { name: 'Abierto' })).not.toBeInTheDocument();
  });

  test('should not open WhatsApp, say why and show the member as omitted when the law does not allow the contact', async () => {
    // Arrange: 409 CONTACTO_NO_PERMITIDO; el servidor deja al destinatario OMITIDO con su motivo
    mockPost = vi.fn(async () => {
      throw { status: 409, code: 'CONTACTO_NO_PERMITIDO', message: 'Ana no ha aceptado recibir mensajes comerciales del gimnasio.' };
    });
    const { user, modal } = await abrirDestinatarios();
    despuesDelEnvio('OMITIDO', 'NO_AUTORIZA');

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(within(await screen.findByRole('alert')).getByText('No se abrió WhatsApp: Ana no ha aceptado recibir mensajes comerciales del gimnasio.')).toBeInTheDocument();
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);
    expect(await within(modal).findByText('Omitido')).toBeInTheDocument();
    expect(fila(modal, 'Ana Ruiz')).toHaveTextContent('No aceptó mensajes comerciales');
    expect(within(modal).queryByRole('button', { name: /WhatsApp|Abierto/ })).not.toBeInTheDocument();
  });

  test('should not open a second chat nor show an error when the server says the delivery was already recorded', async () => {
    // Arrange: el 200 con duplicado: true de un doble clic (o de otra pestaña)
    mockPost = vi.fn(async () => ({ data: constancia({ duplicado: true, telefono: undefined }) }));
    const { user, modal } = await abrirDestinatarios();
    despuesDelEnvio('ENVIADO');

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(await within(modal).findByText('Enviado')).toHaveClass('badge--ok');
    expect(ventana.location.replace).not.toHaveBeenCalled();
    expect(ventana.close).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should ask the server only once and say Revisando when the admin clicks another recipient while the first one is on its way', async () => {
    // Arrange: dos pendientes con telefono y una constancia que no llega hasta que el test lo diga
    destinatarios = [DESTINATARIOS[0], destinatario(44, 'Dora Mesa', 'PENDIENTE', '573152223344', 'Hola Dora, te esperamos.')];
    let responder;
    mockPost = vi.fn(() => new Promise((resolve) => { responder = resolve; }));
    const { user, modal } = await abrirDestinatarios();

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));
    const revisando = await within(fila(modal, 'Ana Ruiz')).findByRole('button', { name: 'Revisando…' });
    await user.click(within(fila(modal, 'Dora Mesa')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(revisando).toBeDisabled();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/5/destinatarios/41/enviado', {});
    expect(window.open).toHaveBeenCalledTimes(1);

    // Act: llega la constancia de Ana
    responder({ data: constancia() });

    // Assert: se abre un solo chat, el de Ana, y los botones vuelven a servir
    await waitFor(() => expect(ventana.location.replace).toHaveBeenCalledTimes(1));
    expect(await within(fila(modal, 'Dora Mesa')).findByRole('button', { name: 'WhatsApp' })).toBeEnabled();
    await waitFor(() => expect(within(modal).queryByRole('button', { name: 'Revisando…' })).not.toBeInTheDocument());
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test('should mark the button as opened when the chat opened but the recipients cannot be reloaded', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: constancia() }));
    const { user, modal } = await abrirDestinatarios();
    const getNormal = apiQueResponde();
    mockGet.mockImplementation(async (url) => {
      if (url === '/admin/campanas/5/destinatarios') throw { status: 503, message: 'Sin base' };
      return getNormal(url);
    });

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert: la lista se queda como estaba, pero el boton avisa que ese chat ya se abrio
    expect(await within(fila(modal, 'Ana Ruiz')).findByRole('button', { name: 'Abierto' })).toBeEnabled();
    expect(ventana.location.replace).toHaveBeenCalledWith(
      `https://wa.me/573001234567?text=${encodeURIComponent(`Hola Ana, te esperamos.${PIE_BAJA}`)}`,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should open the chat with the phone and the text of the list when the server only confirms the delivery', async () => {
    // Arrange: un backend anterior a RQNF-16 contesta solo { destinatario }
    mockPost = vi.fn(async () => ({ data: { destinatario: { id_campana_destinatario: 131, estado_envio: 'ENVIADO', fecha_envio: '2026-11-20T15:00:00.000Z' } } }));
    const { user, modal } = await abrirDestinatarios();
    despuesDelEnvio('ENVIADO');

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    await waitFor(() => expect(ventana.location.replace).toHaveBeenCalledWith(
      `https://wa.me/573001234567?text=${encodeURIComponent('Hola Ana, te esperamos.')}`,
    ));
    expect(await within(modal).findByText('Enviado')).toHaveClass('badge--ok');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('should close the recipients when Escape is pressed', async () => {
    // Arrange
    const { user } = await abrirDestinatarios();

    // Act
    await user.keyboard('{Escape}');

    // Assert
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(boton('Destinatarios', await tarjeta('Vuelve en diciembre'))).toBeInTheDocument();
  });

  test('should show why each member was left out or is still waiting and hide the message of the omitted ones when the law kept the campaign from some recipients', async () => {
    // Arrange: los motivos de campana_destinatario.motivo (migracion 018)
    destinatarios = [
      destinatario(41, 'Ana Ruiz', 'OMITIDO', '573001234567', 'Hola Ana, te esperamos.', 'NO_AUTORIZA'),
      destinatario(42, 'Beto Gil', 'OMITIDO', '573002223344', 'Hola Beto, te esperamos.', 'CANAL_NO_AUTORIZADO'),
      destinatario(43, 'Carla Paz', 'OMITIDO', '573109876543', 'Hola Carla, te esperamos.', 'FRECUENCIA'),
      destinatario(44, 'Dora Mesa', 'PENDIENTE', '573152223344', 'Hola Dora, te esperamos.', 'FUERA_DE_HORARIO'),
      destinatario(45, 'Eva Lara', 'FALLIDO', null, 'Hola Eva, te esperamos.', 'SIN_TELEFONO'),
      destinatario(46, 'Fabio Rey', 'OMITIDO', '573004445566', 'Hola Fabio, te esperamos.', 'MOTIVO_NUEVO'),
    ];

    // Act
    const { modal } = await abrirDestinatarios();

    // Assert
    const ana = fila(modal, 'Ana Ruiz');
    expect(within(ana).getByText('Omitido')).toHaveClass('badge');
    expect(within(ana).getByText('No aceptó mensajes comerciales')).toBeInTheDocument();
    expect(ana).not.toHaveTextContent('Hola Ana, te esperamos.');
    expect(ana).toHaveStyle({ opacity: '0.7' });
    expect(within(ana).queryByRole('button')).not.toBeInTheDocument();
    expect(within(fila(modal, 'Beto Gil')).getByText('No autorizó este canal')).toBeInTheDocument();
    expect(within(fila(modal, 'Carla Paz')).getByText('Ya se le contactó (hoy, u otro canal esta semana)')).toBeInTheDocument();
    // El que espera la siguiente franja sigue pendiente: se ve su mensaje y se le puede escribir a mano.
    const dora = fila(modal, 'Dora Mesa');
    expect(within(dora).getByText('Por enviar')).toHaveClass('badge--warn');
    expect(within(dora).getByText('Fuera del horario permitido: sale en la siguiente franja')).toBeInTheDocument();
    expect(dora).toHaveTextContent('Hola Dora, te esperamos.');
    expect(dora).toHaveStyle({ opacity: '1' });
    expect(within(dora).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    const eva = fila(modal, 'Eva Lara');
    expect(within(eva).getByText('Sin teléfono válido')).toBeInTheDocument();
    expect(within(eva).getByText('Sin teléfono')).toBeInTheDocument();
    // Un motivo que la pagina no conoce se muestra tal cual.
    expect(within(fila(modal, 'Fabio Rey')).getByText('MOTIVO_NUEVO')).toBeInTheDocument();
  });

  test('should not offer WhatsApp buttons when the campaign went by email', async () => {
    // Arrange
    campanas = [{ ...ENVIADA, canal: 'EMAIL' }];

    // Act
    const { modal } = await abrirDestinatarios();

    // Assert
    expect(within(modal).getByText('Ana Ruiz')).toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(within(modal).queryByText('Sin teléfono')).not.toBeInTheDocument();
  });

  test('should say that nobody was in the segment and close when the campaign had no recipients', async () => {
    // Arrange
    destinatarios = [];
    const { user, modal } = await abrirDestinatarios();
    expect(modal).toHaveTextContent('Nadie cayó en el segmento cuando se envió.');

    // Act
    await user.click(within(modal).getByText('Cerrar', { selector: 'footer button' }));

    // Assert
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test.each([
    ['the message of the API', { message: 'Campaña no encontrada.' }, 'Campaña no encontrada.'],
    ['a generic message', {}, 'No se pudieron cargar los destinatarios.'],
  ])('should show %s when the recipients cannot be loaded', async (_caso, error, texto) => {
    // Arrange
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => {
      if (url.endsWith('/destinatarios')) throw error;
      return getNormal(url);
    });
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Destinatarios', await tarjeta('Vuelve en diciembre')));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('CampanasPage: las plantillas', () => {
  const tarjetaPlantilla = (nombrePlantilla) => screen.getByText(nombrePlantilla, { selector: 'strong' }).closest('article');

  test('should list the templates with the action to turn each one on or off', async () => {
    // Act
    abrirCampanas();
    await tarjeta('Te extrañamos');

    // Assert
    expect(tarjetaPlantilla('Regreso')).toHaveTextContent('Hola {primer_nombre}, en {gimnasio} te esperamos.');
    expect(within(tarjetaPlantilla('Regreso')).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    expect(within(tarjetaPlantilla('Vieja')).getByRole('button', { name: 'Activar' })).toBeInTheDocument();
    expect(tarjetaPlantilla('Vieja')).toHaveStyle({ opacity: '0.55' });
  });

  test.each([
    ['Regreso', 'Desactivar', 3, false],
    ['Vieja', 'Activar', 6, true],
  ])('should save the template %s as the opposite when the admin presses %s', async (nombrePlantilla, accion, id, activa) => {
    // Arrange
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');

    // Act
    await user.click(within(tarjetaPlantilla(nombrePlantilla)).getByRole('button', { name: accion }));

    // Assert
    expect(mockPut).toHaveBeenCalledWith(`/admin/plantillas/${id}`, { activa });
    await waitFor(() => expect(mockGet.mock.calls.filter(([url]) => url === '/admin/plantillas')).toHaveLength(2));
  });

  test.each([
    ['the message of the API', { message: 'Plantilla no encontrada.' }, 'Plantilla no encontrada.'],
    ['a generic message', {}, 'No se pudo actualizar la plantilla.'],
  ])('should show %s when the template cannot be turned off', async (_caso, error, texto) => {
    // Arrange
    mockPut = vi.fn(async () => { throw error; });
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');

    // Act
    await user.click(within(tarjetaPlantilla('Regreso')).getByRole('button', { name: 'Desactivar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
  });

  test('should create the template with the suggested text and leave the form empty again', async () => {
    // Arrange
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');
    const agregar = boton('Agregar plantilla');
    expect(agregar).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Texto' })).toHaveValue('Hola {primer_nombre}, en {gimnasio} te extrañamos. ¡Vuelve esta semana y retoma tu rutina!');

    // Act
    await user.type(screen.getByRole('textbox', { name: 'Nombre de la plantilla' }), 'Te extrañamos');
    await user.click(agregar);

    // Assert
    expect(mockPost).toHaveBeenCalledWith('/admin/plantillas', {
      nombre: 'Te extrañamos', contenido: 'Hola {primer_nombre}, en {gimnasio} te extrañamos. ¡Vuelve esta semana y retoma tu rutina!',
    });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nombre de la plantilla' })).toHaveValue(''));
  });

  test.each([
    ['the message of the API', { message: 'Ya existe una plantilla con ese nombre.' }, 'Ya existe una plantilla con ese nombre.'],
    ['a generic message', {}, 'No se pudo crear la plantilla.'],
  ])('should keep the template written and show %s when it cannot be created', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');
    await user.type(screen.getByRole('textbox', { name: 'Nombre de la plantilla' }), 'Regreso');
    const texto5 = screen.getByRole('textbox', { name: 'Texto' });
    await user.clear(texto5);
    await user.type(texto5, 'Te esperamos');

    // Act
    await user.click(boton('Agregar plantilla'));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(screen.getByRole('textbox', { name: 'Nombre de la plantilla' })).toHaveValue('Regreso');
    expect(texto5).toHaveValue('Te esperamos');
  });
});
