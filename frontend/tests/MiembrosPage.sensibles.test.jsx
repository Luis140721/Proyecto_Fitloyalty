/**
 * MiembrosPage: la autorizacion de datos sensibles (RQNF-17) y los datos de
 * salud en la ficha del miembro, desde lo que hace la recepcion y lo que le
 * llega al servidor en el PUT.
 *
 * Antes, cada guardado de la ficha mandaba la casilla tal como estaba en
 * pantalla y, con ella, las condiciones medicas y las alergias. Corregir la
 * ciudad volvia a enviar una autorizacion que nadie toco: si el miembro la
 * habia revocado entre tanto, ese guardado la otorgaba otra vez.
 *
 * Ahora la autorizacion solo viaja si se cambio en esa ficha, y cada dato de
 * salud solo viaja si cambio:
 * - sin cambios, ninguna de las tres claves va en el PUT;
 * - otorgar manda true con los dos textos; revocar manda false con los dos
 *   textos vacios (el servidor borra los datos);
 * - si solo cambia un texto, va ese texto sin la autorizacion: el servidor lo
 *   guarda o lo descarta segun la que este vigente;
 * - un registro anterior con datos de salud y sin autorizacion manda los dos
 *   textos vacios: se borran, como dice el aviso de la ficha;
 * - si un guardado que llevaba algo de esto falla, ya no se sabe que quedo en
 *   el servidor: el siguiente manda lo que haya en pantalla.
 *
 * El API, useAuth y qrcode se simulan con vi.mock. La fecha se fija (solo
 * Date; los timers siguen reales para user-event): la ficha calcula si el
 * miembro es menor de edad.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
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
// GET /api/admin/miembros/:id. Ana no ha autorizado los datos sensibles: las dos columnas llegan en null.
const SIN_AUTORIZACION = {
  ...ANA, tipo_documento: 'CC', fecha_nacimiento: '1990-05-17T00:00:00.000Z', genero: 'Femenino', codigo_pais_telefono: '57',
  ciudad: 'Medellín', direccion: 'Calle 10 # 20-30', contacto_emergencia: 'Luz Pérez', telefono_emergencia: '3110000000',
  condiciones_medicas: null, alergias: null, objetivo: '', nivel_experiencia: '', observaciones: '',
  acepta_mensajes_comerciales: false, canales_comerciales: [], autorizo_datos_sensibles: false,
  datos_sensibles_sin_autorizacion: false, menor_de_edad: false,
  representante_nombre: null, representante_tipo_documento: null, representante_documento: null,
  representante_parentesco: null, representante_telefono: null,
};
const AUTORIZADA = { ...SIN_AUTORIZACION, autorizo_datos_sensibles: true, condiciones_medicas: 'Asma', alergias: 'Polen' };
// Miembro de antes de RQNF-17: tiene datos de salud guardados y nunca dio la autorizacion separada.
const REGISTRO_ANTERIOR = { ...SIN_AUTORIZACION, condiciones_medicas: 'Asma', alergias: 'Polen', datos_sensibles_sin_autorizacion: true };
// Sin fecha de nacimiento, la tarjeta de identidad dice que es menor (misma regla del backend).
const MENOR = {
  ...SIN_AUTORIZACION, tipo_documento: 'TI', fecha_nacimiento: null, menor_de_edad: true,
  representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52111222',
  representante_parentesco: 'Madre', representante_telefono: '3104445566',
};
const SIN_CONEXION = { status: 0, code: 'NETWORK', message: 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.' };

let ana;

const ficha = () => screen.getByRole('dialog', { name: 'Editar Ana Pérez' });
const enFicha = () => within(ficha());
const autorizacion = () => enFicha().getByRole('checkbox', { name: /^Datos sensibles \(salud\)/ });
const condiciones = () => enFicha().getByRole('textbox', { name: 'Condiciones médicas' });
const alergias = () => enFicha().getByRole('textbox', { name: 'Alergias' });
const guardarCambios = () => screen.getByRole('button', { name: 'Guardar cambios' });

async function abrirFichaDeAna() {
  const pantalla = renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
  await pantalla.user.click(await screen.findByRole('row', { name: /Ana Pérez/ }));
  await enFicha().findByRole('heading', { name: 'Plan y cobro' });
  return pantalla;
}
async function reemplazar(user, campo, texto) {
  await user.clear(campo);
  await user.type(campo, texto);
}
const cambiarCiudad = (user) => reemplazar(user, enFicha().getByRole('textbox', { name: 'Ciudad' }), 'Bello');
/** Pulsa «Guardar cambios» y devuelve el cuerpo del PUT numero `veces`. */
async function guardar(user, veces = 1) {
  await user.click(guardarCambios());
  await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(veces));
  const [url, cuerpo] = mockPut.mock.calls[veces - 1];
  expect(url).toBe('/admin/miembros/1');
  return cuerpo;
}
const sinDatosSensibles = (cuerpo) => {
  expect(cuerpo).not.toHaveProperty('autorizo_datos_sensibles');
  expect(cuerpo).not.toHaveProperty('condiciones_medicas');
  expect(cuerpo).not.toHaveProperty('alergias');
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 19, 10, 0, 0));
  ana = SIN_AUTORIZACION;
  mockGet = vi.fn(async (url) => {
    if (url === '/admin/config') return { data: { config: { plan_mensual_valor: '90000.00' } } };
    if (url === '/admin/miembros') return { data: { miembros: [ANA] } };
    if (url === '/admin/miembros/1') return { data: { miembro: ana, autorizaciones: { version_actual: 'v2', vigentes: {}, historial: [] } } };
    if (url === '/admin/miembros/1/plan') return { data: { plan: null, congelaciones: [] } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
  mockPost = vi.fn(async () => ({ data: {} }));
  mockPut = vi.fn(async () => ({ data: { message: 'Miembro actualizado.' } }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => vi.useRealTimers());

describe('MiembrosPage: los datos sensibles en la ficha, cuando no se tocan', () => {
  test('should not send the authorization nor the health data when only the city changes and the member had authorized', async () => {
    // Arrange: Ana autorizo y tiene «Asma» y «Polen» guardados
    ana = AUTORIZADA;
    const { user } = await abrirFichaDeAna();
    expect(autorizacion()).toBeChecked();
    expect(condiciones()).toHaveValue('Asma');
    expect(alergias()).toHaveValue('Polen');

    // Act
    await cambiarCiudad(user);
    const cuerpo = await guardar(user);

    // Assert: si Ana revoco entre tanto, este guardado no vuelve a otorgar nada
    expect(cuerpo).toMatchObject({ nombre: 'Ana Pérez', ciudad: 'Bello' });
    sinDatosSensibles(cuerpo);
  });

  test.each([
    ['null, as the server sends them', { condiciones_medicas: null, alergias: null }],
    ['empty', { condiciones_medicas: '', alergias: '' }],
  ])('should not send the authorization nor the health data when only the city changes and the member had not authorized (health texts %s)', async (_caso, textos) => {
    // Arrange
    ana = { ...SIN_AUTORIZACION, ...textos };
    const { user } = await abrirFichaDeAna();
    expect(autorizacion()).not.toBeChecked();
    expect(condiciones()).toBeDisabled();
    expect(alergias()).toBeDisabled();

    // Act
    await cambiarCiudad(user);
    const cuerpo = await guardar(user);

    // Assert: tampoco se registra un «no» que nadie dijo
    expect(cuerpo).toMatchObject({ nombre: 'Ana Pérez', ciudad: 'Bello' });
    sinDatosSensibles(cuerpo);
  });

  test('should not send the authorization nor the health data when the box is marked, a text is typed and the box is unmarked again', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act: queda como llego, sin autorizacion
    await user.click(autorizacion());
    await user.type(condiciones(), 'Asma');
    await user.click(autorizacion());
    expect(autorizacion()).not.toBeChecked();
    await cambiarCiudad(user);
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ ciudad: 'Bello' });
    sinDatosSensibles(cuerpo);
    expect(JSON.stringify(cuerpo)).not.toMatch(/Asma/);
  });

  test('should not send the authorization nor the health data when the box is unmarked and marked again and a text is edited and restored', async () => {
    // Arrange
    ana = AUTORIZADA;
    const { user } = await abrirFichaDeAna();

    // Act: todo queda como llego
    await user.click(autorizacion());
    await user.click(autorizacion());
    await user.type(condiciones(), ' y rinitis');
    await reemplazar(user, condiciones(), 'Asma');
    expect(autorizacion()).toBeChecked();
    expect(condiciones()).toHaveValue('Asma');
    expect(alergias()).toHaveValue('Polen');
    await cambiarCiudad(user);
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ ciudad: 'Bello' });
    sinDatosSensibles(cuerpo);
  });

  test('should not send the health data when only spaces were added at the end of the texts', async () => {
    // Arrange
    ana = AUTORIZADA;
    const { user } = await abrirFichaDeAna();

    // Act: un espacio de mas no es otro dato de salud
    await user.type(condiciones(), '  ');
    await user.type(alergias(), ' ');
    expect(condiciones()).toHaveValue('Asma  ');
    await cambiarCiudad(user);
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ ciudad: 'Bello' });
    sinDatosSensibles(cuerpo);
  });
});

