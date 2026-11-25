/**
 * Integracion, capa BD: "hoy" empieza en la medianoche de Colombia.
 *
 * INICIO_HOY (lib/segmentos.js) decide que ingresos salen en "Ingresos de hoy"
 * (GET /api/admin/checkin?dia=hoy). checkin.fecha_hora es un TIMESTAMP sin zona
 * escrito con la hora de la sesion, asi que el corte depende de la zona de la
 * sesion: UTC en Neon y en Docker, y la de Colombia en un equipo local. Aqui se
 * comprueba con las dos. Sin DATABASE_URL en el entorno del proceso se salta.
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearMiembro, usarTransaccionPorTest } = require('./datos');
const { INICIO_HOY } = require('../../src/lib/segmentos');

describeConBd('INICIO_HOY contra la BD de pruebas', () => {
  let pool;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
  }, 60_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  const tx = usarTransaccionPorTest(() => pool);

  test.each(['UTC', 'America/Bogota', 'Asia/Tokyo'])('deja pasar los ingresos de hoy y no los de ayer, con la sesion en %s', async (zona) => {
    await tx.cliente.query(`SET LOCAL TIME ZONE '${zona}'`);
    const gym = await crearGimnasio(tx.cliente);
    const miembro = await crearMiembro(tx.cliente, gym.id_gimnasio);
    // Un segundo antes y justo en la medianoche de hoy en Colombia, escritos con la hora de la sesion.
    for (const [metodo, desfase] of [['MANUAL', '-1 second'], ['QR', '0 seconds']]) {
      await tx.cliente.query(
        `INSERT INTO checkin (id_gimnasio, id_miembro, metodo, valido, fecha_hora)
         VALUES ($1, $2, $3, TRUE,
                 ((date_trunc('day', now() AT TIME ZONE 'America/Bogota') + $4::interval) AT TIME ZONE 'America/Bogota')
                   AT TIME ZONE current_setting('TimeZone'))`,
        [gym.id_gimnasio, miembro.id_miembro, metodo, desfase],
      );
    }

    const { rows } = await tx.cliente.query(
      `SELECT metodo FROM checkin c WHERE c.id_gimnasio = $1 AND c.fecha_hora >= ${INICIO_HOY}`,
      [gym.id_gimnasio],
    );

    expect(rows).toEqual([{ metodo: 'QR' }]);
  });
});
