/**
 * RQF-10 con la Ley 2300 de 2023 (RQNF-16), sin base de datos (corre en el CI).
 *
 * lib/campanas.js contra una base falsa con estado (miembros, autorizaciones
 * de mensajes comerciales, historial de contactos, destinatarios y envios):
 *   - solo reciben la campana quienes aceptaron mensajes comerciales por ese
 *     canal; los demas quedan OMITIDO con su motivo (NO_AUTORIZA,
 *     CANAL_NO_AUTORIZADO, FRECUENCIA);
 *   - fuera de horario no se ejecuta nada;
 *   - cada mensaje lleva el enlace de baja;
 *   - los PENDIENTE que deja un proceso caido se reintentan sin duplicar;
 *   - la constancia manual de WhatsApp no duplica con doble clic;
 *   - campanasVencidas filtra por gimnasio.
 * Contra la base real: ley2300-real.test.js.
 */
process.env.JWT_SECRET = 'secreto-de-pruebas';

const legal = require('../src/lib/contacto-legal');
const {
  ejecutarCampana, reanudarCampana, registrarEnvioManual, campanasVencidas, fueraDeHorario,
} = require('../src/lib/campanas');
const { verificarTokenBaja } = require('../src/lib/baja-mensajes');

const co = (texto) => new Date(`${texto.replace(' ', 'T')}:00-05:00`);
const MARTES = co('2026-11-17 10:00');

beforeEach(() => legal.establecerReloj(() => MARTES));
afterAll(() => legal.establecerReloj(null));

/**
 * Base falsa con estado. `miembros` son los del segmento; `comerciales` es
 * id -> { otorgada, canales }; `contactos` son envios previos { id, canal, fecha }.
 */
