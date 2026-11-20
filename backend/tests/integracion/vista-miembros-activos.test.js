/**
 * Integracion, capa BD: la vista vista_miembros_activos (migracion 011), que
 * lee GET /api/vista/miembros-activos. Es la consulta propia del miembro que
 * vive en la BD: filtra los activos, toma la ultima membresia con un JOIN
 * LATERAL ordenado por fecha_fin y trae el nombre del plan con un LEFT JOIN.
 *
 * Sin TEST_DATABASE_URL se salta.
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { unico, crearGimnasio, crearMiembro, usarTransaccionPorTest } = require('./datos');

describeConBd('vista_miembros_activos', () => {
  let pool;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
  }, 60_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  const tx = usarTransaccionPorTest(() => pool);

  async function crearPlan(idGimnasio, nombre) {
    const { rows } = await tx.cliente.query(
      `INSERT INTO plan_membresia (id_gimnasio, nombre, duracion_dias, precio)
       VALUES ($1, $2, 30, 80000) RETURNING id_plan, nombre`,
      [idGimnasio, nombre],
    );
    return rows[0];
  }

  async function crearMembresia(idMiembro, plan, { inicio, fin, estado }) {
    await tx.cliente.query(
      'INSERT INTO membresia (id_miembro, id_plan, fecha_inicio, fecha_fin, estado) VALUES ($1, $2, $3, $4, $5)',
      [idMiembro, plan.id_plan, inicio, fin, estado],
    );
  }

  const LEER = `SELECT documento, estado_membresia, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, plan
                  FROM vista_miembros_activos
                 WHERE id_gimnasio = $1`;

  test('solo trae los miembros activos del gimnasio pedido', async () => {
    const gym = await crearGimnasio(tx.cliente);
    const otroGym = await crearGimnasio(tx.cliente);
    const activo = await crearMiembro(tx.cliente, gym.id_gimnasio);
    await crearMiembro(tx.cliente, gym.id_gimnasio, { activo: false });
    await crearMiembro(tx.cliente, otroGym.id_gimnasio);

    const { rows } = await tx.cliente.query(LEER, [gym.id_gimnasio]);

    expect(rows.map((r) => r.documento)).toEqual([activo.documento]);
  });

  test('muestra una sola fila por miembro: la membresia que vence de ultima, con su plan', async () => {
    const gym = await crearGimnasio(tx.cliente);
    const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
    const mensual = await crearPlan(gym.id_gimnasio, unico('Mensual'));
    const anual = await crearPlan(gym.id_gimnasio, unico('Anual'));
    // Fuera de orden a proposito: ni el id ni el orden en disco coinciden con
    // fecha_fin, asi que solo el ORDER BY de la vista elige la correcta.
    await crearMembresia(miembro.id_miembro, mensual, { inicio: '2026-02-01', fin: '2026-03-01', estado: 'VENCIDA' });
    await crearMembresia(miembro.id_miembro, anual, { inicio: '2026-03-01', fin: '2027-03-01', estado: 'ACTIVA' });
    await crearMembresia(miembro.id_miembro, mensual, { inicio: '2026-01-01', fin: '2026-02-01', estado: 'VENCIDA' });

    const { rows } = await tx.cliente.query(LEER, [gym.id_gimnasio]);

    expect(rows).toEqual([
      { documento: miembro.documento, estado_membresia: 'ACTIVA', fecha_fin: '2027-03-01', plan: anual.nombre },
    ]);
  });

  test('un miembro sin membresia aparece con el estado y el plan vacios (LEFT JOIN)', async () => {
    const gym = await crearGimnasio(tx.cliente);
    const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);

    const { rows } = await tx.cliente.query(LEER, [gym.id_gimnasio]);

    expect(rows).toEqual([{ documento: miembro.documento, estado_membresia: null, fecha_fin: null, plan: null }]);
  });
});
