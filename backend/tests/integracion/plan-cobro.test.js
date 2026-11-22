/**
 * Integracion, capa BD (semana 6, Santiago): plan_cobro, donde vive de verdad
 * el plan de cada miembro (lib/planes.js), contra PostgreSQL.
 *
 *   - ULTIMO_PLAN: la consulta propia que usan el check-in, el dashboard y los
 *     jobs de abandono y expiracion para saber "el plan vigente" de cada
 *     miembro (DISTINCT ON + ORDER BY + filtro activo). Los pools falsos de los
 *     tests unitarios devuelven la fila que se les diga; aqui se ve lo que el
 *     SQL elige de verdad.
 *   - Las restricciones de la tabla (migracion 004) que no prueba el #96
 *     (cobros-congelamiento-notificaciones.test.js, que ya cubre los NOT NULL,
 *     los CHECK, NUMERIC(10,2) y su redondeo, VARCHAR(100) de referencia_pago,
 *     el borrado en cascada con el miembro, actualizado_por y el gimnasio que
 *     no existe):
 *       · que el CHECK de tipo_plan acepte cada tipo_plan del createSchema de
 *         routes/miembros.js;
 *       · id_miembro rechaza un miembro que no existe;
 *       · id_gimnasio con ON DELETE CASCADE borra el plan aunque el miembro
 *         sea de otro gimnasio.
 *
 * Limpieza: la de tests/integracion/datos.js, una transaccion por test que
 * termina en ROLLBACK, con una red que verifica desde otra conexion que no
 * quedo ningun gimnasio de la corrida. Se eligio sobre el truncado porque la
 * BD de pruebas la comparten los E2E: truncar borraria sus datos a mitad de
 * una corrida.
 *
 * Codigos: 23514 CHECK · 23503 llave foranea.
 *
 * Sin la URL de la BD de pruebas se salta (ver bd-pruebas.js).
 */
// routes/miembros.js se carga solo para leer su createSchema: los envios no se
// usan aqui y WhatsApp arrancaria su cliente al cargarse.
jest.mock('../../src/lib/email', () => ({ sendMemberQR: jest.fn() }));
jest.mock('../../src/lib/whatsapp', () => ({ sendWhatsAppQR: jest.fn() }));