function crearBase({ canal = 'WHATSAPP', estado = 'PROGRAMADA', miembros, comerciales = {}, contactos = [], fallasConstancia = 0 }) {
  const bd = {
    campana: { id_campana: 5, id_gimnasio: 1, nombre: 'Te extrañamos', segmento: 'TODOS', mensaje: 'Hola {primer_nombre}', canal, estado, activa: true, id_plantilla: null, gimnasio: 'Gym Demo' },
    destinatarios: [],
    envios: [],
    bloqueadas: new Set(), // filas de destinatario tomadas por "otro proceso"
    log: [],
    sig: 1,
  };
  const miembro = (id) => miembros.find((m) => m.id_miembro === id);
  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();
    bd.log.push(s);
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
    if (/pg_advisory_xact_lock/.test(s)) return { rows: [] };
    if (/FROM campana c JOIN gimnasio g/.test(s)) return { rows: [{ ...bd.campana }] };
    if (/FROM miembro m LEFT JOIN/.test(s)) return { rows: miembros.map((m) => ({ ...m })) };
    if (/FROM autorizacion_miembro a/.test(s)) {
      const ids = params[0];
      return {
        rows: ids.filter((id) => comerciales[id]).map((id) => ({
          id_miembro: id, otorgada: comerciales[id].otorgada, canales_autorizados: comerciales[id].canales,
          canal: 'APP', version_texto: 'v2', fecha: co('2026-11-01 09:00'),
        })),
      };
    }
    if (/FROM envio_mensaje e INNER JOIN canal_comunicacion/.test(s)) {
      const todos = [...contactos, ...bd.envios.filter((e) => e.estado === 'ENVIADO').map((e) => ({ id: e.id_miembro, canal: bd.campana.canal, fecha: e.fecha }))];
      return { rows: todos.filter((c) => params[0].includes(c.id) && c.fecha >= params[1]).map((c) => ({ id_miembro: c.id, canal: c.canal, fecha: c.fecha })) };
    }
    if (/to_regclass/.test(s)) return { rows: [{ existe: false }] };
    if (/^INSERT INTO campana_destinatario/.test(s)) {
      bd.destinatarios.push({ id_campana_destinatario: bd.sig++, id_miembro: params[1], estado_envio: params[2], motivo: params[3], fecha_envio: null });
      return { rows: [] };
    }
    if (/^UPDATE campana SET estado = 'ENVIADA'/.test(s)) { bd.campana.estado = 'ENVIADA'; return { rows: [] }; }
    if (/FROM campana_destinatario d JOIN miembro m .* FOR UPDATE OF d/.test(s)) {
      const d = bd.destinatarios.find((x) => x.id_miembro === params[1]);
      return { rows: d ? [{ ...d, ...miembro(d.id_miembro) }] : [] };
    }
    if (/FROM campana_destinatario d JOIN miembro m/.test(s)) {
      const solo = /estado_envio = 'PENDIENTE'/.test(s);
      return { rows: bd.destinatarios.filter((d) => !solo || d.estado_envio === 'PENDIENTE').map((d) => ({ ...d, ...miembro(d.id_miembro) })) };
    }
    if (/^SELECT estado_envio FROM campana_destinatario .* FOR UPDATE/.test(s)) {
      if (/SKIP LOCKED/.test(s) && bd.bloqueadas.has(params[0])) return { rows: [] };
      const d = bd.destinatarios.find((x) => x.id_campana_destinatario === params[0]);
      return { rows: d ? [{ estado_envio: d.estado_envio }] : [] };
    }
    if (/^INSERT INTO envio_mensaje/.test(s)) {
      bd.envios.push({ id_miembro: params[1], id_campana: params[4], mensaje: params[6], estado: params[7], fecha: params[8], enviado_por: params[9] });
      return { rows: [{ id_envio: bd.envios.length, estado: params[7], fecha_envio: params[8] }] };
    }
    if (/^UPDATE campana_destinatario SET estado_envio/.test(s)) {
      const d = bd.destinatarios.find((x) => x.id_campana_destinatario === params[0]);
      Object.assign(d, { estado_envio: params[1], motivo: params[2], fecha_envio: params[3] || d.fecha_envio });
      return { rows: [{ ...d }] };
    }
    if (/SELECT mensaje_copiado FROM envio_mensaje/.test(s)) {
      const e = bd.envios.filter((x) => x.id_miembro === params[1] && x.estado === 'ENVIADO').pop();
      return { rows: e ? [{ mensaje_copiado: e.mensaje }] : [] };
    }
    if (/GROUP BY estado_envio, motivo/.test(s)) {
      const grupos = {};
      for (const d of bd.destinatarios) {
        const k = `${d.estado_envio}|${d.motivo}`;
        grupos[k] = (grupos[k] || 0) + 1;
      }
      return { rows: Object.entries(grupos).map(([k, n]) => ({ estado_envio: k.split('|')[0], motivo: k.split('|')[1] === 'null' ? null : k.split('|')[1], n })) };
    }
    throw new Error(`Consulta inesperada: ${s.slice(0, 120)}`);
  }
  // Cada conexion se porta como en PostgreSQL: despues de un error, la
  // transaccion queda abortada y todo falla con 25P02 hasta el ROLLBACK.
  // `fallasConstancia`: cuantas veces falla guardar la constancia de un
  // ENVIADO (un corte breve de la BD), para el defecto #111.
  // Lo que no se confirma con COMMIT se pierde (ROLLBACK, o soltar la conexion).
  // `otroProceso` corre una vez despues de un ROLLBACK: otro proceso que escribe
  // y confirma entre la falla y el reintento.
  bd.fallasConstancia = fallasConstancia;
  const foto = () => ({ destinatarios: bd.destinatarios.map((d) => ({ ...d })), envios: bd.envios.map((e) => ({ ...e })), estado: bd.campana.estado });
  const deshacer = (f) => { bd.destinatarios = f.destinatarios; bd.envios = f.envios; bd.campana.estado = f.estado; };
  bd.pool = {
    query,
    connect: async () => {
      let abortada = false;
      let antes = null;
      const terminar = () => {
        if (antes) deshacer(antes);
        antes = null;
        abortada = false;
        const otro = bd.otroProceso;
        bd.otroProceso = null;
        if (otro) otro();
      };
      return {
        release: () => { if (antes) terminar(); },
        query: async (sql, params = []) => {
          const s = sql.replace(/\s+/g, ' ').trim();
          if (s === 'ROLLBACK') { bd.log.push(s); terminar(); return { rows: [] }; }
          if (abortada) {
            throw Object.assign(new Error('current transaction is aborted'), { code: '25P02' });
          }
          if (s === 'BEGIN') antes = foto();
          if (s === 'COMMIT') antes = null;
          try {
            if (/^INSERT INTO envio_mensaje/.test(s) && params[7] === 'ENVIADO' && bd.fallasConstancia > 0) {
              bd.fallasConstancia -= 1;
              throw Object.assign(new Error('se perdio la conexion'), { code: '08006' });
            }
            return await query(sql, params);
          } catch (err) {
            if (s !== 'BEGIN' && s !== 'COMMIT' && s !== 'ROLLBACK') abortada = true;
            throw err;
          }
        },
      };
    },
  };
  return bd;
}

