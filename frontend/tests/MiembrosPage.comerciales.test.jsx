/**
 * RQNF-16 (Ley 2300 de 2023, arts. 2 y 5; #108): la aceptacion de mensajes
 * comerciales en MiembrosPage, desde lo que hace la recepcion y lo que le
 * llega al servidor:
 *
 * - en el alta (paso 5, «Términos»): por defecto nadie acepta; para aceptar
 *   hay que marcar antes un canal, y solo viajan los canales marcados;
 * - en la ficha: el interruptor muestra la decision vigente; apagarlo y
 *   guardar da de baja al miembro, y queda en el historial. La decision solo
 *   viaja en el PUT si se cambio en esa ficha: guardar otro campo no vuelve a
 *   registrar un «si» que el miembro pudo cancelar entre tanto con el enlace;
 * - si el miembro es menor, la decision la toma su representante legal.
 *
 * Sin esa aceptacion el servidor no deja enviarle campañas ni mensajes de
 * retencion, asi que lo que importa aqui es el cuerpo del POST y del PUT
 * (acepta_mensajes_comerciales y canales_comerciales, como los valida
 * backend/src/routes/miembros.js).
 *
 * El API, useAuth y qrcode se simulan con vi.mock. La fecha se fija (solo
 * Date; los timers siguen reales para user-event): el alta propone la fecha
 * de hoy y calcula el vencimiento.
 */
