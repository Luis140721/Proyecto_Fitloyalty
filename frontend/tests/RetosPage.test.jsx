/**
 * RetosPage (RQF-12) desde lo que hace el administrador: ver los retos del
 * gimnasio, crear uno, editarlo, cancelarlo, ver sus participantes e inscribir
 * a los elegibles, y los errores del API en cada paso.
 *
 * Sale de la sincronizacion de la rama de la semana con develop (#100 y #104):
 * la pagina entro sin tests y la cobertura de lineas del front bajo de 80.
 *
 * El API se simula con vi.mock. window.confirm y window.scrollTo son espias.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import RetosPage from '../src/pages/RetosPage';
import { formatearFechaDia } from '../src/fechas';
import { renderWithProviders } from './renderWithProviders';

let mockGet, mockPost, mockPut;
vi.mock('../src/api', () => ({
  api: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a), put: (...a) => mockPut(...a) },
}));

const RETO = {
  id_reto: 9, nombre: 'Noviembre activo', descripcion: null, meta_asistencias: 8, recompensa: 'Batido',
  segmento_elegible: 'INACTIVOS', estado: 'ACTIVO', activo: true, fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30',
  inscritos: 1, completados: 0, avance_promedio: 37.5,
};
const PARTICIPANTES = [
  { id_reto_miembro: 70, id_miembro: 41, nombre: 'Ana Ruiz', documento: '1020', estado: 'COMPLETADO', checkins_acumulados: 8, porcentaje_avance: 100 },
  { id_reto_miembro: 71, id_miembro: 42, nombre: 'Beto Gil', documento: '1030', estado: 'EN_CURSO', checkins_acumulados: 3, porcentaje_avance: 37.5 },
  { id_reto_miembro: 72, id_miembro: 43, nombre: 'Carla Paz', documento: '1040', estado: 'CANCELADO', checkins_acumulados: 1, porcentaje_avance: 12.5 },
];

let retos;
let elegibles;
let participantes;

function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/admin/retos') return { data: { retos } };
    const reto = retos.find((r) => url.startsWith(`/admin/retos/${r.id_reto}/`));
    if (reto && url.endsWith('/participantes')) return { data: { reto, participantes } };
    if (reto && url.endsWith('/elegibles')) return { data: { total: elegibles, miembros: [] } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const abrirRetos = () => renderWithProviders(<RetosPage />, { route: '/admin/retos' });
const tarjeta = async (nombre) => (await screen.findByText(nombre)).closest('article');
const boton = (nombre, dentro = document.body) => within(dentro).getByRole('button', { name: new RegExp(`${nombre}$`) });
const mensaje = (rol) => screen.findByRole(rol);

beforeEach(() => {
  retos = [RETO];
  elegibles = 2;
  participantes = PARTICIPANTES;
  mockGet = apiQueResponde();
  mockPost = vi.fn(async () => ({ data: {} }));
  mockPut = vi.fn(async () => ({ data: {} }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('RetosPage: la lista de retos', () => {
  test('should show each challenge with its state, goal, dates, segment, reward and progress when the page loads', async () => {
    // Arrange
    retos = [
      RETO,
      { ...RETO, id_reto: 10, nombre: 'Diciembre', estado: 'PROGRAMADO', segmento_elegible: 'TODOS', recompensa: null, inscritos: 2, completados: 1, avance_promedio: 140 },
      { ...RETO, id_reto: 11, nombre: 'Octubre', estado: 'COMPLETADO', segmento_elegible: 'ETIQUETA', inscritos: 0, completados: 2 },
      { ...RETO, id_reto: 12, nombre: 'Septiembre', estado: 'CANCELADO' },
    ];

    // Act
    abrirRetos();

    // Assert
    const activo = await tarjeta('Noviembre activo');
    expect(within(activo).getByText('Activo')).toHaveClass('badge--ok');
    expect(activo).toHaveTextContent(`Meta: 8 asistencias · ${formatearFechaDia('2026-11-01')} a ${formatearFechaDia('2026-11-30')} · Inactivos (7 días o más sin venir)`);
    expect(activo).toHaveTextContent('Recompensa: Batido');
    expect(activo).toHaveTextContent('1 inscrito · 0 completados · avance promedio 37.5%');
    expect(within(activo).getByLabelText('Avance promedio 37.5%').firstChild).toHaveStyle({ width: '37.5%' });

    const programado = await tarjeta('Diciembre');
    expect(within(programado).getByText('Programado')).toHaveClass('badge--warn');
    expect(programado).toHaveTextContent('Todos los miembros');
    expect(programado).not.toHaveTextContent('Recompensa');
    expect(programado).toHaveTextContent('2 inscritos · 1 completado');
    // La barra no pasa del 100 %.
    expect(within(programado).getByLabelText('Avance promedio 140%').firstChild).toHaveStyle({ width: '100%' });

    // Un segmento que la pagina no conoce se muestra tal cual.
    expect(await tarjeta('Octubre')).toHaveTextContent('· ETIQUETA');
    expect(within(await tarjeta('Octubre')).getByText('Terminado')).toHaveClass('badge--neutral');
    expect(within(await tarjeta('Septiembre')).getByText('Cancelado')).toHaveClass('badge--err');
    expect(await tarjeta('Septiembre')).toHaveStyle({ opacity: '0.6' });
    expect(mockGet).toHaveBeenCalledWith('/admin/retos');
  });

  test('should offer Edit and Cancel only for the challenges that are still running', async () => {
    // Arrange
    retos = [RETO, { ...RETO, id_reto: 12, nombre: 'Septiembre', estado: 'CANCELADO' }];

    // Act
    abrirRetos();

    // Assert
    const activo = await tarjeta('Noviembre activo');
    expect(boton('Editar', activo)).toBeInTheDocument();
    expect(boton('Cancelar', activo)).toBeInTheDocument();
    const cancelado = await tarjeta('Septiembre');
    expect(boton('Participantes', cancelado)).toBeInTheDocument();
    expect(within(cancelado).queryByRole('button', { name: /Editar|Cancelar/ })).not.toBeInTheDocument();
  });

  test('should invite to create the first challenge when the gym has none', async () => {
    // Arrange
    retos = [];

    // Act
    abrirRetos();

    // Assert
    expect(await screen.findByText('Todavía no hay retos. Crea el primero arriba.')).toBeInTheDocument();
  });

  test.each([
    ['the message of the API', { message: 'No pudimos cargar los retos.' }, 'No pudimos cargar los retos.'],
    ['a generic message', {}, 'No se pudieron cargar los retos.'],
  ])('should show %s when the challenges cannot be loaded', async (_caso, error, texto) => {
    // Arrange
    mockGet = vi.fn(async () => { throw error; });

    // Act
    abrirRetos();

    // Assert
    expect(await mensaje('alert')).toHaveTextContent(texto);
    expect(screen.queryByText('Todavía no hay retos. Crea el primero arriba.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('RetosPage: crear y editar un reto', () => {
  const nombre = () => screen.getByRole('textbox', { name: 'Nombre' });

  test.each([
    ['every member', 'TODOS', 'Reto creado. Cada miembro queda inscrito en su próximo check-in.'],
    ['a segment', 'NUEVOS', 'Reto creado. Usa «Inscribir elegibles» o pide a los miembros que se unan desde la app.'],
  ])('should create the challenge with the goal as a number and explain how members join when it is for %s', async (_caso, segmento, texto) => {
    // Arrange
    const { user } = abrirRetos();
    await tarjeta('Noviembre activo');
    const crear = boton('Crear reto');
    expect(crear).toBeDisabled();

    // Act
    await user.type(nombre(), '12 visitas');
    await user.clear(screen.getByRole('spinbutton', { name: 'Meta (asistencias)' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Meta (asistencias)' }), '10');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-12-31' } });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Quién puede participar' }), segmento);
    await user.type(screen.getByRole('textbox', { name: 'Recompensa' }), 'Batido gratis');
    await user.type(screen.getByRole('textbox', { name: 'Descripción (opcional)' }), 'Ven 10 días');
    await user.click(crear);

    // Assert
    expect(await mensaje('status')).toHaveTextContent(texto);
    expect(mockPost).toHaveBeenCalledWith('/admin/retos', {
      nombre: '12 visitas', descripcion: 'Ven 10 días', meta_asistencias: 10, recompensa: 'Batido gratis',
      segmento_elegible: segmento, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31',
    });
    // El formulario vuelve a quedar vacio y la lista se vuelve a pedir.
    expect(nombre()).toHaveValue('');
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/retos')).toHaveLength(2);
  });

  test('should not send the challenge when the end date is before the start date', async () => {
    // Arrange
    const { user } = abrirRetos();
    await tarjeta('Noviembre activo');
    await user.type(nombre(), '12 visitas');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-12-10' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-12-01' } });

    // Act
    await user.click(boton('Crear reto'));

    // Assert
    expect(await mensaje('alert')).toHaveTextContent('La fecha de fin no puede ser anterior a la de inicio.');
    expect(mockPost).not.toHaveBeenCalled();
  });

  test.each([
    ['the message of the API', { message: 'El reto ya habría terminado: la fecha de fin es anterior a hoy.' }, 'El reto ya habría terminado: la fecha de fin es anterior a hoy.'],
    ['a generic message', {}, 'No se pudo guardar el reto.'],
  ])('should keep what was written and show %s when the challenge cannot be saved', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirRetos();
    await tarjeta('Noviembre activo');
    await user.type(nombre(), '12 visitas');

    // Act
    await user.click(boton('Crear reto'));

    // Assert
    expect(await mensaje('alert')).toHaveTextContent(texto);
    expect(nombre()).toHaveValue('12 visitas');
    expect(boton('Crear reto')).toBeEnabled();
  });

  test('should fill the form with the challenge and save the changes with PUT when the admin edits it', async () => {
    // Arrange
    const { user } = abrirRetos();
    await user.click(boton('Editar', await tarjeta('Noviembre activo')));
    expect(screen.getByRole('heading', { name: 'Editar reto' })).toBeInTheDocument();
    expect(nombre()).toHaveValue('Noviembre activo');
    expect(screen.getByRole('textbox', { name: 'Recompensa' })).toHaveValue('Batido');
    expect(screen.getByRole('textbox', { name: 'Descripción (opcional)' })).toHaveValue('');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    // Act
    await user.clear(nombre());
    await user.type(nombre(), 'Noviembre a fondo');
    await user.click(boton('Guardar cambios'));

    // Assert
    expect(await mensaje('status')).toHaveTextContent('Reto actualizado. El avance de los inscritos se recalculó.');
    expect(mockPut).toHaveBeenCalledWith('/admin/retos/9', {
      nombre: 'Noviembre a fondo', descripcion: '', meta_asistencias: 8, recompensa: 'Batido',
      segmento_elegible: 'INACTIVOS', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30',
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Nuevo reto' })).toBeInTheDocument();
  });

  test('should go back to a new empty challenge when the admin cancels the edition', async () => {
    // Arrange
    const { user } = abrirRetos();
    await user.click(boton('Editar', await tarjeta('Noviembre activo')));

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancelar edición' }));

    // Assert
    expect(screen.getByRole('heading', { name: 'Nuevo reto' })).toBeInTheDocument();
    expect(nombre()).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Cancelar edición' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('RetosPage: cancelar un reto', () => {
  test('should cancel the challenge and reload the list when the admin confirms', async () => {
    // Arrange
    const { user } = abrirRetos();

    // Act
    await user.click(boton('Cancelar', await tarjeta('Noviembre activo')));

    // Assert
    expect(await mensaje('status')).toHaveTextContent('Reto cancelado.');
    expect(window.confirm).toHaveBeenCalledWith('¿Cancelar el reto «Noviembre activo»? Los inscritos dejarán de sumar.');
    expect(mockPost).toHaveBeenCalledWith('/admin/retos/9/cancelar');
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/retos')).toHaveLength(2);
  });

  test('should not cancel anything when the admin does not confirm', async () => {
    // Arrange
    window.confirm.mockReturnValue(false);
    const { user } = abrirRetos();

    // Act
    await user.click(boton('Cancelar', await tarjeta('Noviembre activo')));

    // Assert
    expect(mockPost).not.toHaveBeenCalled();
  });

  test.each([
    ['the message of the API', { message: 'El reto está cancelado.' }, 'El reto está cancelado.'],
    ['a generic message', {}, 'No se pudo cancelar el reto.'],
  ])('should show %s when the challenge cannot be cancelled', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirRetos();

    // Act
    await user.click(boton('Cancelar', await tarjeta('Noviembre activo')));

    // Assert
    expect(await mensaje('alert')).toHaveTextContent(texto);
  });
});

// ---------------------------------------------------------------------------
describe('RetosPage: participantes y elegibles', () => {
  const dialogo = () => screen.findByRole('dialog', { name: 'Participantes de «Noviembre activo»' });

  test('should show the progress and state of each participant when the admin opens a running challenge', async () => {
    // Arrange
    const { user } = abrirRetos();

    // Act
    await user.click(boton('Participantes', await tarjeta('Noviembre activo')));

    // Assert
    const modal = await dialogo();
    const filas = within(modal).getAllByRole('row').slice(1);
    expect(filas.map((f) => f.textContent)).toEqual([
      'Ana Ruiz10208 / 8100%Completado',
      'Beto Gil10303 / 837.5%En curso',
      'Carla Paz10401 / 812.5%Cancelado',
    ]);
    expect(within(filas[0]).getByText('Completado')).toHaveClass('badge--ok');
    expect(within(filas[1]).getByText('En curso')).toHaveClass('badge--neutral');
    expect(within(filas[2]).getByText('Cancelado')).toHaveClass('badge--err');
    expect(within(modal).getByRole('button', { name: 'Inscribir 2 elegibles' })).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/retos/9/participantes');
    expect(mockGet).toHaveBeenCalledWith('/admin/retos/9/elegibles');
  });

  test.each([
    [1, '1 miembro inscrito en «Noviembre activo».'],
    [3, '3 miembros inscritos en «Noviembre activo».'],
  ])('should enroll the eligible members and reload the participants when %i are enrolled', async (inscritos, texto) => {
    // Arrange
    elegibles = 1;
    mockPost = vi.fn(async () => ({ data: { inscritos } }));
    const { user } = abrirRetos();
    await user.click(boton('Participantes', await tarjeta('Noviembre activo')));

    // Act
    await user.click(within(await dialogo()).getByRole('button', { name: 'Inscribir 1 elegible' }));

    // Assert
    expect(await mensaje('status')).toHaveTextContent(texto);
    expect(mockPost).toHaveBeenCalledWith('/admin/retos/9/inscribir', {});
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/retos/9/participantes')).toHaveLength(2);
    expect(mockGet.mock.calls.filter(([url]) => url === '/admin/retos')).toHaveLength(2);
  });

  test.each([
    ['the message of the API', { message: 'El reto ya terminó.' }, 'El reto ya terminó.'],
    ['a generic message', {}, 'No se pudo inscribir a los elegibles.'],
  ])('should show %s when the eligible members cannot be enrolled', async (_caso, error, texto) => {
    // Arrange
    mockPost = vi.fn(async () => { throw error; });
    const { user } = abrirRetos();
    await user.click(boton('Participantes', await tarjeta('Noviembre activo')));

    // Act
    await user.click(within(await dialogo()).getByRole('button', { name: 'Inscribir 2 elegibles' }));

    // Assert
    expect(await mensaje('alert')).toHaveTextContent(texto);
  });

  test('should not ask for eligible members and explain that they join on check-in when an ended challenge for everyone has no participants', async () => {
    // Arrange
    retos = [{ ...RETO, estado: 'COMPLETADO', segmento_elegible: 'TODOS' }];
    participantes = [];
    const { user } = abrirRetos();

    // Act
    await user.click(boton('Participantes', await tarjeta('Noviembre activo')));

    // Assert
    const modal = await dialogo();
    expect(modal).toHaveTextContent('Nadie inscrito todavía. Se inscriben solos en su próximo check-in.');
    expect(within(modal).queryByRole('button', { name: /Inscribir/ })).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/admin/retos/9/elegibles');
  });

  test('should say only that nobody is enrolled when the challenge is for a segment and has no participants nor eligible members', async () => {
    // Arrange
    participantes = [];
    elegibles = 0;
    const { user } = abrirRetos();

    // Act
    await user.click(boton('Participantes', await tarjeta('Noviembre activo')));

    // Assert
    const modal = await dialogo();
    expect(within(modal).getByText('Nadie inscrito todavía.')).toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: /Inscribir/ })).not.toBeInTheDocument();
  });

  test('should close the participants when the admin presses Cerrar', async () => {
    // Arrange
    const { user } = abrirRetos();
    await user.click(boton('Participantes', await tarjeta('Noviembre activo')));
    const modal = await dialogo();

    // Act
    await user.click(within(modal).getByText('Cerrar', { selector: 'footer button' }));

    // Assert
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test.each([
    ['the message of the API', { message: 'Reto no encontrado.' }, 'Reto no encontrado.'],
    ['a generic message', {}, 'No se pudo cargar el detalle.'],
  ])('should show %s when the participants cannot be loaded', async (_caso, error, texto) => {
    // Arrange
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url) => {
      if (url.endsWith('/participantes')) throw error;
      return getNormal(url);
    });
    const { user } = abrirRetos();

    // Act
    await user.click(boton('Participantes', await tarjeta('Noviembre activo')));

    // Assert
    expect(await mensaje('alert')).toHaveTextContent(texto);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