const deps = (extra = {}) => ({
  canalDelGimnasio: async () => 9,
  enviarCorreo: jest.fn(async () => ({ delivered: true })),
  enviarWhatsapp: jest.fn(async () => {}),
  whatsappActivo: () => true,
  esperar: jest.fn(async () => {}), // sin esperar de verdad entre reintentos de la constancia
  ...extra,
});

const ANA = { id_miembro: 1, nombre: 'Ana Gómez', telefono: '3001112233', email: 'ana@x.co' };
const BETO = { id_miembro: 2, nombre: 'Beto Ruiz', telefono: '3002223344', email: 'beto@x.co' };
const CARLA = { id_miembro: 3, nombre: 'Carla Paz', telefono: '3003334455', email: null };
const DANI = { id_miembro: 4, nombre: 'Dani Mora', telefono: '3004445566', email: 'dani@x.co' };
const SOLO_WA = { otorgada: true, canales: ['WHATSAPP'] };
const LOS_DOS = { otorgada: true, canales: ['WHATSAPP', 'EMAIL'] };

describe('ejecutarCampana: quien la recibe (Ley 2300, arts. 2, 3 y 5)', () => {
  test('solo los que aceptaron por ese canal; los demas quedan OMITIDO con su motivo', async () => {
    const bd = crearBase({
      miembros: [ANA, BETO, CARLA, DANI],
      comerciales: { 1: SOLO_WA, 2: { otorgada: true, canales: ['EMAIL'] }, 4: SOLO_WA },
      contactos: [{ id: 4, canal: 'WHATSAPP', fecha: co('2026-11-17 08:00') }], // Dani ya tuvo contacto hoy
    });
    const d = deps();
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);
    expect(r).toMatchObject({ destinatarios: 4, enviados: 1, omitidos: 3, pendientes: 0, fallidos: 0 });
    expect(r.omitidosPorMotivo).toEqual({ CANAL_NO_AUTORIZADO: 1, NO_AUTORIZA: 1, FRECUENCIA: 1 });
    const porId = Object.fromEntries(bd.destinatarios.map((x) => [x.id_miembro, [x.estado_envio, x.motivo]]));
    expect(porId).toEqual({
      1: ['ENVIADO', null], 2: ['OMITIDO', 'CANAL_NO_AUTORIZADO'], 3: ['OMITIDO', 'NO_AUTORIZA'], 4: ['OMITIDO', 'FRECUENCIA'],
    });
    expect(d.enviarWhatsapp).toHaveBeenCalledTimes(1);
  });

  test('por defecto (sin autorizacion registrada) nadie recibe la campana', async () => {
    const bd = crearBase({ miembros: [ANA, BETO] });
    const d = deps();
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r).toMatchObject({ enviados: 0, omitidos: 2, omitidosPorMotivo: { NO_AUTORIZA: 2 } });
    expect(d.enviarWhatsapp).not.toHaveBeenCalled();
    expect(bd.envios).toHaveLength(0);
  });

  test('otro canal la misma semana: FRECUENCIA; la semana pasada no cuenta', async () => {
    const bd = crearBase({
      miembros: [ANA, BETO],
      comerciales: { 1: SOLO_WA, 2: SOLO_WA },
      contactos: [
        { id: 1, canal: 'EMAIL', fecha: co('2026-11-16 12:00') },   // lunes de esta semana
        { id: 2, canal: 'EMAIL', fecha: co('2026-11-15 12:00') },   // domingo anterior
      ],
    });
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, deps());
    expect(r).toMatchObject({ enviados: 1, omitidosPorMotivo: { FRECUENCIA: 1 } });
    expect(bd.destinatarios.find((x) => x.id_miembro === 2).estado_envio).toBe('ENVIADO');
  });

  test('cada mensaje lleva el enlace de baja firmado del miembro', async () => {
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA } });
    const d = deps();
    await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    const [tel, texto] = d.enviarWhatsapp.mock.calls[0];
    expect(tel).toBe('573001112233');
    expect(texto).toMatch(/^Hola Ana\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: http.*\/baja\//);
    const token = texto.split('/baja/')[1];
    expect(verificarTokenBaja(token)).toEqual({ idMiembro: 1, idGimnasio: 1 });
    expect(bd.envios[0].mensaje).toBe(texto);
    expect(bd.envios[0].fecha).toEqual(MARTES);
  });

  test('por correo: sin correo queda FALLIDO SIN_CORREO', async () => {
    const bd = crearBase({ canal: 'EMAIL', miembros: [ANA, CARLA], comerciales: { 1: LOS_DOS, 3: LOS_DOS } });
    const d = deps();
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r).toMatchObject({ enviados: 1, fallidos: 1 });
    expect(d.enviarCorreo).toHaveBeenCalledWith('ana@x.co', 'Te extrañamos', expect.stringContaining('/baja/'));
    expect(bd.destinatarios.find((x) => x.id_miembro === 3)).toMatchObject({ estado_envio: 'FALLIDO', motivo: 'SIN_CORREO' });
  });

  test('sin WhatsApp en el servidor: los que se pueden contactar quedan PENDIENTE para enviarlos a mano', async () => {
    const bd = crearBase({ miembros: [ANA, BETO], comerciales: { 1: SOLO_WA } });
    const d = deps({ whatsappActivo: () => false });
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r).toMatchObject({ pendientes: 1, omitidos: 1, enviados: 0 });
    expect(d.enviarWhatsapp).not.toHaveBeenCalled();
  });

  test('si WhatsApp deja de estar listo a mitad del envio, el resto queda PENDIENTE', async () => {
    const err = Object.assign(new Error('no listo'), { code: 'WHATSAPP_NO_LISTO' });
    const bd = crearBase({ miembros: [ANA, BETO], comerciales: { 1: SOLO_WA, 2: SOLO_WA } });
    const d = deps({ enviarWhatsapp: jest.fn().mockRejectedValue(err) });
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r).toMatchObject({ pendientes: 2, enviados: 0, fallidos: 0 });
    expect(d.enviarWhatsapp).toHaveBeenCalledTimes(1); // no insiste
    expect(bd.envios).toHaveLength(0);
  });

  test('una campana ya enviada no se vuelve a ejecutar', async () => {
    const bd = crearBase({ estado: 'ENVIADA', miembros: [ANA] });
    expect(await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, deps())).toBeNull();
  });
});

