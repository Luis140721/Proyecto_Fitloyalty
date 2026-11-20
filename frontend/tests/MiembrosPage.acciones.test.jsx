/**
 * Cobertura del front (Luis): MiembrosPage, lo que no cubren MiembrosPage.test.jsx
 * (lista, busqueda, alta minima) ni MiembrosPage.ficha.test.jsx (la ficha):
 * - el alta con todos los datos opcionales de los cinco pasos y las pestanas;
 * - los desactivados: eliminar para siempre (con confirmacion) y reactivar;
 * - el error al desactivar;
 * - el aviso del miembro recien creado: el QR por WhatsApp y copiarlo;
 * - la lista vacia invita a crear el primero.
 *
 * El API, useAuth y qrcode se simulan con vi.mock.
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
const JULIO = { id_miembro: 5, nombre: 'Julio Mora', documento: '80111222', telefono: '3125550000', codigo_qr: 'QR-JULIO', activo: false, whatsapp: null };
const SOFIA = { id_miembro: 3, nombre: 'Sofía Gómez', documento: '1033444555', telefono: '3201112233', codigo_qr: 'QR-SOFIA', activo: true };

let miembros;

/** Doble del GET: configuracion con precios, lista (con o sin inactivos) y la ficha de Julio. */
function apiQueResponde() {
  return vi.fn(async (url, opciones = {}) => {
    if (url === '/admin/config') return { data: { config: { plan_mensual_valor: '90000.00', plan_trimestral_valor: '240000.00' } } };
    if (url === '/admin/miembros') {
      const conInactivos = opciones.params?.includeInactive;
      return { data: { miembros: miembros.filter((m) => conInactivos || m.activo) } };
    }
    if (url === '/admin/miembros/5') return { data: { miembro: JULIO } };
    if (url === '/admin/miembros/5/plan') return { data: { plan: null, congelaciones: [] } };
    throw new Error(`GET no simulado en el test: ${url}`);
  });
}

const abrirMiembros = () => renderWithProviders(<MiembrosPage />, { route: '/admin/miembros' });
const filaDe = (nombre) => screen.getByRole('row', { name: new RegExp(nombre) });
const siguiente = () => screen.getByRole('button', { name: 'Siguiente →' });
const campo = (etiqueta) => screen.getByLabelText(etiqueta);

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterAll(() => { delete Element.prototype.scrollIntoView; });

