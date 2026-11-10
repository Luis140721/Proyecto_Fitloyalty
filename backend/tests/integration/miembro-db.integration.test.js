const {
  applyMigrations,
  beginTransaction,
  createTestClient,
  integrationEnabled,
  rollbackTransaction,
} = require('../helpers/db');

const integrationDescribe = integrationEnabled ? describe : describe.skip;

async function createGym(client, name = 'Gimnasio de integración') {
  const { rows } = await client.query(
    'INSERT INTO gimnasio (nombre, telefono) VALUES ($1, $2) RETURNING id_gimnasio',
    [name, '3001234567']
  );
  return rows[0].id_gimnasio;
}

async function createMember(client, gymId, { name, document, qr, createdAt }) {
  const { rows } = await client.query(
    `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, codigo_qr, fecha_registro)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id_miembro, id_gimnasio, nombre, documento, telefono, codigo_qr, fecha_registro`,
    [gymId, name, document, '3001234567', qr, createdAt]
  );
  return rows[0];
}

async function expectConstraintError(client, sql, params, code) {
  await client.query('SAVEPOINT constraint_check');
  let caughtError;
  try {
    await client.query(sql, params);
  } catch (error) {
    caughtError = error;
  }
  await client.query('ROLLBACK TO SAVEPOINT constraint_check');
  await client.query('RELEASE SAVEPOINT constraint_check');

  expect(caughtError).toBeDefined();
  expect(caughtError.code).toBe(code);
}

integrationDescribe('miembro en PostgreSQL real', () => {
  let client;

  beforeAll(async () => {
    applyMigrations();
    client = createTestClient();
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await beginTransaction(client);
  });

  afterEach(async () => {
    await rollbackTransaction(client);
  });

  test('inserta, actualiza y lee de vuelta un miembro persistido en la transacción', async () => {
    const gymId = await createGym(client);
    const inserted = await createMember(client, gymId, {
      name: 'Ana Integración',
      document: `DOC-${process.pid}-A`,
      qr: `QR-${process.pid}-A`,
      createdAt: '2026-11-10T09:00:00Z',
    });

    await client.query(
      'UPDATE miembro SET telefono = $1 WHERE id_miembro = $2',
      ['3117654321', inserted.id_miembro]
    );
    const { rows } = await client.query(
      `SELECT m.id_miembro, m.nombre, m.documento, m.telefono, g.nombre AS gimnasio
       FROM miembro m
       JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
       WHERE m.id_miembro = $1`,
      [inserted.id_miembro]
    );

    expect(rows).toEqual([expect.objectContaining({
      id_miembro: inserted.id_miembro,
      nombre: 'Ana Integración',
      documento: `DOC-${process.pid}-A`,
      telefono: '3117654321',
      gimnasio: 'Gimnasio de integración',
    })]);

    await client.query('DELETE FROM miembro WHERE id_miembro = $1', [inserted.id_miembro]);
    const deleted = await client.query(
      'SELECT id_miembro FROM miembro WHERE id_miembro = $1',
      [inserted.id_miembro]
    );
    expect(deleted.rows).toHaveLength(0);
  });

  test('filtra por gimnasio y ordena miembros por fecha de registro', async () => {
    const gymOne = await createGym(client, 'Gimnasio uno');
    const gymTwo = await createGym(client, 'Gimnasio dos');
    const olderMember = await createMember(client, gymOne, {
      name: 'Miembro anterior',
      document: `DOC-${process.pid}-B1`,
      qr: `QR-${process.pid}-B1`,
      createdAt: '2026-11-08T09:00:00Z',
    });
    const newerMember = await createMember(client, gymOne, {
      name: 'Miembro reciente',
      document: `DOC-${process.pid}-B2`,
      qr: `QR-${process.pid}-B2`,
      createdAt: '2026-11-09T09:00:00Z',
    });
    await createMember(client, gymTwo, {
      name: 'Otro gimnasio',
      document: `DOC-${process.pid}-B3`,
      qr: `QR-${process.pid}-B3`,
      createdAt: '2026-11-10T09:00:00Z',
    });

    const { rows } = await client.query(
      `SELECT id_miembro, nombre FROM miembro
       WHERE id_gimnasio = $1
       ORDER BY fecha_registro DESC, id_miembro DESC`,
      [gymOne]
    );

    expect(rows.map(({ id_miembro }) => id_miembro)).toEqual([
      newerMember.id_miembro,
      olderMember.id_miembro,
    ]);
    expect(rows.map(({ nombre }) => nombre)).not.toContain('Otro gimnasio');
  });

  test('aplica NOT NULL, longitudes, llave primaria y llave foránea', async () => {
    const gymId = await createGym(client);
    const validFields = [gymId, 'Miembro válido', `DOC-${process.pid}-C`, '3001234567', `QR-${process.pid}-C`];
    const insertSql = `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, codigo_qr)
                       VALUES ($1, $2, $3, $4, $5)`;

    for (const values of [
      [null, ...validFields.slice(1)],
      [gymId, null, ...validFields.slice(2)],
      [...validFields.slice(0, 2), null, ...validFields.slice(3)],
      [...validFields.slice(0, 4), null],
    ]) {
      await expectConstraintError(client, insertSql, values, '23502');
    }

    for (const values of [
      [gymId, 'N'.repeat(101), ...validFields.slice(2)],
      [gymId, validFields[1], 'D'.repeat(21), ...validFields.slice(3)],
      [gymId, validFields[1], validFields[2], '3'.repeat(21), validFields[4]],
      [gymId, ...validFields.slice(1, 4), 'Q'.repeat(101)],
    ]) {
      await expectConstraintError(client, insertSql, values, '22001');
    }

    const member = await createMember(client, gymId, {
      name: validFields[1],
      document: validFields[2],
      qr: validFields[4],
      createdAt: '2026-11-10T09:00:00Z',
    });
    await expectConstraintError(
      client,
      `INSERT INTO miembro (id_miembro, id_gimnasio, nombre, documento, telefono, codigo_qr)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [member.id_miembro, ...validFields],
      '23505'
    );

    await client.query('DELETE FROM gimnasio WHERE id_gimnasio = $1', [gymId]);
    await expectConstraintError(
      client,
      insertSql,
      validFields,
      '23503'
    );
  });
});