describe('ejecutarCampana: horario (art. 3)', () => {
  test.each([
    ['domingo', '2026-11-22 10:00'],
    ['festivo', '2026-11-16 10:00'],
    ['viernes a las 7:00 p. m.', '2026-11-20 19:00'],
    ['sabado a las 3:00 p. m.', '2026-11-21 15:00'],
  ])('%s: no toca la base y dice cuando se puede', async (_, hora) => {
    legal.establecerReloj(() => co(hora));
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA } });
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, deps());
    expect(r).toMatchObject({ fueraDeHorario: true });
    expect(r.siguiente).toBeInstanceOf(Date);
    expect(r.mensaje).toMatch(/Ley 2300 de 2023/);
    expect(bd.log).toHaveLength(0);
  });

  test('fueraDeHorario: null en horario y el siguiente instante fuera', () => {
    expect(fueraDeHorario(MARTES)).toBeNull();
    expect(fueraDeHorario(co('2026-11-21 15:00')).siguiente.toISOString()).toBe(co('2026-11-23 07:00').toISOString());
  });

  test('si la franja se cierra a mitad del envio, el resto queda PENDIENTE con FUERA_DE_HORARIO', async () => {
    const horas = [co('2026-11-17 18:59'), co('2026-11-17 18:59'), co('2026-11-17 19:00')];
    let i = 0;
    legal.establecerReloj(() => horas[Math.min(i++, horas.length - 1)]);
    const bd = crearBase({ miembros: [ANA, BETO], comerciales: { 1: SOLO_WA, 2: SOLO_WA } });
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1 }, deps());
    expect(r).toMatchObject({ enviados: 1, pendientes: 1, cerroFranja: true });
    expect(bd.destinatarios.find((x) => x.id_miembro === 2)).toMatchObject({ estado_envio: 'PENDIENTE', motivo: 'FUERA_DE_HORARIO' });
  });
});

