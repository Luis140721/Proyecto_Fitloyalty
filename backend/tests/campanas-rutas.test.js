/**
 * Campanas de mensajes y plantillas del administrador (routes/campanas.js,
 * RQF-10), con la ejecucion de lib/campanas.js y el job del scheduler
 * (jobs/campanas.js).
 *
 * Sale de la sincronizacion de la rama de la semana con develop (#100 y #104):
 * routes/campanas.js entro con 97 ramas sin cubrir en el job backend. Sus
 * pruebas contra la base real (retos-campanas-real.test.js) se saltan en los
 * dos jobs del CI.
 *
 * Con el #108 (RQNF-16, Ley 2300 de 2023) una campana es un mensaje comercial:
 * solo le llega a quien lo acepto por ese canal, dentro del horario permitido
 * y sin pasar la frecuencia; los demas quedan OMITIDO con su motivo. Fuera de
 * horario no sale nada, cada mensaje termina con el enlace de baja y la lista
 * ya no ejecuta las programadas vencidas (las ejecuta el scheduler).
 *
 * Dobles:
 *  - BD: stub por consulta, como en config-rutas.test.js. Cada test declara
 *    que responde a que SQL; una consulta que no esta declarada lanza error.
 *    Las llamadas quedan anotadas (tambien las del cliente de las
 *    transacciones, con BEGIN, COMMIT, ROLLBACK y release) para verificar que
 *    se escribio y con que datos.
 *  - Destinatarios de una ejecucion: stub con estado (destinatariosEnMemoria).
 *    Lo que guarda el INSERT es lo que despues leen la entrega y el resumen,
 *    y lo cambia el UPDATE; asi el resumen sale de lo que de verdad se guardo.
 *  - Reloj de la Ley 2300: stub con establecerReloj de lib/contacto-legal. Por
 *    defecto es el martes 17 de noviembre de 2026 a las 10:00 a. m. de
 *    Colombia (dentro del horario); los tests de fuera de horario lo cambian.
 *  - Entregas: router.setDeps() reemplaza el canal, el correo y el WhatsApp.
 *  - Lectura del personal en authenticate: stub (el admin 1 del gimnasio 7).
 *  - authenticate, authorize, requireActiveTrial, zod, lib/campanas,
 *    lib/segmentos, lib/mensajes, lib/contacto-legal, lib/contacto-miembro y
 *    lib/baja-mensajes son los reales.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockReglas = [];
let mockLlamadas = [];

async function mockEjecutar(sql, params = []) {
  mockLlamadas.push({ sql, params });
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
  if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
  for (const [patron, respuesta] of mockReglas) if (patron.test(sql)) return respuesta(params, sql);
  throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 80));
}
jest.mock('../src/db/db', () => ({
  query: (...a) => mockEjecutar(...a),
  connect: async () => ({
    query: (...a) => mockEjecutar(...a),
    release: () => { mockLlamadas.push({ sql: 'release', params: [] }); },
  }),
}));

const campanasRouter = require('../src/routes/campanas');
const { runJob } = require('../src/jobs/campanas');
const { VARIABLES } = require('../src/lib/campanas');
const legal = require('../src/lib/contacto-legal');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', campanasRouter);
app.use(errorHandler);

const ENV_ORIGINAL = process.env;
const SECRETO = 'secreto-de-pruebas';
const ADMIN = () => jwt.sign({ id: 1, role: 'admin', gymId: 7 }, SECRETO, { expiresIn: '1h' });
const pedir = (metodo, ruta) => request(app)[metodo](`/api${ruta}`).set('Authorization', `Bearer ${ADMIN()}`);

const responder = (...reglas) => { mockReglas = reglas; };
const filas = (rows) => () => ({ rows });
const cambiadas = (rowCount) => () => ({ rows: [], rowCount });
const falla = (code) => () => { const e = new Error('fallo de la BD'); if (code) e.code = code; throw e; };
/** Responde una cosa distinta en cada llamada; la ultima se repite. */
const secuencia = (...respuestas) => {
  let i = 0;
  return (...a) => respuestas[Math.min(i++, respuestas.length - 1)](...a);
};
const llamadas = (patron) => mockLlamadas.filter(({ sql }) => patron.test(sql));
/** BEGIN, COMMIT, ROLLBACK y release, en el orden en que pasaron. */
const transacciones = () => mockLlamadas.map(({ sql }) => sql).filter((sql) => /^(BEGIN|COMMIT|ROLLBACK|release)$/.test(sql));

// ------------------------------------------------------------------- datos
const MENSAJE = 'Hola {primer_nombre}, llevas {dias_sin_venir} días sin venir a {gimnasio}.';
const MENSAJE_CON_FECHA = `${MENSAJE} Tu plan vence el {fecha_vencimiento}.`;
const CAMPANA = {
  id_campana: 4, nombre: 'Te extrañamos', segmento: 'INACTIVOS', mensaje: MENSAJE, id_plantilla: null,
  canal: 'WHATSAPP', tipo_disparo: 'MANUAL', dias_inactividad: 10, estado: 'PROGRAMADA', activa: true,
  fecha_programada: null, fecha_ejecucion: null, fecha_creacion: '2026-11-20T15:00:00.000Z',
  destinatarios: 0, enviados: 0, fallidos: 0, pendientes: 0, omitidos: 0,
};
// La fila que lee la ejecucion con FOR UPDATE: la campana con el nombre del gimnasio.
const PARA_EJECUTAR = {
  id_campana: 4, id_gimnasio: 7, nombre: 'Te extrañamos', segmento: 'INACTIVOS', mensaje: MENSAJE, canal: 'WHATSAPP',
  dias_inactividad: 10, estado: 'PROGRAMADA', activa: true, id_plantilla: null, gimnasio: 'Gym Norte',
};
const ANA = { id_miembro: 41, nombre: 'Ana Ruiz', telefono: '3001234567', codigo_pais_telefono: '57', email: 'ana@example.com', fecha_fin: '2026-12-01', dias_sin_venir: 12 };
const BETO = { id_miembro: 42, nombre: 'Beto Gil', telefono: null, codigo_pais_telefono: null, email: null, fecha_fin: null, dias_sin_venir: null };
const CARLA = { id_miembro: 43, nombre: 'Carla Paz', telefono: '310 987 6543', codigo_pais_telefono: null, email: 'carla@example.com', fecha_fin: null, dias_sin_venir: 30 };
const DANI = { id_miembro: 44, nombre: 'Dani Rey', telefono: '310 987 6543', codigo_pais_telefono: null, email: 'dani@example.com', fecha_fin: null, dias_sin_venir: 30 };

// ------------------------------------------------------- Ley 2300 (RQNF-16)
// El reloj de la ley, en hora de Colombia (UTC-5 todo el ano).
const co = (texto) => new Date(`${texto.replace(' ', 'T')}:00-05:00`);
const MARTES = co('2026-11-17 10:00'); // dentro del horario
const DOMINGO = co('2026-11-22 10:00'); // nunca se contacta
const relojEn = (instante) => legal.establecerReloj(() => instante);
const TEXTO_HORARIO = 'de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca los domingos ni los festivos';
const EN_HORARIO = { permitido: true, texto: TEXTO_HORARIO, siguiente: null, siguiente_texto: null };
// El domingo 22 el siguiente horario permitido es el lunes 23 a las 7:00 a. m. (12:00 UTC).
const LUNES_7AM = '2026-11-23T12:00:00.000Z';
const LUNES_7AM_TEXTO = 'lunes 23 de noviembre a las 7:00 a. m.';

// El enlace de baja con que termina cada mensaje comercial (lib/baja-mensajes.js).
// La firma sale del secreto de pruebas, del miembro y del gimnasio: "miembro.gimnasio".
const FIRMA_BAJA = {
  '41.7': '2KO26tBWB0U6fafG3v5bDQ',
  '42.7': 'T803IEozy2mkZttVrQZPxw',
  '43.7': 'Nem7HvUWefKv8qmjoDuD7A',
  '42.8': '3q0xKJRvZqO6kFWF0xFslw',
};
const baja = (idMiembro, gymId = 7) => {
  const firma = FIRMA_BAJA[`${idMiembro}.${gymId}`];
  if (!firma) throw new Error(`Falta la firma de baja de ${idMiembro}.${gymId}`);
  return `\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: http://localhost:5173/baja/${idMiembro}.${gymId}.${firma}`;
};

// Consultas de la campana, de la ejecucion y de cada entrega.
const VENCIDAS = /SELECT id_campana, id_gimnasio, creada_por FROM campana/;
const CON_PENDIENTES = /SELECT c\.id_campana, c\.id_gimnasio, c\.creada_por FROM campana c/;
const PENDIENTES = /AND d\.estado_envio = 'PENDIENTE'\s+ORDER BY d\.id_campana_destinatario/;
const MARCAR = /UPDATE campana_destinatario\s+SET estado_envio/;
const ACEPTACION = /FROM autorizacion_miembro a/;
// La campana que lee el reintento: ya enviada, con el nombre del gimnasio y sin bloquear la fila.
const REANUDAR = /FROM campana c JOIN gimnasio g ON g\.id_gimnasio = c\.id_gimnasio\s+WHERE c\.id_campana = \$1 AND c\.id_gimnasio = \$2$/;
const PARA_REANUDAR = {
  id_campana: 4, id_gimnasio: 7, nombre: 'Te extrañamos', mensaje: MENSAJE, canal: 'EMAIL', estado: 'ENVIADA', id_plantilla: null, gimnasio: 'Gym Norte',
};
const paraReanudar = (respuesta) => [REANUDAR, respuesta];
const laCampana = (...respuestas) => [/WHERE c\.id_campana = \$1 AND c\.id_gimnasio = \$2\s+GROUP BY/, secuencia(...respuestas)];
const paraEjecutar = (respuesta) => [/FOR UPDATE OF c/, respuesta];
const delSegmento = (miembros) => [/FROM miembro m\s+LEFT JOIN/, filas(miembros)];
const guardarDestinatario = (respuesta = filas([])) => [/INSERT INTO campana_destinatario/, respuesta];
const marcarEnviada = [/UPDATE campana SET estado = 'ENVIADA'/, cambiadas(1)];
const guardarEnvio = (respuesta = filas([])) => [/INSERT INTO envio_mensaje/, respuesta];
const marcarDestinatario = [MARCAR, (p) => ({ rows: [{ id_campana_destinatario: p[0], estado_envio: p[1], motivo: p[2], fecha_envio: p[3] }] })];
const sinVencidas = [VENCIDAS, filas([])];
const sinPendientes = [CON_PENDIENTES, filas([])];
const bloqueoDeContacto = [/pg_advisory_xact_lock/, filas([])];
/**
 * La aceptacion de mensajes comerciales vigente de cada miembro: id -> los
 * canales que autorizo, o null si la cancelo. Quien no esta no tiene fila: no
 * acepta (asi quedan los miembros que ya existian).
 */
const aceptan = (porMiembro) => [ACEPTACION, (p) => ({
  rows: p[0].filter((id) => id in porMiembro).map((id) => ({
    id_miembro: id, otorgada: porMiembro[id] !== null, canales_autorizados: porMiembro[id],
    canal: 'PANEL', version_texto: 'v2', fecha: '2026-11-02T15:00:00.000Z',
  })),
})];
const todosAceptan = (miembros) => aceptan(Object.fromEntries(miembros.map((m) => [m.id_miembro, ['WHATSAPP', 'EMAIL']])));
/** Los contactos que ya salieron esta semana: [{ id_miembro, canal, fecha }]. La tabla de avisos automaticos no existe. */
const contactos = (previos = []) => [
  [/FROM envio_mensaje e\s+INNER JOIN canal_comunicacion/, (p) => ({ rows: previos.filter((c) => p[0].includes(c.id_miembro) && c.fecha >= p[1]) })],
  [/to_regclass/, filas([{ existe: false }])],
];
/**
 * Los destinatarios de una ejecucion, en memoria. Lo que guarda el INSERT es lo
 * que despues leen la entrega (los PENDIENTE, en orden de llegada), el bloqueo
 * de cada fila y el resumen por estado y motivo, y lo cambia el UPDATE.
 * `miembros` son los datos con que se arma cada mensaje e `iniciales`, los
 * destinatarios que ya estaban guardados. El id del destinatario de un miembro
 * es 50 + su id (el 91 es el de Ana).
 */
