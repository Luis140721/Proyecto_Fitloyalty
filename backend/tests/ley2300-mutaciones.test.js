/**
 * RQNF-16: pruebas para las mutaciones que sobrevivieron en la revision del
 * PR #108 (corren sin base de datos, en el CI):
 *
 *   - historialDeVarios (lib/contacto-miembro.js): un envio FALLIDO no cuenta
 *     en la frecuencia y los avisos automaticos de vencimiento si cuentan;
 *   - el scheduler reintenta los avisos de vencimiento a las 2:00 p. m. (y no
 *     a las 3:00, que el sabado ya esta fuera del horario de la Ley 2300);
 *   - la firma del enlace de baja incluye el gimnasio: se prueba en
 *     lib/baja-mensajes.js, sin pasar por el filtro por gimnasio de la ruta.
 *
 * La base falsa del historial aplica de verdad los filtros que trae el SQL
 * (estado y fecha): si alguien los quita, la prueba lo nota.
 */
process.env.JWT_SECRET = 'secreto-de-pruebas';

const legal = require('../src/lib/contacto-legal');
const { historialDeVarios, evaluarContacto } = require('../src/lib/contacto-miembro');
const { tokenBaja, verificarTokenBaja } = require('../src/lib/baja-mensajes');

const co = (texto) => new Date(`${texto.replace(' ', 'T')}:00-05:00`);
const MARTES = co('2026-11-17 10:00');

/**
 * Base falsa del historial. `envios`: [{ id, canal, estado, fecha }];
 * `avisos`: [{ id, fecha }] (alerta_vencimiento_enviada); `conTablaAvisos`:
 * si existe la tabla de la migracion 007.
 */
function baseHistorial({ envios = [], avisos = [], conTablaAvisos = true } = {}) {
  const log = [];
  const db = {
    query: jest.fn(async (sql, params = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      log.push(s);
      if (/FROM envio_mensaje e/.test(s)) {
        const ids = params[0];
        return {
          rows: envios
            .filter((e) => ids.includes(e.id))
            .filter((e) => !/e\.estado = 'ENVIADO'/.test(s) || e.estado === 'ENVIADO')
            .filter((e) => !/e\.fecha_envio >= /.test(s) || e.fecha >= params[1])
            .map((e) => ({ id_miembro: e.id, canal: e.canal, fecha: e.fecha })),
        };
      }
      if (/to_regclass\('public\.alerta_vencimiento_enviada'\)/.test(s)) return { rows: [{ existe: conTablaAvisos }] };
      if (/FROM alerta_vencimiento_enviada/.test(s)) {
        const ids = params[0];
        return {
          rows: avisos
            .filter((a) => ids.includes(a.id))
            .filter((a) => !/enviado_at >= /.test(s) || a.fecha >= params[1])
            .map((a) => ({ id_miembro: a.id, canal: 'WHATSAPP', fecha: a.fecha })),
        };
      }
      throw new Error(`Consulta inesperada: ${s.slice(0, 80)}`);
    }),
  };
  return { db, log };
}

const LUNES = legal.inicioDeSemana(MARTES);
const aviso = (db) => evaluarContacto(db, { miembro: { id_miembro: 7, nombre: 'Ana' }, gymId: 1, canal: 'WHATSAPP', clase: 'AVISO', instante: MARTES });