describe('reanudarCampana: PENDIENTE que dejo un proceso caido', () => {
  function caida() {
    // La campana quedo ENVIADA con dos PENDIENTE: el proceso se cayo antes de enviarlos.
    const bd = crearBase({ canal: 'EMAIL', estado: 'ENVIADA', miembros: [ANA, BETO], comerciales: { 1: LOS_DOS, 2: LOS_DOS } });
    bd.destinatarios.push(
      { id_campana_destinatario: 50, id_miembro: 1, estado_envio: 'PENDIENTE', motivo: null },
      { id_campana_destinatario: 51, id_miembro: 2, estado_envio: 'PENDIENTE', motivo: null },
    );
    return bd;
  }

  test('los envia y deja constancia', async () => {
    const bd = caida();
    const d = deps();
    const r = await reanudarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r).toMatchObject({ enviados: 2, pendientes: 0, procesados: 2 });
    expect(d.enviarCorreo).toHaveBeenCalledTimes(2);
  });

  test('reintentar otra vez no le escribe dos veces a nadie', async () => {
    const bd = caida();
    const d = deps();
    await reanudarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    const r = await reanudarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r.procesados).toBe(0);
    expect(d.enviarCorreo).toHaveBeenCalledTimes(2);
    expect(bd.envios).toHaveLength(2);
  });

  test('una fila que otro proceso tiene tomada (FOR UPDATE SKIP LOCKED) se salta', async () => {
    const bd = caida();
    bd.bloqueadas.add(50);
    const d = deps();
    const r = await reanudarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r.procesados).toBe(1);
    expect(d.enviarCorreo).toHaveBeenCalledTimes(1);
    expect(d.enviarCorreo).toHaveBeenCalledWith('beto@x.co', expect.any(String), expect.any(String));
  });

  test('si el miembro se dio de baja mientras tanto, queda OMITIDO NO_AUTORIZA', async () => {
    const bd = crearBase({ canal: 'EMAIL', estado: 'ENVIADA', miembros: [ANA], comerciales: { 1: { otorgada: false, canales: null } } });
    bd.destinatarios.push({ id_campana_destinatario: 50, id_miembro: 1, estado_envio: 'PENDIENTE', motivo: null });
    const d = deps();
    const r = await reanudarCampana(bd.pool, { idCampana: 5, gymId: 1 }, d);
    expect(r).toMatchObject({ omitidos: 1, enviados: 0 });
    expect(d.enviarCorreo).not.toHaveBeenCalled();
  });

  test('fuera de horario no reintenta', async () => {
    legal.establecerReloj(() => co('2026-11-22 10:00'));
    const bd = caida();
    expect(await reanudarCampana(bd.pool, { idCampana: 5, gymId: 1 }, deps())).toMatchObject({ fueraDeHorario: true });
    expect(bd.log).toHaveLength(0);
  });
});

