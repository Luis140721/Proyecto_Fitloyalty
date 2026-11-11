const express = require('express');
const request = require('supertest');

const USER = { id: 7, gymId: 42, role: 'admin' };

function createApp(queryImpl, client) {
  const pool = {
    query: jest.fn((sql, params) => queryImpl(sql, params)),
    connect: jest.fn().mockResolvedValue(client),
  };
  const mocks = {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    sendMemberQR: jest.fn().mockResolvedValue({ delivered: true }),
    sendWhatsAppQR: jest.fn().mockResolvedValue({ delivered: true }),
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr'),
  };

  jest.resetModules();
  jest.doMock('../src/db/db', () => pool);
  jest.doMock('../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
      req.user = USER;
      next();
    },
    authorize: (...roles) => (req, res, next) => (
      roles.includes(USER.role) ? next() : res.status(403).json({ error: 'Forbidden' })
    ),
  }));
  jest.doMock('../src/lib/trial', () => ({
    requireActiveTrial: () => (req, res, next) => next(),
  }));
  jest.doMock('bcryptjs', () => ({ hash: mocks.hash }));
  jest.doMock('../src/lib/email', () => ({ sendMemberQR: mocks.sendMemberQR }));
  jest.doMock('../src/lib/whatsapp', () => ({ sendWhatsAppQR: mocks.sendWhatsAppQR }));
  jest.doMock('qrcode', () => ({ toDataURL: mocks.toDataURL }));

  const router = require('../src/routes/miembros');
  const { errorHandler } = require('../src/middleware/errorHandler');
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  return { app, pool, mocks };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.dontMock('../src/db/db');
  jest.dontMock('../src/middleware/auth');
  jest.dontMock('../src/lib/trial');
  jest.dontMock('bcryptjs');
  jest.dontMock('../src/lib/email');
  jest.dontMock('../src/lib/whatsapp');
  jest.dontMock('qrcode');
});

test('lista miembros paginados y genera avisos según estado de membresía', async () => {
  const data = [
    { id_miembro: 1, nombre: 'Congelado', congelada: true, vencido: true, telefono: '3001234567' },
    { id_miembro: 2, nombre: 'Vencido', vencido: true, dias_vencido: 3, telefono: '3001234567' },
    { id_miembro: 3, nombre: 'Por vencer', vencePronto: true, dias_para_vencer: 2, telefono: '3001234567' },
    { id_miembro: 4, nombre: 'En riesgo', enRiesgo: true, dias_sin_venir: 20, telefono: '3001234567' },
    { id_miembro: 5, nombre: 'Al día', telefono: '3001234567' },
  ];
  const { app, pool } = createApp(async (sql) => {
    if (sql.includes('COALESCE(cg.dias_recordatorio_default')) return { rows: [{ dias_aviso: 5, dias_riesgo: 12 }] };
    if (sql.includes('SELECT m.id_miembro')) return { rows: data };
    if (sql.includes('SELECT COUNT(*)')) return { rows: [{ total: 25 }] };
    if (sql === 'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1') return { rows: [{ nombre: 'Gym Norte' }] };
    throw new Error(`Consulta no esperada: ${sql}`);
  });

  const response = await request(app)
    .get('/admin/miembros?page=2&pageSize=5&q=%20ANA%20&includeInactive=true')
    .expect(200);

  expect(response.body).toMatchObject({ total: 25, page: 2, pageSize: 5 });
  expect(response.body.miembros.map(({ whatsapp }) => whatsapp?.motivo ?? null)).toEqual([
    null, 'vencida', 'por-vencer', 'riesgo', null,
  ]);
  expect(response.body.miembros[1].whatsapp).toMatchObject({
    telefono: '573001234567',
    mensaje: expect.stringContaining('Gym Norte'),
  });
  const listCall = pool.query.mock.calls.find(([sql]) => sql.includes('SELECT m.id_miembro'));
  expect(listCall[0]).not.toContain('WHERE m.id_gimnasio = $1 AND m.activo = TRUE');
  expect(listCall[0]).toContain('WHERE m.id_gimnasio = $1 AND (LOWER(m.nombre) LIKE $2');
  expect(listCall[0]).toContain('LOWER(m.nombre) LIKE $2');
  expect(listCall[0]).toContain('LIMIT 5 OFFSET 10');
  expect(listCall[1]).toEqual([42, '%ana%', 'ANA', 5, 12]);
});

