/**
 * Integracion, capa BD: el alta del miembro es atomica (issue #95).
 *
 * POST /api/admin/miembros guardaba al miembro y despues su plan en consultas
 * sueltas: si fallaba el INSERT del plan, el miembro quedaba guardado sin plan,
 * el API respondia 503 y el reintento chocaba con el 409 del documento
 * repetido. Desde el #102 el miembro, su plan y sus autorizaciones van en una
 * sola transaccion. Esta prueba lo verifica contra PostgreSQL.
 *
 * Para forzar el fallo del plan sin depender de un valor que hoy ya valida
 * zod, un trigger de la BD de pruebas rechaza el INSERT en plan_cobro. Solo
 * actua sobre el gimnasio de este archivo (WHEN), asi que no afecta a nadie
 * mas que use la misma BD. Se crea en beforeAll y se borra en afterAll.
 *
 * Sin la BD de pruebas se salta (ver bd-pruebas.js). Corre con --runInBand,
 * como el resto de test:integracion.
 */
const crypto = require('crypto');
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearUsuario } = require('./datos');

// El secreto con el que esta prueba firma su token. Solo vale en este archivo.
process.env.JWT_SECRET = 'prueba-alta-miembro-atomica';
process.env.ENABLE_WHATSAPP = 'false';

describeConBd('alta de miembro atomica contra la BD de pruebas (#95)', () => {
  let pool, server, base, token, gymId;
  const FALLA = `prueba_plan_falla_${crypto.randomBytes(4).toString('hex')}`;
  const documento = `AT${Date.now()}`;

  const contar = async (tabla) => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM ${tabla} WHERE id_gimnasio = $1`,
      [gymId],
    );
    return rows[0].n;
  };

  const alta = async () => {
    const r = await fetch(`${base}/api/admin/miembros`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Ana Atómica',
        documento,
        telefono: '3001112233',
        tipo_plan: 'MENSUAL',
        valor_total: '100000',
        valor_pagado: '100000',
        estado_pago: 'PAGADO',
        acepto_terminos: true,
        autorizo_datos: true,
      }),
    });
    return { status: r.status, body: await r.json() };
  };

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    // Los modulos de src/ despues de prepararBdDePruebas: el pool ya apunta a la BD de pruebas.
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const miembrosRouter = require('../../src/routes/miembros');
    const { errorHandler } = require('../../src/middleware/errorHandler');

    gymId = (await crearGimnasio(pool)).id_gimnasio;
    const admin = await crearUsuario(pool, gymId);

    // El INSERT en plan_cobro de este gimnasio falla siempre.
    await pool.query(
      `CREATE FUNCTION ${FALLA}() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'fallo forzado del plan (prueba #95)'; END
       $$ LANGUAGE plpgsql`,
    );
    await pool.query(
      `CREATE TRIGGER ${FALLA} BEFORE INSERT ON plan_cobro
       FOR EACH ROW WHEN (NEW.id_gimnasio = ${Number(gymId)})
       EXECUTE FUNCTION ${FALLA}()`,
    );

    token = jwt.sign({ id: admin.id_usuario, role: 'admin', gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const app = express();
    app.use(express.json());
    app.use('/api', miembrosRouter);
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
    await pool.query(`DROP TRIGGER IF EXISTS ${FALLA} ON plan_cobro`);
    await pool.query(`DROP FUNCTION IF EXISTS ${FALLA}()`);
    if (gymId) {
      // De las hijas a gimnasio.
      for (const tabla of ['autorizacion_miembro', 'notificacion', 'plan_cobro', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = $1`, [gymId]);
      }
    }
    await pool.end();
  });

  test('si falla el INSERT del plan, no queda el miembro ni sus autorizaciones', async () => {
    // Act
    const respuesta = await alta();

    // Assert: el API no confirma el alta y la BD queda como estaba
    expect(respuesta.status).not.toBe(201);
    expect(await contar('miembro')).toBe(0);
    expect(await contar('plan_cobro')).toBe(0);
    expect(await contar('autorizacion_miembro')).toBe(0);
  });

  test('al quitar la falla, el reintento con el mismo documento crea el miembro (no choca con un 409)', async () => {
    // Arrange: el plan ya se puede guardar
    await pool.query(`DROP TRIGGER IF EXISTS ${FALLA} ON plan_cobro`);

    // Act
    const respuesta = await alta();

    // Assert
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.miembro.documento).toBe(documento);
    expect(await contar('miembro')).toBe(1);
    expect(await contar('plan_cobro')).toBe(1);
  });
});