beforeEach(() => {
  miembros = [ANA, JULIO];
  mockGet = apiQueResponde();
  mockPost = vi.fn(async () => { miembros = [...miembros, SOFIA]; return { data: { miembro: SOFIA } }; });
  mockPut = vi.fn(async () => ({ data: {} }));
  mockDelete = vi.fn(async () => ({ data: {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Abre el asistente con la lista ya cargada. */
async function abrirAlta() {
  const pantalla = abrirMiembros();
  await screen.findByRole('row', { name: /Ana Pérez/ });
  await pantalla.user.click(screen.getByRole('button', { name: 'Nuevo miembro' }));
  return pantalla;
}

/** Crea a Sofía con los datos minimos y espera el aviso del QR. */
async function crearASofia() {
  const pantalla = await abrirAlta();
  const { user } = pantalla;
  await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
  await user.type(campo(/^Número documento/), '1033444555');
  await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
  for (let paso = 2; paso <= 5; paso += 1) await user.click(siguiente());
  await user.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
  await user.click(screen.getByRole('checkbox', { name: /Autorizo el uso de mis datos/ }));
  await user.click(screen.getByRole('button', { name: 'Crear miembro' }));
  await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' });
  return pantalla;
}

describe('MiembrosPage: el alta con todos los datos', () => {
  // Teclea los cinco pasos campo por campo: con toda la suite en paralelo pasa de los 5 s por defecto.
  test('should send every optional field of the five steps when the member is created with all the data', async () => {
    // Arrange: solo se fija la fecha (los timers siguen reales para user-event)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 19, 10, 0, 0));
    const { user } = await abrirAlta();

    // Act: paso 1, datos personales
    await user.selectOptions(campo(/^Tipo documento/), 'CE');
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo('Fecha nacimiento'), '17051990');
    await user.selectOptions(campo('Género'), 'Femenino');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    await user.type(campo('Email'), 'sofia@correo.co');
    await user.type(campo('Dirección completa'), 'Calle 45 # 12-30');
    await user.click(siguiente());
    // paso 2, salud y emergencia
    await user.type(campo('Contacto de emergencia'), 'Marta Gómez');
    await user.type(campo('Teléfono emergencia'), '3109998877');
    await user.type(campo('Condiciones médicas / lesiones'), 'Rodilla derecha');
    await user.type(campo('Alergias'), 'Ninguna');
    await user.click(siguiente());
    // paso 3, plan y cobros: el trimestral trae el precio de la configuracion
    await user.selectOptions(campo(/^Tipo de plan/), 'TRIMESTRAL');
    await user.type(campo('Valor pagado hoy'), '240000');
    await user.selectOptions(campo(/^Método de pago/), 'TRANSFERENCIA');
    await user.type(campo('Referencia / comprobante'), 'TRX-881');
    const recordatorio = screen.getByText('Activar recordatorio').closest('label');
    await user.click(within(recordatorio).getByRole('checkbox'));
    await user.clear(within(recordatorio).getByRole('spinbutton'));
    await user.type(within(recordatorio).getByRole('spinbutton'), '5');
    await user.click(siguiente());
    // paso 4, informacion adicional
    await user.selectOptions(campo('Objetivo principal'), 'Ganar músculo');
    await user.selectOptions(campo('Nivel de experiencia'), 'Intermedio');
    await user.type(campo('Observaciones / notas del entrenador'), 'Viene en la mañana');
    await user.click(siguiente());
    // paso 5, terminos
    await user.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Autorizo el uso de mis datos/ }));
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert
    expect(await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/admin/miembros', expect.objectContaining({
      tipo_documento: 'CE', nombre: 'Sofía Gómez', documento: '1033444555', fecha_nacimiento: '1990-05-17', genero: 'Femenino',
      telefono: '3201112233', email: 'sofia@correo.co', direccion: 'Calle 45 # 12-30',
      contacto_emergencia: 'Marta Gómez', telefono_emergencia: '3109998877', condiciones_medicas: 'Rodilla derecha', alergias: 'Ninguna',
      tipo_plan: 'TRIMESTRAL', valor_total: '240000', valor_pagado: '240000', estado_pago: 'PAGADO', metodo_pago: 'TRANSFERENCIA',
      referencia_pago: 'TRX-881', activar_recordatorio: true, dias_recordatorio: 5,
      fecha_inicio: '2026-11-19', fecha_fin: '2027-02-17', proxima_fecha_cobro: '2027-02-18',
      objetivo: 'Ganar músculo', nivel_experiencia: 'Intermedio', observaciones: 'Viene en la mañana',
    }));
  }, 15000);

  test('should jump to a later step with its tab when the current step is valid, and come back with Anterior', async () => {
    // Arrange
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');

    // Act
    await user.click(screen.getByRole('button', { name: 'Info adicional' }));

    // Assert
    expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument();
    expect(campo('Objetivo principal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '← Anterior' }));
    expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument();
  });

  test('should recalculate the end and keep the chosen payment state when the start date is typed by hand', async () => {
    // Arrange
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    await user.click(siguiente());
    await user.click(siguiente());

    // Act: paso 3, el plan empieza el 1 de diciembre y lo paga a medias
    await user.clear(campo(/^Fecha inicio/));
    await user.type(campo(/^Fecha inicio/), '01122026');
    await user.clear(campo(/^Valor total del plan/));
    await user.type(campo(/^Valor total del plan/), '100000');
    await user.selectOptions(campo('Estado del pago'), 'PARCIAL');
    await user.click(siguiente());
    await user.click(siguiente());
    await user.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Autorizo el uso de mis datos/ }));
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert
    await screen.findByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    expect(mockPost).toHaveBeenCalledWith('/admin/miembros', expect.objectContaining({
      fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31', proxima_fecha_cobro: '2027-01-01', valor_total: '100000', estado_pago: 'PARCIAL',
    }));
  });

  test('should stay on the current step and mark its errors when a later tab is clicked with the step empty', async () => {
    // Arrange
    const { user } = await abrirAlta();

    // Act
    await user.click(screen.getByRole('button', { name: 'Términos' }));

    // Assert
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    expect(screen.getByText('Escribe el nombre del miembro.')).toBeInTheDocument();
  });

  test('should show the error of the API and keep the wizard open when the member cannot be created', async () => {
    // Arrange
    mockPost = vi.fn(async () => { throw { status: 409, code: 'DUPLICATE_DOCUMENT', message: 'Ya existe un miembro con ese documento.' }; });
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    for (let paso = 2; paso <= 5; paso += 1) await user.click(siguiente());
    await user.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Autorizo el uso de mis datos/ }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Crear miembro' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un miembro con ese documento.');
    expect(screen.getByRole('button', { name: 'Crear miembro' })).toBeEnabled();
    expect(screen.queryByRole('dialog', { name: '¡Miembro creado exitosamente!' })).not.toBeInTheDocument();
  });
});