describe('registrarEnvioManual: constancia del WhatsApp a mano', () => {
  function conPendiente(comerciales = { 1: SOLO_WA }) {
    const bd = crearBase({ estado: 'ENVIADA', miembros: [ANA], comerciales });
    bd.destinatarios.push({ id_campana_destinatario: 50, id_miembro: 1, estado_envio: 'PENDIENTE', motivo: null });
    return bd;
  }

  test('deja la constancia y devuelve el texto con el enlace de baja y el telefono', async () => {
    const bd = conPendiente();
    const r = await registrarEnvioManual(bd.pool, { campana: bd.campana, gymId: 1, idMiembro: 1, usuarioId: 8 }, deps());
    expect(r).toMatchObject({ duplicado: false, telefono: '573001112233' });
    expect(r.mensaje).toMatch(/^Hola Ana\n\n.*\/baja\//);
    expect(bd.envios).toEqual([expect.objectContaining({ id_miembro: 1, estado: 'ENVIADO', enviado_por: 8, mensaje: r.mensaje })]);
  });

  test('doble clic: el segundo no agrega otra fila y devuelve el mismo texto', async () => {
    const bd = conPendiente();
    const primero = await registrarEnvioManual(bd.pool, { campana: bd.campana, gymId: 1, idMiembro: 1, usuarioId: 8 }, deps());
    const segundo = await registrarEnvioManual(bd.pool, { campana: bd.campana, gymId: 1, idMiembro: 1, usuarioId: 8 }, deps());
    expect(segundo).toMatchObject({ duplicado: true, mensaje: primero.mensaje });
    expect(bd.envios).toHaveLength(1);
    // revisa el estado con la fila bloqueada, dentro de la transaccion
    const i = bd.log.findIndex((s) => /FOR UPDATE OF d/.test(s));
    expect(bd.log[i - 1]).toBe('BEGIN');
  });

  test('fuera de horario: error FUERA_DE_HORARIO y sigue PENDIENTE para despues', async () => {
    legal.establecerReloj(() => co('2026-11-21 16:00'));
    const bd = conPendiente();
    const r = await registrarEnvioManual(bd.pool, { campana: bd.campana, gymId: 1, idMiembro: 1 }, deps());
    expect(r.error).toMatchObject({ motivo: 'FUERA_DE_HORARIO' });
    expect(r.error.siguiente.toISOString()).toBe(co('2026-11-23 07:00').toISOString());
    expect(bd.destinatarios[0]).toMatchObject({ estado_envio: 'PENDIENTE', motivo: 'FUERA_DE_HORARIO' });
    expect(bd.envios).toHaveLength(0);
  });

  test('si se dio de baja: error NO_AUTORIZA y queda OMITIDO', async () => {
    const bd = conPendiente({ 1: { otorgada: false, canales: null } });
    const r = await registrarEnvioManual(bd.pool, { campana: bd.campana, gymId: 1, idMiembro: 1 }, deps());
    expect(r.error.motivo).toBe('NO_AUTORIZA');
    expect(bd.destinatarios[0]).toMatchObject({ estado_envio: 'OMITIDO', motivo: 'NO_AUTORIZA' });
  });

  test('un miembro que no es destinatario: null', async () => {
    const bd = conPendiente();
    expect(await registrarEnvioManual(bd.pool, { campana: bd.campana, gymId: 1, idMiembro: 99 }, deps())).toBeNull();
  });
});

describe('campanasVencidas: filtra por gimnasio', () => {
  test('con gimnasio lo pasa a la consulta; sin el (scheduler) toma todos', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    await campanasVencidas({ query }, 7);
    await campanasVencidas({ query });
    expect(query.mock.calls[0][0]).toMatch(/\$1::int IS NULL OR id_gimnasio = \$1::int/);
    expect(query.mock.calls[0][1]).toEqual([7]);
    expect(query.mock.calls[1][1]).toEqual([null]);
  });
});