function destinatariosEnMemoria(miembros, iniciales = []) {
  const tabla = iniciales.map((d) => ({ motivo: null, fecha_envio: null, ...d, id_campana_destinatario: 50 + d.id_miembro }));
  const conMiembro = (d) => ({ ...miembros.find((m) => m.id_miembro === d.id_miembro), ...d });
  return [
    [/INSERT INTO campana_destinatario/, ([idCampana, idMiembro, estado, motivo]) => {
      tabla.push({ id_campana: idCampana, id_campana_destinatario: 50 + idMiembro, id_miembro: idMiembro, estado_envio: estado, motivo, fecha_envio: null });
      return { rows: [] };
    }],
    [PENDIENTES, ([idCampana]) => ({ rows: tabla.filter((d) => d.id_campana === idCampana && d.estado_envio === 'PENDIENTE').map(conMiembro) })],
    // Con SKIP LOCKED la toma el envio; sin el, el reintento de la constancia (#111).
    [/SELECT estado_envio FROM campana_destinatario[\s\S]*FOR UPDATE/, ([id]) => ({ rows: tabla.filter((d) => d.id_campana_destinatario === id).map((d) => ({ estado_envio: d.estado_envio })) })],
    [MARCAR, ([id, estado, motivo, fecha]) => {
      const d = tabla.find((x) => x.id_campana_destinatario === id);
      Object.assign(d, { estado_envio: estado, motivo, fecha_envio: fecha || d.fecha_envio });
      return { rows: [{ id_campana_destinatario: id, estado_envio: estado, motivo, fecha_envio: d.fecha_envio }] };
    }],
    [/GROUP BY estado_envio, motivo/, ([idCampana]) => {
      const grupos = [];
      for (const d of tabla.filter((x) => x.id_campana === idCampana)) {
        const grupo = grupos.find((g) => g.estado_envio === d.estado_envio && g.motivo === d.motivo);
        if (grupo) grupo.n += 1; else grupos.push({ estado_envio: d.estado_envio, motivo: d.motivo, n: 1 });
      }
      return { rows: grupos };
    }],
  ];
}
/** Como quedo cada destinatario (UPDATE campana_destinatario), en orden: miembro, estado y motivo. */
const estadosGuardados = () => llamadas(MARCAR).map(({ params }) => [params[0] - 50, params[1], params[2]]);
/** Los destinatarios tal como se guardaron al ejecutar (INSERT), en orden. */
const destinatariosGuardados = () => llamadas(/INSERT INTO campana_destinatario/).map(({ params }) => params);

let deps;
beforeAll(() => {
  establecerBusquedaPersonal((p) => ({ activo: true, id_gimnasio: p.gymId, rol_nombre: 'ADMINISTRADOR' }));
});
afterAll(() => {
  establecerBusquedaPersonal(null);
  legal.establecerReloj(null);
});

beforeEach(() => {
  // El enlace de baja se firma con JWT_SECRET (sin BAJA_SECRET) y apunta al primer origen de FRONTEND_URL.
  process.env = { ...ENV_ORIGINAL, JWT_SECRET: SECRETO, FRONTEND_URL: 'http://localhost:5173' };
  delete process.env.BAJA_SECRET;
  relojEn(MARTES);
  mockReglas = [];
  mockLlamadas = [];
  deps = {
    canalDelGimnasio: jest.fn(async () => 3),
    enviarCorreo: jest.fn(async () => ({ delivered: true })),
    enviarWhatsapp: jest.fn(async () => ({ ok: true })),
    whatsappActivo: jest.fn(() => true),
    esperar: jest.fn(async () => {}),
  };
  campanasRouter.setDeps(deps);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

// ===========================================================================
describe('/api/admin/plantillas: the reusable templates', () => {
  const PLANTILLA = { id_plantilla: 3, nombre: 'Regreso', contenido: 'Hola {nombre}, te esperamos.', activa: true, fecha_creacion: '2026-11-01T12:00:00.000Z' };

  test('should list the templates of the gym of the admin with the variables the text admits', async () => {
    // Arrange
    responder([/FROM plantilla_mensaje WHERE id_gimnasio = \$1/, filas([PLANTILLA])]);

    // Act
    const r = await pedir('get', '/admin/plantillas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ plantillas: [PLANTILLA], variables: VARIABLES });
    expect(llamadas(/FROM plantilla_mensaje/)[0].params).toEqual([7]);
  });

  test('should answer 503 DB_UNREACHABLE and log the cause when the templates cannot be read', async () => {
    // Arrange
    responder([/FROM plantilla_mensaje/, falla('08006')]);

    // Act
    const r = await pedir('get', '/admin/plantillas');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar las plantillas.', code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith('[GET /admin/plantillas] Error:', 'fallo de la BD');
  });

  test.each([
    ['active when activa is not sent', {}, true],
    ['inactive when activa is false', { activa: false }, false],
  ])('should create the template trimmed and %s', async (_caso, extra, activa) => {
    // Arrange
    responder([/INSERT INTO plantilla_mensaje/, filas([{ ...PLANTILLA, activa }])]);

    // Act
    const r = await pedir('post', '/admin/plantillas').send({ nombre: '  Regreso ', contenido: ' Hola {nombre}, te esperamos. ', ...extra });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ plantilla: { ...PLANTILLA, activa } });
    expect(llamadas(/INSERT INTO plantilla_mensaje/)[0].params).toEqual([7, 'Regreso', 'Hola {nombre}, te esperamos.', activa, 1]);
  });

  test('should answer 400 VALIDATION_ERROR without writing when the name is too short', async () => {
    // Act
    const r = await pedir('post', '/admin/plantillas').send({ nombre: 'ab', contenido: 'Hola {nombre}' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['nombre']);
    expect(llamadas(/plantilla_mensaje/)).toHaveLength(0);
  });

  test('should answer 409 PLANTILLA_DUPLICADA when the gym already has a template with that name', async () => {
    // Arrange: la restriccion UNIQUE (id_gimnasio, nombre)
    responder([/INSERT INTO plantilla_mensaje/, falla('23505')]);

    // Act
    const r = await pedir('post', '/admin/plantillas').send({ nombre: 'Regreso', contenido: 'Hola {nombre}' });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Ya existe una plantilla con ese nombre.', code: 'PLANTILLA_DUPLICADA' });
  });

  test('should update only the fields sent on the template of the gym of the admin', async () => {
    // Arrange
    responder([/UPDATE plantilla_mensaje SET/, filas([{ ...PLANTILLA, contenido: 'Te esperamos, {primer_nombre}.', activa: false }])]);

    // Act
    const r = await pedir('put', '/admin/plantillas/3').send({ contenido: ' Te esperamos, {primer_nombre}. ', activa: false });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.plantilla).toMatchObject({ contenido: 'Te esperamos, {primer_nombre}.', activa: false });
    const [update] = llamadas(/UPDATE plantilla_mensaje/);
    expect(update.sql).toMatch(/SET contenido = \$1, activa = \$2\s+WHERE id_plantilla = \$3 AND id_gimnasio = \$4/);
    expect(update.params).toEqual(['Te esperamos, {primer_nombre}.', false, 3, 7]);
  });

  test('should answer 400 VALIDATION_ERROR on PUT without writing when nothing is sent', async () => {
    // Act
    const r = await pedir('put', '/admin/plantillas/3').send({});

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Nada que actualizar.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/plantilla_mensaje/)).toHaveLength(0);
  });

  test.each([
    ['PUT', 'put', { nombre: 'Otro nombre' }],
    ['DELETE', 'delete', undefined],
  ])('should answer 404 NOT_FOUND on %s when the template is not of the gym of the admin', async (_m, metodo, cuerpo) => {
    // Arrange
    responder([/UPDATE plantilla_mensaje/, filas([])]);

    // Act
    const r = await pedir(metodo, '/admin/plantillas/99').send(cuerpo);

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Plantilla no encontrada.', code: 'NOT_FOUND' });
    expect(llamadas(/UPDATE plantilla_mensaje/)[0].params.slice(-2)).toEqual([99, 7]);
  });

  test('should deactivate the template instead of deleting it, so the campaigns that used it keep their text', async () => {
    // Arrange
    responder([/UPDATE plantilla_mensaje SET activa = FALSE/, filas([{ ...PLANTILLA, activa: false }])]);

    // Act
    const r = await pedir('delete', '/admin/plantillas/3');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ plantilla: { ...PLANTILLA, activa: false } });
    expect(llamadas(/UPDATE plantilla_mensaje SET activa = FALSE/)[0].params).toEqual([3, 7]);
    expect(llamadas(/DELETE/)).toHaveLength(0);
  });

  test.each(['abc', '0', '3.5', '03'])('should answer 400 VALIDATION_ERROR without touching the database when the template id is %s', async (id) => {
    // Act
    const r = await pedir('delete', `/admin/plantillas/${id}`);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id de plantilla invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/plantilla_mensaje/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('GET /api/admin/campanas: the list and the due scheduled campaigns', () => {
  const LISTA = /WHERE c\.id_gimnasio = \$1\s+GROUP BY c\.id_campana/;

  test('should answer the campaigns with the segments, their default days, the variables and the schedule of the law when it is inside the allowed schedule', async () => {
    // Arrange: martes a las 10:00 a. m. (beforeEach)
    responder([LISTA, filas([CAMPANA])]);

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      campanas: [CAMPANA],
      segmentos: [
        { valor: 'TODOS', etiqueta: 'Todos los miembros activos', dias: null },
        { valor: 'INACTIVOS', etiqueta: 'Inactivos', dias: 7 },
        { valor: 'NUEVOS', etiqueta: 'Nuevos', dias: 30 },
        { valor: 'PROXIMOS_A_VENCER', etiqueta: 'Próximos a vencer', dias: 7 },
      ],
      variables: VARIABLES,
      horario: EN_HORARIO,
    });
    expect(llamadas(LISTA)[0].params).toEqual([7]);
  });

  test.each([
    ['Sunday', '2026-11-22 10:00', LUNES_7AM, LUNES_7AM_TEXTO],
    ['a holiday', '2026-11-16 10:00', '2026-11-17T12:00:00.000Z', 'martes 17 de noviembre a las 7:00 a. m.'],
    ['Friday at 7:00 p. m.', '2026-11-20 19:00', '2026-11-21T13:00:00.000Z', 'sábado 21 de noviembre a las 8:00 a. m.'],
    ['Saturday at 3:00 p. m.', '2026-11-21 15:00', LUNES_7AM, LUNES_7AM_TEXTO],
  ])('should say that it cannot be sent now and when the next allowed time is when it is %s', async (_caso, hora, siguiente, siguienteTexto) => {
    // Arrange
    relojEn(co(hora));
    responder([LISTA, filas([CAMPANA])]);

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.horario).toEqual({ permitido: false, texto: TEXTO_HORARIO, siguiente, siguiente_texto: siguienteTexto });
  });

  // Antes del #108 la lista ejecutaba primero las programadas vencidas del
  // gimnasio. Ahora solo lee: las ejecuta el scheduler (jobs/campanas.js), y
  // el filtro por gimnasio va en la consulta (ver "the scheduler job").
  test('should only read and leave the due campaigns to the scheduler when the server slept through their time', async () => {
    // Arrange: la 5 esta programada y su hora ya paso. Solo se declara la
    // lectura de la lista: buscar las vencidas o ejecutarlas lanzaria error.
    const vencida = { ...CAMPANA, id_campana: 5, tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-17T08:00' };
    responder([LISTA, filas([vencida])]);

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.campanas).toEqual([vencida]);
    expect(llamadas(VENCIDAS)).toHaveLength(0);
    expect(llamadas(/FOR UPDATE|INSERT INTO|UPDATE /)).toHaveLength(0);
    expect(transacciones()).toEqual([]);
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(deps.enviarCorreo).not.toHaveBeenCalled();
  });

  test('should answer 503 DB_UNREACHABLE when the campaigns cannot be read', async () => {
    // Arrange
    responder([LISTA, falla()]);

    // Act
    const r = await pedir('get', '/admin/campanas');

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos cargar las campañas.', code: 'DB_UNREACHABLE' });
  });
});