describe('MiembrosPage: las reglas del asistente', () => {
  test('should not move on when the birth date is in the future', async () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 19, 10, 0, 0));
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    await user.type(campo('Fecha nacimiento'), '01012030');

    // Act
    await user.click(siguiente());

    // Assert
    expect(screen.getByText('La fecha de nacimiento no puede ser futura.')).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
  });

  test.each([
    ['the name has one letter', { nombre: 'A' }, /^Nombre completo/, 'El nombre es demasiado corto.'],
    ['the document has four digits', { documento: '1234' }, /^Número documento/, 'El documento parece incompleto.'],
    ['the email has no domain', { email: 'sofia@correo' }, /^Email/, 'Este correo no tiene un formato válido.'],
    ['the birth date does not exist', { nacimiento: '31021990' }, null, 'Fecha incompleta o inexistente. Usa DD/MM/AAAA.'],
    ['the birth date has day 00', { nacimiento: '00051990' }, null, 'Fecha incompleta o inexistente. Usa DD/MM/AAAA.'],
  ])('should stay on step 1 and explain it when %s', async (_caso, cambios, etiqueta, mensaje) => {
    // Arrange
    const datos = { nombre: 'Sofía Gómez', documento: '1033444555', ...cambios };
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), datos.nombre);
    await user.type(campo(/^Número documento/), datos.documento);
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    if (datos.email) await user.type(campo(/^Email/), datos.email);
    if (datos.nacimiento) await user.type(campo(/^Fecha nacimiento/), datos.nacimiento);

    // Act
    await user.click(siguiente());

    // Assert
    expect(screen.getByText(mensaje)).toBeInTheDocument();
    if (etiqueta) expect(campo(etiqueta)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
  });

  test.each([
    ['the start date is empty', async (user) => user.clear(campo(/^Fecha inicio/)), null, 'Indica cuándo empieza el plan.'],
    ['the start date does not exist', async (user) => {
      await user.clear(campo(/^Fecha inicio/));
      await user.type(campo(/^Fecha inicio/), '31022026');
    }, null, 'Fecha incompleta o inexistente. Usa DD/MM/AAAA.'],
    ['the price is negative', async (user) => {
      await user.clear(campo(/^Valor total del plan/));
      await user.type(campo(/^Valor total del plan/), '-5000');
    }, /^Valor total del plan/, 'El valor no puede ser negativo.'],
    ['the payment of today is negative', async (user) => {
      await user.clear(campo(/^Valor pagado hoy/));
      await user.type(campo(/^Valor pagado hoy/), '-5000');
    }, /^Valor pagado hoy/, 'El valor no puede ser negativo.'],
  ])('should stay on step 3 and explain it when %s', async (_caso, cambiar, etiqueta, mensaje) => {
    // Arrange
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    await user.click(siguiente());
    await user.click(siguiente());
    await cambiar(user);

    // Act
    await user.click(siguiente());

    // Assert
    expect(screen.getByText(mensaje)).toBeInTheDocument();
    if (etiqueta) expect(campo(etiqueta)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument();
  });

  test('should stay on step 2 and ask for 10 digits when the emergency phone is incomplete', async () => {
    // Arrange
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    await user.click(siguiente());
    await user.type(campo('Teléfono emergencia'), '310999887');

    // Act
    await user.click(siguiente());

    // Assert
    expect(screen.getByText('Debe tener 10 dígitos (escribiste 9).')).toBeInTheDocument();
    expect(campo(/^Teléfono emergencia/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument();
  });

  test('should not let the payment of today be higher than the plan and clear the notice when it is fixed', async () => {
    // Arrange
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');
    await user.type(campo(/^Número documento/), '1033444555');
    await user.type(campo(/^Teléfono \/ WhatsApp/), '3201112233');
    await user.click(siguiente());
    await user.click(siguiente());
    await user.clear(campo(/^Valor total del plan/));
    await user.type(campo(/^Valor total del plan/), '90000');
    await user.type(campo(/^Valor pagado hoy/), '100000');

    // Act y Assert: el plan vale 90 000
    await user.click(siguiente());
    expect(screen.getByText('Lo pagado no puede superar el valor del plan.')).toBeInTheDocument();
    expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument();

    // Act y Assert: al corregir se va el error de ese campo
    await user.clear(campo(/^Valor pagado hoy/));
    await user.type(campo(/^Valor pagado hoy/), '90000');
    expect(screen.queryByText('Lo pagado no puede superar el valor del plan.')).not.toBeInTheDocument();
    await user.click(siguiente());
    expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument();
  });

  test('should still open the wizard and create the member when the gym prices and the QR image fail', async () => {
    // Arrange: sin configuracion de precios y sin poder guardar la imagen del QR
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getNormal = apiQueResponde();
    mockGet = vi.fn(async (url, opciones) => {
      if (url === '/admin/config') throw { status: 503, message: 'Sin configuracion' };
      return getNormal(url, opciones);
    });
    mockPut = vi.fn(async () => { throw { status: 413, message: 'Imagen muy grande' }; });

    // Act
    await crearASofia();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Miembro creado exitosamente.');
    expect(console.error).toHaveBeenCalledWith('No se pudo cargar la configuración del gimnasio:', expect.anything());
    expect(console.error).toHaveBeenCalledWith('No se pudo guardar la imagen del QR:', expect.anything());
  });
});

describe('MiembrosPage: los filtros', () => {
  test.each([
    ['Vence pronto', { vencePronto: true }],
    ['En riesgo', { enRiesgo: true }],
    ['Congelado', { congelada: true }],
  ])('should show only those members when the tab %s is chosen', async (pestana, marca) => {
    // Arrange
    miembros = [ANA, { ...JULIO, nombre: 'Julio Mora', activo: true, ...marca }];
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Julio Mora/ });

    // Act
    await user.click(screen.getByRole('tab', { name: new RegExp(`^${pestana}`) }));

    // Assert
    expect(screen.getByRole('tab', { name: new RegExp(`^${pestana}`) })).toHaveAttribute('aria-selected', 'true');
    expect(filaDe('Julio Mora')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });
  test('should show only the members without notices when the tab Al día is chosen', async () => {
    // Arrange
    miembros = [ANA, { ...JULIO, activo: true, vencido: true }];
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Julio Mora/ });

    // Act
    await user.click(screen.getByRole('tab', { name: /^Al día/ }));

    // Assert
    expect(filaDe('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Julio Mora/ })).not.toBeInTheDocument();
  });

  test('should search among the deactivated members when the tab Desactivados is open', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(screen.getByRole('tab', { name: /^Desactivados/ }));
    await screen.findByRole('row', { name: /Julio Mora/ });

    // Act
    await user.type(screen.getByRole('textbox', { name: 'Buscar miembros' }), 'Julio');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    // Assert
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith('/admin/miembros', { params: { q: 'Julio', pageSize: 100, includeInactive: true } }));
  });
});

