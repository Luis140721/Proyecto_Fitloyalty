/**
 * CampanasPage (RQF-10) desde lo que hace el administrador: ver las campañas,
 * la vista previa del segmento, crear una campaña (con mensaje escrito o con
 * una plantilla, para enviar ya o programada), editarla, enviarla, cancelarla,
 * ver sus destinatarios y enviar a mano por WhatsApp, y las plantillas.
 *
 * Sale de la sincronizacion de la rama de la semana con develop (#100 y #104):
 * la pagina entro sin tests y la cobertura de lineas del front bajo de 80.
 *
 * El API se simula con vi.mock. window.confirm, window.open y window.scrollTo
 * son espias. La vista previa del segmento espera 250 ms con un setTimeout
 * real: los findBy la esperan.
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
  destinatarios: 0, enviados: 0, fallidos: 0, pendientes: 0,
};
const ENVIADA = {
  ...CAMPANA, id_campana: 5, nombre: 'Vuelve en diciembre', estado: 'ENVIADA', canal: 'WHATSAPP',
  fecha_ejecucion: '2026-11-20T09:00', destinatarios: 3, enviados: 1, fallidos: 1, pendientes: 1,
};
const PLANTILLAS = [
  { id_plantilla: 3, nombre: 'Regreso', contenido: 'Hola {primer_nombre}, en {gimnasio} te esperamos.', activa: true },
  { id_plantilla: 6, nombre: 'Vieja', contenido: 'Texto viejo de la plantilla', activa: false },
];
const destinatario = (id, nombre, estado, telefono, mensaje) => ({
  id_campana_destinatario: 90 + id, id_miembro: id, nombre, estado_envio: estado, fecha_envio: null, telefono, email: null, mensaje,
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

function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/admin/campanas') return { data: { campanas, segmentos: SEGMENTOS, variables: [] } };
    if (url === '/admin/plantillas') return { data: { plantillas } };
    if (url.startsWith('/admin/campanas/segmento?')) {
      if (previa instanceof Error) throw previa;
      return { data: previa };
    }
    const m = /^\/admin\/campanas\/(\d+)\/destinatarios$/.exec(url);
    if (m) return { data: { campana: campanas.find((c) => c.id_campana === Number(m[1])), destinatarios } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const abrirCampanas = () => renderWithProviders(<CampanasPage />, { route: '/admin/campanas' });
const tarjeta = async (nombre) => (await screen.findByText(nombre, { selector: 'strong' })).closest('article');
const boton = (nombre, dentro = document.body) => within(dentro).getByRole('button', { name: new RegExp(`${nombre}$`) });
const nombre = () => screen.getByRole('textbox', { name: 'Nombre' });
const mensaje = () => screen.getByRole('textbox', { name: 'Mensaje' });
const llamadasGet = (patron) => mockGet.mock.calls.map(([url]) => url).filter((url) => patron.test(url));

beforeEach(() => {
  campanas = [CAMPANA, ENVIADA];
  plantillas = PLANTILLAS;
  previa = { segmento: 'INACTIVOS', dias: 7, total: 3, con_telefono: 2, con_correo: 1, muestra: [] };
  destinatarios = DESTINATARIOS;
  mockGet = apiQueResponde();
  mockPost = vi.fn(async () => ({ data: {} }));
  mockPut = vi.fn(async () => ({ data: {} }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockImplementation(() => null);
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
    expect(enviada).toHaveTextContent('3 destinatarios · 1 enviados · 1 por enviar · 1 fallidos');
    expect(boton('Destinatarios', enviada)).toBeInTheDocument();
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
  test('should say how many members would receive the campaign today and how many have phone and email', async () => {
    // Act
    abrirCampanas();

    // Assert
    expect(await screen.findByText('Hoy la recibirían 3 miembros (2 con teléfono, 1 con correo).')).toBeInTheDocument();
    expect(llamadasGet(/segmento\?/)).toEqual(['/admin/campanas/segmento?segmento=INACTIVOS']);
    expect(screen.getByRole('spinbutton', { name: 'Días sin venir' })).toHaveAttribute('placeholder', '7');
  });

  test.each([
    ['NUEVOS', 'Registrados hace (días)', '30'],
    ['PROXIMOS_A_VENCER', 'Vence en (días)', '7'],
  ])('should ask the days with its own label and send them when the segment is %s', async (segmento, etiqueta, porDefecto) => {
    // Arrange
    previa = { total: 1, con_telefono: 1, con_correo: 0 };
    const { user } = abrirCampanas();
    await tarjeta('Te extrañamos');

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: 'Segmento' }), segmento);
    const dias = screen.getByRole('spinbutton', { name: etiqueta });
    await user.type(dias, '15');

    // Assert
    expect(dias).toHaveAttribute('placeholder', porDefecto);
    expect(await screen.findByText('Hoy la recibirían 1 miembro (1 con teléfono, 0 con correo).')).toBeInTheDocument();
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
    expect(await screen.findByRole('status')).toHaveTextContent('Campaña guardada. Pulsa «Enviar ahora» cuando quieras lanzarla.');
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
    expect(await screen.findByRole('status')).toHaveTextContent('Campaña programada. El servidor la envía a la hora indicada.');
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
    expect(await screen.findByRole('status')).toHaveTextContent('Campaña programada.');
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
  test('should send the campaign, show the summary and open the recipients when some are left to send by hand', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: { resumen: { destinatarios: 3, enviados: 1, pendientes: 1, fallidos: 1 } } }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Enviar ahora', await tarjeta('Te extrañamos')));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('«Te extrañamos»: 3 destinatarios · 1 enviados · 1 por enviar a mano · 1 fallidos.');
    expect(window.confirm).toHaveBeenCalledWith('¿Enviar ahora «Te extrañamos»? Se calcula el segmento en este momento.');
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/4/ejecutar');
    expect(await screen.findByRole('dialog', { name: 'Destinatarios de «Te extrañamos»' })).toBeInTheDocument();
  });

  test('should not open the recipients when every message went out', async () => {
    // Arrange
    mockPost = vi.fn(async () => ({ data: { resumen: { destinatarios: 2, enviados: 2, pendientes: 0, fallidos: 0 } } }));
    const { user } = abrirCampanas();

    // Act
    await user.click(boton('Enviar ahora', await tarjeta('Te extrañamos')));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('2 destinatarios · 2 enviados · 0 por enviar a mano · 0 fallidos.');
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

  test('should open WhatsApp with the message, record the delivery and reload the recipients when the admin sends one by hand', async () => {
    // Arrange
    const { user, modal } = await abrirDestinatarios();
    const getNormal = apiQueResponde();
    mockGet.mockImplementation(async (url) => {
      if (url === '/admin/campanas/5/destinatarios') {
        return { data: { campana: ENVIADA, destinatarios: [{ ...DESTINATARIOS[0], estado_envio: 'ENVIADO' }] } };
      }
      return getNormal(url);
    });

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(window.open).toHaveBeenCalledWith(
      `https://wa.me/573001234567?text=${encodeURIComponent('Hola Ana, te esperamos.')}`, '_blank', 'noopener,noreferrer',
    );
    expect(mockPost).toHaveBeenCalledWith('/admin/campanas/5/destinatarios/41/enviado', { mensaje: 'Hola Ana, te esperamos.' });
    expect(await within(modal).findByText('Enviado')).toHaveClass('badge--ok');
    expect(within(modal).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  test.each([
    ['the message of the API', { message: 'Ese miembro no es destinatario de la campaña.' }, 'Ese miembro no es destinatario de la campaña.'],
    ['a generic message', {}, 'Se abrió WhatsApp, pero no se pudo dejar constancia del envío.'],
  ])('should mark the button as opened and show %s when the delivery cannot be recorded', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user, modal } = await abrirDestinatarios();

    // Act
    await user.click(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'WhatsApp' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(within(fila(modal, 'Ana Ruiz')).getByRole('button', { name: 'Abierto' })).toBeInTheDocument();
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