// ===========================================================================
describe('GET /api/admin/campanas/segmento: the preview of a segment', () => {
  test.each([
    ['the default days of the segment when no days are sent', '', 7],
    ['the default days of the segment when the days come empty', '&dias=', 7],
    ['the days sent when the admin writes them', '&dias=15', 15],
  ])('should count the members with WhatsApp and with email, and the ones who accepted commercial messages by each channel, using %s', async (_caso, query, dias) => {
    // Arrange: Ana acepto los dos canales, Beto cancelo la aceptacion y Carla solo acepto el correo
    responder(delSegmento([ANA, BETO, CARLA]), aceptan({ 41: ['WHATSAPP', 'EMAIL'], 42: null, 43: ['EMAIL'] }));

    // Act
    const r = await pedir('get', `/admin/campanas/segmento?segmento=INACTIVOS${query}`);

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      segmento: 'INACTIVOS',
      dias,
      total: 3,
      con_telefono: 2,
      con_correo: 2,
      aceptan_whatsapp: 1,
      aceptan_correo: 2,
      muestra: [{ id_miembro: 41, nombre: 'Ana Ruiz' }, { id_miembro: 42, nombre: 'Beto Gil' }, { id_miembro: 43, nombre: 'Carla Paz' }],
    });
    expect(llamadas(/FROM miembro m/)[0].params).toEqual([7, dias]);
    // La aceptacion se lee solo de los miembros del segmento y del gimnasio del admin.
    expect(llamadas(ACEPTACION)[0].params).toEqual([[41, 42, 43], 7]);
  });

  test('should show a sample of at most 10 members when the segment is bigger', async () => {
    // Arrange: ninguno tiene registrada una aceptacion de mensajes comerciales
    const muchos = Array.from({ length: 12 }, (_, i) => ({ ...BETO, id_miembro: 100 + i, nombre: `Miembro ${i}` }));
    responder(delSegmento(muchos), aceptan({}));

    // Act
    const r = await pedir('get', '/admin/campanas/segmento?segmento=TODOS');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ segmento: 'TODOS', dias: null, total: 12, con_telefono: 0, con_correo: 0, aceptan_whatsapp: 0, aceptan_correo: 0 });
    expect(r.body.muestra).toHaveLength(10);
  });

  test.each(['ETIQUETA', ''])('should answer 400 VALIDATION_ERROR without reading the members when the segment is "%s"', async (segmento) => {
    // Act
    const r = await pedir('get', `/admin/campanas/segmento?segmento=${segmento}`);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Segmento invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/FROM miembro/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas: create a campaign', () => {
  const INSERT = /INSERT INTO campana \(/;
  const crear = (cambios) => pedir('post', '/admin/campanas').send({ nombre: ' Te extrañamos ', segmento: 'INACTIVOS', dias: '10', ...cambios });

  test('should create a manual WhatsApp campaign with the message written and answer it with its counters', async () => {
    // Arrange
    responder([INSERT, filas([{ id_campana: 4 }])], laCampana(filas([CAMPANA])));

    // Act
    const r = await crear({ mensaje: ` ${MENSAJE} ` });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ campana: CAMPANA });
    expect(llamadas(INSERT)[0].params).toEqual([7, 'Te extrañamos', 'INACTIVOS', MENSAJE, null, 'MANUAL', 10, null, 1, 'WHATSAPP']);
    expect(llamadas(/GROUP BY c\.id_campana/)[0].params).toEqual([4, 7]);
  });

  test('should copy the text of the active template of the gym when no message is written', async () => {
    // Arrange
    responder(
      [/SELECT contenido FROM plantilla_mensaje/, filas([{ contenido: 'Hola {nombre}, te esperamos.' }])],
      [INSERT, filas([{ id_campana: 4 }])],
      laCampana(filas([CAMPANA])),
    );

    // Act
    const r = await crear({ id_plantilla: 3 });

    // Assert
    expect(r.status).toBe(201);
    expect(llamadas(/SELECT contenido FROM plantilla_mensaje/)[0].params).toEqual([3, 7]);
    expect(llamadas(INSERT)[0].params.slice(3, 5)).toEqual(['Hola {nombre}, te esperamos.', 3]);
  });

  test('should keep the message written and only check that the template is of the gym when both are sent', async () => {
    // Arrange
    responder(
      [/SELECT 1 FROM plantilla_mensaje/, filas([{ '?column?': 1 }])],
      [INSERT, filas([{ id_campana: 4 }])],
      laCampana(filas([CAMPANA])),
    );

    // Act
    const r = await crear({ id_plantilla: 3, mensaje: MENSAJE });

    // Assert
    expect(r.status).toBe(201);
    expect(llamadas(/SELECT 1 FROM plantilla_mensaje/)[0].params).toEqual([3, 7]);
    expect(llamadas(INSERT)[0].params.slice(3, 5)).toEqual([MENSAJE, 3]);
    expect(llamadas(/SELECT contenido/)).toHaveLength(0);
  });

  test.each([
    ['no message is written', {}, /SELECT contenido FROM plantilla_mensaje/],
    ['a message is written', { mensaje: MENSAJE }, /SELECT 1 FROM plantilla_mensaje/],
  ])('should answer 404 NOT_FOUND without creating it when the template is not of the gym and %s', async (_caso, extra, patron) => {
    // Arrange
    responder([patron, filas([])]);

    // Act
    const r = await crear({ id_plantilla: 99, ...extra });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Plantilla no encontrada.', code: 'NOT_FOUND' });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test.each([
    ['there is no message and no template', {}],
    ['the message has less than 5 characters', { mensaje: 'Hola' }],
  ])('should answer 400 VALIDATION_ERROR without creating it when %s', async (_caso, extra) => {
    // Act
    const r = await crear(extra);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Escribe el mensaje o elige una plantilla.', code: 'VALIDATION_ERROR' });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test('should create a scheduled email campaign with the Colombian date and time when the date is in the future', async () => {
    // Arrange
    responder(
      [/AS futura/, filas([{ futura: true }])],
      [INSERT, filas([{ id_campana: 4 }])],
      laCampana(filas([{ ...CAMPANA, canal: 'EMAIL', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00' }])),
    );

    // Act
    const r = await crear({ mensaje: MENSAJE, canal: 'EMAIL', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00' });

    // Assert
    expect(r.status).toBe(201);
    expect(r.body.campana).toMatchObject({ canal: 'EMAIL', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-25T08:00' });
    const [futura] = llamadas(/AS futura/);
    expect(futura.sql).toMatch(/AT TIME ZONE 'America\/Bogota'/);
    expect(futura.params).toEqual(['2026-11-25T08:00']);
    expect(llamadas(INSERT)[0].params).toEqual([7, 'Te extrañamos', 'INACTIVOS', MENSAJE, null, 'PROGRAMADO', 10, '2026-11-25T08:00', 1, 'EMAIL']);
  });

  test.each([
    ['there is no date', {}, [], 'Elige la fecha y la hora de envío.'],
    ['the date already passed', { fecha_programada: '2026-11-20T08:00' }, [[/AS futura/, filas([{ futura: false }])]], 'La fecha de envío debe ser futura.'],
  ])('should answer 400 VALIDATION_ERROR without creating a scheduled campaign when %s', async (_caso, extra, reglas, mensaje) => {
    // Arrange
    responder(...reglas);

    // Act
    const r = await crear({ mensaje: MENSAJE, tipo_disparo: 'PROGRAMADO', ...extra });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: mensaje, code: 'VALIDATION_ERROR' });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test.each([
    ['a Sunday', '2026-11-22T10:00', LUNES_7AM, LUNES_7AM_TEXTO],
    ['a holiday', '2026-12-08T10:00', '2026-12-09T12:00:00.000Z', 'miércoles 9 de diciembre a las 7:00 a. m.'],
    ['a weekday at 7:00 p. m.', '2026-11-25T19:00', '2026-11-26T12:00:00.000Z', 'jueves 26 de noviembre a las 7:00 a. m.'],
    ['a Saturday before 8:00 a. m.', '2026-11-28T07:59', '2026-11-28T13:00:00.000Z', 'sábado 28 de noviembre a las 8:00 a. m.'],
  ])('should answer 400 FUERA_DE_HORARIO with the next allowed time, without creating it, when the scheduled time is %s', async (_caso, fecha, siguiente, siguienteTexto) => {
    // Arrange: la fecha es futura, pero la Ley 2300 no deja contactar a esa hora
    responder([/AS futura/, filas([{ futura: true }])]);

    // Act
    const r = await crear({ mensaje: MENSAJE, tipo_disparo: 'PROGRAMADO', fecha_programada: fecha });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: `Esa hora está fuera del horario permitido. La Ley 2300 de 2023 solo permite enviar mensajes ${TEXTO_HORARIO}. El siguiente horario permitido es el ${siguienteTexto}`,
      code: 'FUERA_DE_HORARIO',
      details: { siguiente },
    });
    expect(llamadas(INSERT)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when the segment does not exist', async () => {
    // Act
    const r = await crear({ segmento: 'ETIQUETA', mensaje: MENSAJE });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['segmento']);
    expect(llamadas(/campana|plantilla/)).toHaveLength(0);
  });

  test('should answer 400 VALIDATION_ERROR when a CHECK of the database rejects the campaign', async () => {
    // Arrange: el CHECK de campana.segmento en produccion
    responder([INSERT, falla('23514')]);

    // Act
    const r = await crear({ mensaje: MENSAJE });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Los datos no son validos.', code: 'VALIDATION_ERROR' });
  });
});

// ===========================================================================
describe('PUT /api/admin/campanas/:id: edit a campaign while it is scheduled', () => {
  const UPDATE = /UPDATE campana SET nombre = \$3/;

  test('should merge the changes with the saved campaign and answer it as it was saved', async () => {
    // Arrange
    const editada = { ...CAMPANA, nombre: 'Vuelve pronto', canal: 'EMAIL' };
    responder(laCampana(filas([CAMPANA]), filas([editada])), [UPDATE, cambiadas(1)]);

    // Act
    const r = await pedir('put', '/admin/campanas/4').send({ nombre: 'Vuelve pronto', canal: 'EMAIL' });

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ campana: editada });
    const [update] = llamadas(UPDATE);
    expect(update.sql).toMatch(/WHERE id_campana = \$1 AND id_gimnasio = \$2 AND estado = 'PROGRAMADA'/);
    expect(update.params).toEqual([4, 7, 'Vuelve pronto', 'INACTIVOS', MENSAJE, null, 'MANUAL', 10, null, 'EMAIL']);
  });

  test.each(['ENVIADA', 'CANCELADA'])('should answer 409 CAMPANA_NO_EDITABLE without saving when the campaign is %s', async (estado) => {
    // Arrange
    responder(laCampana(filas([{ ...CAMPANA, estado }])));

    // Act
    const r = await pedir('put', '/admin/campanas/4').send({ nombre: 'Vuelve pronto' });

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Solo se puede editar una campaña que no se ha enviado.', code: 'CAMPANA_NO_EDITABLE' });
    expect(llamadas(UPDATE)).toHaveLength(0);
  });

  test('should answer 404 NOT_FOUND when the campaign is not of the gym of the admin', async () => {
    // Arrange
    responder(laCampana(filas([])));

    // Act
    const r = await pedir('put', '/admin/campanas/99').send({ nombre: 'Vuelve pronto' });

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Campaña no encontrada.', code: 'NOT_FOUND' });
    expect(llamadas(/GROUP BY c\.id_campana/)[0].params).toEqual([99, 7]);
  });

  test.each(['abc', '0', '4.5', '04'])('should answer 400 VALIDATION_ERROR without touching the database when the campaign id is %s', async (id) => {
    // Act
    const r = await pedir('put', `/admin/campanas/${id}`).send({ nombre: 'Vuelve pronto' });

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id de campaña invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/campana/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas/:id/ejecutar: send a campaign now', () => {
  const ejecutar = () => pedir('post', '/admin/campanas/4/ejecutar');
  const enviada = (contadores) => filas([{ ...CAMPANA, estado: 'ENVIADA', fecha_ejecucion: '2026-11-17T10:00', ...contadores }]);
  const PROGRAMAR = /UPDATE campana SET tipo_disparo = 'PROGRAMADO'/;
  /**
   * Reglas de una ejecucion completa. `acepta` es la aceptacion de mensajes
   * comerciales de cada miembro (por defecto, todos aceptaron los dos canales)
   * y `previos`, los contactos que ya salieron esta semana.
   */
  const reglasDeEnvio = ({ campana = PARA_EJECUTAR, miembros = [ANA, BETO, CARLA], acepta, previos = [], contadores = {} } = {}) => [
    laCampana(filas([CAMPANA]), enviada(contadores)),
    paraEjecutar(filas([campana])),
    delSegmento(miembros),
    acepta ? aceptan(acepta) : todosAceptan(miembros),
    ...contactos(previos),
    ...destinatariosEnMemoria(miembros),
    marcarEnviada,
    bloqueoDeContacto,
    guardarEnvio(),
  ];
  const SIN_OMITIDOS = { omitidos: 0, omitidosPorMotivo: {}, cerroFranja: false };

  test('should send by WhatsApp, with the unsubscribe link, to the members who accepted it and have a phone, and mark the one without a phone as FALLIDO when the WhatsApp module is active', async () => {
    // Arrange: Ana, Beto y Carla aceptaron los mensajes comerciales por WhatsApp
    responder(...reglasDeEnvio({ contadores: { destinatarios: 3, enviados: 2, fallidos: 1 } }));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 2, fallidos: 1, pendientes: 0, canal: 'WHATSAPP', ...SIN_OMITIDOS });
    expect(r.body.campana).toMatchObject({ estado: 'ENVIADA', enviados: 2, fallidos: 1 });
    expect(deps.enviarWhatsapp.mock.calls).toEqual([
      ['573001234567', `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`],
      ['573109876543', `Hola Carla, llevas 30 días sin venir a Gym Norte.${baja(43)}`],
    ]);
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO', null], [42, 'FALLIDO', 'SIN_TELEFONO'], [43, 'ENVIADO', null]]);
    // Los destinatarios y el estado ENVIADA quedan en la misma transaccion, con la fila bloqueada.
    expect(destinatariosGuardados()).toEqual([[4, 41, 'PENDIENTE', null], [4, 42, 'PENDIENTE', null], [4, 43, 'PENDIENTE', null]]);
    expect(llamadas(/FROM miembro m/)[0].params).toEqual([7, 10]);
    // La aceptacion se lee de los tres al congelar y otra vez de cada uno al entregarle.
    expect(llamadas(ACEPTACION).map(({ params }) => params)).toEqual([[[41, 42, 43], 7], [[41], 7], [[42], 7], [[43], 7]]);
    // La campana queda ENVIADA con la hora del reloj de la ley.
    expect(llamadas(/UPDATE campana SET estado = 'ENVIADA'/)[0].params).toEqual([4, MARTES]);
    // Una transaccion para congelar los destinatarios y una por cada entrega guardada.
    expect(transacciones()).toEqual(Array(4).fill(['BEGIN', 'COMMIT', 'release']).flat());
    // Cada entrega deja constancia en envio_mensaje, con el canal del gimnasio y la hora del reloj.
    expect(llamadas(/INSERT INTO envio_mensaje/)[0].params).toEqual([7, 41, 3, null, 4, null, `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`, 'ENVIADO', MARTES, 1]);
    expect(deps.canalDelGimnasio).toHaveBeenCalledWith(expect.anything(), 7, 'WHATSAPP');
  });

  test('should leave OMITIDO with its reason, without writing to them, the members who did not accept commercial messages by that channel or were already contacted today', async () => {
    // Arrange: Ana acepto WhatsApp; Beto no tiene aceptacion registrada; Carla solo
    // acepto el correo; Dani acepto WhatsApp, pero ya se le escribio hoy a las 8:00 a. m.
    responder(...reglasDeEnvio({
      miembros: [ANA, BETO, CARLA, DANI],
      acepta: { 41: ['WHATSAPP'], 43: ['EMAIL'], 44: ['WHATSAPP'] },
      previos: [{ id_miembro: 44, canal: 'WHATSAPP', fecha: co('2026-11-17 08:00') }],
    }));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({
      destinatarios: 4, enviados: 1, fallidos: 0, pendientes: 0, canal: 'WHATSAPP',
      omitidos: 3, omitidosPorMotivo: { NO_AUTORIZA: 1, CANAL_NO_AUTORIZADO: 1, FRECUENCIA: 1 }, cerroFranja: false,
    });
    expect(destinatariosGuardados()).toEqual([
      [4, 41, 'PENDIENTE', null], [4, 42, 'OMITIDO', 'NO_AUTORIZA'], [4, 43, 'OMITIDO', 'CANAL_NO_AUTORIZADO'], [4, 44, 'OMITIDO', 'FRECUENCIA'],
    ]);
    expect(deps.enviarWhatsapp.mock.calls.map(([telefono]) => telefono)).toEqual(['573001234567']);
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO', null]]);
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => params[1])).toEqual([41]);
  });

  test('should omit every member when nobody has accepted commercial messages, which is the default', async () => {
    // Arrange: ninguno tiene fila de MENSAJES_COMERCIALES (asi quedan los miembros que ya existian)
    responder(...reglasDeEnvio({ acepta: {} }));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({
      destinatarios: 3, enviados: 0, fallidos: 0, pendientes: 0, canal: 'WHATSAPP',
      omitidos: 3, omitidosPorMotivo: { NO_AUTORIZA: 3 }, cerroFranja: false,
    });
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(llamadas(/INSERT INTO envio_mensaje/)).toHaveLength(0);
  });

  test.each([
    ['Sunday', '2026-11-22 10:00', LUNES_7AM, LUNES_7AM_TEXTO],
    ['a holiday', '2026-11-16 10:00', '2026-11-17T12:00:00.000Z', 'martes 17 de noviembre a las 7:00 a. m.'],
    ['Friday at 7:00 p. m.', '2026-11-20 19:00', '2026-11-21T13:00:00.000Z', 'sábado 21 de noviembre a las 8:00 a. m.'],
    ['Saturday at 3:00 p. m.', '2026-11-21 15:00', LUNES_7AM, LUNES_7AM_TEXTO],
  ])('should send nothing and answer 202 with the campaign scheduled for the next allowed time when it is %s', async (_caso, hora, siguiente, siguienteTexto) => {
    // Arrange: la Ley 2300 no deja contactar a esta hora. Solo se declaran la lectura
    // de la campana y su programacion: congelar destinatarios o enviar lanzaria error.
    relojEn(co(hora));
    const horaDeColombia = new Date(Date.parse(siguiente) - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const programada = { ...CAMPANA, tipo_disparo: 'PROGRAMADO', fecha_programada: horaDeColombia };
    responder(laCampana(filas([CAMPANA]), filas([programada])), [PROGRAMAR, cambiadas(1)]);

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(202);
    expect(r.body).toEqual({
      programada: true,
      message: `Ahora no se puede enviar. La Ley 2300 de 2023 solo permite enviar mensajes ${TEXTO_HORARIO}. El siguiente horario permitido es el ${siguienteTexto} La campaña quedó programada para el ${siguienteTexto}`,
      siguiente,
      campana: programada,
    });
    // Queda programada para ese instante, sin tocar los destinatarios ni enviar nada.
    const [programar] = llamadas(PROGRAMAR);
    expect(programar.sql).toMatch(/WHERE id_campana = \$1 AND id_gimnasio = \$2 AND estado = 'PROGRAMADA'/);
    expect(programar.params).toEqual([4, 7, new Date(siguiente)]);
    expect(llamadas(/FOR UPDATE|FROM miembro|INSERT INTO|UPDATE campana SET estado/)).toHaveLength(0);
    expect(transacciones()).toEqual([]);
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(deps.enviarCorreo).not.toHaveBeenCalled();
  });

  test('should leave PENDIENTE for sending by hand every member with a phone when the WhatsApp module is not active', async () => {
    // Arrange: los tres aceptaron los mensajes comerciales por WhatsApp
    deps.whatsappActivo.mockReturnValue(false);
    responder(...reglasDeEnvio());

    // Act
    const r = await ejecutar();

    // Assert: a Ana y a Carla se les envia a mano; a Beto, sin telefono, tampoco se le
    // puede escribir a mano y queda FALLIDO de una vez
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 0, fallidos: 1, pendientes: 2, canal: 'WHATSAPP', ...SIN_OMITIDOS });
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(estadosGuardados()).toEqual([[42, 'FALLIDO', 'SIN_TELEFONO']]);
    expect(destinatariosGuardados()).toEqual([[4, 41, 'PENDIENTE', null], [4, 42, 'PENDIENTE', null], [4, 43, 'PENDIENTE', null]]);
    // La unica constancia es la del fallido, con el enlace de baja y la hora del reloj.
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => params)).toEqual([
      [7, 42, 3, null, 4, null, `Hola Beto, llevas varios días sin venir a Gym Norte.${baja(42)}`, 'FALLIDO', MARTES, 1],
    ]);
    // Una transaccion para congelar los destinatarios y otra para el fallido; la ley se revisa solo para el.
    expect(transacciones()).toEqual(Array(2).fill(['BEGIN', 'COMMIT', 'release']).flat());
    expect(llamadas(/pg_advisory_xact_lock/).map(({ params }) => params)).toEqual([[42]]);
  });

  test.each(['WHATSAPP_NO_LISTO', 'WHATSAPP_DESHABILITADO'])('should stop trying WhatsApp and leave the rest PENDIENTE when the client answers %s', async (code) => {
    // Arrange: los tres aceptaron; el primer envio (a Ana) responde que el cliente no esta listo
    deps.enviarWhatsapp.mockRejectedValueOnce(Object.assign(new Error('sin cliente'), { code }));
    responder(...reglasDeEnvio());

    // Act
    const r = await ejecutar();

    // Assert: el intento de Ana se deshace y a Carla ya no se le intenta; Beto, sin
    // telefono, queda FALLIDO
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 0, fallidos: 1, pendientes: 2, canal: 'WHATSAPP', ...SIN_OMITIDOS });
    expect(deps.enviarWhatsapp).toHaveBeenCalledTimes(1);
    expect(deps.enviarWhatsapp.mock.calls[0]).toEqual(['573001234567', `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`]);
    expect(estadosGuardados()).toEqual([[42, 'FALLIDO', 'SIN_TELEFONO']]);
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => [params[1], params[7]])).toEqual([[42, 'FALLIDO']]);
    // Congelar los destinatarios, el intento de Ana que se deshace y el fallido de Beto.
    expect(transacciones()).toEqual(['BEGIN', 'COMMIT', 'release', 'BEGIN', 'ROLLBACK', 'release', 'BEGIN', 'COMMIT', 'release']);
  });

  test.each([
    ['has five digits', '12345'],
    ['has no digits', 'no tiene'],
  ])('should mark FALLIDO the member whose phone is not valid for WhatsApp and leave PENDIENTE the ones with a valid phone when the WhatsApp module is not active and the phone %s', async (_caso, telefono) => {
    // Arrange: los tres aceptaron WhatsApp; Dani tiene algo escrito en el telefono, pero
    // no sirve para WhatsApp (menos de siete digitos), asi que tampoco se le puede escribir a mano
    deps.whatsappActivo.mockReturnValue(false);
    responder(...reglasDeEnvio({ miembros: [ANA, { ...DANI, telefono }, CARLA] }));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 0, fallidos: 1, pendientes: 2, canal: 'WHATSAPP', ...SIN_OMITIDOS });
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(estadosGuardados()).toEqual([[44, 'FALLIDO', 'SIN_TELEFONO']]);
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => [params[1], params[7]])).toEqual([[44, 'FALLIDO']]);
    expect(transacciones()).toEqual(Array(2).fill(['BEGIN', 'COMMIT', 'release']).flat());
  });

  test('should mark FALLIDO the member whose WhatsApp fails for another reason and keep sending to the rest', async () => {
    // Arrange
    deps.enviarWhatsapp.mockRejectedValueOnce(new Error('numero invalido'));
    responder(...reglasDeEnvio());

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 3, enviados: 1, fallidos: 2, pendientes: 0, canal: 'WHATSAPP', ...SIN_OMITIDOS });
    expect(estadosGuardados()).toEqual([[41, 'FALLIDO', 'ERROR_ENVIO'], [42, 'FALLIDO', 'SIN_TELEFONO'], [43, 'ENVIADO', null]]);
  });

  test('should send an email, with the unsubscribe link, to each member who accepted it and has an email, and mark FALLIDO the ones without email or whose email was not delivered when the channel is EMAIL', async () => {
    // Arrange: los cuatro aceptaron el correo; a Ana le llega, Beto no tiene correo, a Carla Brevo no lo entrega y con Dani falla
    deps.enviarCorreo.mockImplementation(async (to) => {
      if (to === 'dani@example.com') throw new Error('Brevo no responde');
      return { delivered: to === 'ana@example.com' };
    });
    responder(...reglasDeEnvio({ campana: { ...PARA_EJECUTAR, canal: 'EMAIL' }, miembros: [ANA, BETO, CARLA, DANI] }));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ destinatarios: 4, enviados: 1, fallidos: 3, pendientes: 0, canal: 'EMAIL', ...SIN_OMITIDOS });
    expect(deps.enviarCorreo.mock.calls.map(([to]) => to)).toEqual(['ana@example.com', 'carla@example.com', 'dani@example.com']);
    expect(deps.enviarCorreo).toHaveBeenCalledWith('ana@example.com', 'Te extrañamos', `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`);
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO', null], [42, 'FALLIDO', 'SIN_CORREO'], [43, 'FALLIDO', 'ERROR_ENVIO'], [44, 'FALLIDO', 'ERROR_ENVIO']]);
    expect(deps.canalDelGimnasio).toHaveBeenCalledWith(expect.anything(), 7, 'EMAIL');
  });

  test.each([
    ['ENVIADA', true, 'La campaña ya se envió.'],
    ['CANCELADA', false, 'La campaña está cancelada.'],
    ['PROGRAMADA', false, 'La campaña está cancelada.'],
  ])('should answer 409 CAMPANA_NO_EJECUTABLE without sending when the campaign is %s and activa is %s', async (estado, activa, mensaje) => {
    // Arrange
    responder(laCampana(filas([{ ...CAMPANA, estado, activa }])));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: mensaje, code: 'CAMPANA_NO_EJECUTABLE' });
    expect(llamadas(/FOR UPDATE/)).toHaveLength(0);
  });

  test('should answer 409 CAMPANA_NO_EJECUTABLE and roll back when another execution took the campaign first', async () => {
    // Arrange: al bloquear la fila, otra ejecucion ya la paso a ENVIADA
    responder(laCampana(filas([CAMPANA])), paraEjecutar(filas([{ ...PARA_EJECUTAR, estado: 'ENVIADA' }])));

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'La campaña ya se está enviando.', code: 'CAMPANA_NO_EJECUTABLE' });
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
    expect(llamadas(/INSERT INTO campana_destinatario|UPDATE campana SET estado/)).toHaveLength(0);
  });

  test('should roll back, release the client and answer 503 DB_UNREACHABLE when the recipients cannot be saved', async () => {
    // Arrange
    responder(
      laCampana(filas([CAMPANA])),
      paraEjecutar(filas([PARA_EJECUTAR])),
      delSegmento([ANA]),
      todosAceptan([ANA]),
      ...contactos(),
      guardarDestinatario(falla('08006')),
    );

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos ejecutar la campaña.', code: 'DB_UNREACHABLE' });
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
    expect(llamadas(/UPDATE campana SET estado = 'ENVIADA'/)).toHaveLength(0);
  });

  test('should roll back the record of the delivery and tell the admin when it cannot be saved', async () => {
    // Arrange: el correo a Ana (que lo acepto) sale, pero su constancia no se puede guardar
    responder(
      laCampana(filas([CAMPANA])),
      paraEjecutar(filas([{ ...PARA_EJECUTAR, canal: 'EMAIL' }])),
      delSegmento([ANA]),
      todosAceptan([ANA]),
      ...contactos(),
      ...destinatariosEnMemoria([ANA]),
      marcarEnviada,
      bloqueoDeContacto,
      guardarEnvio(falla('08006')),
    );

    // Act
    const r = await ejecutar();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('CONSTANCIA_NO_GUARDADA');
    expect(r.body.error).toMatch(/Ana.* salió, pero no se pudo guardar la constancia: sigue PENDIENTE y un reintento puede repetirlo/);
    expect(deps.enviarCorreo).toHaveBeenCalledTimes(1);
    // El correo salio: la constancia se intenta en su transaccion y, por el
    // #111, otras tres veces aparte antes de rendirse. Nunca se marca FALLIDO.
    expect(transacciones()).toEqual([
      'BEGIN', 'COMMIT', 'release',
      'BEGIN', 'ROLLBACK',
      'BEGIN', 'ROLLBACK', 'release',
      'BEGIN', 'ROLLBACK', 'release',
      'BEGIN', 'ROLLBACK', 'release',
      'ROLLBACK', 'release',
    ]);
    expect(llamadas(/INSERT INTO envio_mensaje/)).toHaveLength(4);
    expect(llamadas(/UPDATE campana_destinatario/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas/:id/reintentar: process again the recipients left PENDIENTE', () => {
  const reintentar = () => pedir('post', '/admin/campanas/4/reintentar');
  // La campana por correo ya se ejecuto y le quedaron dos destinatarios PENDIENTE.
  const CON_DOS_PENDIENTES = { ...CAMPANA, canal: 'EMAIL', estado: 'ENVIADA', fecha_ejecucion: '2026-11-17T09:00', destinatarios: 2, pendientes: 2 };
  const anaYCarlaPendientes = () => destinatariosEnMemoria([ANA, CARLA], [
    { id_campana: 4, id_miembro: 41, estado_envio: 'PENDIENTE' },
    { id_campana: 4, id_miembro: 43, estado_envio: 'PENDIENTE', motivo: 'FUERA_DE_HORARIO' },
  ]);

  test('should send to the recipients left PENDIENTE who still accept, omit the one who cancelled and answer the new summary', async () => {
    // Arrange: el envio se interrumpio con Ana y Carla PENDIENTE; despues Carla cancelo la aceptacion
    const despues = { ...CON_DOS_PENDIENTES, enviados: 1, pendientes: 0, omitidos: 1 };
    responder(
      laCampana(filas([CON_DOS_PENDIENTES]), filas([despues])),
      paraReanudar(filas([PARA_REANUDAR])),
      ...anaYCarlaPendientes(),
      bloqueoDeContacto,
      aceptan({ 41: ['EMAIL'], 43: null }),
      ...contactos(),
      guardarEnvio(),
    );

    // Act
    const r = await reintentar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      resumen: {
        destinatarios: 2, enviados: 1, fallidos: 0, pendientes: 0, canal: 'EMAIL',
        omitidos: 1, omitidosPorMotivo: { NO_AUTORIZA: 1 }, cerroFranja: false, procesados: 2,
      },
      message: 'Reintento hecho: 1 enviados, 0 pendientes, 0 fallidos y 1 omitidos.',
      campana: despues,
    });
    expect(llamadas(REANUDAR)[0].params).toEqual([4, 7]);
    expect(deps.enviarCorreo.mock.calls).toEqual([['ana@example.com', 'Te extrañamos', `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`]]);
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO', null], [43, 'OMITIDO', 'NO_AUTORIZA']]);
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => params)).toEqual([
      [7, 41, 3, null, 4, null, `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`, 'ENVIADO', MARTES, 1],
    ]);
    // Cada destinatario va en su transaccion, con su fila bloqueada.
    expect(transacciones()).toEqual(Array(2).fill(['BEGIN', 'COMMIT', 'release']).flat());
  });

  test('should answer that the pending ones are sent by hand, without trying any delivery, when the campaign is by WhatsApp and the module is not active', async () => {
    // Arrange
    deps.whatsappActivo.mockReturnValue(false);
    const porWhatsapp = { ...CON_DOS_PENDIENTES, canal: 'WHATSAPP' };
    responder(laCampana(filas([porWhatsapp])), paraReanudar(filas([{ ...PARA_REANUDAR, canal: 'WHATSAPP' }])), ...anaYCarlaPendientes());

    // Act
    const r = await reintentar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      resumen: {
        destinatarios: 2, enviados: 0, fallidos: 0, pendientes: 2, canal: 'WHATSAPP',
        omitidos: 0, omitidosPorMotivo: {}, cerroFranja: false, procesados: 0,
      },
      message: 'El servidor no tiene WhatsApp conectado: envía los pendientes uno a uno con el botón de WhatsApp.',
      campana: porWhatsapp,
    });
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(estadosGuardados()).toEqual([]);
    expect(transacciones()).toEqual([]);
  });

  test('should send by WhatsApp to the recipients left PENDIENTE and answer the summary of the retry, not that they are sent by hand, when the campaign is by WhatsApp and the module is active', async () => {
    // Arrange: la campana por WhatsApp quedo con Ana, Beto (sin telefono) y Carla
    // PENDIENTE; los tres aceptaron y el modulo del servidor esta activo (beforeEach)
    const porWhatsapp = { ...CAMPANA, estado: 'ENVIADA', fecha_ejecucion: '2026-11-17T09:00', destinatarios: 3, pendientes: 3 };
    const despues = { ...porWhatsapp, enviados: 2, fallidos: 1, pendientes: 0 };
    responder(
      laCampana(filas([porWhatsapp]), filas([despues])),
      paraReanudar(filas([{ ...PARA_REANUDAR, canal: 'WHATSAPP' }])),
      ...destinatariosEnMemoria([ANA, BETO, CARLA], [
        { id_campana: 4, id_miembro: 41, estado_envio: 'PENDIENTE' },
        { id_campana: 4, id_miembro: 42, estado_envio: 'PENDIENTE' },
        { id_campana: 4, id_miembro: 43, estado_envio: 'PENDIENTE' },
      ]),
      bloqueoDeContacto,
      todosAceptan([ANA, BETO, CARLA]),
      ...contactos(),
      guardarEnvio(),
    );

    // Act
    const r = await reintentar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      resumen: {
        destinatarios: 3, enviados: 2, fallidos: 1, pendientes: 0, canal: 'WHATSAPP',
        omitidos: 0, omitidosPorMotivo: {}, cerroFranja: false, procesados: 3,
      },
      message: 'Reintento hecho: 2 enviados, 0 pendientes, 1 fallidos y 0 omitidos.',
      campana: despues,
    });
    expect(deps.enviarWhatsapp.mock.calls).toEqual([
      ['573001234567', `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`],
      ['573109876543', `Hola Carla, llevas 30 días sin venir a Gym Norte.${baja(43)}`],
    ]);
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO', null], [42, 'FALLIDO', 'SIN_TELEFONO'], [43, 'ENVIADO', null]]);
  });

  test.each([
    ['Sunday', '2026-11-22 10:00', LUNES_7AM, LUNES_7AM_TEXTO],
    ['a holiday', '2026-11-16 10:00', '2026-11-17T12:00:00.000Z', 'martes 17 de noviembre a las 7:00 a. m.'],
    ['Saturday at 3:00 p. m.', '2026-11-21 15:00', LUNES_7AM, LUNES_7AM_TEXTO],
  ])('should answer 409 FUERA_DE_HORARIO with the next allowed time, without sending, when it is %s', async (_caso, hora, siguiente, siguienteTexto) => {
    // Arrange: solo se declara la lectura de la campana; leer los pendientes o enviar lanzaria error
    relojEn(co(hora));
    responder(laCampana(filas([CON_DOS_PENDIENTES])));

    // Act
    const r = await reintentar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      error: `Ahora no se puede enviar. La Ley 2300 de 2023 solo permite enviar mensajes ${TEXTO_HORARIO}. El siguiente horario permitido es el ${siguienteTexto}`,
      code: 'FUERA_DE_HORARIO',
      details: { siguiente },
    });
    expect(llamadas(REANUDAR)).toHaveLength(0);
    expect(transacciones()).toEqual([]);
    expect(deps.enviarCorreo).not.toHaveBeenCalled();
  });

  test('should answer that there is nothing pending, without looking for recipients, when the campaign has no PENDIENTE left', async () => {
    // Arrange
    const completa = { ...CON_DOS_PENDIENTES, enviados: 2, pendientes: 0 };
    responder(laCampana(filas([completa])));

    // Act
    const r = await reintentar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'No hay destinatarios pendientes.', campana: completa });
    expect(llamadas(REANUDAR)).toHaveLength(0);
    expect(deps.enviarCorreo).not.toHaveBeenCalled();
  });

  test.each(['PROGRAMADA', 'CANCELADA'])('should answer 409 CAMPANA_NO_EJECUTABLE without sending when the campaign is %s', async (estado) => {
    // Arrange
    responder(laCampana(filas([{ ...CAMPANA, estado }])));

    // Act
    const r = await reintentar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Solo se reintenta una campaña que ya se envió.', code: 'CAMPANA_NO_EJECUTABLE' });
    expect(llamadas(REANUDAR)).toHaveLength(0);
  });

  test.each([
    ['is no longer ENVIADA', filas([{ ...PARA_REANUDAR, estado: 'CANCELADA' }])],
    ['no longer exists', filas([])],
  ])('should answer 409 CAMPANA_NO_EJECUTABLE without sending when the campaign %s between the read of the route and the retry', async (_caso, alReanudar) => {
    // Arrange: la ruta la lee ENVIADA con dos PENDIENTE, pero al reanudarla ya no lo
    // esta. No se declaran los destinatarios: leerlos o enviar lanzaria error.
    responder(laCampana(filas([CON_DOS_PENDIENTES])), paraReanudar(alReanudar));

    // Act
    const r = await reintentar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Solo se reintenta una campaña que ya se envió.', code: 'CAMPANA_NO_EJECUTABLE' });
    expect(llamadas(REANUDAR)[0].params).toEqual([4, 7]);
    expect(llamadas(PENDIENTES)).toHaveLength(0);
    expect(transacciones()).toEqual([]);
    expect(deps.enviarCorreo).not.toHaveBeenCalled();
  });

  test('should answer 404 NOT_FOUND when the campaign is not of the gym of the admin', async () => {
    // Arrange
    responder(laCampana(filas([])));

    // Act
    const r = await pedir('post', '/admin/campanas/99/reintentar');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Campaña no encontrada.', code: 'NOT_FOUND' });
    expect(llamadas(/GROUP BY c\.id_campana/)[0].params).toEqual([99, 7]);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas/:id/cancelar: cancel a campaign', () => {
  const CANCELAR = /UPDATE campana SET estado = 'CANCELADA', activa = FALSE/;

  test('should cancel the scheduled campaign of the gym of the admin and answer it', async () => {
    // Arrange
    responder([CANCELAR, cambiadas(1)], laCampana(filas([{ ...CAMPANA, estado: 'CANCELADA', activa: false }])));

    // Act
    const r = await pedir('post', '/admin/campanas/4/cancelar');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.campana).toMatchObject({ id_campana: 4, estado: 'CANCELADA', activa: false });
    const [update] = llamadas(CANCELAR);
    expect(update.sql).toMatch(/WHERE id_campana = \$1 AND id_gimnasio = \$2 AND estado = 'PROGRAMADA'/);
    expect(update.params).toEqual([4, 7]);
  });

  test('should answer 409 CAMPANA_NO_EDITABLE when the campaign was already sent', async () => {
    // Arrange
    responder([CANCELAR, cambiadas(0)], laCampana(filas([{ ...CAMPANA, estado: 'ENVIADA' }])));

    // Act
    const r = await pedir('post', '/admin/campanas/4/cancelar');

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Solo se puede cancelar una campaña que no se ha enviado.', code: 'CAMPANA_NO_EDITABLE' });
  });

  test('should answer 404 NOT_FOUND when the campaign is not of the gym of the admin', async () => {
    // Arrange
    responder([CANCELAR, cambiadas(0)], laCampana(filas([])));

    // Act
    const r = await pedir('post', '/admin/campanas/99/cancelar');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Campaña no encontrada.', code: 'NOT_FOUND' });
  });
});