// Defecto #111: el envio y su constancia iban en el mismo try. Si el mensaje
// salia y fallaba guardar la constancia, el catch lo marcaba FALLIDO (el admin
// lo reenviaria a mano); con PostgreSQL la transaccion quedaba abortada, el
// destinatario seguia PENDIENTE y el reintento lo volvia a mandar.
// https://github.com/Luis140721/Proyecto_Fitloyalty/issues/111
describe('constancia de un mensaje que ya salio (#111)', () => {
  test('un WhatsApp que salio queda ENVIADO aunque falle la primera constancia', async () => {
    // Arrange
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA }, fallasConstancia: 1 });
    const d = deps();

    // Act
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    // Assert
    expect(r).toMatchObject({ enviados: 1, fallidos: 0, pendientes: 0 });
    expect(bd.destinatarios[0]).toMatchObject({ estado_envio: 'ENVIADO', motivo: null });
    expect(bd.envios.filter((e) => e.estado === 'ENVIADO')).toHaveLength(1);
    expect(bd.envios.filter((e) => e.estado === 'FALLIDO')).toHaveLength(0);
    expect(d.enviarWhatsapp).toHaveBeenCalledTimes(1);
  });

  test('reintentar la campana despues no vuelve a mandar el WhatsApp que ya salio', async () => {
    // Arrange
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA }, fallasConstancia: 1 });
    const d = deps();
    await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    // Act
    await reanudarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    // Assert
    expect(d.enviarWhatsapp).toHaveBeenCalledTimes(1);
  });

  test('un correo que salio queda ENVIADO aunque falle la primera constancia', async () => {
    // Arrange
    const bd = crearBase({ canal: 'EMAIL', miembros: [ANA], comerciales: { 1: LOS_DOS }, fallasConstancia: 1 });
    const d = deps();

    // Act
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    // Assert
    expect(r).toMatchObject({ enviados: 1, fallidos: 0 });
    expect(bd.destinatarios[0].estado_envio).toBe('ENVIADO');
    expect(d.enviarCorreo).toHaveBeenCalledTimes(1);
  });

  test('la constancia que se guarda en el reintento queda confirmada, sin repetirla', async () => {
    const bd = crearBase({ miembros: [ANA, BETO], comerciales: { 1: SOLO_WA, 2: SOLO_WA }, fallasConstancia: 1 });
    const d = deps();

    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    expect(r).toMatchObject({ enviados: 2, pendientes: 0 });
    expect(bd.envios.map((e) => [e.id_miembro, e.estado])).toEqual([[1, 'ENVIADO'], [2, 'ENVIADO']]);
    expect(bd.destinatarios.map((x) => x.estado_envio)).toEqual(['ENVIADO', 'ENVIADO']);
  });

  test('si otro proceso ya dejo la constancia, el reintento no la escribe otra vez', async () => {
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA }, fallasConstancia: 1 });
    bd.otroProceso = () => {
      bd.destinatarios[0].estado_envio = 'ENVIADO';
      bd.envios.push({ id_miembro: 1, id_campana: 5, estado: 'ENVIADO', fecha: MARTES });
    };

    await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, deps());

    expect(bd.envios).toHaveLength(1);
  });

  test.each([
    [1, []],
    [2, [500]],
    [3, [500, 3000]],
  ])('reintenta enseguida y solo espera si la base sigue fallando (%i fallas)', async (fallasConstancia, esperas) => {
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA }, fallasConstancia });
    const d = deps();

    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    expect(r).toMatchObject({ enviados: 1, pendientes: 0 });
    expect(d.esperar.mock.calls.map(([ms]) => ms)).toEqual(esperas);
    expect(d.enviarWhatsapp).toHaveBeenCalledTimes(1);
  });

  // La fecha de la constancia es la que usa la frecuencia de la Ley 2300.
  test('la constancia del reintento lleva la fecha del envio', async () => {
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA }, fallasConstancia: 2 });
    const d = deps({ esperar: jest.fn(async () => { legal.establecerReloj(() => co('2026-11-17 11:30')); }) });

    await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    expect(bd.envios.map((e) => e.fecha)).toEqual([MARTES]);
  });

  test('sin `esperar` en las dependencias, espera de verdad medio segundo antes del segundo reintento', async () => {
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA }, fallasConstancia: 2 });
    const inicio = Date.now();

    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, deps({ esperar: undefined }));

    expect(r).toMatchObject({ enviados: 1 });
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(450);
  });

  test('si no se logra guardar, el destinatario queda PENDIENTE y el error dice que un reintento puede repetirlo', async () => {
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA }, fallasConstancia: 4 });

    await expect(ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, deps()))
      .rejects.toThrow(/Ana.*sigue PENDIENTE y un reintento puede repetirlo/);

    expect(bd.destinatarios[0].estado_envio).toBe('PENDIENTE');
    expect(bd.envios).toEqual([]);
  });

  test('si la constancia no se puede guardar, la campana se detiene y no le escribe a nadie mas', async () => {
    // Arrange
    const bd = crearBase({ miembros: [ANA, BETO], comerciales: { 1: SOLO_WA, 2: SOLO_WA }, fallasConstancia: 99 });
    const d = deps();

    // Act
    const promesa = ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    // Assert
    await expect(promesa).rejects.toMatchObject({ code: 'CONSTANCIA_NO_GUARDADA' });
    await expect(promesa).rejects.toThrow(/salió, pero no se pudo guardar la constancia/);
    expect(d.enviarWhatsapp).toHaveBeenCalledTimes(1);
    expect(bd.envios.filter((e) => e.estado === 'FALLIDO')).toHaveLength(0);
  });

  test('un WhatsApp que de verdad fallo sigue quedando FALLIDO con ERROR_ENVIO', async () => {
    // Arrange
    const bd = crearBase({ miembros: [ANA], comerciales: { 1: SOLO_WA } });
    const d = deps({ enviarWhatsapp: jest.fn(async () => { throw new Error('numero invalido'); }) });

    // Act
    const r = await ejecutarCampana(bd.pool, { idCampana: 5, gymId: 1, usuarioId: 8 }, d);

    // Assert
    expect(r).toMatchObject({ enviados: 0, fallidos: 1 });
    expect(bd.destinatarios[0]).toMatchObject({ estado_envio: 'FALLIDO', motivo: 'ERROR_ENVIO' });
  });
});
