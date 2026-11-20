/**
 * RQF-10 y RQF-12 sin base de datos (corren en el CI). Las pruebas contra la
 * base real estan en retos-campanas-real.test.js.
 */
const { personalizar, ejecutarCampana } = require('../src/lib/campanas');
const { estadoPorFechas, mensajeRetos, porcentaje, actualizarRetos } = require('../src/lib/retos');
const { consultaSegmento, diasDe } = require('../src/lib/segmentos');

describe('personalizar (variables de las plantillas)', () => {
  test('reemplaza todas las variables conocidas', () => {
    const t = personalizar('Hola {primer_nombre} ({nombre}), en {gimnasio} llevas {dias_sin_venir} días; vence {fecha_vencimiento}.', {
      nombre: 'Ana María Gómez', gimnasio: 'Gym Uno', dias_sin_venir: 12, fecha_fin: '2026-11-30',
    });
    expect(t).toBe('Hola Ana (Ana María Gómez), en Gym Uno llevas 12 días; vence 30/11/2026.');
  });
  test('sin datos usa textos neutros y deja intactas las variables que no conoce', () => {
    expect(personalizar('{gimnasio} {dias_sin_venir} {otra}', {})).toBe('tu gimnasio varios {otra}');
  });
});

describe('segmentos', () => {
  test('dias por defecto de cada segmento', () => {
    expect(diasDe('INACTIVOS')).toBe(7);
    expect(diasDe('NUEVOS')).toBe(30);
    expect(diasDe('PROXIMOS_A_VENCER')).toBe(7);
    expect(diasDe('INACTIVOS', '15')).toBe(15);
  });
  test('rechaza ETIQUETA y valores desconocidos', () => {
    expect(() => consultaSegmento(1, 'ETIQUETA')).toThrow(/no soportado/);
    expect(() => consultaSegmento(1, 'X')).toThrow(/no soportado/);
  });
  test('siempre filtra por gimnasio y miembros activos', () => {
    for (const s of ['TODOS', 'INACTIVOS', 'NUEVOS', 'PROXIMOS_A_VENCER']) {
      const { sql, params } = consultaSegmento(7, s, { idMiembro: 3 });
      expect(sql).toMatch(/m\.id_gimnasio = \$1 AND m\.activo = TRUE/);
      expect(params[0]).toBe(7);
      expect(params[2]).toBe(3);
    }
  });
});

describe('retos: ayudantes', () => {
  test('estado segun las fechas', () => {
    const r = { estado: 'PROGRAMADO', activo: true, fecha_inicio: '2026-11-10', fecha_fin: '2026-11-20' };
    expect(estadoPorFechas(r, '2026-11-09')).toBe('PROGRAMADO');
    expect(estadoPorFechas(r, '2026-11-10')).toBe('ACTIVO');
    expect(estadoPorFechas(r, '2026-11-20')).toBe('ACTIVO');
    expect(estadoPorFechas(r, '2026-11-21')).toBe('COMPLETADO');
    expect(estadoPorFechas({ ...r, estado: 'CANCELADO' }, '2026-11-15')).toBe('CANCELADO');
  });
  test('porcentaje con dos decimales y tope de 100', () => {
    expect(porcentaje(1, 8)).toBe(12.5);
    expect(porcentaje(1, 3)).toBe(33.33);
    expect(porcentaje(9, 8)).toBe(100);
    expect(porcentaje(1, 0)).toBe(0);
  });
  test('mensaje del check-in: felicita al completar y si no, dice cuanto falta', () => {
    expect(mensajeRetos([])).toBeNull();
    expect(mensajeRetos([{ nombre: 'A', meta: 5, acumulados: 4, completado: false }])).toContain('te falta 1');
    expect(mensajeRetos([{ nombre: 'A', meta: 5, acumulados: 2, completado: false }])).toContain('te faltan 3');
    expect(mensajeRetos([
      { nombre: 'A', meta: 5, acumulados: 2, completado: false },
      { nombre: 'B', meta: 2, acumulados: 2, completado: true, recompensa: 'Batido' },
    ])).toBe('¡Completaste el reto «B»! Recompensa: Batido.');
  });
  test('actualizarRetos nunca lanza: si la base falla devuelve []', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const pool = { query: jest.fn().mockRejectedValue(new Error('sin conexion')) };
    await expect(actualizarRetos(pool, { gymId: 1, idMiembro: 2 })).resolves.toEqual([]);
    console.error.mockRestore();
  });
});