// ===========================================================================
describe('GET /api/admin/campanas/:id/destinatarios: the recipients and their message', () => {
  const DESTINATARIOS = /SELECT d\.id_campana_destinatario, d\.estado_envio/;
  const fila =(m, estado, motivo = null) => ({ id_campana_destinatario: 90 + m.id_miembro - 40, estado_envio: estado, motivo, fecha_envio: null, ...m });

  test('should answer each recipient with the WhatsApp number, the reason it was not sent and the message of today, with the unsubscribe link, ready to send by hand', async () => {
    // Arrange: Ana sigue pendiente, Beto fallo porque no tiene telefono y a Carla se le omitio porque no acepto
    responder(
      laCampana(filas([{ ...CAMPANA, mensaje: MENSAJE_CON_FECHA }])),
      [/SELECT nombre FROM gimnasio WHERE id_gimnasio = \$1/, filas([{ nombre: 'Gym Norte' }])],
      [DESTINATARIOS, filas([fila(ANA, 'PENDIENTE'), fila(BETO, 'FALLIDO', 'SIN_TELEFONO'), fila(CARLA, 'OMITIDO', 'NO_AUTORIZA')])],
    );

    // Act
    const r = await pedir('get', '/admin/campanas/4/destinatarios');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.campana).toMatchObject({ id_campana: 4 });
    expect(r.body.horario).toEqual(EN_HORARIO);
    expect(r.body.destinatarios).toEqual([
      { id_campana_destinatario: 91, id_miembro: 41, nombre: 'Ana Ruiz', estado_envio: 'PENDIENTE', motivo: null, fecha_envio: null, telefono: '573001234567', email: 'ana@example.com',
        mensaje: `Hola Ana, llevas 12 días sin venir a Gym Norte. Tu plan vence el 01/12/2026.${baja(41)}` },
      { id_campana_destinatario: 92, id_miembro: 42, nombre: 'Beto Gil', estado_envio: 'FALLIDO', motivo: 'SIN_TELEFONO', fecha_envio: null, telefono: null, email: null,
        mensaje: `Hola Beto, llevas varios días sin venir a Gym Norte. Tu plan vence el .${baja(42)}` },
      { id_campana_destinatario: 93, id_miembro: 43, nombre: 'Carla Paz', estado_envio: 'OMITIDO', motivo: 'NO_AUTORIZA', fecha_envio: null, telefono: '573109876543', email: 'carla@example.com',
        mensaje: `Hola Carla, llevas 30 días sin venir a Gym Norte. Tu plan vence el .${baja(43)}` },
    ]);
    expect(llamadas(DESTINATARIOS)[0].params).toEqual([4, 7]);
  });

  test('should answer that it cannot be sent now and the next allowed time when the recipients are opened on a Sunday', async () => {
    // Arrange
    relojEn(DOMINGO);
    responder(
      laCampana(filas([CAMPANA])),
      [/SELECT nombre FROM gimnasio/, filas([{ nombre: 'Gym Norte' }])],
      [DESTINATARIOS, filas([fila(ANA, 'PENDIENTE', 'FUERA_DE_HORARIO')])],
    );

    // Act
    const r = await pedir('get', '/admin/campanas/4/destinatarios');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.horario).toEqual({ permitido: false, texto: TEXTO_HORARIO, siguiente: LUNES_7AM, siguiente_texto: LUNES_7AM_TEXTO });
    expect(r.body.destinatarios[0]).toMatchObject({ id_miembro: 41, estado_envio: 'PENDIENTE', motivo: 'FUERA_DE_HORARIO' });
  });

  test('should write "tu gimnasio" in the message when the gym name cannot be found', async () => {
    // Arrange
    responder(
      laCampana(filas([CAMPANA])),
      [/SELECT nombre FROM gimnasio/, filas([])],
      [DESTINATARIOS, filas([fila(CARLA, 'PENDIENTE')])],
    );

    // Act
    const r = await pedir('get', '/admin/campanas/4/destinatarios');

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.destinatarios[0].mensaje).toBe(`Hola Carla, llevas 30 días sin venir a tu gimnasio.${baja(43)}`);
  });

  test('should answer 404 NOT_FOUND without reading recipients when the campaign is not of the gym of the admin', async () => {
    // Arrange
    responder(laCampana(filas([])));

    // Act
    const r = await pedir('get', '/admin/campanas/99/destinatarios');

    // Assert
    expect(r.status).toBe(404);
    expect(llamadas(/SELECT nombre FROM gimnasio|FROM campana_destinatario d\s+JOIN miembro/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('POST /api/admin/campanas/:id/destinatarios/:idMiembro/enviado: record a WhatsApp sent by hand', () => {
  // La fila del destinatario, bloqueada, con los datos del miembro que lee esa consulta
  // (los mismos de la lista de destinatarios, con fecha_fin y dias_sin_venir).
  const DESTINATARIO = /FROM campana_destinatario d\s+JOIN miembro m[\s\S]+FOR UPDATE OF d/;
  const YA_REGISTRADO = /SELECT mensaje_copiado FROM envio_mensaje/;
  const elGimnasio = [/SELECT nombre FROM gimnasio WHERE id_gimnasio = \$1/, filas([{ nombre: 'Gym Norte' }])];
  // La campana ya se ejecuto (solo entonces tiene destinatarios) y su texto sale de la plantilla 3.
  const ENVIADA = { ...CAMPANA, estado: 'ENVIADA', id_plantilla: 3, mensaje: 'Hola {primer_nombre}, te esperamos en {gimnasio}.' };
  const TEXTO = `Hola Ana, te esperamos en Gym Norte.${baja(41)}`;
  const destinatario = (cambios) => ({
    id_campana_destinatario: 91, estado_envio: 'PENDIENTE', motivo: null, fecha_envio: null, ...ANA, ...cambios,
  });
  /** La campana enviada, el destinatario y lo que la ley consulta de Ana (por defecto acepto WhatsApp y no se le ha escrito). */
  const reglasDeRegistro = ({ campana = ENVIADA, fila = destinatario(), acepta = { 41: ['WHATSAPP'] }, previos = [], envio = guardarEnvio() } = {}) => [
    laCampana(filas([campana])),
    elGimnasio,
    [DESTINATARIO, filas(fila ? [fila] : [])],
    bloqueoDeContacto,
    aceptan(acepta),
    ...contactos(previos),
    envio,
    marcarDestinatario,
  ];
  const marcar = (idMiembro = '41', cuerpo = { mensaje: ' Hola Ana, te esperamos. ' }) => (
    pedir('post', `/admin/campanas/4/destinatarios/${idMiembro}/enviado`).send(cuerpo)
  );

  // Antes del #108 quedaba registrado el texto que mandaba el panel. Ahora el
  // panel pide la constancia ANTES de abrir el chat y lo abre con el texto que
  // arma el servidor, con el enlace de baja; el que mande el panel se ignora.
  test.each([
    ['the panel sends its own text', { mensaje: ' Hola Ana, te esperamos. ' }],
    ['the panel sends no text', {}],
  ])('should record the delivery with the text the server builds, with the unsubscribe link, and mark the recipient as ENVIADO when %s', async (_caso, cuerpo) => {
    // Arrange: Ana acepto WhatsApp y sigue PENDIENTE
    responder(...reglasDeRegistro());

    // Act
    const r = await marcar('41', cuerpo);

    // Assert
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      duplicado: false,
      destinatario: { id_campana_destinatario: 91, estado_envio: 'ENVIADO', motivo: null, fecha_envio: '2026-11-17T15:00:00.000Z' },
      mensaje: TEXTO,
      telefono: '573001234567',
    });
    expect(llamadas(DESTINATARIO)[0].params).toEqual([4, 41, 7]);
    expect(llamadas(ACEPTACION)[0].params).toEqual([[41], 7]);
    expect(llamadas(/INSERT INTO envio_mensaje/)[0].params).toEqual([7, 41, 3, null, 4, 3, TEXTO, 'ENVIADO', MARTES, 1]);
    expect(llamadas(MARCAR)[0].params).toEqual([91, 'ENVIADO', null, MARTES]);
    expect(deps.canalDelGimnasio).toHaveBeenCalledWith(expect.anything(), 7, 'WHATSAPP');
    // La ley se revisa con la fila del destinatario y el contacto del miembro bloqueados.
    expect(transacciones()).toEqual(['BEGIN', 'COMMIT', 'release']);
    expect(llamadas(/pg_advisory_xact_lock/)[0].params).toEqual([41]);
  });

  // El panel muestra en la lista de destinatarios el mensaje de cada uno y, al
  // enviarlo a mano, abre el chat con el texto que devuelve la constancia: los
  // dos tienen que ser el mismo. La constancia perdia {dias_sin_venir} y
  // {fecha_vencimiento} porque su consulta no traia esas dos columnas.
  test('should record and answer exactly the message the recipients list shows for that member when the template uses the days without coming and the expiration date', async () => {
    // Arrange: todo lo que la base sabe de Ana y de su fila de destinatario. Como la
    // base, el doble le responde a cada consulta solo las columnas que pide su SELECT.
    const enLaBase = { id_campana_destinatario: 91, estado_envio: 'PENDIENTE', motivo: null, fecha_envio: null, ...ANA };
    const soloLoQuePide = (_params, sql) => {
      const pedido = sql.slice(0, sql.indexOf('FROM campana_destinatario d'));
      return { rows: [Object.fromEntries(Object.entries(enLaBase).filter(([columna]) => new RegExp(`\\b${columna}\\b`).test(pedido)))] };
    };
    responder(
      laCampana(filas([{ ...ENVIADA, mensaje: MENSAJE_CON_FECHA }])),
      elGimnasio,
      [/FROM campana_destinatario d\s+JOIN miembro m/, soloLoQuePide],
      bloqueoDeContacto,
      aceptan({ 41: ['WHATSAPP'] }),
      ...contactos(),
      guardarEnvio(),
      marcarDestinatario,
    );
    const lista = await pedir('get', '/admin/campanas/4/destinatarios');
    const enLaLista = lista.body.destinatarios[0].mensaje;

    // Act
    const r = await marcar('41', {});

    // Assert
    expect(enLaLista).toBe(`Hola Ana, llevas 12 días sin venir a Gym Norte. Tu plan vence el 01/12/2026.${baja(41)}`);
    expect(r.status).toBe(201);
    expect(r.body.mensaje).toBe(enLaLista);
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => params)).toEqual([[7, 41, 3, null, 4, 3, enLaLista, 'ENVIADO', MARTES, 1]]);
  });

  test('should answer 200 with duplicado and the text already recorded, without recording again, when the recipient was already ENVIADO (double click)', async () => {
    // Arrange
    responder(
      ...reglasDeRegistro({ fila: destinatario({ estado_envio: 'ENVIADO', fecha_envio: '2026-11-17T15:00:00.000Z' }) }),
      [YA_REGISTRADO, filas([{ mensaje_copiado: TEXTO }])],
    );

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      duplicado: true,
      destinatario: { id_campana_destinatario: 91, estado_envio: 'ENVIADO', fecha_envio: '2026-11-17T15:00:00.000Z' },
      mensaje: TEXTO,
    });
    expect(llamadas(YA_REGISTRADO)[0].params).toEqual([4, 41]);
    expect(llamadas(/INSERT INTO envio_mensaje/)).toHaveLength(0);
    expect(llamadas(MARCAR)).toHaveLength(0);
    expect(transacciones()).toEqual(['BEGIN', 'COMMIT', 'release']);
  });

  test.each([
    ['has no acceptance registered', {}, [], 'NO_AUTORIZA', 'Ana no ha aceptado recibir mensajes comerciales del gimnasio.'],
    ['cancelled the acceptance', { 41: null }, [], 'NO_AUTORIZA', 'Ana no ha aceptado recibir mensajes comerciales del gimnasio.'],
    ['only accepted email', { 41: ['EMAIL'] }, [], 'CANAL_NO_AUTORIZADO', 'Ana no autorizó que le envíen mensajes comerciales por WhatsApp.'],
    ['was already contacted today', { 41: ['WHATSAPP'] }, [{ id_miembro: 41, canal: 'WHATSAPP', fecha: co('2026-11-17 08:00') }],
      'FRECUENCIA', 'A Ana ya se le contactó hoy. La Ley 2300 de 2023 permite un solo contacto al día.'],
    ['was contacted by email this week', { 41: ['WHATSAPP', 'EMAIL'] }, [{ id_miembro: 41, canal: 'EMAIL', fecha: co('2026-11-16 12:00') }],
      'FRECUENCIA', 'A Ana ya se le contactó esta semana por correo. La Ley 2300 de 2023 no permite contactarlo por otro canal en la misma semana.'],
  ])('should answer 409 CONTACTO_NO_PERMITIDO and leave the recipient OMITIDO, without recording, when the member %s', async (_caso, acepta, previos, motivo, mensaje) => {
    // Arrange
    responder(...reglasDeRegistro({ acepta, previos }));

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: mensaje, code: 'CONTACTO_NO_PERMITIDO', details: { motivo, siguiente: null } });
    expect(llamadas(MARCAR).map(({ params }) => params)).toEqual([[91, 'OMITIDO', motivo, null]]);
    expect(llamadas(/INSERT INTO envio_mensaje/)).toHaveLength(0);
    expect(deps.canalDelGimnasio).not.toHaveBeenCalled();
    expect(transacciones()).toEqual(['BEGIN', 'COMMIT', 'release']);
  });

  test.each([
    ['Sunday', '2026-11-22 10:00', 'Hoy es domingo. ', LUNES_7AM, LUNES_7AM_TEXTO],
    ['a holiday', '2026-11-16 10:00', 'Hoy es festivo (Independencia de Cartagena). ', '2026-11-17T12:00:00.000Z', 'martes 17 de noviembre a las 7:00 a. m.'],
    ['Saturday at 3:00 p. m.', '2026-11-21 15:00', '', LUNES_7AM, LUNES_7AM_TEXTO],
    ['a weekday at 6:59 a. m.', '2026-11-17 06:59', '', '2026-11-17T12:00:00.000Z', 'martes 17 de noviembre a las 7:00 a. m.'],
  ])('should answer 409 CONTACTO_NO_PERMITIDO with the next allowed time and keep the recipient PENDIENTE, without recording, when it is %s', async (_caso, hora, porque, siguiente, siguienteTexto) => {
    // Arrange: Ana acepto WhatsApp, pero la Ley 2300 no deja contactar a esta hora
    relojEn(co(hora));
    responder(...reglasDeRegistro());

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      error: `${porque}La Ley 2300 de 2023 solo permite contactar ${TEXTO_HORARIO}. Podrás hacerlo desde el ${siguienteTexto}`,
      code: 'CONTACTO_NO_PERMITIDO',
      details: { motivo: 'FUERA_DE_HORARIO', siguiente },
    });
    expect(llamadas(MARCAR).map(({ params }) => params)).toEqual([[91, 'PENDIENTE', 'FUERA_DE_HORARIO', null]]);
    expect(llamadas(/INSERT INTO envio_mensaje/)).toHaveLength(0);
    expect(deps.canalDelGimnasio).not.toHaveBeenCalled();
  });

  test('should answer 409 CONTACTO_NO_PERMITIDO with the saved reason, without checking again nor recording, when the recipient was left OMITIDO', async () => {
    // Arrange
    responder(...reglasDeRegistro({ fila: destinatario({ estado_envio: 'OMITIDO', motivo: 'NO_AUTORIZA' }) }));

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      error: 'A Ana no se le puede enviar esta campaña (NO_AUTORIZA).',
      code: 'CONTACTO_NO_PERMITIDO',
      details: { motivo: 'NO_AUTORIZA', siguiente: null },
    });
    expect(llamadas(ACEPTACION)).toHaveLength(0);
    expect(llamadas(MARCAR)).toHaveLength(0);
    expect(llamadas(/INSERT INTO envio_mensaje/)).toHaveLength(0);
  });

  test('should answer 409 CONTACTO_NO_PERMITIDO and roll back, without recording, when the member has no valid phone', async () => {
    // Arrange
    responder(...reglasDeRegistro({ fila: destinatario({ telefono: null, codigo_pais_telefono: null }) }));

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      error: 'El miembro no tiene un teléfono válido para WhatsApp.',
      code: 'CONTACTO_NO_PERMITIDO',
      details: { motivo: 'SIN_TELEFONO', siguiente: null },
    });
    expect(llamadas(/INSERT INTO envio_mensaje/)).toHaveLength(0);
    expect(llamadas(MARCAR)).toHaveLength(0);
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
  });

  test.each([
    ['is by email', { canal: 'EMAIL' }, 'Solo las campañas por WhatsApp se envían a mano.'],
    ['has not been executed yet', { estado: 'PROGRAMADA' }, 'La campaña todavía no se ha ejecutado.'],
  ])('should answer 409 CAMPANA_NO_EJECUTABLE without looking for the recipient when the campaign %s', async (_caso, cambios, mensaje) => {
    // Arrange
    responder(...reglasDeRegistro({ campana: { ...ENVIADA, ...cambios } }));

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: mensaje, code: 'CAMPANA_NO_EJECUTABLE' });
    expect(llamadas(DESTINATARIO)).toHaveLength(0);
    expect(llamadas(/envio_mensaje/)).toHaveLength(0);
    expect(transacciones()).toEqual([]);
  });

  test('should roll back, release the client and answer 503 DB_UNREACHABLE when the delivery cannot be recorded', async () => {
    // Arrange
    responder(...reglasDeRegistro({ envio: guardarEnvio(falla('08006')) }));

    // Act
    const r = await marcar();

    // Assert
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'No pudimos dejar constancia del envío.', code: 'DB_UNREACHABLE' });
    expect(console.error).toHaveBeenCalledWith('[POST /admin/campanas/enviado] Error:', 'fallo de la BD');
    expect(llamadas(MARCAR)).toHaveLength(0);
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
  });

  test('should answer 404 NOT_FOUND without recording when the member is not a recipient of the campaign', async () => {
    // Arrange
    responder(...reglasDeRegistro({ fila: null }));

    // Act
    const r = await marcar('99');

    // Assert
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Ese miembro no es destinatario de la campaña.', code: 'NOT_FOUND' });
    expect(llamadas(DESTINATARIO)[0].params).toEqual([4, 99, 7]);
    expect(llamadas(/envio_mensaje/)).toHaveLength(0);
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release']);
  });

  test('should answer 400 VALIDATION_ERROR without touching the database when the member id is not valid', async () => {
    // Act
    const r = await marcar('abc');

    // Assert
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Id de miembro invalido.', code: 'VALIDATION_ERROR' });
    expect(llamadas(/campana/)).toHaveLength(0);
  });

  // Antes del #108 el mensaje era obligatorio y uno vacio daba 400. Ahora es
  // opcional (el texto lo arma el servidor), asi que lo que se rechaza es un
  // mensaje que no es texto o que pasa de 2000 caracteres.
  test.each([
    ['is not a text', { mensaje: 123 }],
    ['has more than 2000 characters', { mensaje: 'a'.repeat(2001) }],
  ])('should answer 400 VALIDATION_ERROR without touching the database when the message sent %s', async (_caso, cuerpo) => {
    // Act
    const r = await marcar('41', cuerpo);

    // Assert
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details.issues[0].path).toEqual(['mensaje']);
    expect(llamadas(/campana/)).toHaveLength(0);
  });
});

