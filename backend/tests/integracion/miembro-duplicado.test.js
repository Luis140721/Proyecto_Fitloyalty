/**
 * Integracion, capa BD: no quedan dos miembros activos con el mismo documento o
 * el mismo correo (RQF-03, issue #87).
 *
 * POST /api/admin/miembros buscaba el documento y despues insertaba, en
 * consultas sueltas: dos altas a la vez pasaban las dos. PUT no buscaba nada.
 * Ahora la busqueda y el guardado van en una transaccion con un candado por
 * documento y otro por correo (src/lib/miembro-duplicado.js).
 *
 * Para que la carrera sea determinista, un trigger de la BD de pruebas retrasa
 * 1 s el INSERT y el UPDATE de miembro de este gimnasio, como en
 * checkin-concurrente.test.js. Se crea en beforeAll y se borra en afterAll.
 *
 * Sin la BD de pruebas se salta (ver bd-pruebas.js). Corre con --runInBand,
 * como el resto de test:integracion.
 */
const crypto = require('crypto');
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearUsuario, documentoUnico, unico } = require('./datos');

// El secreto con el que esta prueba firma su token. Solo vale en este archivo.
process.env.JWT_SECRET = 'prueba-miembro-duplicado';
process.env.ENABLE_WHATSAPP = 'false';

jest.mock('../../src/lib/email', () => ({ sendMemberQR: async () => ({ delivered: false }) }));