describe('MiembrosPage: el miembro recien creado', () => {
  test('should copy the image of the QR and say it can be pasted in WhatsApp when the browser allows it', async () => {
    // Arrange: un navegador con ClipboardItem (user-event ya simula el portapapeles)
    vi.stubGlobal('ClipboardItem', class { constructor(datos) { this.datos = datos; } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['QR'], { type: 'image/png' }) })));
    const avisar = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const descargar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user } = await crearASofia();

    // Act
    await user.click(screen.getByRole('button', { name: 'Copiar QR' }));

    // Assert
    await waitFor(() => expect(avisar).toHaveBeenCalledWith('Imagen del QR copiada al portapapeles. Ahora puedes pegarla en WhatsApp.'));
    expect(fetch).toHaveBeenCalledWith('data:image/png;base64,UVI=');
    expect(descargar).not.toHaveBeenCalled();
  });
  test('should offer WhatsApp with the phone and a welcome message when the member is created', async () => {
    // Arrange y Act
    await crearASofia();

    // Assert
    const aviso = screen.getByRole('dialog', { name: '¡Miembro creado exitosamente!' });
    expect(within(aviso).getByRole('img', { name: 'Código QR del miembro' })).toHaveAttribute('src', 'data:image/png;base64,UVI=');
    expect(within(aviso).getByText('QR-SOFIA')).toBeInTheDocument();
    const enlace = within(aviso).getByRole('link', { name: 'Enviar QR por WhatsApp' });
    expect(enlace.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/3201112233\?text=Hola%20Sof%C3%ADa%20G%C3%B3mez%2C%20bienvenido/);
  });

  test('should download the QR and explain it when the browser cannot copy images', async () => {
    // Arrange: jsdom no tiene ClipboardItem, como algunos navegadores
    const avisar = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const descargar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = await crearASofia();

    // Act
    await user.click(screen.getByRole('button', { name: 'Copiar QR' }));

    // Assert
    await waitFor(() => expect(avisar).toHaveBeenCalledWith('La imagen se descargó. Puedes adjuntar el archivo descargado en WhatsApp.'));
    expect(descargar).toHaveBeenCalledTimes(1);
  });

  test('should close the notice and leave the member in the list when Cerrar is clicked', async () => {
    // Arrange
    const { user } = await crearASofia();
    const aviso = screen.getByRole('dialog', { name: '¡Miembro creado exitosamente!' });

    // Act
    await user.click(within(aviso).getAllByRole('button', { name: 'Cerrar' }).at(-1));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Sofía Gómez/ })).toBeInTheDocument();
  });
});