const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearMiembro, errorDe, usarTransaccionPorTest } = require('./datos');
const { ULTIMO_PLAN } = require('../../src/lib/planes');
const { createSchema } = require('../../src/routes/miembros');

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
      referencia_pago: null,
      actualizado_por: null,
      ...campos,
    };
    const { rows } = await tx.cliente.query(
      `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin,
                               valor_total, valor_pagado, estado_pago, activo,
                               referencia_pago, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [idMiembro, gymId, fila.tipo_plan, fila.fecha_inicio, fila.fecha_fin,
        fila.valor_total, fila.valor_pagado, fila.estado_pago, fila.activo,
        fila.referencia_pago, fila.actualizado_por],
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

  const planesDelMiembro = async (idMiembro) => {
    const { rows } = await tx.cliente.query('SELECT COUNT(*)::int AS n FROM plan_cobro WHERE id_miembro = $1', [idMiembro]);
    return rows[0].n;
  };

  describe('ULTIMO_PLAN', () => {
    it('should pick the plan that ends last when a later-ending plan was inserted first', async () => {
      // Arrange: una renovacion anual cargada primero y un mensual viejo cargado
      // despues (por ejemplo, al corregir un pago atrasado).
      const { gymId, idMiembro } = await gimnasioConMiembro();
      await crearPlan(idMiembro, gymId, { tipo_plan: 'ANUAL', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' });
      await crearPlan(idMiembro, gymId, { tipo_plan: 'MENSUAL', fecha_inicio: '2025-12-01', fecha_fin: '2025-12-31' });

      // Act
      const planes = await ultimoPlanDe(gymId);

      // Assert
      expect(planes).toEqual([{ id_miembro: idMiembro, tipo_plan: 'ANUAL', fecha_fin: '2026-12-31' }]);
    });

    it('should ignore an inactive plan when it ends later than the active one', async () => {
      // Arrange
      const { gymId, idMiembro } = await gimnasioConMiembro();
      await crearPlan(idMiembro, gymId, { tipo_plan: 'MENSUAL', fecha_fin: '2026-01-31' });
      await crearPlan(idMiembro, gymId, { tipo_plan: 'ANUAL', fecha_fin: '2026-12-31', activo: false });

      // Act
      const planes = await ultimoPlanDe(gymId);

      // Assert
      expect(planes).toEqual([{ id_miembro: idMiembro, tipo_plan: 'MENSUAL', fecha_fin: '2026-01-31' }]);
    });

    it('should return one row per member, the newest one, when two plans tie on fecha_fin', async () => {
      // Arrange
      const { gymId, idMiembro } = await gimnasioConMiembro();
      const otro = await crearMiembro(tx.cliente, gymId);
      await crearPlan(idMiembro, gymId, { tipo_plan: 'MENSUAL', fecha_fin: '2026-06-30' });
      await crearPlan(idMiembro, gymId, { tipo_plan: 'TRIMESTRAL', fecha_fin: '2026-06-30' });
      await crearPlan(otro.id_miembro, gymId, { tipo_plan: 'SEMESTRAL', fecha_fin: '2026-03-31' });

      // Act
      const planes = await ultimoPlanDe(gymId);

      // Assert: un miembro, una fila. En el empate gana el id mas alto (el
      // ultimo cargado).
      expect(planes).toEqual([
        { id_miembro: idMiembro, tipo_plan: 'TRIMESTRAL', fecha_fin: '2026-06-30' },
        { id_miembro: otro.id_miembro, tipo_plan: 'SEMESTRAL', fecha_fin: '2026-03-31' },
      ]);
    });

    it('should leave out a member when all of their plans are inactive', async () => {
      // Arrange: el miembro tiene un plan, pero inactivo.
      const { gymId, idMiembro } = await gimnasioConMiembro();
      await crearPlan(idMiembro, gymId, { activo: false });

      // Act
      const planes = await ultimoPlanDe(gymId);

      // Assert
      expect(planes).toEqual([]);
    });
  });

  describe('restricciones de plan_cobro que no cubre el #96', () => {
    it('should accept a plan when its tipo_plan is any value the createSchema of the API allows', async () => {
      // Arrange: la lista sale del createSchema de routes/miembros.js, no de una
      // copia. Si alguien agrega un plan al zod y no al CHECK, el alta
      // responderia 500 y este test falla con 23514.
      const tipos = createSchema.shape.tipo_plan.removeDefault().options;
      const { gymId, idMiembro } = await gimnasioConMiembro();

      // Act
      for (const tipo_plan of tipos) await crearPlan(idMiembro, gymId, { tipo_plan });

      // Assert
      expect(tipos.length).toBeGreaterThan(0);
      expect(await planesDelMiembro(idMiembro)).toBe(tipos.length);
    });

    it('should reject with 23503 when the member of the plan does not exist', async () => {
      // Arrange
      const { gymId, idMiembro } = await gimnasioConMiembro();
      await tx.cliente.query('DELETE FROM miembro WHERE id_miembro = $1', [idMiembro]);

      // Act
      const err = await errorDe(
        tx.cliente,
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin)
         VALUES ($1, $2, 'MENSUAL', '2026-01-01', '2026-01-31')`,
        [idMiembro, gymId],
      );

      // Assert
      expect(err.code).toBe('23503');
      expect(err.constraint).toBe('plan_cobro_id_miembro_fkey');
    });

    it('should delete the plans of a gym when the gym is deleted (ON DELETE CASCADE)', async () => {
      // Arrange: el plan apunta a un gimnasio distinto del de su miembro, asi lo
      // que lo borra es plan_cobro_id_gimnasio_fkey y no la cascada del miembro.
      const { gymId, idMiembro } = await gimnasioConMiembro();
      const otro = await crearGimnasio(tx.cliente);
      await crearPlan(idMiembro, otro.id_gimnasio);

      // Act
      await tx.cliente.query('DELETE FROM gimnasio WHERE id_gimnasio = $1', [otro.id_gimnasio]);

      // Assert: el plan se fue y el miembro (del otro gimnasio) sigue.
      expect(await planesDelMiembro(idMiembro)).toBe(0);
      const { rows } = await tx.cliente.query('SELECT id_gimnasio FROM miembro WHERE id_miembro = $1', [idMiembro]);
      expect(rows).toEqual([{ id_gimnasio: gymId }]);
    });
  });
});
