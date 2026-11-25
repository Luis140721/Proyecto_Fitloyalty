/**
 * Integracion, capa BD: codigos de recuperacion (RQF-17) e invitaciones del
 * personal (RQF-01) contra PostgreSQL.
 *
 * tests/cuentas-y-perfil.test.js prueba las mismas reglas con una base en
 * memoria, que no interpreta el SQL. Aqui corren las sentencias de verdad: las
 * CTE que escriben (anular los codigos anteriores, revocar invitaciones) y el
 * EXISTS que mira si quien creo la invitacion sigue siendo administrador.
 *
 * Crea su propio gimnasio y lo borra al terminar. Sin la BD de pruebas se salta.
 */
const { describeConBd, prepararBdDePruebas } = require('./bd-pruebas');
const { crearGimnasio, crearUsuario, unico } = require('./datos');

// El secreto con el que esta prueba firma sus tokens. Solo vale en este archivo.
process.env.JWT_SECRET = 'prueba-cuentas-integracion';
process.env.FRONTEND_URL = 'https://app.test';
jest.mock('../../src/lib/email', () => ({
  ...jest.requireActual('../../src/lib/email'),
  sendRecoveryCode: async (d) => { global.codigosEnviados.push(d.code); return { delivered: true }; },
  sendStaffInvite: async () => ({ delivered: true }),
}));
global.codigosEnviados = [];

describeConBd('cuentas contra la BD de pruebas', () => {
  let pool, server, base, jwt, gym, otroGym, dueno, otro;

  const token = (u, gymId) => jwt.sign({ id: u.id_usuario, name: u.nombre, role: 'admin', gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const pedir = async (metodo, ruta, cuerpo, tok) => {
    const r = await fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(tok && { Authorization: `Bearer ${tok}` }) },
      body: cuerpo && JSON.stringify(cuerpo),
    });
    return { status: r.status, body: await r.json() };
  };
  const invitar = async (quien, rol = 'ADMINISTRADOR') => {
    const r = await pedir('POST', '/admin/staff/invite', { email: `${unico('inv')}@fitloyalty.test`, nombre: 'Invitada', rol }, token(quien, gym.id_gimnasio));
    expect(r.status).toBe(201);
    return new URL(r.body.acceptUrl).searchParams.get('token');
  };
  const ver = (t) => pedir('GET', `/auth/accept-invite/${t}`);
  const aceptar = (t) => pedir('POST', '/auth/accept-invite', { token: t, password: 'clave123' });
  const editar = (u, cambios) => pedir('PATCH', `/admin/staff/${u.id_usuario}`, cambios, token(dueno, gym.id_gimnasio));

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    const express = require('express');
    jwt = require('jsonwebtoken');
    const { errorHandler } = require('../../src/middleware/errorHandler');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../../src/routes/auth'));
    app.use('/api', require('../../src/routes/staff'));
    app.use(errorHandler);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
    gym = await crearGimnasio(pool);
    otroGym = await crearGimnasio(pool);
    dueno = await crearUsuario(pool, gym.id_gimnasio);
    await pool.query('UPDATE gimnasio SET id_dueno = $1 WHERE id_gimnasio = $2', [dueno.id_usuario, gym.id_gimnasio]);
  }, 60_000);

  beforeEach(async () => {
    otro = await crearUsuario(pool, gym.id_gimnasio, { nombre: 'Otro Admin' });
    global.codigosEnviados.length = 0;
  });

  afterAll(async () => {
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (!pool) return;
    for (const g of [gym, otroGym].filter(Boolean)) {
      await pool.query('UPDATE gimnasio SET id_dueno = NULL WHERE id_gimnasio = $1', [g.id_gimnasio]);
      await pool.query('DELETE FROM password_reset WHERE id_usuario IN (SELECT id_usuario FROM usuario WHERE id_gimnasio = $1)', [g.id_gimnasio]);
      for (const tabla of ['invitacion_staff', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = $1`, [g.id_gimnasio]);
      }
    }
    await pool.end();
  });

  test('pedir otro codigo anula los anteriores de esa persona y no los de las demas', async () => {
    const pedirCodigo = async (u) => {
      expect((await pedir('POST', '/auth/forgot-password', { email: u.email })).status).toBe(200);
      return global.codigosEnviados.at(-1);
    };
    const verificar = (u, code) => pedir('POST', '/auth/verify-reset-code', { email: u.email, code });
    const deOtro = await pedirCodigo(otro);
    const primero = await pedirCodigo(dueno);
    const segundo = await pedirCodigo(dueno);

    expect((await verificar(dueno, primero)).body.code).toBe('BAD_CODE');
    expect((await verificar(dueno, segundo)).status).toBe(200);
    expect((await verificar(otro, deOtro)).status).toBe(200);
  });

  test('una invitacion de un administrador activo se ve y se acepta', async () => {
    const t = await invitar(otro);

    expect((await ver(t)).status).toBe(200);
    expect((await aceptar(t)).status).toBe(201);
  });

  test.each([
    ['desactivarlo', { activo: false }],
    ['bajarlo de rol', { rol: 'RECEPCIONISTA' }],
    ['cambiar todo a la vez', { nombre: 'Nombre Nuevo', rol: 'RECEPCIONISTA', activo: false }],
  ])('al %s se revocan solo sus invitaciones pendientes', async (_caso, cambios) => {
    const delDueno = await invitar(dueno);
    const suya = await invitar(otro);

    expect((await editar(otro, cambios)).status).toBe(200);

    expect((await ver(suya)).body.code).toBe('INVITE_REVOKED');
    expect((await aceptar(suya)).body.code).toBe('INVITE_REVOKED');
    expect((await ver(delDueno)).status).toBe(200);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM invitacion_staff WHERE id_usuario_creador = $1 AND fecha_revocado IS NOT NULL', [otro.id_usuario]);
    expect(rows[0].n).toBe(1);
  });

  // Invitaciones de antes de este cambio: nadie las revoco.
  test.each([
    ['esta inactivo', 'activo = FALSE'],
    ['ya no es administrador', 'id_rol = 2'],
    ['esta en otro gimnasio', 'id_gimnasio = $2'],
  ])('una invitacion sin revocar no sirve si quien la creo %s', async (_caso, cambio) => {
    const t = await invitar(otro);
    await pool.query(`UPDATE usuario SET ${cambio} WHERE id_usuario = $1 AND $2::int IS NOT NULL`, [otro.id_usuario, otroGym.id_gimnasio]);

    expect((await ver(t)).body.code).toBe('INVITE_REVOKED');
    expect((await aceptar(t)).body.code).toBe('INVITE_REVOKED');
  });
});