describe('MiembrosPage: desactivar y eliminar', () => {
  test('should explain the failure and keep the member when the deactivation fails', async () => {
    // Arrange
    mockDelete = vi.fn(async () => { throw { status: 503, code: 'DB_UNREACHABLE', message: 'No pudimos desactivar al miembro.' }; });
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(within(filaDe('Ana Pérez')).getByRole('button', { name: 'Desactivar a Ana Pérez' }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos desactivar al miembro.');
    expect(filaDe('Ana Pérez')).toBeInTheDocument();
  });

  test('should close the confirmations without touching the member when the X of the dialog is clicked', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });

    // Act y Assert: la confirmacion de desactivar
    await user.click(within(filaDe('Ana Pérez')).getByRole('button', { name: 'Desactivar a Ana Pérez' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Desactivar miembro' })).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Act y Assert: la de eliminar para siempre
    await user.click(screen.getByRole('tab', { name: /Desactivados/ }));
    await user.click(within(await screen.findByRole('row', { name: /Julio Mora/ })).getByRole('button', { name: 'Eliminar permanentemente a Julio Mora' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar miembro permanentemente' })).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('should keep the member when the deactivation is canceled', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(within(filaDe('Ana Pérez')).getByRole('button', { name: 'Desactivar a Ana Pérez' }));

    // Act
    await user.click(within(screen.getByRole('dialog', { name: 'Desactivar miembro' })).getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('should ask before deleting for ever when a deactivated member is deleted', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(screen.getByRole('tab', { name: /Desactivados/ }));
    await screen.findByRole('row', { name: /Julio Mora/ });

    // Act
    await user.click(within(filaDe('Julio Mora')).getByRole('button', { name: 'Eliminar permanentemente a Julio Mora' }));
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar permanentemente' }));

    // Assert
    expect(mockDelete).toHaveBeenCalledWith('/admin/miembros/5/permanent');
    expect(mockGet).toHaveBeenCalledWith('/admin/miembros', { params: { q: '', pageSize: 100, includeInactive: true } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('should not delete anything when the permanent deletion is canceled, and explain a failure', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(screen.getByRole('tab', { name: /Desactivados/ }));
    await user.click(within(await screen.findByRole('row', { name: /Julio Mora/ })).getByRole('button', { name: 'Eliminar permanentemente a Julio Mora' }));

    // Act y Assert: cancelar no borra
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar miembro permanentemente' })).getByRole('button', { name: 'Cancelar' }));
    expect(mockDelete).not.toHaveBeenCalled();

    // Act y Assert: si el API falla, se explica
    mockDelete = vi.fn(async () => { throw { status: 409, code: 'HAS_PAYMENTS', message: 'No se puede eliminar: tiene pagos registrados.' }; });
    await user.click(within(filaDe('Julio Mora')).getByRole('button', { name: 'Eliminar permanentemente a Julio Mora' }));
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar permanentemente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede eliminar: tiene pagos registrados.');
  });

  test('should open the file of a deactivated member when Reactivar is clicked', async () => {
    // Arrange
    const { user } = abrirMiembros();
    await screen.findByRole('row', { name: /Ana Pérez/ });
    await user.click(screen.getByRole('tab', { name: /Desactivados/ }));

    // Act
    await user.click(within(await screen.findByRole('row', { name: /Julio Mora/ })).getByRole('button', { name: 'Reactivar a Julio Mora' }));

    // Assert
    expect(await screen.findByRole('dialog', { name: 'Editar Julio Mora' })).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/miembros/5');
  });
});

describe('MiembrosPage: cancelar el alta', () => {
  test('should close the wizard and keep the list when the person clicks Cerrar in the header', async () => {
    // Arrange
    const { user } = await abrirAlta();
    await user.type(campo(/^Nombre completo/), 'Sofía Gómez');

    // Act
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    // Assert
    expect(screen.queryByText('Paso 1 de 5')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo miembro' })).toBeInTheDocument();
    expect(filaDe('Ana Pérez')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('MiembrosPage: el calendario', () => {
  test('should show the months in Spanish when the date picker opens', async () => {
    // Arrange
    const { user } = await abrirAlta();

    // Act
    await user.click(campo('Fecha nacimiento'));

    // Assert
    expect(await screen.findByRole('option', { name: 'noviembre' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'November' })).not.toBeInTheDocument();
  });

  test('should write the day picked in the calendar when the person clicks it', async () => {
    // Arrange: solo se fija la fecha, para que el calendario abra en noviembre de 2026
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 19, 10, 0, 0));
    const { user } = await abrirAlta();
    await user.click(campo('Fecha nacimiento'));

    // Act
    await user.click(await screen.findByRole('option', { name: /15 de noviembre de 2026/ }));

    // Assert
    expect(campo(/^Fecha nacimiento/)).toHaveValue('15/11/2026');
  });
});

describe('MiembrosPage: sin miembros', () => {
  test('should open the wizard when the list is empty and the person clicks Nuevo miembro', async () => {
    // Arrange
    miembros = [];
    const { user } = abrirMiembros();
    const tabla = screen.getByRole('table');

    // Act
    await user.click(await within(tabla).findByRole('button', { name: 'Nuevo miembro' }));

    // Assert
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
  });
});