describe('MiembrosPage: los datos sensibles en la ficha, cuando cambian', () => {
  test('should send the authorization with the two health texts when the member authorizes and they are written', async () => {
    // Arrange
    const { user } = await abrirFichaDeAna();

    // Act
    await user.click(autorizacion());
    await user.type(condiciones(), 'Asma');
    await user.type(alergias(), 'Polen');
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ autorizo_datos_sensibles: true, condiciones_medicas: 'Asma', alergias: 'Polen' });
  });

  test('should send the authorization with the health data that was already stored when a member of a previous record authorizes', async () => {
    // Arrange: datos de salud guardados antes de que existiera la autorizacion separada
    ana = REGISTRO_ANTERIOR;
    const { user } = await abrirFichaDeAna();

    // Act: solo se marca la casilla; los textos no se tocan
    await user.click(autorizacion());
    expect(condiciones()).toHaveValue('Asma');
    expect(alergias()).toHaveValue('Polen');
    const cuerpo = await guardar(user);

    // Assert: la autorizacion cambio, asi que los textos van aunque sean los mismos
    expect(cuerpo).toMatchObject({ autorizo_datos_sensibles: true, condiciones_medicas: 'Asma', alergias: 'Polen' });
  });

  test.each([
    ['with health data stored', AUTORIZADA],
    ['with no health data stored', { ...AUTORIZADA, condiciones_medicas: null, alergias: null }],
  ])('should warn and send the revocation with the two health texts empty when the authorization is unmarked (%s)', async (_caso, miembro) => {
    // Arrange
    ana = miembro;
    const { user } = await abrirFichaDeAna();
    expect(enFicha().queryByText(/^Al guardar se revoca la autorización/)).not.toBeInTheDocument();

    // Act
    await user.click(autorizacion());

    // Assert
    expect(enFicha().getByText('Al guardar se revoca la autorización y se borran las condiciones médicas y las alergias. Queda constancia en el historial.')).toBeInTheDocument();
    const cuerpo = await guardar(user);
    expect(cuerpo).toMatchObject({ autorizo_datos_sensibles: false, condiciones_medicas: '', alergias: '' });
  });

  test.each([
    ['Condiciones médicas', condiciones, 'condiciones_medicas', 'alergias'],
    ['Alergias', alergias, 'alergias', 'condiciones_medicas'],
  ])('should send only that text, without the authorization, when only «%s» changes', async (_etiqueta, campo, clave, laOtra) => {
    // Arrange
    ana = AUTORIZADA;
    const { user } = await abrirFichaDeAna();

    // Act
    await reemplazar(user, campo(), 'Rinitis');
    const cuerpo = await guardar(user);

    // Assert: el servidor guarda el texto solo si la autorizacion sigue vigente
    expect(cuerpo).toMatchObject({ [clave]: 'Rinitis' });
    expect(cuerpo).not.toHaveProperty('autorizo_datos_sensibles');
    expect(cuerpo).not.toHaveProperty(laOtra);
  });

  test('should send the emptied text, without the authorization, when a health text is deleted', async () => {
    // Arrange
    ana = AUTORIZADA;
    const { user } = await abrirFichaDeAna();

    // Act
    await user.clear(alergias());
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ alergias: '' });
    expect(cuerpo).not.toHaveProperty('autorizo_datos_sensibles');
    expect(cuerpo).not.toHaveProperty('condiciones_medicas');
  });

  test('should warn and send the two health texts empty, without the authorization, when a previous record with health data is saved without authorizing', async () => {
    // Arrange
    ana = REGISTRO_ANTERIOR;
    const { user } = await abrirFichaDeAna();
    expect(enFicha().getByText('Este miembro tiene datos de salud guardados sin una autorización separada (registro anterior). Si guardas sin marcar la autorización, se borran.')).toBeInTheDocument();
    expect(autorizacion()).not.toBeChecked();

    // Act
    await cambiarCiudad(user);
    const cuerpo = await guardar(user);

    // Assert: se borran, como dice el aviso; y no se registra una revocacion de algo que nunca se otorgo
    expect(cuerpo).toMatchObject({ ciudad: 'Bello', condiciones_medicas: '', alergias: '' });
    expect(cuerpo).not.toHaveProperty('autorizo_datos_sensibles');
  });
});

