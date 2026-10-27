/**
 * RQF-11: rachas e hitos del check-in.
 */
const { calcularGamificacion, contarRacha, armarMensaje } = require('../src/lib/gamificacion');

describe('contarRacha', () => {
  test('sin ingresos no hay racha', () => {
    expect(contarRacha([])).toBe(0);
  });

  test('un solo dia es racha de 1', () => {
    expect(contarRacha(['2026-10-20'])).toBe(1);
  });

  test('cuenta los dias seguidos y se corta en el primer hueco', () => {
    expect(contarRacha(['2026-10-20', '2026-10-19', '2026-10-18', '2026-10-15', '2026-10-14'])).toBe(3);
  });

  test('cruza el cambio de mes y de ano', () => {
    expect(contarRacha(['2027-01-01', '2026-12-31', '2026-12-30'])).toBe(3);
    expect(contarRacha(['2026-11-01', '2026-10-31'])).toBe(2);
  });
});

describe('armarMensaje', () => {
  test('con hito nuevo usa el mensaje del gimnasio', () => {
    const msg = armarMensaje({ racha: 7, nuevos: [{ mensaje: '¡7 días seguidos!' }], proximo: null });
    expect(msg).toBe('¡7 días seguidos!');
  });

  test('con racha de varios dias lo dice y avisa lo que falta', () => {
    const msg = armarMensaje({ racha: 3, nuevos: [], proximo: { nombre: 'Primera Semana', faltan: 4 } });
    expect(msg).toContain('3 días seguidos');
    expect(msg).toContain('Te faltan 4 para «Primera Semana»');
  });

  test('el primer dia invita a volver', () => {
    expect(armarMensaje({ racha: 1, nuevos: [], proximo: null })).toContain('Vuelve mañana');
  });
});

describe('calcularGamificacion', () => {
  const HITOS = [
    { id_hito: 1, nombre: 'Primera Semana', tipo_hito: 'RACHA', valor_objetivo: 7, mensaje: '¡7 días!' },
    { id_hito: 2, nombre: '10 Visitas', tipo_hito: 'TOTAL_ASISTENCIAS', valor_objetivo: 10, mensaje: '¡10 visitas!' },
    { id_hito: 3, nombre: 'Primer Mes', tipo_hito: 'RACHA', valor_objetivo: 30, mensaje: '¡Un mes!' },
  ];

  /** Pool falso: responde cada consulta segun su texto y guarda los inserts. */
  function poolFalso({ dias, total, pendientes, otorgables = true }) {
    const inserts = [];
    const pool = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('SELECT DISTINCT')) return { rows: dias.map((dia) => ({ dia })) };
        if (sql.includes('COUNT(*)')) return { rows: [{ total }] };
        if (sql.includes('FROM hito_gamificacion')) return { rows: pendientes };
        if (sql.includes('INSERT INTO hito_miembro')) {
          inserts.push(params);
          return { rows: otorgables ? [{ id_hito_miembro: 1 }] : [] };
        }
        throw new Error(`consulta inesperada: ${sql}`);
      }),
    };
    return { pool, inserts };
  }

  test('otorga el hito de racha al llegar a la meta', async () => {
    const dias = ['2026-10-20', '2026-10-19', '2026-10-18', '2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14'];
    const { pool, inserts } = poolFalso({ dias, total: 7, pendientes: HITOS });
    const r = await calcularGamificacion(pool, { gymId: 1, idMiembro: 9 });

    expect(r.racha).toBe(7);
    expect(r.hitosNuevos.map((h) => h.id)).toEqual([1]);
    expect(inserts).toEqual([[1, 9]]);
    expect(r.mensaje).toBe('¡7 días!');
    expect(r.proximoHito).toEqual({ nombre: '10 Visitas', tipo: 'TOTAL_ASISTENCIAS', faltan: 3 });
  });

  test('otorga el hito de total de asistencias', async () => {
    const { pool } = poolFalso({ dias: ['2026-10-20'], total: 10, pendientes: HITOS });
    const r = await calcularGamificacion(pool, { gymId: 1, idMiembro: 9 });
    expect(r.hitosNuevos.map((h) => h.id)).toEqual([2]);
  });

  test('sin hitos alcanzados solo informa racha y lo que falta', async () => {
    const { pool, inserts } = poolFalso({ dias: ['2026-10-20', '2026-10-19'], total: 2, pendientes: HITOS });
    const r = await calcularGamificacion(pool, { gymId: 1, idMiembro: 9 });
    expect(r.racha).toBe(2);
    expect(r.hitosNuevos).toEqual([]);
    expect(inserts).toEqual([]);
    expect(r.proximoHito.nombre).toBe('Primera Semana');
    expect(r.mensaje).toContain('2 días seguidos');
  });

  test('si otro check-in ya otorgo el hito (ON CONFLICT) no lo repite', async () => {
    const { pool } = poolFalso({ dias: ['2026-10-20'], total: 10, pendientes: HITOS, otorgables: false });
    const r = await calcularGamificacion(pool, { gymId: 1, idMiembro: 9 });
    expect(r.hitosNuevos).toEqual([]);
  });

  test('si la base falla devuelve null y no lanza', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const pool = { query: jest.fn().mockRejectedValue(new Error('caida')) };
    await expect(calcularGamificacion(pool, { gymId: 1, idMiembro: 9 })).resolves.toBeNull();
    spy.mockRestore();
  });
});