test('incluye inactivos, limita parámetros de paginación y maneja fallos de lectura', async () => {
  const { app } = createApp(async (sql) => {
    if (sql.includes('COALESCE(cg.dias_recordatorio_default')) return { rows: [] };
    if (sql.includes('SELECT m.id_miembro')) throw new Error('database offline');
    throw new Error(`Consulta no esperada: ${sql}`);
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(app)
    .get('/admin/miembros?page=-2&pageSize=500&includeInactive=true')
    .expect(503);

  expect(response.body).toEqual({
    error: 'No pudimos listar los miembros. Intenta de nuevo.',
    code: 'DB_UNREACHABLE',
  });
});

test('valida campos requeridos y evita duplicar documento o correo en el alta', async () => {
  const { app } = createApp(async (sql, params) => {
    if (sql.includes('SELECT id_miembro FROM miembro') && sql.includes('documento = $2')) {
      return { rows: params[1] === 'CC12345' ? [{ id_miembro: 90 }] : [] };
    }
    if (sql.includes('SELECT id_miembro FROM miembro') && sql.includes('LOWER(email)')) {
      return { rows: [{ id_miembro: 91 }] };
    }
    throw new Error(`Consulta no esperada: ${sql}`);
  });

  await request(app).post('/admin/miembros').send({ nombre: 'A' }).expect(400);
  const member = { nombre: 'Ana María', documento: 'CC12345', telefono: '3001234567' };
  const duplicateDocument = await request(app).post('/admin/miembros').send(member).expect(409);
  expect(duplicateDocument.body.code).toBe('MEMBER_DOC_TAKEN');

  const duplicateEmail = await request(app).post('/admin/miembros')
    .send({ ...member, documento: 'CC54321', email: 'ANA@example.com' })
    .expect(409);
  expect(duplicateEmail.body.code).toBe('MEMBER_EMAIL_TAKEN');
});

test('crea miembro, cifra el QR, calcula plan y registra errores de notificación sin perder el alta', async () => {
  const { app, pool, mocks } = createApp(async (sql) => {
    if (sql.includes('SELECT id_miembro FROM miembro')) return { rows: [] };
    if (sql.includes('SELECT 1 FROM miembro WHERE codigo_qr')) return { rows: [] };
    if (sql.includes('INSERT INTO miembro')) {
      return { rows: [{ id_miembro: 88, nombre: 'Ana María', documento: 'CC12345' }] };
    }
    if (sql.includes('INSERT INTO plan_cobro')) return { rows: [] };
    if (sql === 'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1') return { rows: [{ nombre: 'Gym Norte' }] };
    throw new Error(`Consulta no esperada: ${sql}`);
  });
  mocks.sendMemberQR.mockRejectedValue(new Error('mail unavailable'));
  mocks.sendWhatsAppQR.mockRejectedValue(new Error('WhatsApp unavailable'));
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(app).post('/admin/miembros').send({
    nombre: ' Ana María ',
    documento: 'CC12345',
    telefono: '3001234567',
    email: 'ANA@example.com',
    password: 'clave-segura',
    tipo_plan: 'TRIMESTRAL',
    fecha_inicio: '2026-01-01',
    valor_total: '100000',
    valor_pagado: '25000',
    estado_pago: 'PARCIAL',
  }).expect(201);

  expect(response.body.miembro.id_miembro).toBe(88);
  expect(response.body.miembro.nombre).toBe('Ana María');
  expect(response.body.plan_cobro).toMatchObject({
    tipo_plan: 'TRIMESTRAL',
    fecha_fin: '2026-04-01',
    valor_total: 100000,
    valor_pagado: 25000,
    estado_pago: 'PARCIAL',
    proxima_fecha_cobro: '2026-04-02',
  });
  expect(response.body.qr_data).toContain(':');
  expect(mocks.hash).toHaveBeenCalledWith('clave-segura', 10);
  expect(mocks.sendMemberQR).toHaveBeenCalledWith(expect.objectContaining({
    to: 'ANA@example.com',
    gymName: 'Gym Norte',
    qrImageUrl: 'data:image/png;base64,qr',
  }));
  expect(mocks.sendWhatsAppQR).toHaveBeenCalledTimes(1);
  expect(pool.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO plan_cobro'))).toBe(true);
});

test('busca por documento, carga detalle, valida actualizaciones y soporta borrar miembros', async () => {
  const member = { id_miembro: 88, nombre: 'Ana María', documento: 'CC12345' };
  const { app, pool } = createApp(async (sql) => {
    if (sql.includes('FROM miembro WHERE id_gimnasio = $1')) return { rows: [member] };
    if (sql.includes('INITCAP(LOWER(tipo_plan))')) return { rows: [{ estado: 'PAGADO', plan: 'Mensual' }] };
    if (sql.includes('FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2')) return { rows: [member] };
    if (sql.startsWith('UPDATE miembro SET') && sql.includes('RETURNING id_miembro, nombre')) return { rows: [member] };
    if (sql.includes('UPDATE miembro SET activo = FALSE')) return { rows: [{ id_miembro: 88 }] };
    if (sql.startsWith('DELETE FROM miembro')) return { rows: [{ id_miembro: 88 }] };
    throw new Error(`Consulta no esperada: ${sql}`);
  });

  const lookup = await request(app).get('/admin/miembros/lookup?documento=CC12345').expect(200);
  expect(lookup.body).toMatchObject({ miembro: member, membresia: { estado: 'PAGADO' } });
  expect(pool.query.mock.calls[0][1]).toEqual([42, 'CC12345']);
  await request(app).get('/admin/miembros/lookup').expect(400);

  const detail = await request(app).get('/admin/miembros/88').expect(200);
  expect(detail.body.miembro).toEqual(member);
  await request(app).get('/admin/miembros/invalid').expect(400);

  await request(app).put('/admin/miembros/88').send({ email: 'ANA@example.com', password: 'clave123' }).expect(200);
  const updateCall = pool.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE miembro SET') && sql.includes('password_hash'));
  expect(updateCall[1]).toContain('hashed-password');
  expect(updateCall[1]).toContain('ana@example.com');
  await request(app).put('/admin/miembros/88').send({}).expect(400);
  await request(app).put('/admin/miembros/no-id').send({ nombre: 'Ana' }).expect(400);

  await request(app).delete('/admin/miembros/88').expect(200);
  await request(app).delete('/admin/miembros/88/permanent').expect(200);
});

test('actualiza o crea planes y rechaza valores inconsistentes', async () => {
  const validPlan = {
    tipo_plan: 'MENSUAL',
    fecha_inicio: '2026-01-01',
    fecha_fin: '2026-02-01',
    valor_total: 100000,
    valor_pagado: 50000,
    metodo_pago: 'EFECTIVO',
  };
  let existingPlan = true;
  const { app } = createApp(async (sql) => {
    if (sql.includes('SELECT id_miembro FROM miembro WHERE id_miembro = $1')) return { rows: [{ id_miembro: 88 }] };
    if (sql.includes('SELECT id_plan_cobro FROM plan_cobro')) return { rows: existingPlan ? [{ id_plan_cobro: 5 }] : [] };
    if (sql.startsWith('UPDATE plan_cobro')) return { rows: [{ id_plan_cobro: 5, estado_pago: 'PARCIAL' }] };
    if (sql.startsWith('INSERT INTO plan_cobro')) return { rows: [{ id_plan_cobro: 6, estado_pago: 'PAGADO' }] };
    throw new Error(`Consulta no esperada: ${sql}`);
  });

  await request(app).put('/admin/miembros/88/plan').send({ ...validPlan, valor_pagado: 100001 }).expect(400);
  await request(app).put('/admin/miembros/88/plan').send({
    ...validPlan, fecha_inicio: '2026-03-01', fecha_fin: '2026-02-01',
  }).expect(400);

  const updated = await request(app).put('/admin/miembros/88/plan').send(validPlan).expect(200);
  expect(updated.body.plan.estado_pago).toBe('PARCIAL');

  existingPlan = false;
  const created = await request(app).put('/admin/miembros/88/plan').send({
    ...validPlan, valor_total: 50000, valor_pagado: 50000,
  }).expect(200);
  expect(created.body.plan.id_plan_cobro).toBe(6);
});

test('congela un plan dentro de una transacción y rechaza intentos incompatibles', async () => {
  const client = {
    query: jest.fn(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE OF pc')) {
        return { rows: [{ id_plan_cobro: 5, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', congelado_desde: null }] };
      }
      if (sql.includes('AS futura')) return { rows: [{ inicio: '2026-02-01', futura: false, antes_del_plan: false, vencida: false }] };
      if (sql.startsWith('UPDATE plan_cobro')) return { rows: [] };
      if (sql.startsWith('INSERT INTO congelacion_plan')) {
        return { rows: [{ id_congelacion: 30, fecha_inicio: '2026-02-01', motivo: 'Viaje' }] };
      }
      throw new Error(`Consulta de transacción no esperada: ${sql}`);
    }),
    release: jest.fn(),
  };
  const { app, pool } = createApp(async () => ({ rows: [] }), client);

  const response = await request(app).post('/admin/miembros/88/congelar')
    .send({ motivo: ' Viaje ', fecha_inicio: '2026-02-01' })
    .expect(200);
  expect(response.body).toEqual({
    message: 'Membresía congelada.',
    congelacion: { id_congelacion: 30, fecha_inicio: '2026-02-01', motivo: 'Viaje' },
  });
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(pool.connect).toHaveBeenCalledTimes(1);
  expect(client.release).toHaveBeenCalledTimes(1);

  await request(app).post('/admin/miembros/invalid/congelar').send({}).expect(400);
});

test('descongela el plan y extiende vencimiento por los días congelados', async () => {
  const client = {
    query: jest.fn(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE OF pc')) {
        return { rows: [{ id_plan_cobro: 5, congelado_desde: '2026-01-01' }] };
      }
      if (sql.includes('GREATEST(CURRENT_DATE - congelado_desde')) return { rows: [{ dias: 14 }] };
      if (sql.startsWith('UPDATE plan_cobro')) {
        return { rows: [{ fecha_fin: '2026-03-15', proxima_fecha_cobro: '2026-03-16' }] };
      }
      if (sql.startsWith('UPDATE congelacion_plan')) return { rows: [] };
      throw new Error(`Consulta de transacción no esperada: ${sql}`);
    }),
    release: jest.fn(),
  };
  const { app } = createApp(async () => ({ rows: [] }), client);

  const response = await request(app).post('/admin/miembros/88/descongelar').send({}).expect(200);
  expect(response.body).toEqual({
    message: 'Membresía descongelada. El vencimiento se corrió 14 días.',
    dias: 14,
    fecha_fin: '2026-03-15',
    proxima_fecha_cobro: '2026-03-16',
  });
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(client.release).toHaveBeenCalledTimes(1);
});