/*
 * Un guardado que falla en el cliente (se cae la conexion, se acaba el tiempo) pudo haber llegado al
 * servidor. Si llevaba la autorizacion o un dato de salud, ya no se sabe que quedo guardado: el siguiente
 * guardado manda lo que haya en pantalla, aunque sea igual a como llego la ficha.
 */
describe('MiembrosPage: los datos sensibles en la ficha, despues de un guardado que falla', () => {
  beforeEach(() => {
    mockPut = vi.fn()
      .mockRejectedValueOnce(SIN_CONEXION)
      .mockResolvedValueOnce({ data: { message: 'Miembro actualizado.' } });
  });

  test('should send the authorization on screen in the next save when the save that carried a new authorization failed and the box was put back', async () => {
    // Arrange: Ana no habia autorizado. Se marca, se escribe, se guarda y el guardado falla
    const { user } = await abrirFichaDeAna();
    await user.click(autorizacion());
    await user.type(condiciones(), 'Asma');
    await user.click(guardarCambios());
    expect(await enFicha().findByRole('alert')).toHaveTextContent('Sin conexion con el servidor.');
    expect(mockPut.mock.calls[0][1]).toMatchObject({ autorizo_datos_sensibles: true, condiciones_medicas: 'Asma' });

    // Act: se desmarca la casilla (queda como llego) y se guarda otra vez
    await user.click(autorizacion());
    expect(autorizacion()).not.toBeChecked();
    const cuerpo = await guardar(user, 2);

    // Assert: el «no» viaja de forma explicita, por si el servidor alcanzo a registrar el «si»
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(cuerpo).toMatchObject({ autorizo_datos_sensibles: false, condiciones_medicas: '', alergias: '' });
  });

  test('should send the restored text in the next save when the save that carried only a health text failed and the text was put back', async () => {
    // Arrange: Ana autorizo. Se cambia solo «Condiciones médicas», se guarda y el guardado falla
    ana = AUTORIZADA;
    const { user } = await abrirFichaDeAna();
    await reemplazar(user, condiciones(), 'Rinitis');
    await user.click(guardarCambios());
    expect(await enFicha().findByRole('alert')).toHaveTextContent('Sin conexion con el servidor.');
    expect(mockPut.mock.calls[0][1]).toMatchObject({ condiciones_medicas: 'Rinitis' });
    expect(mockPut.mock.calls[0][1]).not.toHaveProperty('autorizo_datos_sensibles');

    // Act: se vuelve a escribir lo que habia y se guarda otra vez
    await reemplazar(user, condiciones(), 'Asma');
    const cuerpo = await guardar(user, 2);

    // Assert: «Asma» viaja aunque sea lo que habia al abrir, por si el servidor alcanzo a guardar «Rinitis»
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(cuerpo).toMatchObject({ condiciones_medicas: 'Asma' });
  });

  test('should still not send the authorization nor the health data in the next save when the save that failed did not carry them', async () => {
    // Arrange: Ana autorizo; solo se le corrige la ciudad, y ese guardado falla
    ana = AUTORIZADA;
    const { user } = await abrirFichaDeAna();
    await cambiarCiudad(user);
    await user.click(guardarCambios());
    expect(await enFicha().findByRole('alert')).toHaveTextContent('Sin conexion con el servidor.');
    sinDatosSensibles(mockPut.mock.calls[0][1]);

    // Act: se guarda otra vez, sin tocar nada
    const cuerpo = await guardar(user, 2);

    // Assert: va la ciudad, y sigue sin ir una autorizacion que nadie toco
    expect(await screen.findByText('Miembro actualizado.')).toBeInTheDocument();
    expect(cuerpo).toMatchObject({ ciudad: 'Bello' });
    sinDatosSensibles(cuerpo);
  });
});