describeConBd('miembros duplicados contra la BD de pruebas (#87)', () => {
  let pool, server, base, token, gymId;
  const LENTO = `prueba_miembro_lento_${crypto.randomBytes(4).toString('hex')}`;

  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(`${base}/api/admin/miembros${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    return { status: r.status, body: await r.json() };
  };
  const alta = (datos) => pedir('POST', '', {
    nombre: 'Ana Repetida', telefono: '3001112233', tipo_plan: 'MENSUAL', valor_total: '100000', valor_pagado: '100000',
    estado_pago: 'PAGADO', acepto_terminos: true, autorizo_datos: true, ...datos,
  });
  const editar = (id, datos) => pedir('PUT', `/${id}`, datos);
  const crear = async (datos = {}) => (await alta({ documento: documentoUnico(), ...datos })).body.miembro;
  const activosCon = async (columna, valor) => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM miembro WHERE id_gimnasio = $1 AND LOWER(${columna}) = LOWER($2) AND activo`,
      [gymId, valor],
    );
    return rows[0].n;
  };
  const correo = () => `${unico('correo')}@fitloyalty.test`.toLowerCase();

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    // Los modulos de src/ despues de prepararBdDePruebas: el pool ya apunta a la BD de pruebas.
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const miembrosRouter = require('../../src/routes/miembros');
    const { errorHandler } = require('../../src/middleware/errorHandler');

    gymId = (await crearGimnasio(pool)).id_gimnasio;
    const admin = await crearUsuario(pool, gymId);
    await pool.query(
      `CREATE FUNCTION ${LENTO}() RETURNS trigger AS $$
       BEGIN PERFORM pg_sleep(1); RETURN NEW; END
       $$ LANGUAGE plpgsql`,
    );
    for (const cuando of ['INSERT', 'UPDATE']) {
      await pool.query(
        `CREATE TRIGGER ${LENTO}_${cuando} BEFORE ${cuando} ON miembro
         FOR EACH ROW WHEN (NEW.id_gimnasio = ${Number(gymId)} AND NEW.nombre LIKE 'Lenta%')
         EXECUTE FUNCTION ${LENTO}()`,
      );
    }
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
    for (const cuando of ['INSERT', 'UPDATE']) await pool.query(`DROP TRIGGER IF EXISTS ${LENTO}_${cuando} ON miembro`);
    await pool.query(`DROP FUNCTION IF EXISTS ${LENTO}()`);
    if (gymId) {
      for (const tabla of ['autorizacion_miembro', 'plan_cobro', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = $1`, [gymId]);
      }
    }
    await pool.end();
  });

  test.each([
    ['el mismo documento', () => { const documento = documentoUnico(); return [['documento', documento], { documento }, { documento }]; }, 'MEMBER_DOC_TAKEN'],
    ['el mismo correo', () => {
      const email = correo();
      return [['email', email], { documento: documentoUnico(), email }, { documento: documentoUnico(), email: email.toUpperCase() }];
    }, 'MEMBER_EMAIL_TAKEN'],
  ])('dos altas a la vez con %s dejan un solo miembro: una 201 y la otra 409', async (_caso, datos, code) => {
    const [[columna, valor], uno, dos] = datos();

    const inicio = Date.now();
    const respuestas = await Promise.all([alta({ nombre: 'Lenta Uno', ...uno }), alta({ nombre: 'Lenta Dos', ...dos })]);
    const duracion = Date.now() - inicio;

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409).body.code).toBe(code);
    expect(await activosCon(columna, valor)).toBe(1);
    // Sin el retraso del trigger la carrera casi no se ve y el test no probaria nada.
    expect(duracion).toBeGreaterThanOrEqual(1000);
  }, 20_000);

  test('dos ediciones a la vez que ponen el mismo documento: una 200 y la otra 409', async () => {
    const [a, b] = [await crear({ nombre: 'Rapida Uno' }), await crear({ nombre: 'Rapida Dos' })];
    const documento = documentoUnico();

    const respuestas = await Promise.all([
      editar(a.id_miembro, { nombre: 'Lenta Uno', documento }),
      editar(b.id_miembro, { nombre: 'Lenta Dos', documento }),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await activosCon('documento', documento)).toBe(1);
  }, 20_000);

  test('al editar, el documento y el correo de otro miembro activo responden 409 y no cambian nada', async () => {
    const email = correo();
    const a = await crear({ email });
    const b = await crear();

    const porDocumento = await editar(b.id_miembro, { documento: a.documento });
    const porCorreo = await editar(b.id_miembro, { email: email.toUpperCase() });

    expect(porDocumento).toMatchObject({ status: 409, body: { code: 'MEMBER_DOC_TAKEN' } });
    expect(porCorreo).toMatchObject({ status: 409, body: { code: 'MEMBER_EMAIL_TAKEN' } });
    const { rows } = await pool.query('SELECT documento, email FROM miembro WHERE id_miembro = $1', [b.id_miembro]);
    expect(rows).toEqual([{ documento: b.documento, email: null }]);
  });

  test('la ficha que manda el mismo documento y el mismo correo guarda los demas datos', async () => {
    const email = correo();
    const a = await crear({ email });

    const r = await editar(a.id_miembro, { nombre: 'Ana Nueva', documento: a.documento, email, activo: true });

    expect(r.status).toBe(200);
    expect(r.body.miembro.nombre).toBe('Ana Nueva');
  });

  test('un miembro desactivado no vuelve a activarse si otro activo ya tiene su documento', async () => {
    const a = await crear();
    await pool.query('UPDATE miembro SET activo = FALSE WHERE id_miembro = $1', [a.id_miembro]);
    const b = await alta({ documento: a.documento });

    const r = await editar(a.id_miembro, { activo: true });

    expect(b.status).toBe(201);
    expect(r).toMatchObject({ status: 409, body: { code: 'MEMBER_DOC_TAKEN' } });
    expect(await activosCon('documento', a.documento)).toBe(1);
  });

  test('en otro gimnasio si puede haber un miembro con el mismo documento y el mismo correo', async () => {
    const otro = (await crearGimnasio(pool)).id_gimnasio;
    const documento = documentoUnico();
    const email = correo();
    try {
      await pool.query("INSERT INTO miembro (id_gimnasio, nombre, documento, email, codigo_qr) VALUES ($1, 'Otra', $2, $3, $4)", [otro, documento, email, unico('QR')]);
      const b = await crear();

      const nuevo = await alta({ documento: `${documento}`.slice(0, 20), email: email.toUpperCase() });
      const editado = await editar(b.id_miembro, { documento: `${documentoUnico()}`, email: correo() });
      const conElDelOtro = await editar(b.id_miembro, { email: `${unico('x')}@fitloyalty.test` });

      expect(nuevo.status).toBe(201);
      expect(editado.status).toBe(200);
      expect(conElDelOtro.status).toBe(200);
      expect(await activosCon('documento', documento)).toBe(1);
    } finally {
      await pool.query('DELETE FROM miembro WHERE id_gimnasio = $1', [otro]);
      await pool.query('DELETE FROM gimnasio WHERE id_gimnasio = $1', [otro]);
    }
  });
});