import { describe, expect, test, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
// GET /api/admin/miembros/:id: Ana todavia no ha decidido nada sobre los mensajes comerciales.
const ANA_COMPLETA = {
  ...ANA, tipo_documento: 'CC', fecha_nacimiento: '1990-05-17T00:00:00.000Z', genero: 'Femenino', codigo_pais_telefono: '57',
  ciudad: 'Medellín', direccion: 'Calle 10 # 20-30', contacto_emergencia: 'Luz Pérez', telefono_emergencia: '3110000000',
  condiciones_medicas: '', alergias: '', objetivo: '', nivel_experiencia: '', observaciones: '',
  acepta_mensajes_comerciales: false, canales_comerciales: [], autorizo_datos_sensibles: false, menor_de_edad: false,
};
const SOFIA = { id_miembro: 3, nombre: 'Sofía Gómez', documento: '1033444555', telefono: '3201112233', codigo_qr: 'QR-SOFIA', activo: true };
// Fila del historial como la arma resumenAutorizaciones (backend/src/lib/autorizaciones.js). La pantalla
// muestra la fecha en la zona del navegador: es el mediodia del 20 de octubre en la zona del equipo donde
// corra, para que el dia sea el mismo en Colombia, en UTC o donde sea.
const ACEPTO_EN_PANEL = {
  tipo: 'MENSAJES_COMERCIALES', otorgada: true, version: 'v2', canal: 'PANEL', fecha: new Date(2026, 9, 20, 12, 0, 0).toISOString(),
  registrada_por: 'Luis Admin', texto: '', detalle: null, canales: ['WHATSAPP', 'EMAIL'],
};

let miembros, ana, autorizaciones;

function apiQueResponde() {
  return vi.fn(async (url) => {
    if (url === '/admin/config') return { data: { config: { plan_mensual_valor: '90000.00' } } };
    if (url === '/admin/miembros') return { data: { miembros } };
    if (url === '/admin/miembros/1') return { data: { miembro: ana, autorizaciones } };
    if (url === '/admin/miembros/1/plan') return { data: { plan: null, congelaciones: [] } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const interruptor = (dentro = screen) => dentro.getByRole('switch', { name: /^Mensajes comerciales \(opcional\)/ });
const canal = (nombre, dentro = screen) => within(dentro.getByRole('group', { name: 'Canales autorizados' })).getByRole('checkbox', { name: nombre });

// jsdom no implementa scrollIntoView, y el asistente lo usa para llevarte al primer campo con error.
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterAll(() => { delete Element.prototype.scrollIntoView; });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 27, 10, 0, 0));
  miembros = [ANA];
  ana = ANA_COMPLETA;
  autorizaciones = { version_actual: 'v2', vigentes: {}, historial: [] };
  mockGet = apiQueResponde();
  mockPost = vi.fn(async () => { miembros = [...miembros, SOFIA]; return { data: { miembro: SOFIA } }; });
  mockPut = vi.fn(async () => ({ data: { message: 'Miembro actualizado.' } }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => vi.useRealTimers());

describe('MiembrosPage: los mensajes comerciales en el alta', () => {
  /** Abre el asistente, llena el paso 1 y avanza hasta Terminos (paso 5). */
  const llegarATerminos = async ({ menor = false } = {}) => {
    const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    const { user } = pantalla;
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(screen.getByRole('button', { name: 'Nuevo miembro' }));
    await user.type(screen.getByLabelText(/^Nombre completo/), 'Sofía Gómez');
    await user.type(screen.getByLabelText(/^Número documento/), '1033444555');
    await user.type(screen.getByLabelText(/^Teléfono \/ WhatsApp/), '3201112233');
    if (menor) {
      // Sin fecha de nacimiento, la tarjeta de identidad dice que es menor (misma regla del backend).
      await user.selectOptions(screen.getByLabelText(/^Tipo documento/), 'TI');
      await user.type(screen.getByLabelText(/^Nombre del representante legal/), 'Marta Ruiz');
      await user.selectOptions(screen.getByLabelText(/^Tipo de documento/), 'CC');
      await user.type(screen.getByLabelText(/^Número de documento/), '52111222');
      await user.selectOptions(screen.getByLabelText(/^Parentesco/), 'Madre');
      await user.type(screen.getByLabelText(/^Teléfono del representante/), '310 444 5566');
    }
    for (let paso = 2; paso <= 5; paso += 1) await user.click(screen.getByRole('button', { name: 'Siguiente →' }));
    expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument();
    return pantalla;
  };
  const crear = async (user) => {
    await user.click(screen.getByRole('checkbox', { name: /^Contrato y términos/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Tratamiento de datos/ }));
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
    await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, cuerpo] = mockPost.mock.calls[0];
    expect(url).toBe('/admin/miembros');
    return cuerpo;
  };

  test('should register that the member does not accept commercial messages when the switch is left as it comes', async () => {
    // Arrange
    const { user } = await llegarATerminos();
    expect(interruptor()).not.toBeChecked();
    expect(interruptor()).toBeDisabled();
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(canal('Correo')).not.toBeChecked();

    // Act
    const cuerpo = await crear(user);

    // Assert: aceptar los terminos y el tratamiento de datos no es aceptar publicidad
    expect(cuerpo).toMatchObject({ acepto_terminos: true, autorizo_datos: true, acepta_mensajes_comerciales: false, canales_comerciales: [] });
  });

  test('should send the acceptance with only the marked channel when the reception marks WhatsApp and turns the switch on', async () => {
    // Arrange
    const { user } = await llegarATerminos();

    // Act
    await user.click(canal('WhatsApp'));
    await user.click(interruptor());
    expect(interruptor()).toBeChecked();
    const cuerpo = await crear(user);

    // Assert
    expect(cuerpo).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
  });

  test('should send both channels in the order of the server when the member accepts by email and by WhatsApp', async () => {
    // Arrange
    const { user } = await llegarATerminos();

    // Act: primero correo y despues WhatsApp
    await user.click(canal('Correo'));
    await user.click(canal('WhatsApp'));
    await user.click(interruptor());
    const cuerpo = await crear(user);

    // Assert
    expect(cuerpo).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP', 'EMAIL'] });
  });

  // Regresion de la decision 12 de la evidencia: los dos cambios del mismo clic (quitar el canal y
  // apagar la aceptacion) se pisaban, y quedaba WhatsApp marcado con el interruptor apagado.
  test('should leave the switch off and the channel unmarked when the only channel is unmarked after accepting', async () => {
    // Arrange
    const { user } = await llegarATerminos();
    await user.click(canal('WhatsApp'));
    await user.click(interruptor());
    expect(interruptor()).toBeChecked();

    // Act
    await user.click(canal('WhatsApp'));

    // Assert
    expect(canal('WhatsApp')).not.toBeChecked();
    expect(interruptor()).not.toBeChecked();
    expect(interruptor()).toBeDisabled();
    expect(await crear(user)).toMatchObject({ acepta_mensajes_comerciales: false, canales_comerciales: [] });
  });

  test('should not send any channel when the channels are marked but the member did not accept', async () => {
    // Arrange
    const { user } = await llegarATerminos();

    // Act: se marcan los canales y el interruptor se queda apagado
    await user.click(canal('WhatsApp'));
    await user.click(canal('Correo'));
    expect(interruptor()).toBeEnabled();
    expect(interruptor()).not.toBeChecked();
    const cuerpo = await crear(user);

    // Assert
    expect(cuerpo).toMatchObject({ acepta_mensajes_comerciales: false, canales_comerciales: [] });
  });

  // Teclea tambien los datos del representante: con toda la suite en paralelo se acerca a los 5 s por defecto.
  test('should say that the legal representative decides and send the acceptance with the data of the representative when the member is a minor', async () => {
    // Arrange
    const { user } = await llegarATerminos({ menor: true });
    expect(screen.getByText(/El miembro es menor de edad: estas autorizaciones las da su representante legal, Marta Ruiz\./)).toBeInTheDocument();
    expect(screen.getByText('El miembro es menor de edad: esta decisión la toma su representante legal.')).toBeInTheDocument();

    // Act
    await user.click(canal('WhatsApp'));
    await user.click(interruptor());
    await user.click(screen.getByRole('checkbox', { name: /^Representante legal/ }));
    const cuerpo = await crear(user);

    // Assert
    expect(cuerpo).toMatchObject({
      tipo_documento: 'TI',
      acepta_mensajes_comerciales: true,
      canales_comerciales: ['WHATSAPP'],
      autoriza_representante: true,
      representante_nombre: 'Marta Ruiz',
      representante_tipo_documento: 'CC',
      representante_documento: '52111222',
      representante_parentesco: 'Madre',
      representante_telefono: '3104445566',
    });
  }, 15000);
});

describe('MiembrosPage: los mensajes comerciales en la ficha', () => {
  const ficha = () => screen.getByRole('dialog', { name: 'Editar Ana Pérez' });
  const enFicha = () => within(ficha());
  const abrirFichaDeAna = async () => {
    const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
    await pantalla.user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));
    await enFicha().findByRole('heading', { name: 'Plan y cobro' });
    return pantalla;
  };
  const guardar = async (user) => {
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [url, cuerpo] = mockPut.mock.calls[0];
    expect(url).toBe('/admin/miembros/1');
    return cuerpo;
  };

  test('should show the switch off and blocked, with no channel marked, when the member has not accepted', async () => {
    // Act
    await abrirFichaDeAna();

    // Assert
    expect(interruptor(enFicha())).not.toBeChecked();
    expect(interruptor(enFicha())).toBeDisabled();
    expect(canal('WhatsApp', enFicha())).not.toBeChecked();
    expect(canal('Correo', enFicha())).not.toBeChecked();
    expect(enFicha().getByText('Todavía no hay autorizaciones registradas para este miembro.')).toBeInTheDocument();
  });

  test('should show the switch on with the accepted channels and the record of the decision when the member accepted', async () => {
    // Arrange
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP', 'EMAIL'] };
    autorizaciones = { version_actual: 'v2', vigentes: { MENSAJES_COMERCIALES: ACEPTO_EN_PANEL }, historial: [ACEPTO_EN_PANEL] };

    // Act
    await abrirFichaDeAna();

    // Assert
    expect(interruptor(enFicha())).toBeChecked();
    expect(canal('WhatsApp', enFicha())).toBeChecked();
    expect(canal('Correo', enFicha())).toBeChecked();
    expect(enFicha().queryByRole('status')).not.toBeInTheDocument();
    const [constancia] = enFicha().getAllByRole('listitem');
    expect(constancia).toHaveTextContent(/^20\/10\/2026/);
    expect(constancia).toHaveTextContent(/· Mensajes comerciales: otorgada \(WhatsApp y correo\) · texto v2 · panel del gimnasio · registró Luis Admin$/);
  });

  test('should warn that the member stops receiving campaigns and send the cancellation when the switch is turned off and saved', async () => {
    // Arrange
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP', 'EMAIL'] };
    mockPut = vi.fn(async () => ({ data: { message: 'Miembro actualizado. El miembro ya no recibirá mensajes comerciales.' } }));
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(interruptor(enFicha()));

    // Assert: se avisa antes de guardar
    expect(within(enFicha().getByRole('status')).getByText(
      'Al guardar, el miembro deja de recibir campañas y mensajes de retención. Queda constancia en el historial.',
    )).toBeInTheDocument();

    // Act
    const cuerpo = await guardar(user);

    // Assert: la baja viaja sin canales
    expect(cuerpo).toMatchObject({ acepta_mensajes_comerciales: false, canales_comerciales: [] });
    expect(await screen.findByText('Miembro actualizado. El miembro ya no recibirá mensajes comerciales.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should register the acceptance with the marked channel when a member who had not accepted accepts by email', async () => {
    // Arrange
    mockPut = vi.fn(async () => ({ data: { message: 'Miembro actualizado. Quedó registrada la aceptación de mensajes comerciales.' } }));
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(canal('Correo', enFicha()));
    await user.click(interruptor(enFicha()));
    expect(interruptor(enFicha())).toBeChecked();
    // No hay nada que advertir: no se le esta quitando nada.
    expect(enFicha().queryByRole('status')).not.toBeInTheDocument();
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['EMAIL'] });
    expect(await screen.findByText('Miembro actualizado. Quedó registrada la aceptación de mensajes comerciales.')).toBeInTheDocument();
  });

  test('should keep the acceptance with the channel that is left when one of the two channels is unmarked', async () => {
    // Arrange
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP', 'EMAIL'] };
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(canal('WhatsApp', enFicha()));
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['EMAIL'] });
  });

  test('should turn the switch off, warn and send the cancellation when the last channel is unmarked', async () => {
    // Arrange
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] };
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(canal('WhatsApp', enFicha()));

    // Assert
    expect(canal('WhatsApp', enFicha())).not.toBeChecked();
    expect(interruptor(enFicha())).not.toBeChecked();
    expect(interruptor(enFicha())).toBeDisabled();
    expect(enFicha().getByRole('status')).toHaveTextContent('Al guardar, el miembro deja de recibir campañas y mensajes de retención.');
    expect(await guardar(user)).toMatchObject({ acepta_mensajes_comerciales: false, canales_comerciales: [] });
  });

  test('should send the acceptance with both channels when a channel is added to the one the member had', async () => {
    // Arrange
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] };
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(canal('Correo', enFicha()));
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP', 'EMAIL'] });
  });

  /*
   * La aceptacion comercial solo viaja si se cambio en esta ficha. Si viajara siempre, y el miembro
   * se diera de baja con el enlace o en la app mientras la ficha esta abierta, guardar cualquier otro
   * campo le volveria a registrar una aceptacion que el ya habia cancelado (Ley 2300, art. 5).
   */
  const sinDecisionComercial = (cuerpo) => {
    expect(cuerpo).not.toHaveProperty('acepta_mensajes_comerciales');
    expect(cuerpo).not.toHaveProperty('canales_comerciales');
  };

  test('should not send the commercial decision when only another field of a member who had accepted is edited', async () => {
    // Arrange: Ana acepto por WhatsApp; en la ficha solo se le corrige la ciudad
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] };
    const { user } = await abrirFichaDeAna();
    const ciudad = enFicha().getByRole('textbox', { name: 'Ciudad' });

    // Act
    await user.clear(ciudad);
    await user.type(ciudad, 'Bello');
    const cuerpo = await guardar(user);

    // Assert: viaja lo que se cambio y lo demas de la ficha, pero no su «si» a los mensajes comerciales
    expect(cuerpo).toMatchObject({ nombre: 'Ana Pérez', ciudad: 'Bello', direccion: 'Calle 10 # 20-30', telefono: '3001234567' });
    sinDecisionComercial(cuerpo);
  });

  test('should not send the commercial decision when the file of a member who has not accepted is saved without touching it', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act
    const cuerpo = await guardar(user);

    // Assert: tampoco viaja un «no» que nadie registro
    expect(cuerpo).toMatchObject({ nombre: 'Ana Pérez', ciudad: 'Medellín' });
    sinDecisionComercial(cuerpo);
  });

  test('should not send the commercial decision when the switch is turned off and on again', async () => {
    // Arrange
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] };
    const { user } = await abrirFichaDeAna();

    // Act: se apaga y se vuelve a dejar como estaba
    await user.click(interruptor(enFicha()));
    expect(interruptor(enFicha())).not.toBeChecked();
    await user.click(interruptor(enFicha()));
    expect(interruptor(enFicha())).toBeChecked();
    const cuerpo = await guardar(user);

    // Assert
    sinDecisionComercial(cuerpo);
  });

  test('should not send the commercial decision when a channel is added and taken away again', async () => {
    // Arrange
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] };
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(canal('Correo', enFicha()));
    await user.click(canal('Correo', enFicha()));
    expect(canal('WhatsApp', enFicha())).toBeChecked();
    expect(canal('Correo', enFicha())).not.toBeChecked();
    const cuerpo = await guardar(user);

    // Assert
    sinDecisionComercial(cuerpo);
  });

  test('should not count it as a change when the channels end up the same in another order', async () => {
    // Arrange: el registro trae los canales en un orden y la ficha los rearma en el suyo (WhatsApp, correo)
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['EMAIL', 'WHATSAPP'] };
    const { user } = await abrirFichaDeAna();

    // Act: se quita WhatsApp y se vuelve a marcar
    await user.click(canal('WhatsApp', enFicha()));
    await user.click(canal('WhatsApp', enFicha()));
    expect(interruptor(enFicha())).toBeChecked();
    expect(canal('WhatsApp', enFicha())).toBeChecked();
    expect(canal('Correo', enFicha())).toBeChecked();
    const cuerpo = await guardar(user);

    // Assert
    sinDecisionComercial(cuerpo);
  });

  test('should not send the commercial decision when a member who had not accepted gets channels marked but does not accept', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act: se marcan los canales, se acepta y se vuelve a apagar: Ana sigue sin aceptar
    await user.click(canal('WhatsApp', enFicha()));
    await user.click(interruptor(enFicha()));
    await user.click(interruptor(enFicha()));
    expect(interruptor(enFicha())).not.toBeChecked();
    expect(canal('WhatsApp', enFicha())).toBeChecked();
    const cuerpo = await guardar(user);

    // Assert
    sinDecisionComercial(cuerpo);
  });

  /*
   * Un guardado que falla en el cliente (se cae la conexion, se acaba el tiempo) pudo haber llegado al
   * servidor. Si llevaba la decision comercial, ya no se sabe que quedo registrado: el siguiente guardado
   * manda la decision que haya en pantalla, aunque sea igual a como llego la ficha.
   */
  const SIN_CONEXION = { status: 0, code: 'NETWORK', message: 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.' };
  const guardarCambios = () => screen.getByRole('button', { name: 'Guardar cambios' });

  test('should send the decision on screen in the next save when the save that carried a new decision failed and the switch was put back', async () => {
    // Arrange: Ana no acepta. Se marca WhatsApp, se enciende, se guarda y el guardado falla
    mockPut = vi.fn()
      .mockRejectedValueOnce(SIN_CONEXION)
      .mockResolvedValueOnce({ data: { message: 'Miembro actualizado.' } });
    const { user } = await abrirFichaDeAna();
    await user.click(canal('WhatsApp', enFicha()));
    await user.click(interruptor(enFicha()));
    await user.click(guardarCambios());
    expect(await enFicha().findByRole('alert')).toHaveTextContent('Sin conexion con el servidor.');
    expect(mockPut.mock.calls[0][1]).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });

    // Act: se apaga el interruptor (queda como llego) y se guarda otra vez
    await user.click(interruptor(enFicha()));
    expect(interruptor(enFicha())).not.toBeChecked();
    await user.click(guardarCambios());

    // Assert: el «no» viaja de forma explicita, por si el servidor alcanzo a registrar el «si»
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockPut.mock.calls[1][0]).toBe('/admin/miembros/1');
    expect(mockPut.mock.calls[1][1]).toMatchObject({ acepta_mensajes_comerciales: false, canales_comerciales: [] });
  });

  test('should still not send the commercial decision in the next save when the save that failed did not carry it', async () => {
    // Arrange: Ana acepto por WhatsApp; solo se le corrige la ciudad, y ese guardado falla
    ana = { ...ANA_COMPLETA, acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] };
    mockPut = vi.fn()
      .mockRejectedValueOnce(SIN_CONEXION)
      .mockResolvedValueOnce({ data: { message: 'Miembro actualizado.' } });
    const { user } = await abrirFichaDeAna();
    const ciudad = enFicha().getByRole('textbox', { name: 'Ciudad' });
    await user.clear(ciudad);
    await user.type(ciudad, 'Bello');
    await user.click(guardarCambios());
    expect(await enFicha().findByRole('alert')).toHaveTextContent('Sin conexion con el servidor.');
    sinDecisionComercial(mockPut.mock.calls[0][1]);

    // Act: se guarda otra vez, sin tocar nada
    await user.click(guardarCambios());

    // Assert: va la ciudad, y sigue sin ir una aceptacion que nadie toco
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockPut.mock.calls[1][1]).toMatchObject({ ciudad: 'Bello' });
    sinDecisionComercial(mockPut.mock.calls[1][1]);
  });

  test('should say that the representative decides and send the acceptance in the name of the minor with the data of the representative when the member is a minor', async () => {
    // Arrange: sin fecha de nacimiento, la tarjeta de identidad dice que es menor
    ana = { ...ANA_COMPLETA, tipo_documento: 'TI', fecha_nacimiento: null, menor_de_edad: true };
    const { user } = await abrirFichaDeAna();
    expect(enFicha().getByText('El miembro es menor de edad: esta decisión la toma su representante legal.')).toBeInTheDocument();
    expect(enFicha().getByText('Todavía no está registrada: márcala para poder guardar.')).toBeInTheDocument();

    // Act
    await user.type(enFicha().getByLabelText(/^Nombre del representante legal/), 'Marta Ruiz');
    await user.selectOptions(enFicha().getByLabelText(/^Tipo de documento \*/), 'CC');
    await user.type(enFicha().getByLabelText(/^Número de documento/), '52111222');
    await user.selectOptions(enFicha().getByLabelText(/^Parentesco/), 'Madre');
    await user.type(enFicha().getByLabelText(/^Teléfono del representante/), '310 444 5566');
    await user.click(enFicha().getByRole('checkbox', { name: /^Representante legal/ }));
    await user.click(canal('WhatsApp', enFicha()));
    await user.click(interruptor(enFicha()));
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({
      acepta_mensajes_comerciales: true,
      canales_comerciales: ['WHATSAPP'],
      autoriza_representante: true,
      representante_nombre: 'Marta Ruiz',
      representante_tipo_documento: 'CC',
      representante_documento: '52111222',
      representante_parentesco: 'Madre',
      representante_telefono: '3104445566',
    });
  }, 15000);
});