describe('MiembrosPage: los datos sensibles en la ficha de un menor de edad', () => {
  const REPRESENTANTE = {
    representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52111222',
    representante_parentesco: 'Madre',
  };

  test('should keep sending the data and the authorization of the legal representative when the health data of the minor is not touched', async () => {
    // Arrange: la menor tiene representante y datos de salud autorizados
    ana = { ...MENOR, autorizo_datos_sensibles: true, condiciones_medicas: 'Asma', alergias: 'Polen' };
    const { user } = await abrirFichaDeAna();
    expect(enFicha().getByLabelText(/^Nombre del representante legal/)).toHaveValue('Marta Ruiz');

    // Act: cambia el telefono de la representante, que autoriza de nuevo
    await reemplazar(user, enFicha().getByLabelText(/^Teléfono del representante/), '310 444 5577');
    await user.click(enFicha().getByRole('checkbox', { name: /^Representante legal/ }));
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({ ...REPRESENTANTE, representante_telefono: '3104445577', autoriza_representante: true });
    sinDatosSensibles(cuerpo);
  }, 15000);

  test('should send the authorization with the health data and the data of the legal representative when the representative authorizes the sensitive data of the minor', async () => {
    // Arrange
    ana = MENOR;
    const { user } = await abrirFichaDeAna();
    expect(enFicha().getByText('El miembro es menor de edad: esta autorización la da su representante legal.')).toBeInTheDocument();

    // Act
    await user.click(autorizacion());
    await user.type(alergias(), 'Penicilina');
    const cuerpo = await guardar(user);

    // Assert
    expect(cuerpo).toMatchObject({
      autorizo_datos_sensibles: true, alergias: 'Penicilina', ...REPRESENTANTE, representante_telefono: '3104445566',
    });
  }, 15000);
});
