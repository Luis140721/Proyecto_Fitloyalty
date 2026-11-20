/**
 * Integracion, capa BD (semana 6, Santiago): plan_cobro, donde vive de verdad
 * el plan de cada miembro (lib/planes.js), contra PostgreSQL.
 *
 *   - ULTIMO_PLAN: la consulta propia que usan el check-in, el dashboard y los
 *     jobs de abandono y expiracion para saber "el plan vigente" de cada
 *     miembro (DISTINCT ON + ORDER BY + filtro activo). Los pools falsos de los
 *     tests unitarios devuelven la fila que se les diga; aqui se ve lo que el
 *     SQL elige de verdad.
 *   - Cada restriccion de la tabla documentada con un test: NOT NULL, CHECK de
 *     tipo_plan, metodo_pago y estado_pago, llave foranea con ON DELETE
 *     CASCADE, y NUMERIC(10,2).
 *
 * Limpieza: la de tests/integracion/datos.js, una transaccion por test que
 * termina en ROLLBACK, con una red que verifica desde otra conexion que no
 * quedo ningun gimnasio de la corrida. Se eligio sobre el truncado porque la
 * BD de pruebas la comparten los E2E: truncar borraria sus datos a mitad de
 * una corrida.
 *
 * Codigos: 23502 NOT NULL · 23514 CHECK · 23503 llave foranea · 22003 numero
 * fuera del rango de la columna.
 *
 * Sin la URL de la BD de pruebas se salta (ver bd-pruebas.js).
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearMiembro, errorDe, usarTransaccionPorTest } = require('./datos');
const { ULTIMO_PLAN } = require('../../src/lib/planes');

describeConBd('plan_cobro contra la BD de pruebas', () => {
  let pool;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
  }, 60_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  const tx = usarTransaccionPorTest(() => pool);

  async function gimnasioConMiembro() {
    const gym = await crearGimnasio(tx.cliente);
    const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
    return { gymId: gym.id_gimnasio, idMiembro: miembro.id_miembro };
  }

  /** Inserta un plan_cobro con valores validos; `campos` pisa los que haga falta. */
  async function crearPlan(idMiembro, gymId, campos = {}) {
    const fila = {
      tipo_plan: 'MENSUAL',
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-01-31',
      valor_total: 80000,
      valor_pagado: 80000,
      estado_pago: 'PAGADO',
      activo: true,
      ...campos,
    };
    const { rows } = await tx.cliente.query(
      `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin,
                               valor_total, valor_pagado, estado_pago, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [idMiembro, gymId, fila.tipo_plan, fila.fecha_inicio, fila.fecha_fin,
        fila.valor_total, fila.valor_pagado, fila.estado_pago, fila.activo],
    );
    return rows[0];
  }

  /** Lo que ve el check-in: el ultimo plan de los miembros de un gimnasio. */
  async function ultimoPlanDe(gymId) {
    const { rows } = await tx.cliente.query(
      `SELECT pc.id_miembro, pc.tipo_plan, to_char(pc.fecha_fin, 'YYYY-MM-DD') AS fecha_fin
         FROM ${ULTIMO_PLAN} pc
         JOIN miembro mb ON mb.id_miembro = pc.id_miembro
        WHERE pc.id_gimnasio = $1
        ORDER BY pc.id_miembro`,
      [gymId],
    );
    return rows;
  }

  describe('ULTIMO_PLAN', () => {
    it('should pick the plan that ends last, not the one inserted last', async () => {
      const { gymId, idMiembro } = await gimnasioConMiembro();
      // Una renovacion anual cargada primero y un mensual viejo cargado despues
      // (por ejemplo, al corregir un pago atrasado).
      await crearPlan(idMiembro, gymId, { tipo_plan: 'ANUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' });
      await crearPlan(idMiembro, gymId, { tipo_plan: 'MENSUAL', fecha_inicio: '2025-12-01', fecha_fin: '2025-12-31' });

      const planes = await ultimoPlanDe(gymId);

      expect(planes).toEqual([{ id_miembro: idMiembro, tipo_plan: 'ANUAL', fecha_fin: '2026-12-31' }]);
    });

    it('should ignore inactive plans even when they end later', async () => {
      const { gymId, idMiembro } = await gimnasioConMiembro();
      await crearPlan(idMiembro, gymId, { tipo_plan: 'MENSUAL', fecha_fin: '2026-01-31' });
      await crearPlan(idMiembro, gymId, { tipo_plan: 'ANUAL', fecha_fin: '2026-12-31', activo: false });

      const planes = await ultimoPlanDe(gymId);

      expect(planes).toEqual([{ id_miembro: idMiembro, tipo_plan: 'MENSUAL', fecha_fin: '2026-01-31' }]);
    });

    it('should break a tie on fecha_fin with the newest row, one row per member', async () => {
      const { gymId, idMiembro } = await gimnasioConMiembro();
      const otro = await crearMiembro(tx.cliente, gymId);
      await crearPlan(idMiembro, gymId, { tipo_plan: 'MENSUAL', fecha_fin: '2026-06-30' });
      await crearPlan(idMiembro, gymId, { tipo_plan: 'TRIMESTRAL', fecha_fin: '2026-06-30' });
      await crearPlan(otro.id_miembro, gymId, { tipo_plan: 'SEMESTRAL', fecha_fin: '2026-03-31' });

      const planes = await ultimoPlanDe(gymId);

      // Un miembro, una fila. En el empate gana el id mas alto (el ultimo cargado).
      expect(planes).toEqual([
        { id_miembro: idMiembro, tipo_plan: 'TRIMESTRAL', fecha_fin: '2026-06-30' },
        { id_miembro: otro.id_miembro, tipo_plan: 'SEMESTRAL', fecha_fin: '2026-03-31' },
      ]);
    });

    it('should leave out members without an active plan', async () => {
      const { gymId } = await gimnasioConMiembro();

      expect(await ultimoPlanDe(gymId)).toEqual([]);
    });
  });

  describe('restricciones de plan_cobro', () => {
    it.each(['tipo_plan', 'fecha_inicio', 'fecha_fin', 'valor_total', 'estado_pago', 'activo'])(
      'should reject NULL in %s (23502)',
      async (columna) => {
        const { gymId, idMiembro } = await gimnasioConMiembro();
        const plan = await crearPlan(idMiembro, gymId);

        const err = await errorDe(tx.cliente, `UPDATE plan_cobro SET ${columna} = NULL WHERE id_plan_cobro = $1`, [plan.id_plan_cobro]);

        expect(err.code).toBe('23502');
        expect(err.column).toBe(columna);
      },
    );

    it.each([
      ['tipo_plan', 'SEMANAL', 'chk_tipo_plan'],
      ['metodo_pago', 'BITCOIN', 'chk_metodo_pago'],
      ['estado_pago', 'ANULADO', 'chk_estado_pago'],
    ])('should reject %s = %s with the CHECK %s (23514)', async (columna, valor, restriccion) => {
      const { gymId, idMiembro } = await gimnasioConMiembro();
      const plan = await crearPlan(idMiembro, gymId);

      const err = await errorDe(tx.cliente, `UPDATE plan_cobro SET ${columna} = $1 WHERE id_plan_cobro = $2`, [valor, plan.id_plan_cobro]);

      expect(err.code).toBe('23514');
      expect(err.constraint).toBe(restriccion);
    });

    it('should accept every value the API schema allows for tipo_plan', async () => {
      // Si alguien agrega un plan en el zod de routes/miembros.js y no en el
      // CHECK, el alta responderia 500. Esta es la lista del createSchema.
      const { gymId, idMiembro } = await gimnasioConMiembro();
      const tipos = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CLASES_SUELTAS', 'ILIMITADO', 'OTRO'];

      for (const tipo_plan of tipos) await crearPlan(idMiembro, gymId, { tipo_plan });

      const { rows } = await tx.cliente.query('SELECT COUNT(*)::int AS n FROM plan_cobro WHERE id_miembro = $1', [idMiembro]);
      expect(rows[0].n).toBe(tipos.length);
    });

    it('should reject a plan for a member that does not exist (23503)', async () => {
      const { gymId, idMiembro } = await gimnasioConMiembro();
      await tx.cliente.query('DELETE FROM miembro WHERE id_miembro = $1', [idMiembro]);

      const err = await errorDe(
        tx.cliente,
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin)
         VALUES ($1, $2, 'MENSUAL', '2026-01-01', '2026-01-31')`,
        [idMiembro, gymId],
      );

      expect(err.code).toBe('23503');
      expect(err.constraint).toBe('plan_cobro_id_miembro_fkey');
    });

    it('should delete the plans of a member when the member is deleted (ON DELETE CASCADE)', async () => {
      const { gymId, idMiembro } = await gimnasioConMiembro();
      await crearPlan(idMiembro, gymId);
      await crearPlan(idMiembro, gymId, { fecha_fin: '2026-02-28' });

      await tx.cliente.query('DELETE FROM miembro WHERE id_miembro = $1', [idMiembro]);

      const { rows } = await tx.cliente.query('SELECT COUNT(*)::int AS n FROM plan_cobro WHERE id_miembro = $1', [idMiembro]);
      expect(rows[0].n).toBe(0);
    });

    it('should reject a valor_total that does not fit NUMERIC(10,2) (22003)', async () => {
      const { gymId, idMiembro } = await gimnasioConMiembro();

      // 8 digitos enteros caben (99.999.999,99); 9 no. En MySQL sin modo
      // estricto el valor se recortaria al maximo en silencio; PostgreSQL falla.
      await crearPlan(idMiembro, gymId, { valor_total: '99999999.99' });
      const err = await errorDe(
        tx.cliente,
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, valor_total)
         VALUES ($1, $2, 'MENSUAL', '2026-01-01', '2026-01-31', 100000000)`,
        [idMiembro, gymId],
      );

      expect(err.code).toBe('22003');
    });

    it('should round cents to two decimals instead of rejecting them', async () => {
      const { gymId, idMiembro } = await gimnasioConMiembro();

      const plan = await crearPlan(idMiembro, gymId, { valor_total: '80000.005', valor_pagado: '0.004' });

      // pg devuelve NUMERIC como texto para no perder precision.
      expect(plan.valor_total).toBe('80000.01');
      expect(plan.valor_pagado).toBe('0.00');
    });
  });
});
