/**
 * RQNF-17 y RQNF-18 contra una base de datos real.
 *
 * Levanta los routers reales de miembros, de la app del miembro y del
 * contrato sobre la BD de pruebas y los llama por HTTP. Comprueba las filas
 * que quedan en miembro, autorizacion_miembro (migracion 019) y
 * contrato_enviado (migracion 020), y que las restricciones de las dos
 * migraciones existen de verdad.
 *
 * La conexion es la de los tests de integracion (tests/integracion/bd-pruebas.js),
 * como en registro-envio-real.test.js:
 *   - Sin DATABASE_URL en el entorno del proceso se salta entera (asi queda en
 *     el job backend del CI); la DATABASE_URL de backend/.env no la activa.
 *   - Solo acepta la BD de pruebas local (127.0.0.1:5433, BD terminada en
 *     _test), revisa antes de conectarse el destino que pg va a usar de verdad
 *     y aplica las migraciones de backend/migrations. Las pruebas de esa
 *     guardia estan en tests/integracion/guardia-bd.test.js.
 *   - WhatsApp y el correo estan simulados: no sale ningun mensaje.
 *   - Crea sus propios gimnasios y al final borra todo lo que creo, tabla por
 *     tabla (en ConsultasDB las FK de miembro no tienen ON DELETE CASCADE).
 *
 * Corre en el job integracion del CI. Uso (desde la raiz, con db-test levantada):
 *
 *   DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test \
 *   pnpm --dir backend run test:integracion
 */
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
// La guardia de la BD de pruebas y la DATABASE_URL del entorno del proceso:
// ver tests/integracion/bd-pruebas.js.
const { describeConBd, prepararBdDePruebas } = require('./integracion/bd-pruebas');

jest.mock('../src/lib/whatsapp', () => ({
  sendWhatsAppText: jest.fn(async () => {}),
  sendWhatsAppQR: jest.fn(async () => {}),
  isWhatsAppReady: () => true,
}));
jest.mock('../src/lib/email', () => ({ sendMemberQR: jest.fn(async () => {}) }));

// El secreto con el que esta prueba firma sus tokens. Solo vale en este archivo.
process.env.JWT_SECRET = 'prueba-real-local';