describe('historial de contactos (lib/contacto-miembro.js)', () => {
  test('un envio FALLIDO de hoy no cuenta en la frecuencia', async () => {
    const { db } = baseHistorial({ envios: [{ id: 7, canal: 'WHATSAPP', estado: 'FALLIDO', fecha: co('2026-11-17 08:00') }] });
    expect((await historialDeVarios(db, [7], LUNES)).get(7)).toEqual([]);
    expect(await aviso(db)).toEqual({ puede: true, clase: 'AVISO' });
  });

  test('un envio PENDIENTE tampoco cuenta; uno ENVIADO de hoy si (FRECUENCIA)', async () => {
    const pendiente = baseHistorial({ envios: [{ id: 7, canal: 'WHATSAPP', estado: 'PENDIENTE', fecha: co('2026-11-17 08:00') }] });
    expect((await aviso(pendiente.db)).puede).toBe(true);
    const enviado = baseHistorial({ envios: [{ id: 7, canal: 'WHATSAPP', estado: 'ENVIADO', fecha: co('2026-11-17 08:00') }] });
    expect(await aviso(enviado.db)).toMatchObject({ puede: false, motivo: 'FRECUENCIA', detalle: 'MISMO_DIA' });
  });

  test('los avisos automaticos de vencimiento si cuentan (por WhatsApp)', async () => {
    const { db } = baseHistorial({ avisos: [{ id: 7, fecha: co('2026-11-17 09:00') }] });
    expect((await historialDeVarios(db, [7], LUNES)).get(7)).toEqual([{ canal: 'WHATSAPP', fecha: co('2026-11-17 09:00') }]);
    expect(await aviso(db)).toMatchObject({ puede: false, motivo: 'FRECUENCIA', detalle: 'MISMO_DIA' });
  });

  test('un aviso automatico del lunes impide un correo comercial el martes (otro canal en la semana)', async () => {
    const { db } = baseHistorial({ avisos: [{ id: 7, fecha: co('2026-11-16 09:00') }] });
    const historial = (await historialDeVarios(db, [7], LUNES)).get(7);
    const r = legal.puedeContactar({ nombre: 'Ana', acepta_mensajes_comerciales: true, canales_autorizados: ['EMAIL'] }, 'EMAIL', MARTES, historial);
    expect(r).toMatchObject({ puede: false, motivo: 'FRECUENCIA', detalle: 'OTRO_CANAL' });
  });

  test('los de la semana pasada no cuentan, y cada miembro tiene lo suyo', async () => {
    const { db } = baseHistorial({
      envios: [
        { id: 7, canal: 'EMAIL', estado: 'ENVIADO', fecha: co('2026-11-15 12:00') }, // domingo anterior
        { id: 8, canal: 'EMAIL', estado: 'ENVIADO', fecha: co('2026-11-16 12:00') },
      ],
      avisos: [{ id: 8, fecha: co('2026-11-17 08:00') }],
    });
    const mapa = await historialDeVarios(db, [7, 8], LUNES);
    expect(mapa.get(7)).toEqual([]);
    expect(mapa.get(8).map((h) => h.canal)).toEqual(['EMAIL', 'WHATSAPP']);
  });

  test('si la tabla de avisos no existe (base sin la migracion 007), no la consulta', async () => {
    const { db, log } = baseHistorial({ conTablaAvisos: false, avisos: [{ id: 7, fecha: co('2026-11-17 09:00') }] });
    expect((await historialDeVarios(db, [7], LUNES)).get(7)).toEqual([]);
    expect(log.some((s) => /FROM alerta_vencimiento_enviada WHERE/.test(s))).toBe(false);
  });

  test('sin miembros no consulta nada', async () => {
    const { db } = baseHistorial();
    expect((await historialDeVarios(db, [], LUNES)).size).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('scheduler: reintento de los avisos de vencimiento a las 2:00 p. m.', () => {
  test('programa los avisos a las 9:00 y a las 14:00 de Colombia (no a las 15:00)', () => {
    jest.isolateModules(() => {
      jest.useFakeTimers();
      const programadas = [];
      jest.doMock('node-cron', () => ({
        schedule: jest.fn((expr, fn, opts) => { programadas.push({ expr, opts }); return { stop: jest.fn() }; }),
      }));
      jest.doMock('../src/jobs/expiracion', () => ({ runJob: jest.fn(async () => ({})) }));
      jest.doMock('../src/jobs/abandono', () => ({ runJob: jest.fn(async () => ({})) }));
      jest.doMock('../src/jobs/campanas', () => ({ runJob: jest.fn(async () => ({ ejecutadas: 0 })) }));
      const antes = process.env.DISABLE_SCHEDULER;
      delete process.env.DISABLE_SCHEDULER;
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const scheduler = require('../src/jobs/scheduler');
        scheduler.start();
        const exprs = programadas.map((p) => p.expr);
        expect(exprs).toEqual(expect.arrayContaining(['0 9 * * *', '0 14 * * *', '0 8 * * *', '*/10 * * * *']));
        expect(exprs).not.toContain('0 15 * * *');
        for (const p of programadas) expect(p.opts).toEqual({ timezone: 'America/Bogota' });
        // A las 2:00 p. m. del sabado todavia se puede contactar (Ley 2300).
        expect(legal.dentroDeHorario(co('2026-11-21 14:00'))).toBe(true);
        expect(legal.dentroDeHorario(co('2026-11-21 15:00'))).toBe(false);
        scheduler.stop();
      } finally {
        log.mockRestore();
        if (antes === undefined) delete process.env.DISABLE_SCHEDULER; else process.env.DISABLE_SCHEDULER = antes;
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    });
  });
});

describe('enlace de baja: la firma incluye el gimnasio (lib/baja-mensajes.js)', () => {
  test('el mismo miembro con otro gimnasio no verifica, aunque la ruta no filtrara por gimnasio', () => {
    const t = tokenBaja(50, 7);
    expect(verificarTokenBaja(t)).toEqual({ idMiembro: 50, idGimnasio: 7 });
    const [, , firma] = t.split('.');
    expect(verificarTokenBaja(`50.9.${firma}`)).toBeNull();
    expect(verificarTokenBaja(`51.7.${firma}`)).toBeNull();
  });

  test('la firma cambia si cambia el gimnasio o el miembro', () => {
    const firma = (m, g) => tokenBaja(m, g).split('.')[2];
    expect(firma(50, 7)).not.toBe(firma(50, 9));
    expect(firma(50, 7)).not.toBe(firma(51, 7));
    expect(firma(50, 7)).toBe(firma(50, 7));
  });

  test('ids invalidos o tokens mal formados no verifican', () => {
    expect(() => tokenBaja(0, 7)).toThrow(TypeError);
    expect(verificarTokenBaja('50.7')).toBeNull();
    expect(verificarTokenBaja(`050.7.${tokenBaja(50, 7).split('.')[2]}`)).toBeNull();
    expect(verificarTokenBaja(null)).toBeNull();
  });
});
