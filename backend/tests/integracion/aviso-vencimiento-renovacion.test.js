/**
 * Integracion, capa BD: el aviso de vencimiento vuelve a salir despues de
 * renovar (RQF-14).
 *
 * Renovar (PUT /api/admin/miembros/:id/plan) y descongelar cambian las fechas
 * del mismo plan_cobro. El control de repetidos solo miraba el plan, asi que un
 * miembro que ya habia recibido sus avisos no los recibia nunca mas. Ahora cada
 * aviso cuenta para su vencimiento: el dia en que salio mas los dias que faltaban.
 *
 * El reloj de la Ley 2300 se fija en una semana lejana (un martes a las 10:00),
 * para que el horario y la frecuencia no dependan de cuando corre la prueba. Por
 * eso los avisos de antes se insertan con su fecha en vez de enviarlos.
 *
 * Sin la BD de pruebas se salta (ver bd-pruebas.js).
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearMiembro } = require('./datos');

describeConBd('aviso de vencimiento despues de renovar, contra la BD de pruebas (RQF-14)', () => {
  let pool, legal, runJob, gymId, idMiembro, idPlan;
  const MARTES = new Date('2030-01-08T10:00:00-05:00');
  const semanas = (n) => new Date(MARTES.getTime() + n * 7 * 86400000);

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    legal = require('../../src/lib/contacto-legal');
    ({ runJob } = require('../../src/jobs/expiracion'));
    gymId = (await crearGimnasio(pool)).id_gimnasio;
    await pool.query('UPDATE gimnasio SET dias_aviso_vencimiento = 3 WHERE id_gimnasio = $1', [gymId]);
  }, 60_000);

  beforeEach(async () => {
    legal.establecerReloj(() => MARTES);
    idMiembro = (await crearMiembro(pool, gymId)).id_miembro;
    idPlan = (await pool.query(
      `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, activo)
       VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 28, CURRENT_DATE + 2, TRUE) RETURNING id_plan_cobro`,
      [idMiembro, gymId],
    )).rows[0].id_plan_cobro;
  });
  afterEach(async () => {
    legal.establecerReloj(null);
    await pool.query('DELETE FROM miembro WHERE id_gimnasio = $1', [gymId]);
  });
  afterAll(async () => {
    if (!pool) return;
    if (gymId) await pool.query('DELETE FROM gimnasio WHERE id_gimnasio = $1', [gymId]);
    await pool.end();
  });

  const avisado = (dias, haceDias) => pool.query(
    `INSERT INTO alerta_vencimiento_enviada (id_miembro, id_plan_cobro, dias_restantes, enviado_at)
     VALUES ($1, $2, $3, CURRENT_DATE - $4::int + TIME '10:00')`,
    [idMiembro, idPlan, dias, haceDias],
  );
  const vence = (dias) => pool.query('UPDATE plan_cobro SET fecha_fin = CURRENT_DATE + $2::int WHERE id_plan_cobro = $1', [idPlan, dias]);
  const correr = async () => {
    const wa = { sendWhatsAppText: jest.fn(async () => {}) };
    const r = await runJob({ gymId, whatsappClient: wa });
    return { enviados: wa.sendWhatsAppText.mock.calls.length, motivos: r.detalle.map((d) => d.motivo || d.status) };
  };

  test.each([
    ['al entrar en la ventana', 2, 3, 1],
    ['el mismo dia', 2, 2, 0],
    ['el dia del vencimiento', 0, 0, 0],
  ])('no repite el aviso del vencimiento actual: %s', async (_caso, dias, diasDelAviso, haceDias) => {
    await vence(dias);
    await avisado(diasDelAviso, haceDias);

    expect(await correr()).toEqual({ enviados: 0, motivos: ['duplicado'] });
  });

  test.each([
    ['el de entrada a la ventana', 2, 2, 30],
    ['el del dia', 0, 0, 30],
  ])('despues de renovar el mismo plan vuelve a salir %s, una sola vez', async (_caso, dias, diasDelAviso, haceDias) => {
    await vence(dias);
    await avisado(diasDelAviso, haceDias);

    expect(await correr()).toEqual({ enviados: 1, motivos: ['enviado'] });

    // Queda una sola marca, la del ciclo nuevo.
    const { rows } = await pool.query('SELECT dias_restantes, enviado_at FROM alerta_vencimiento_enviada WHERE id_plan_cobro = $1', [idPlan]);
    expect(rows).toHaveLength(1);
    expect(rows[0].dias_restantes).toBe(dias);
    expect(rows[0].enviado_at.getUTCFullYear()).toBe(2030);

    // Con la fecha de hoy, que es la que tendria fuera de la prueba, no se repite.
    await pool.query("UPDATE alerta_vencimiento_enviada SET enviado_at = CURRENT_DATE + TIME '10:00' WHERE id_plan_cobro = $1", [idPlan]);
    legal.establecerReloj(() => semanas(1));
    expect(await correr()).toEqual({ enviados: 0, motivos: ['duplicado'] });
  });

  test('descongelar corre el vencimiento: el aviso de la fecha anterior no cuenta', async () => {
    // Salio cuando vencia hoy + 2 - 10; al descongelar el vencimiento se corrio 10 dias.
    await vence(2);
    await avisado(3, 11);

    expect(await correr()).toEqual({ enviados: 1, motivos: ['enviado'] });
  });

  test('el aviso de otro plan del miembro no cuenta', async () => {
    const otro = (await pool.query(
      `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, activo)
       VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 60, CURRENT_DATE + 2, FALSE) RETURNING id_plan_cobro`,
      [idMiembro, gymId],
    )).rows[0].id_plan_cobro;
    await pool.query(
      `INSERT INTO alerta_vencimiento_enviada (id_miembro, id_plan_cobro, dias_restantes, enviado_at)
       VALUES ($1, $2, 2, CURRENT_DATE + TIME '10:00')`,
      [idMiembro, otro],
    );

    expect((await correr()).enviados).toBe(1);
  });
});