describeConBd('RQNF-17 y RQNF-18 contra la base real', () => {
  let pool, server, base, establecerBusquedaPersonal;
  const gimnasios = [];
  let gymA, gymB, recepA, adminA, recepB, adminB, tokA, tokAdminA, tokB, tokAdminB;
  const sufijo = crypto.randomBytes(3).toString('hex');
  const whatsapp = require('../src/lib/whatsapp');

  const hoy = new Date();
  const fechaHace = (anos) => {
    const f = new Date(Date.UTC(hoy.getUTCFullYear() - anos, hoy.getUTCMonth(), hoy.getUTCDate() - 10));
    return f.toISOString().slice(0, 10);
  };

  const pedir = async (metodo, url, tk, body) => {
    const r = await fetch(base + url, {
      method: metodo,
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const autorizaciones = async (idMiembro) => (await pool.query(
    `SELECT tipo, otorgada, version_texto, canal, registrada_por, detalle,
            ABS(EXTRACT(EPOCH FROM (NOW()::timestamp - fecha))) < 120 AS fecha_de_ahora
       FROM autorizacion_miembro WHERE id_miembro = $1 ORDER BY fecha, id_autorizacion`,
    [idMiembro]
  )).rows;

  let docN = 0;
  const alta = (extra = {}) => ({
    nombre: 'Prueba Legal',
    tipo_documento: 'CC',
    documento: `leg-${sufijo}-${++docN}`,
    telefono: '3001234567',
    fecha_nacimiento: fechaHace(30),
    condiciones_medicas: 'Asma',
    alergias: 'Penicilina',
    tipo_plan: 'MENSUAL',
    fecha_inicio: hoy.toISOString().slice(0, 10),
    valor_total: '80000',
    valor_pagado: '80000',
    metodo_pago: 'NEQUI',
    acepto_terminos: true,
    autorizo_datos: true,
    ...extra,
  });
  const REP = {
    representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52123456',
    representante_parentesco: 'Madre', representante_telefono: '3109876543',
  };

  async function crearGimnasio(nombre) {
    const { rows: [g] } = await pool.query(
      "INSERT INTO gimnasio (nombre, telefono, email, direccion) VALUES ($1, '6015551234', 'pqr@prueba.local', 'Calle 1 # 2-3') RETURNING id_gimnasio",
      [nombre]
    );
    gimnasios.push(g.id_gimnasio);
    return g.id_gimnasio;
  }

  async function crearUsuario(gymId, n, rol = 'RECEPCIONISTA') {
    const { rows: c } = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'id_rol'"
    );
    const cols = ['id_gimnasio', 'nombre', 'email', 'password_hash', 'rol'];
    const vals = [gymId, 'Personal prueba', `legal-${sufijo}-${n}@prueba.local`, 'x', rol];
    if (c.length > 0) { cols.push('id_rol'); vals.push(rol === 'ADMINISTRADOR' ? 1 : 2); }
    const { rows: [u] } = await pool.query(
      `INSERT INTO usuario (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id_usuario`,
      vals
    );
    return u.id_usuario;
  }

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    ({ establecerBusquedaPersonal } = require('../src/middleware/auth'));
    const { errorHandler } = require('../src/middleware/errorHandler');
    // Igual que en registro-envio-real: el usuario de ConsultasDB no tiene
    // id_rol; se lee con columnas que estan en los dos esquemas.
    establecerBusquedaPersonal(async (payload) => {
      const { rows } = await pool.query(
        'SELECT activo, id_gimnasio, rol AS rol_nombre FROM usuario WHERE id_usuario = $1',
        [payload.id]
      );
      return rows[0] || null;
    });

    gymA = await crearGimnasio(`Prueba RQNF-17 A ${sufijo}`);
    gymB = await crearGimnasio(`Prueba RQNF-17 B ${sufijo}`);
    recepA = await crearUsuario(gymA, 'a');
    adminA = await crearUsuario(gymA, 'a-admin', 'ADMINISTRADOR');
    recepB = await crearUsuario(gymB, 'b');
    adminB = await crearUsuario(gymB, 'b-admin', 'ADMINISTRADOR');
    const firmar = (id, gymId, role = 'receptionist') => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokA = firmar(recepA, gymA);
    tokAdminA = firmar(adminA, gymA, 'admin');
    tokB = firmar(recepB, gymB);
    tokAdminB = firmar(adminB, gymB, 'admin');

    const app = express();
    app.use(express.json());
    app.use('/api/admin/miembros', require('../src/routes/admin-contrato'));
    app.use('/api', require('../src/routes/miembros'));
    app.use('/api/cliente', require('../src/routes/cliente'));
    app.use(errorHandler);
    await new Promise((resolve) => {
      server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });

  afterAll(async () => {
    if (establecerBusquedaPersonal) establecerBusquedaPersonal(null);
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (!pool) return;
    if (gimnasios.length > 0) {
      for (const tabla of ['autorizacion_miembro', 'contrato_enviado', 'plan_cobro', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = ANY($1::int[])`, [gimnasios]);
      }
    }
    await pool.end();
  });

  test('las migraciones 019 y 020 dejaron sus tablas, columnas y restricciones', async () => {
    const { rows: cols } = await pool.query(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name = 'miembro' AND column_name LIKE 'representante_%')
            OR table_name = 'autorizacion_miembro'
            OR (table_name = 'contrato_enviado' AND column_name IN ('canal', 'contenido', 'telefono_destino')))`
    );
    const nombres = cols.map((c) => `${c.table_name}.${c.column_name}`);
    expect(nombres).toEqual(expect.arrayContaining([
      'miembro.representante_nombre', 'miembro.representante_tipo_documento', 'miembro.representante_documento',
      'miembro.representante_parentesco', 'miembro.representante_telefono',
      'autorizacion_miembro.tipo', 'autorizacion_miembro.otorgada', 'autorizacion_miembro.version_texto',
      'autorizacion_miembro.canal', 'autorizacion_miembro.registrada_por', 'autorizacion_miembro.fecha',
      'contrato_enviado.canal', 'contrato_enviado.contenido',
    ]));
    expect(cols.find((c) => c.column_name === 'telefono_destino').is_nullable).toBe('YES');
    const { rows: cks } = await pool.query(
      `SELECT conname FROM pg_constraint
        WHERE conname IN ('ck_autorizacion_tipo', 'ck_autorizacion_canal', 'ck_contrato_enviado_canal', 'ck_contrato_enviado_telefono')`
    );
    expect(cks.map((c) => c.conname).sort()).toEqual(['ck_autorizacion_canal', 'ck_autorizacion_tipo', 'ck_contrato_enviado_canal', 'ck_contrato_enviado_telefono']);
  });

  test('alta de un adulto sin datos sensibles: NULL en salud y tres autorizaciones con su prueba', async () => {
    const r = await pedir('POST', '/api/admin/miembros', tokA, alta());
    expect(r.status).toBe(201);
    const id = r.body.miembro.id_miembro;
    const { rows: [m] } = await pool.query(
      'SELECT condiciones_medicas, alergias, acepto_terminos, autorizo_datos, representante_nombre FROM miembro WHERE id_miembro = $1',
      [id]
    );
    expect(m).toEqual({ condiciones_medicas: null, alergias: null, acepto_terminos: true, autorizo_datos: true, representante_nombre: null });
    expect(await autorizaciones(id)).toEqual([
      { tipo: 'TERMINOS', otorgada: true, version_texto: 'v1', canal: 'PANEL', registrada_por: recepA, detalle: null, fecha_de_ahora: true },
      { tipo: 'TRATAMIENTO_DATOS', otorgada: true, version_texto: 'v1', canal: 'PANEL', registrada_por: recepA, detalle: null, fecha_de_ahora: true },
      { tipo: 'DATOS_SENSIBLES', otorgada: false, version_texto: 'v1', canal: 'PANEL', registrada_por: recepA, detalle: null, fecha_de_ahora: true },
    ]);
  });

  test('alta de un menor: sin representante 400 y nada escrito; con representante, sus datos y su autorizacion', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM miembro WHERE id_gimnasio = $1', [gymA])).rows[0].n;
    const sin = await pedir('POST', '/api/admin/miembros', tokA, alta({ tipo_documento: 'TI', fecha_nacimiento: fechaHace(15) }));
    expect(sin.status).toBe(400);
    expect(sin.body.code).toBe('REPRESENTANTE_REQUERIDO');
    expect((await pool.query('SELECT count(*)::int AS n FROM miembro WHERE id_gimnasio = $1', [gymA])).rows[0].n).toBe(antes);

    const con = await pedir('POST', '/api/admin/miembros', tokA, alta({
      tipo_documento: 'TI', fecha_nacimiento: fechaHace(15), ...REP, autoriza_representante: true, autorizo_datos_sensibles: true,
    }));
    expect(con.status).toBe(201);
    const id = con.body.miembro.id_miembro;
    const { rows: [m] } = await pool.query(
      `SELECT representante_nombre, representante_tipo_documento, representante_documento,
              representante_parentesco, representante_telefono, condiciones_medicas
         FROM miembro WHERE id_miembro = $1`, [id]
    );
    expect(m).toEqual({ ...REP, condiciones_medicas: 'Asma' });
    const a = await autorizaciones(id);
    expect(a.map((x) => [x.tipo, x.otorgada])).toEqual([
      ['TERMINOS', true], ['TRATAMIENTO_DATOS', true], ['DATOS_SENSIBLES', true], ['REPRESENTANTE_MENOR', true],
    ]);
    expect(a[3].detalle).toMatchObject({ ...REP, edad_miembro: 15 });
    expect(a[0].detalle).toEqual({ otorgada_por: 'REPRESENTANTE_LEGAL' });
  });

  test('revocar desde la edicion borra los datos y deja la constancia; otro gimnasio recibe 404', async () => {
    const r = await pedir('POST', '/api/admin/miembros', tokA, alta({ autorizo_datos_sensibles: true }));
    const id = r.body.miembro.id_miembro;

    const ajeno = await pedir('PUT', `/api/admin/miembros/${id}`, tokB, { autorizo_datos_sensibles: false });
    expect(ajeno.status).toBe(404);
    expect((await pool.query('SELECT condiciones_medicas FROM miembro WHERE id_miembro = $1', [id])).rows[0].condiciones_medicas).toBe('Asma');

    const rev = await pedir('PUT', `/api/admin/miembros/${id}`, tokA, { autorizo_datos_sensibles: false, condiciones_medicas: 'Asma', alergias: 'Penicilina' });
    expect(rev.status).toBe(200);
    const { rows: [m] } = await pool.query('SELECT condiciones_medicas, alergias FROM miembro WHERE id_miembro = $1', [id]);
    expect(m).toEqual({ condiciones_medicas: null, alergias: null });
    const sens = (await autorizaciones(id)).filter((x) => x.tipo === 'DATOS_SENSIBLES');
    expect(sens.map((x) => x.otorgada)).toEqual([true, false]);
    expect(sens[1]).toMatchObject({ canal: 'PANEL', registrada_por: recepA, version_texto: 'v1' });

    const get = await pedir('GET', `/api/admin/miembros/${id}`, tokA);
    expect(get.body.autorizaciones.vigentes.DATOS_SENSIBLES.otorgada).toBe(false);
    expect(get.body.autorizaciones.historial.length).toBeGreaterThanOrEqual(4);
  });

  test('la app: el miembro ve sus autorizaciones, revoca y ve su contrato; la entrega queda una sola vez', async () => {
    const r = await pedir('POST', '/api/admin/miembros', tokA, alta({ autorizo_datos_sensibles: true }));
    const id = r.body.miembro.id_miembro;
    const tokCliente = jwt.sign({ role: 'cliente', idMiembro: id, gymId: gymA }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const lista = await pedir('GET', '/api/cliente/autorizaciones', tokCliente);
    expect(lista.status).toBe(200);
    expect(lista.body.vigentes.DATOS_SENSIBLES).toMatchObject({ otorgada: true, canal: 'PANEL', version: 'v1' });

    // El mismo id con el gimnasio B no ve nada.
    const ajeno = await pedir('GET', '/api/cliente/autorizaciones', jwt.sign({ role: 'cliente', idMiembro: id, gymId: gymB }, process.env.JWT_SECRET, { expiresIn: '1h' }));
    expect(ajeno.status).toBe(404);

    const rev = await pedir('PATCH', '/api/cliente/autorizaciones/datos-sensibles', tokCliente, { otorgada: false });
    expect(rev.status).toBe(200);
    const ultima = (await autorizaciones(id)).at(-1);
    expect(ultima).toMatchObject({ tipo: 'DATOS_SENSIBLES', otorgada: false, canal: 'APP', registrada_por: null });
    const { rows: [m] } = await pool.query('SELECT condiciones_medicas, alergias FROM miembro WHERE id_miembro = $1', [id]);
    expect(m).toEqual({ condiciones_medicas: null, alergias: null });

    const c1 = await pedir('GET', '/api/cliente/contrato', tokCliente);
    expect(c1.status).toBe(200);
    expect(c1.body.contrato).toMatch(/Precio total del plan: \$80\.000 COP/);
    expect(c1.body.contrato).toMatch(/Forma de pago: Nequi/);
    expect(c1.body.contrato).toMatch(/NO se renueva automáticamente/);
    expect(c1.body.contrato).toMatch(/correo pqr@prueba\.local/);
    await pedir('GET', '/api/cliente/contrato', tokCliente);
    const { rows: entregas } = await pool.query(
      'SELECT canal, telefono_destino, plantilla_version, exito, contenido FROM contrato_enviado WHERE id_miembro = $1',
      [id]
    );
    expect(entregas).toEqual([{ canal: 'APP', telefono_destino: null, plantilla_version: 'v2', exito: true, contenido: c1.body.contrato }]);
  });

  test('envio por WhatsApp: guarda canal y texto; un WHATSAPP sin telefono lo rechaza el CHECK', async () => {
    const r = await pedir('POST', '/api/admin/miembros', tokA, alta());
    const id = r.body.miembro.id_miembro;
    whatsapp.sendWhatsAppText.mockClear();
    const env = await pedir('POST', `/api/admin/miembros/${id}/contrato/enviar`, tokAdminA, {});
    expect(env.status).toBe(200);
    expect(env.body.exito).toBe(true);
    expect(whatsapp.sendWhatsAppText).toHaveBeenCalledTimes(1);
    const { rows: [fila] } = await pool.query(
      'SELECT canal, telefono_destino, plantilla_version, contenido, enviado_por FROM contrato_enviado WHERE id_miembro = $1',
      [id]
    );
    expect(fila).toMatchObject({ canal: 'WHATSAPP', telefono_destino: '573001234567', plantilla_version: 'v2', enviado_por: adminA });
    expect(fila.contenido).toBe(whatsapp.sendWhatsAppText.mock.calls[0][1]);

    await expect(pool.query(
      `INSERT INTO contrato_enviado (id_miembro, id_gimnasio, telefono_destino, canal) VALUES ($1, $2, NULL, 'WHATSAPP')`,
      [id, gymA]
    )).rejects.toMatchObject({ code: '23514' });

    // Un administrador de otro gimnasio: 404, sin enviar nada.
    const ajeno = await pedir('POST', `/api/admin/miembros/${id}/contrato/enviar`, tokAdminB, {});
    expect(whatsapp.sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(ajeno.status).toBe(404);
  });

  test('borrado permanente de un miembro con autorizaciones y entregas: funciona y se lleva su historial', async () => {
    const r = await pedir('POST', '/api/admin/miembros', tokA, alta({ autorizo_datos_sensibles: true }));
    const id = r.body.miembro.id_miembro;
    const tokCliente = jwt.sign({ role: 'cliente', idMiembro: id, gymId: gymA }, process.env.JWT_SECRET, { expiresIn: '1h' });
    expect((await pedir('GET', '/api/cliente/contrato', tokCliente)).status).toBe(200);

    const del = await pedir('DELETE', `/api/admin/miembros/${id}/permanent`, tokAdminA);
    expect(del.status).toBe(200);
    expect((await pool.query('SELECT count(*)::int AS n FROM autorizacion_miembro WHERE id_miembro = $1', [id])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM contrato_enviado WHERE id_miembro = $1', [id])).rows[0].n).toBe(0);
  });
});
