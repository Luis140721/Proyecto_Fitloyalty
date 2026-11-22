/**
 * Integracion, capa BD: dos check-in del mismo miembro a la vez (issue #80).
 *
 * POST /api/admin/checkin busca si el miembro entro en los ultimos 90 s y, si
 * no, inserta. Antes eran dos consultas sueltas: dos peticiones casi a la vez
 * pasaban las dos la busqueda y quedaban dos ingresos. Ahora van en una
 * transaccion con un bloqueo por miembro (registrarSinRepetir, en
 * src/routes/checkin.js).
 *
 * Sola, la carrera casi nunca se ve: 1 de 25 dobles Enter en los E2E de la
 * semana 7. Para que el test sea determinista, un trigger de la BD de pruebas
 * retrasa 1 s el INSERT en checkin. Sin el bloqueo, la segunda peticion busca
 * mientras la primera sigue insertando, y quedan 2 filas siempre.
 *   - El trigger y su funcion se crean en beforeAll y se borran en afterAll.
 *   - Solo actuan sobre el gimnasio de este archivo (WHEN), asi que no frenan
 *     a nadie mas que use la misma BD.
 *
 * Los datos se confirman, no van en la transaccion del test como en los otros
 * archivos de esta carpeta: las dos peticiones usan conexiones propias del
 * pool de la app y tienen que verlos. En afterAll se borran por id de gimnasio.
 *
 * Sin la BD de pruebas se salta (ver bd-pruebas.js). Corre con --runInBand,
 * como el resto de test:integracion.
 */
const crypto = require('crypto');
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearUsuario, crearMiembro } = require('./datos');

// El secreto con el que esta prueba firma su token. Solo vale en este archivo.
process.env.JWT_SECRET = 'prueba-checkin-concurrente';

describeConBd('check-in concurrente contra la BD de pruebas (#80)', () => {
  let pool, server, base, token, gymId, idMiembro, documento;
  // Nombre propio por corrida: dos corridas a la vez no se pisan el trigger.
  const LENTO = `prueba_checkin_lento_${crypto.randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    // Los modulos de src/ despues de prepararBdDePruebas: el pool ya apunta a la BD de pruebas.
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const checkinRouter = require('../../src/routes/checkin');
    const { errorHandler } = require('../../src/middleware/errorHandler');

    // Un gimnasio sin trial, su administradora y un miembro con el plan al dia.
    gymId = (await crearGimnasio(pool)).id_gimnasio;
    const admin = await crearUsuario(pool, gymId);
    const miembro = await crearMiembro(pool, gymId, { nombre: 'Ana Pérez' });
    idMiembro = miembro.id_miembro;
    documento = miembro.documento;
    await pool.query(
      `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, estado_pago)
       VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 1, CURRENT_DATE + 30, 'PAGADO')`,
      [idMiembro, gymId],
    );

    // El INSERT en checkin de este gimnasio tarda 1 s.
    await pool.query(
      `CREATE FUNCTION ${LENTO}() RETURNS trigger AS $$
       BEGIN PERFORM pg_sleep(1); RETURN NEW; END
       $$ LANGUAGE plpgsql`,
    );
    await pool.query(
      `CREATE TRIGGER ${LENTO} BEFORE INSERT ON checkin
       FOR EACH ROW WHEN (NEW.id_gimnasio = ${Number(gymId)})
       EXECUTE FUNCTION ${LENTO}()`,
    );

    token = jwt.sign({ id: admin.id_usuario, role: 'admin', gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const app = express();
    app.use(express.json());
    app.use('/api', checkinRouter);
    app.use(errorHandler);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  }, 60_000);

  afterAll(async () => {
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (!pool) return;
    await pool.query(`DROP TRIGGER IF EXISTS ${LENTO} ON checkin`);
    await pool.query(`DROP FUNCTION IF EXISTS ${LENTO}()`);
    if (gymId) {
      // De las hijas a gimnasio: checkin.id_usuario y notificacion no borran en cascada.
      for (const tabla of ['checkin', 'notificacion', 'plan_cobro', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = $1`, [gymId]);
      }
    }
    await pool.end();
  });

  const registrar = async () => {
    const r = await fetch(`${base}/api/admin/checkin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documento, metodo: 'MANUAL' }),
    });
    return { status: r.status, body: await r.json() };
  };

  test('dos POST del mismo miembro a la vez dejan un solo ingreso: uno 201 y el otro 200 duplicado', async () => {
    // Act: las dos peticiones salen juntas y la primera tarda 1 s en insertar
    const inicio = Date.now();
    const respuestas = await Promise.all([registrar(), registrar()]);
    const duracion = Date.now() - inicio;

    // Assert
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM checkin WHERE id_miembro = $1', [idMiembro]);
    expect(rows[0].n).toBe(1);
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(respuestas.find((r) => r.status === 200).body.duplicado).toBe(true);
    // Sin el retraso del trigger la carrera casi no se ve y el test no probaria nada.
    expect(duracion).toBeGreaterThanOrEqual(1000);
  });
});