// ===========================================================================
describe('jobs/campanas.js: the scheduler job', () => {
  const NADA = { ejecutadas: 0, reintentadas: 0, destinatarios: 0, enviados: 0, pendientes: 0, fallidos: 0, omitidos: 0 };

  test('should run the due campaigns of every gym and add up their summaries when the scheduler calls it', async () => {
    // Arrange: la 5 (gimnasio 7) tiene a Ana, que acepto WhatsApp, y a Carla, que no;
    // la 6 (gimnasio 8) a Beto, que acepto y no tiene telefono; la 7 ya la envio otra ejecucion
    deps.whatsappActivo.mockReturnValue(false);
    const porCampana = {
      5: { ...PARA_EJECUTAR, id_campana: 5 },
      6: { ...PARA_EJECUTAR, id_campana: 6, id_gimnasio: 8 },
      7: { ...PARA_EJECUTAR, id_campana: 7, estado: 'ENVIADA' },
    };
    responder(
      [VENCIDAS, filas([
        { id_campana: 5, id_gimnasio: 7, creada_por: 1 },
        { id_campana: 6, id_gimnasio: 8, creada_por: 2 },
        { id_campana: 7, id_gimnasio: 7, creada_por: 1 },
      ])],
      paraEjecutar((p) => ({ rows: [porCampana[p[0]]] })),
      [/FROM miembro m\s+LEFT JOIN/, (p) => ({ rows: p[0] === 7 ? [ANA, CARLA] : [BETO] })],
      aceptan({ 41: ['WHATSAPP'], 42: ['WHATSAPP'] }),
      ...contactos(),
      ...destinatariosEnMemoria([ANA, BETO, CARLA]),
      marcarEnviada,
      bloqueoDeContacto,
      guardarEnvio(),
      sinPendientes,
    );

    // Act
    const resumen = await runJob();

    // Assert: Ana sigue PENDIENTE para enviarle a mano, Carla queda OMITIDO y Beto FALLIDO
    expect(resumen).toEqual({ ejecutadas: 2, reintentadas: 0, destinatarios: 3, enviados: 0, pendientes: 1, fallidos: 1, omitidos: 1 });
    // El scheduler pide las vencidas de todos los gimnasios: el filtro de la consulta va vacio.
    expect(llamadas(VENCIDAS)[0].params).toEqual([null]);
    expect(llamadas(/FOR UPDATE OF c/).map(({ params }) => params)).toEqual([[5, 7], [6, 8], [7, 7]]);
    expect(destinatariosGuardados()).toEqual([[5, 41, 'PENDIENTE', null], [5, 43, 'OMITIDO', 'NO_AUTORIZA'], [6, 42, 'PENDIENTE', null]]);
    // La entrega fallida de la 6 queda a nombre de quien creo la campana.
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => params)).toEqual([
      [8, 42, 3, null, 6, null, `Hola Beto, llevas varios días sin venir a Gym Norte.${baja(42, 8)}`, 'FALLIDO', MARTES, 2],
    ]);
    expect(estadosGuardados()).toEqual([[42, 'FALLIDO', 'SIN_TELEFONO']]);
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    // Sin el modulo de WhatsApp, el reintento solo busca campanas por correo.
    expect(llamadas(CON_PENDIENTES)[0].params).toEqual([null, false]);
  });

  test('should answer zeros when no campaign is due', async () => {
    // Arrange
    responder(sinVencidas, sinPendientes);

    // Act
    const resumen = await runJob();

    // Assert
    expect(resumen).toEqual(NADA);
    expect(transacciones()).toEqual([]);
  });

  // Antes del #108 esto lo hacia GET /api/admin/campanas con las vencidas del
  // gimnasio del admin, filtrando en memoria. Ahora el filtro va en la consulta.
  test('should ask the database only for the due campaigns of one gym and run them when it is called for that gym', async () => {
    // Arrange: la base ya solo devuelve la 5, del gimnasio 7, sin miembros en su segmento
    responder(
      [VENCIDAS, filas([{ id_campana: 5, id_gimnasio: 7, creada_por: 1 }])],
      paraEjecutar(filas([{ ...PARA_EJECUTAR, id_campana: 5, segmento: 'TODOS' }])),
      delSegmento([]),
      ...destinatariosEnMemoria([]),
      marcarEnviada,
    );

    // Act
    const resultados = await campanasRouter.ejecutarVencidas(7);

    // Assert
    const [vencidas] = llamadas(VENCIDAS);
    expect(vencidas.sql).toMatch(/AND \(\$1::int IS NULL OR id_gimnasio = \$1::int\)/);
    expect(vencidas.params).toEqual([7]);
    expect(resultados).toEqual([{
      id_campana: 5, destinatarios: 0, enviados: 0, fallidos: 0, pendientes: 0, omitidos: 0, omitidosPorMotivo: {}, canal: 'WHATSAPP', cerroFranja: false,
    }]);
    expect(llamadas(/FOR UPDATE OF c/).map(({ params }) => params)).toEqual([[5, 7]]);
    expect(llamadas(/UPDATE campana SET estado = 'ENVIADA'/)[0].params).toEqual([5, MARTES]);
  });

  // Antes del #108 este caso era de GET /api/admin/campanas, que ejecutaba las
  // vencidas al abrir la lista. Ahora solo las ejecuta el scheduler.
  test('should keep running the rest and log the cause when a due campaign fails to run', async () => {
    // Arrange: la 5 falla al bloquear su fila; la 6 tiene a Ana, que acepto WhatsApp
    responder(
      [VENCIDAS, filas([{ id_campana: 5, id_gimnasio: 7, creada_por: 1 }, { id_campana: 6, id_gimnasio: 7, creada_por: 1 }])],
      paraEjecutar((p) => (p[0] === 5 ? falla('08006')() : { rows: [{ ...PARA_EJECUTAR, id_campana: 6 }] })),
      delSegmento([ANA]),
      todosAceptan([ANA]),
      ...contactos(),
      ...destinatariosEnMemoria([ANA]),
      marcarEnviada,
      bloqueoDeContacto,
      guardarEnvio(),
      sinPendientes,
    );

    // Act
    const resumen = await runJob();

    // Assert
    expect(resumen).toEqual({ ...NADA, ejecutadas: 1, destinatarios: 1, enviados: 1 });
    expect(console.error).toHaveBeenCalledWith('[campanas] No se pudo ejecutar la campana 5:', 'fallo de la BD');
    // La 5 se deshace y suelta su cliente; la 6 congela a su destinataria y le entrega.
    expect(transacciones()).toEqual(['BEGIN', 'ROLLBACK', 'release', 'BEGIN', 'COMMIT', 'release', 'BEGIN', 'COMMIT', 'release']);
    expect(deps.enviarWhatsapp.mock.calls).toEqual([['573001234567', `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`]]);
  });

  test('should retry the recipients left PENDIENTE in the campaigns already sent and count them as reintentadas', async () => {
    // Arrange: la 8 (correo) quedo ENVIADA con Ana y Carla PENDIENTE porque el
    // proceso se cayo; despues Carla cancelo la aceptacion
    responder(
      sinVencidas,
      [CON_PENDIENTES, filas([{ id_campana: 8, id_gimnasio: 7, creada_por: 1 }])],
      paraReanudar(filas([{ ...PARA_REANUDAR, id_campana: 8 }])),
      ...destinatariosEnMemoria([ANA, CARLA], [
        { id_campana: 8, id_miembro: 41, estado_envio: 'PENDIENTE' },
        { id_campana: 8, id_miembro: 43, estado_envio: 'PENDIENTE' },
      ]),
      bloqueoDeContacto,
      aceptan({ 41: ['EMAIL'], 43: null }),
      ...contactos(),
      guardarEnvio(),
    );

    // Act
    const resumen = await runJob();

    // Assert
    expect(resumen).toEqual({ ...NADA, reintentadas: 1, enviados: 1 });
    // Con el modulo de WhatsApp activo, el reintento tambien toma las campanas por WhatsApp.
    expect(llamadas(CON_PENDIENTES)[0].params).toEqual([null, true]);
    expect(llamadas(REANUDAR)[0].params).toEqual([8, 7]);
    expect(deps.enviarCorreo.mock.calls).toEqual([['ana@example.com', 'Te extrañamos', `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`]]);
    expect(estadosGuardados()).toEqual([[41, 'ENVIADO', null], [43, 'OMITIDO', 'NO_AUTORIZA']]);
    expect(llamadas(/INSERT INTO envio_mensaje/).map(({ params }) => params)).toEqual([
      [7, 41, 3, null, 8, null, `Hola Ana, llevas 12 días sin venir a Gym Norte.${baja(41)}`, 'ENVIADO', MARTES, 1],
    ]);
  });

  test('should keep going and log the cause when the retry of a campaign fails', async () => {
    // Arrange
    responder(sinVencidas, [CON_PENDIENTES, filas([{ id_campana: 8, id_gimnasio: 7, creada_por: 1 }])], paraReanudar(falla('08006')));

    // Act
    const resumen = await runJob();

    // Assert
    expect(resumen).toEqual(NADA);
    expect(console.error).toHaveBeenCalledWith('[campanas] No se pudo reintentar la campana 8:', 'fallo de la BD');
  });

  test.each([
    ['Sunday', '2026-11-22 10:00'],
    ['a holiday', '2026-11-16 10:00'],
    ['a weekday at 7:00 p. m.', '2026-11-17 19:00'],
    ['Saturday at 7:59 a. m.', '2026-11-21 07:59'],
  ])('should not run nor retry anything, without reading the database, when the scheduler calls it on %s', async (_caso, hora) => {
    // Arrange: ninguna consulta declarada; cualquiera lanzaria error
    relojEn(co(hora));

    // Act
    const resumen = await runJob();

    // Assert
    expect(resumen).toEqual(NADA);
    expect(mockLlamadas).toEqual([]);
    expect(deps.enviarWhatsapp).not.toHaveBeenCalled();
    expect(deps.enviarCorreo).not.toHaveBeenCalled();
  });
});