describe('ejecutarCampana con base falsa', () => {
  function poolFalso({ estado = 'PROGRAMADA', miembros }) {
    const consultas = [];
    const client = {
      query: jest.fn(async (sql, params) => {
        consultas.push({ sql, params });
        if (/FROM campana c/.test(sql)) {
          return { rows: [{ id_campana: 5, id_gimnasio: 1, nombre: 'C', segmento: 'TODOS', mensaje: 'Hola {primer_nombre}', canal: 'WHATSAPP', estado, activa: true, gimnasio: 'G' }] };
        }
        if (/FROM miembro m/.test(sql)) return { rows: miembros };
        if (/UPDATE campana_destinatario/.test(sql)) return { rows: [{ estado_envio: params[2] }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    return { pool: { connect: async () => client }, consultas };
  }
  const deps = (extra = {}) => ({
    canalDelGimnasio: async () => 9,
    enviarCorreo: async () => ({ delivered: true }),
    enviarWhatsapp: jest.fn(async () => {}),
    whatsappActivo: () => true,
    ...extra,
  });

  test('una campana ya enviada no se vuelve a ejecutar', async () => {
    const { pool } = poolFalso({ estado: 'ENVIADA', miembros: [] });
    expect(await ejecutarCampana(pool, { idCampana: 5, gymId: 1 }, deps())).toBeNull();
  });

  test('si WhatsApp no esta listo, deja el resto pendiente para enviar a mano', async () => {
    const miembros = [
      { id_miembro: 1, nombre: 'Ana', telefono: '3001112233' },
      { id_miembro: 2, nombre: 'Beto', telefono: '3002223344' },
      { id_miembro: 3, nombre: 'Sin tel', telefono: null },
    ];
    const err = Object.assign(new Error('no listo'), { code: 'WHATSAPP_NO_LISTO' });
    const enviarWhatsapp = jest.fn().mockRejectedValue(err);
    const { pool, consultas } = poolFalso({ miembros });
    const r = await ejecutarCampana(pool, { idCampana: 5, gymId: 1 }, deps({ enviarWhatsapp }));
    expect(r).toMatchObject({ destinatarios: 3, enviados: 0, pendientes: 2, fallidos: 1 });
    expect(enviarWhatsapp).toHaveBeenCalledTimes(1); // no insiste despues del primer fallo
    const envios = consultas.filter((c) => /INSERT INTO envio_mensaje/.test(c.sql));
    expect(envios).toHaveLength(1); // solo el que no tiene telefono queda FALLIDO
    expect(envios[0].params[6]).toBe('FALLIDO');
  });

  test('con WhatsApp listo envia el texto personalizado y deja constancia', async () => {
    const enviarWhatsapp = jest.fn(async () => {});
    const { pool, consultas } = poolFalso({ miembros: [{ id_miembro: 1, nombre: 'Ana Gómez', telefono: '3001112233' }] });
    const r = await ejecutarCampana(pool, { idCampana: 5, gymId: 1, usuarioId: 4 }, deps({ enviarWhatsapp }));
    expect(r).toMatchObject({ enviados: 1, pendientes: 0 });
    expect(enviarWhatsapp).toHaveBeenCalledWith('573001112233', 'Hola Ana');
    const envio = consultas.find((c) => /INSERT INTO envio_mensaje/.test(c.sql));
    expect(envio.params).toEqual([1, 1, 9, 5, null, 'Hola Ana', 'ENVIADO', 4]);
  });
});
