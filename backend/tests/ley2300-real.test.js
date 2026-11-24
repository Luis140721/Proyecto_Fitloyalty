/**
 * RQNF-16 (Ley 2300 de 2023) contra una base de datos real.
 *
 * Levanta los routers reales (preferencias y enlace de baja, miembros,
 * campanas y notificaciones) sobre la BD de pruebas y los llama
 * por HTTP; corre el job de vencimientos con WhatsApp simulado. Comprueba las
 * filas que quedan en autorizacion_miembro (migraciones 019 y 017),
 * campana_destinatario (015 y 018), envio_mensaje y alerta_vencimiento_enviada,
 * y que las restricciones de 017 y 018 existen de verdad.
 *
 * El reloj de la Ley 2300 se fija (lib/contacto-legal, establecerReloj): las
 * pruebas no dependen de la hora a la que se corren.
 *
 * La conexion es la de los tests de integracion (tests/integracion/bd-pruebas.js),
 * como en legal-real.test.js y registro-envio-real.test.js:
 *   - Sin DATABASE_URL en el entorno del proceso se salta entera (asi queda en
 *     el job backend del CI); la DATABASE_URL de backend/.env no la activa.
 *   - Solo acepta la BD de pruebas local (127.0.0.1:5433, BD terminada en
 *     _test), revisa antes de conectarse el destino que pg va a usar de verdad
 *     y aplica las migraciones de backend/migrations. Las pruebas de esa
 *     guardia estan en tests/integracion/guardia-bd.test.js.
 *   - WhatsApp y el correo estan simulados: no sale ningun mensaje.
 *   - Crea sus propios gimnasios y al final borra todo lo que creo.
 *
 * Corre en el job integracion del CI. Uso (desde la raiz, con db-test levantada):
 *
 *   DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test \
 *   pnpm --dir backend run test:integracion
 */
jest.setTimeout(30000); // base real: con la maquina cargada los hooks pasan de 5 s
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
// La guardia de la BD de pruebas y la DATABASE_URL del entorno del proceso:
// ver tests/integracion/bd-pruebas.js. Va antes que cualquier modulo de src/.
const { describeConBd, prepararBdDePruebas } = require('./integracion/bd-pruebas');

jest.mock('../src/lib/whatsapp', () => ({
  sendWhatsAppText: jest.fn(async () => {}),
  sendWhatsAppQR: jest.fn(async () => {}),
  isWhatsAppReady: () => true,
  isWhatsAppEnabled: () => false,
}));
jest.mock('../src/lib/email', () => ({ sendMemberQR: jest.fn(async () => {}), sendMail: jest.fn(async () => ({ delivered: true })) }));

// El secreto con el que esta prueba firma sus tokens. Solo vale en este archivo.
process.env.JWT_SECRET = 'prueba-real-local';

describeConBd('RQNF-16 contra la base real', () => {
  let pool, server, base, establecerBusquedaPersonal, campanasRouter, legal;
  const sufijo = crypto.randomBytes(3).toString('hex');
  const gimnasios = [];
  let gymA, gymB, adminA, recepA, adminB;
  let tkAdminA, tkRecepA, tkAdminB;
  const whatsapps = [];
  const correos = [];
  let whatsappActivo = false;

  const co = (texto) => new Date(`${texto.replace(' ', 'T')}:00-05:00`);
  const MARTES = co('2026-11-17 10:00');
  const fijar = (instante) => legal.establecerReloj(() => instante);

  const llamar = async (method, url, tk, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (tk) headers.Authorization = `Bearer ${tk}`;
    const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const uno = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const todas = async (sql, params) => (await pool.query(sql, params)).rows;
  const hoyMas = (d) => new Date(Date.now() - 5 * 3600 * 1000 + d * 86400000).toISOString().slice(0, 10);

  async function crearGimnasio(nombre) {
    const g = await uno("INSERT INTO gimnasio (nombre, telefono) VALUES ($1, '3000000000') RETURNING id_gimnasio", [nombre]);
    gimnasios.push(g.id_gimnasio);
    return g.id_gimnasio;
  }
  async function crearUsuario(gymId, n, rol) {
    const { rows: c } = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'id_rol'"
    );
    const cols = ['id_gimnasio', 'nombre', 'email', 'password_hash', 'rol'];
    const vals = [gymId, `Personal ${n}`, `ley2300-${sufijo}-${n}@prueba.local`, 'x', rol];
    if (c.length > 0) { cols.push('id_rol'); vals.push(rol === 'ADMINISTRADOR' ? 1 : 2); }
    const u = await uno(
      `INSERT INTO usuario (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id_usuario`,
      vals
    );
    return u.id_usuario;
  }
  let n = 0;
  async function crearMiembro(gymId, nombre, { email = null, tipoDoc = 'CC', nacimiento = null, ...rep } = {}) {
    n += 1;
    const m = await uno(
      `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, email, codigo_qr, tipo_documento, fecha_nacimiento,
                            representante_nombre, representante_tipo_documento, representante_documento,
                            representante_parentesco, representante_telefono)
       VALUES ($1, $2, $3, '3001234567', $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id_miembro`,
      [gymId, nombre, `ley2300-${sufijo}-${n}`, email, `QR-L2300-${sufijo}-${n}`, tipoDoc, nacimiento,
       rep.representante_nombre || null, rep.representante_tipo_documento || null, rep.representante_documento || null,
       rep.representante_parentesco || null, rep.representante_telefono || null]
    );
    return m.id_miembro;
  }
  const aceptar = (idMiembro, gymId, canales) => pool.query(
    `INSERT INTO autorizacion_miembro (id_miembro, id_gimnasio, tipo, otorgada, version_texto, canal, canales_autorizados)
     VALUES ($1, $2, 'MENSAJES_COMERCIALES', TRUE, 'v2', 'APP', $3::varchar(20)[])`,
    [idMiembro, gymId, canales]
  );
  const planVencido = async (idMiembro, gymId, { venceEn = -2 } = {}) => (await uno(
    `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, activo)
     VALUES ($1, $2, 'MENSUAL', CURRENT_DATE + ($3::int - 30), CURRENT_DATE + $3::int, TRUE) RETURNING id_plan_cobro`,
    [idMiembro, gymId, venceEn]
  )).id_plan_cobro;
  const comerciales = (idMiembro) => todas(
    `SELECT otorgada, canal, version_texto, registrada_por, canales_autorizados
       FROM autorizacion_miembro WHERE id_miembro = $1 AND tipo = 'MENSAJES_COMERCIALES'
      ORDER BY fecha, id_autorizacion`,
    [idMiembro]
  );

  beforeAll(async () => {
    pool = await prepararBdDePruebas();
    legal = require('../src/lib/contacto-legal');
    fijar(MARTES);
    ({ establecerBusquedaPersonal } = require('../src/middleware/auth'));
    establecerBusquedaPersonal(async (payload) => {
      const { rows } = await pool.query('SELECT activo, id_gimnasio, rol AS rol_nombre FROM usuario WHERE id_usuario = $1', [payload.id]);
      return rows[0] || null;
    });
    campanasRouter = require('../src/routes/campanas');
    campanasRouter.setDeps({
      enviarCorreo: async (to, asunto, texto) => { correos.push({ to, asunto, texto }); return { delivered: true }; },
      enviarWhatsapp: async (tel, texto) => { whatsapps.push({ tel, texto }); },
      whatsappActivo: () => whatsappActivo,
    });

    gymA = await crearGimnasio(`Prueba Ley 2300 A ${sufijo}`);
    gymB = await crearGimnasio(`Prueba Ley 2300 B ${sufijo}`);
    adminA = await crearUsuario(gymA, 'admin-a', 'ADMINISTRADOR');
    recepA = await crearUsuario(gymA, 'recep-a', 'RECEPCIONISTA');
    adminB = await crearUsuario(gymB, 'admin-b', 'ADMINISTRADOR');
    const firmar = (id, gymId, role) => jwt.sign({ id, role, gymId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tkAdminA = firmar(adminA, gymA, 'admin');
    tkRecepA = firmar(recepA, gymA, 'receptionist');
    tkAdminB = firmar(adminB, gymB, 'admin');

    const { errorHandler } = require('../src/middleware/errorHandler');
    const app = express();
    app.use(express.json());
    app.use('/api', require('../src/routes/preferencias'));
    app.use('/api', require('../src/routes/notificaciones'));
    app.use('/api', campanasRouter);
    app.use('/api', require('../src/routes/miembros'));
    app.use(errorHandler);
    await new Promise((resolve) => {
      server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });

  beforeEach(() => fijar(MARTES));

  afterAll(async () => {
    if (legal) legal.establecerReloj(null);
    if (establecerBusquedaPersonal) establecerBusquedaPersonal(null);
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (!pool) return;
    if (gimnasios.length > 0) {
      const g = [gimnasios];
      await pool.query('DELETE FROM envio_mensaje WHERE id_gimnasio = ANY($1::int[])', g);
      await pool.query('DELETE FROM campana_destinatario WHERE id_campana IN (SELECT id_campana FROM campana WHERE id_gimnasio = ANY($1::int[]))', g);
      await pool.query('DELETE FROM campana WHERE id_gimnasio = ANY($1::int[])', g);
      await pool.query('DELETE FROM alerta_vencimiento_enviada WHERE id_miembro IN (SELECT id_miembro FROM miembro WHERE id_gimnasio = ANY($1::int[]))', g);
      for (const tabla of ['checkin', 'notificacion', 'canal_comunicacion', 'plan_cobro', 'autorizacion_miembro', 'miembro', 'usuario', 'gimnasio']) {
        await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = ANY($1::int[])`, g);
      }
    }
    await pool.end();
  });

  // ============================================================== migraciones
  describe('migraciones 017 y 018', () => {
    test('dejaron sus columnas y restricciones', async () => {
      const cols = await todas(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND ((table_name = 'autorizacion_miembro' AND column_name = 'canales_autorizados')
              OR (table_name = 'campana_destinatario' AND column_name = 'motivo'))`
      );
      expect(cols.map((c) => `${c.table_name}.${c.column_name}`).sort())
        .toEqual(['autorizacion_miembro.canales_autorizados', 'campana_destinatario.motivo']);
      const cks = await todas(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname IN ('ck_autorizacion_canal', 'ck_autorizacion_canales', 'ck_autorizacion_comerciales_canal',
                            'ck_campana_destinatario_estado', 'ck_campana_destinatario_motivo', 'ck_campana_destinatario_omitido')
          ORDER BY conname`
      );
      expect(cks.map((c) => c.conname)).toEqual([
        'ck_autorizacion_canal', 'ck_autorizacion_canales', 'ck_autorizacion_comerciales_canal',
        'ck_campana_destinatario_estado', 'ck_campana_destinatario_motivo', 'ck_campana_destinatario_omitido',
      ]);
      expect(cks[0].def).toMatch(/ENLACE/);
      expect(cks[3].def).toMatch(/OMITIDO/);
      // El CHECK viejo de estado_envio (sin nombre) ya no esta.
      const viejos = await todas(
        `SELECT conname FROM pg_constraint
          WHERE conrelid = 'public.campana_destinatario'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE '%estado_envio%' AND conname <> 'ck_campana_destinatario_estado'
            AND conname <> 'ck_campana_destinatario_omitido'`
      );
      expect(viejos).toEqual([]);
    });

    test('la base rechaza aceptar sin canal, un canal que no existe y un OMITIDO sin motivo', async () => {
      const id = await crearMiembro(gymA, 'Para Checks');
      const insertar = (canales, otorgada = true, canal = 'APP') => pool.query(
        `INSERT INTO autorizacion_miembro (id_miembro, id_gimnasio, tipo, otorgada, version_texto, canal, canales_autorizados)
         VALUES ($1, $2, 'MENSAJES_COMERCIALES', $3, 'v2', $4, $5::varchar(20)[])`,
        [id, gymA, otorgada, canal, canales]
      );
      await expect(insertar(null)).rejects.toThrow(/ck_autorizacion_comerciales_canal/);
      await expect(insertar([])).rejects.toThrow(/ck_autorizacion_comerciales_canal/);
      await expect(insertar(['SMS'])).rejects.toThrow(/ck_autorizacion_canales/);
      await expect(insertar(null, false, 'ENLACE')).resolves.toBeTruthy(); // baja por el enlace
      await expect(insertar(['WHATSAPP'], true, 'CORREO')).rejects.toThrow(/ck_autorizacion_canal/);
      const c = await uno(
        `INSERT INTO campana (id_gimnasio, nombre, segmento, mensaje, tipo_disparo, estado, canal)
         VALUES ($1, 'Check', 'TODOS', 'Hola', 'MANUAL', 'ENVIADA', 'WHATSAPP') RETURNING id_campana`, [gymA]
      );
      await expect(pool.query(
        "INSERT INTO campana_destinatario (id_campana, id_miembro, estado_envio) VALUES ($1, $2, 'OMITIDO')", [c.id_campana, id]
      )).rejects.toThrow(/ck_campana_destinatario_omitido/);
      await expect(pool.query(
        "INSERT INTO campana_destinatario (id_campana, id_miembro, estado_envio, motivo) VALUES ($1, $2, 'OMITIDO', 'NO_AUTORIZA')", [c.id_campana, id]
      )).resolves.toBeTruthy();
    });
  });

  // ========================================== aceptacion, app, enlace y panel
  describe('aceptacion y baja de los mensajes comerciales', () => {
    let luis;
    const tkLuis = () => jwt.sign({ role: 'cliente', idMiembro: luis, gymId: gymA }, process.env.JWT_SECRET, { expiresIn: '1h' });

    test('un miembro que ya existia (sin fila) no acepta mensajes comerciales', async () => {
      luis = await crearMiembro(gymA, 'Luis Antiguo', { email: `luis-${sufijo}@prueba.local` });
      const r = await llamar('GET', '/api/cliente/preferencias', tkLuis());
      expect(r.status).toBe(200);
      expect(r.body.preferencias).toMatchObject({ aceptaComerciales: false, canalesAutorizados: [] });
      expect(await comerciales(luis)).toEqual([]);
    });

    test('acepta en la app: queda la constancia con canal APP, version v2 y sus canales', async () => {
      const r = await llamar('PATCH', '/api/cliente/preferencias', tkLuis(), { aceptaComerciales: true, canalesAutorizados: ['EMAIL', 'WHATSAPP'] });
      expect(r.status).toBe(200);
      expect(await comerciales(luis)).toEqual([
        { otorgada: true, canal: 'APP', version_texto: 'v2', registrada_por: null, canales_autorizados: ['WHATSAPP', 'EMAIL'] },
      ]);
    });

    test('dos toques a la vez no duplican la constancia', async () => {
      await Promise.all([
        llamar('PATCH', '/api/cliente/preferencias', tkLuis(), { canalesAutorizados: ['WHATSAPP'] }),
        llamar('PATCH', '/api/cliente/preferencias', tkLuis(), { canalesAutorizados: ['WHATSAPP'] }),
      ]);
      const filas = await comerciales(luis);
      expect(filas).toHaveLength(2);
      expect(filas[1]).toMatchObject({ otorgada: true, canales_autorizados: ['WHATSAPP'] });
    });

    test('el enlace de baja: el GET no cambia nada y el POST da de baja con canal ENLACE', async () => {
      const { tokenBaja } = require('../src/lib/baja-mensajes');
      const url = `/api/baja/${tokenBaja(luis, gymA)}`;
      const g = await llamar('GET', url);
      expect(g.body).toEqual({ nombre: 'Luis', gimnasio: `Prueba Ley 2300 A ${sufijo}`, aceptaComerciales: true });
      expect(await comerciales(luis)).toHaveLength(2);
      const p = await llamar('POST', url);
      expect(p.status).toBe(200);
      expect((await comerciales(luis)).pop()).toEqual({ otorgada: false, canal: 'ENLACE', version_texto: 'v2', registrada_por: null, canales_autorizados: null });
      expect((await llamar('POST', url)).body.cambio).toBe(false);
      expect(await comerciales(luis)).toHaveLength(3);
      // Un token con la firma de otro miembro no sirve.
      expect((await llamar('POST', url.replace(`/${luis}.`, `/${luis + 1}.`))).status).toBe(404);
    });

    test('en la ficha del panel: vuelve a aceptar (PANEL, con quien lo registro) y la ficha lo muestra', async () => {
      const r = await llamar('PUT', `/api/admin/miembros/${luis}`, tkRecepA, { acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
      expect(r.status).toBe(200);
      expect((await comerciales(luis)).pop()).toEqual({ otorgada: true, canal: 'PANEL', version_texto: 'v2', registrada_por: recepA, canales_autorizados: ['WHATSAPP'] });
      const g = await llamar('GET', `/api/admin/miembros/${luis}`, tkRecepA);
      expect(g.body.miembro).toMatchObject({ acepta_mensajes_comerciales: true, canales_comerciales: ['WHATSAPP'] });
      // Otro gimnasio no lo cambia.
      expect((await llamar('PUT', `/api/admin/miembros/${luis}`, tkAdminB, { acepta_mensajes_comerciales: false })).status).toBe(404);
    });
  });

  // ================================================= ajustes del #102 (real)
  describe('ajustes del #102 contra la base real', () => {
    const REP = {
      representante_nombre: 'Marta Ruiz', representante_tipo_documento: 'CC', representante_documento: '52123456',
      representante_parentesco: 'Madre', representante_telefono: '3109876543',
    };
    const nacido = (anos) => {
      const f = new Date(Date.now() - 5 * 3600 * 1000);
      return new Date(Date.UTC(f.getUTCFullYear() - anos, f.getUTCMonth(), f.getUTCDate() - 10)).toISOString().slice(0, 10);
    };

    test('(1) PUT solo con { autorizo_datos_sensibles: true }: 200 y la fila', async () => {
      const id = await crearMiembro(gymA, 'Solo Sensibles');
      const r = await llamar('PUT', `/api/admin/miembros/${id}`, tkRecepA, { autorizo_datos_sensibles: true });
      expect(r.status).toBe(200);
      expect(await uno("SELECT otorgada FROM autorizacion_miembro WHERE id_miembro = $1 AND tipo = 'DATOS_SENSIBLES'", [id])).toEqual({ otorgada: true });
    });

    test('(2) un menor no deja de serlo sin fecha; con una fecha de adulto si, con constancia', async () => {
      const id = await crearMiembro(gymA, 'Sofi Menor', { tipoDoc: 'TI', nacimiento: nacido(14), ...REP });
      const vaciar = await llamar('PUT', `/api/admin/miembros/${id}`, tkRecepA, { fecha_nacimiento: '', tipo_documento: 'CC' });
      expect(vaciar.status).toBe(400);
      expect(vaciar.body.code).toBe('MENOR_SIN_CONSTANCIA');
      expect(await uno("SELECT tipo_documento, to_char(fecha_nacimiento, 'YYYY-MM-DD') AS f FROM miembro WHERE id_miembro = $1", [id]))
        .toEqual({ tipo_documento: 'TI', f: nacido(14) });
      const ok = await llamar('PUT', `/api/admin/miembros/${id}`, tkRecepA, { fecha_nacimiento: nacido(19), tipo_documento: 'CC' });
      expect(ok.status).toBe(200);
      const c = await uno(
        "SELECT otorgada, registrada_por, detalle FROM autorizacion_miembro WHERE id_miembro = $1 AND tipo = 'REPRESENTANTE_MENOR' ORDER BY id_autorizacion DESC LIMIT 1",
        [id]
      );
      expect(c).toMatchObject({ otorgada: false, registrada_por: recepA, detalle: { motivo: 'MAYOR_DE_EDAD', edad_miembro: 19 } });
    });
  });

  // ======================================== RQF-09: clase y frecuencia (real)
  describe('POST /notificaciones/enviado contra la base real', () => {
    const enviar = (idMiembro, tipo, mensaje = 'Hola') =>
      llamar('POST', '/api/admin/notificaciones/enviado', tkRecepA, { idMiembro, tipo, mensaje });
    let idCanal;
    beforeAll(async () => {
      idCanal = (await uno("INSERT INTO canal_comunicacion (id_gimnasio, tipo, activo) VALUES ($1, 'WHATSAPP', TRUE) RETURNING id_canal", [gymA])).id_canal;
    });

    test('tipo vencida con el plan al dia: no es aviso, es comercial, y sin aceptacion es 409', async () => {
      const id = await crearMiembro(gymA, 'Plan Al Dia');
      await planVencido(id, gymA, { venceEn: 40 });
      const r = await enviar(id, 'vencida', 'Te extrañamos, vuelve con 20% de descuento');
      expect(r.status).toBe(409);
      expect(r.body.details).toMatchObject({ motivo: 'NO_AUTORIZA', clase: 'COMERCIAL', aviso_no_confirmado: true });
      expect((await uno('SELECT count(*)::int AS n FROM envio_mensaje WHERE id_miembro = $1', [id])).n).toBe(0);
      // por vencer en 3 dias (el gimnasio avisa a 7 por defecto): si es aviso
      const otro = await crearMiembro(gymA, 'Vence Pronto');
      await planVencido(otro, gymA, { venceEn: 3 });
      expect((await enviar(otro, 'por-vencer')).body).toMatchObject({ clase: 'AVISO' });
    });

    test('vencida: hace 30 dias es aviso (con el texto del servidor); hace 31, o vence hoy, es comercial', async () => {
      const m30 = await crearMiembro(gymA, 'Vencio Hace Treinta');
      await planVencido(m30, gymA, { venceEn: -30 });
      const r30 = await enviar(m30, 'vencida', 'Cualquier texto del panel');
      expect(r30.status).toBe(201);
      expect(r30.body).toMatchObject({ clase: 'AVISO', texto_del_servidor: true });
      expect(r30.body.mensaje).toMatch(/^Hola Vencio, te saludamos de Prueba Ley 2300 A .+\. Tu plan vencio hace 30 dias\./);
      expect((await uno('SELECT mensaje_copiado FROM envio_mensaje WHERE id_miembro = $1', [m30])).mensaje_copiado).toBe(r30.body.mensaje);

      const m31 = await crearMiembro(gymA, 'Vencio Hace Treintaiuno');
      await planVencido(m31, gymA, { venceEn: -31 });
      const r31 = await enviar(m31, 'vencida');
      expect(r31.status).toBe(409);
      expect(r31.body.details).toMatchObject({ motivo: 'NO_AUTORIZA', clase: 'COMERCIAL', aviso_no_confirmado: true });
      expect(r31.body.error).toMatch(/venció hace más de 30 días/);

      const hoy = await crearMiembro(gymA, 'Vence Hoy');
      await planVencido(hoy, gymA, { venceEn: 0 });
      const rHoy = await enviar(hoy, 'vencida');
      expect(rHoy.status).toBe(409);
      expect(rHoy.body.details).toMatchObject({ clase: 'COMERCIAL', aviso_no_confirmado: true });
      expect(rHoy.body.error).toMatch(/el plan no está vencido/);
    });

    test('la campana del panel usa la misma regla: ofrece como aviso el vencido hace 30 dias y no el de 31', async () => {
      const g = await crearGimnasio(`Prueba Ley 2300 D ${sufijo}`);
      const recep = await crearUsuario(g, 'recep-d', 'RECEPCIONISTA');
      const tk = jwt.sign({ id: recep, role: 'receptionist', gymId: g }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const a30 = await crearMiembro(g, 'Campana Treinta');
      await planVencido(a30, g, { venceEn: -30 });
      const a31 = await crearMiembro(g, 'Campana Treintaiuno');
      await planVencido(a31, g, { venceEn: -31 });
      const r = await llamar('GET', '/api/admin/notificaciones', tk);
      expect(r.status).toBe(200);
      const vencidas = r.body.avisos.filter((x) => x.tipo === 'vencida');
      expect(vencidas.map((x) => x.idMiembro)).toEqual([a30]);
      // El texto que propone la campana es el mismo que registra el POST.
      const p = await llamar('POST', '/api/admin/notificaciones/enviado', tk, { idMiembro: a30, tipo: 'vencida', mensaje: vencidas[0].mensaje });
      expect(p.status).toBe(201);
      expect(p.body).toMatchObject({ clase: 'AVISO', mensaje: vencidas[0].mensaje });
    });

    test('acceso bloqueado: un bloqueo de hace 23 h es aviso; de hace 25 h, u otra notificacion, no', async () => {
      const notificar = (id, { horas, tipo = 'ALERTA', titulo = 'Acceso bloqueado' }) => pool.query(
        `INSERT INTO notificacion (id_gimnasio, id_miembro, tipo, titulo, mensaje, fecha_creacion)
         VALUES ($1, $2, $3, $4, 'Intento de ingreso', NOW() - ($5 || ' hours')::interval)`,
        [gymA, id, tipo, titulo, String(horas)]
      );
      const reciente = await crearMiembro(gymA, 'Bloqueo Reciente');
      await planVencido(reciente, gymA);
      await notificar(reciente, { horas: 23 });
      const r1 = await enviar(reciente, 'acceso-bloqueado');
      expect(r1.status).toBe(201);
      expect(r1.body.clase).toBe('AVISO');
      expect(r1.body.mensaje).toMatch(/no pudimos dejarte pasar porque tu plan vencio hace 2 dias/);

      const viejo = await crearMiembro(gymA, 'Bloqueo Viejo');
      await planVencido(viejo, gymA);
      await notificar(viejo, { horas: 25 });
      const r2 = await enviar(viejo, 'acceso-bloqueado');
      expect(r2.status).toBe(409);
      expect(r2.body.details).toMatchObject({ clase: 'COMERCIAL', aviso_no_confirmado: true });
      expect(r2.body.error).toMatch(/no hubo un ingreso bloqueado en las últimas 24 horas/);

      const otroTipo = await crearMiembro(gymA, 'Otra Notificacion');
      await planVencido(otroTipo, gymA);
      await notificar(otroTipo, { horas: 1, tipo: 'SISTEMA' });
      await notificar(otroTipo, { horas: 1, titulo: 'Recordatorio enviado' });
      const r3 = await enviar(otroTipo, 'acceso-bloqueado');
      expect(r3.status).toBe(409);
      expect(r3.body.details).toMatchObject({ clase: 'COMERCIAL', aviso_no_confirmado: true });

      // El mismo tipo y titulo, pero para la bandeja del miembro (migracion
      // 016): no es el bloqueo que ve el gimnasio.
      const paraMiembro = await crearMiembro(gymA, 'Bloqueo En Bandeja');
      await planVencido(paraMiembro, gymA);
      await notificar(paraMiembro, { horas: 1 });
      await pool.query("UPDATE notificacion SET destinatario = 'MIEMBRO' WHERE id_miembro = $1", [paraMiembro]);
      const r4 = await enviar(paraMiembro, 'acceso-bloqueado');
      expect(r4.status).toBe(409);
      expect(r4.body.details).toMatchObject({ clase: 'COMERCIAL', aviso_no_confirmado: true });
    });

    test('un miembro inactivo no confirma el aviso, igual que en la campana', async () => {
      const id = await crearMiembro(gymA, 'Inactivo Vencido');
      await planVencido(id, gymA, { venceEn: -5 });
      await pool.query('UPDATE miembro SET activo = FALSE WHERE id_miembro = $1', [id]);
      const r = await enviar(id, 'vencida');
      expect(r.status).toBe(409);
      expect(r.body.details).toMatchObject({ clase: 'COMERCIAL', aviso_no_confirmado: true });
      expect(r.body.error).toMatch(/el miembro está inactivo/);
      expect((await uno('SELECT count(*)::int AS n FROM envio_mensaje WHERE id_miembro = $1', [id])).n).toBe(0);
    });

    test('un envio FALLIDO de hoy no cuenta en la frecuencia', async () => {
      const id = await crearMiembro(gymA, 'Con Fallido');
      await planVencido(id, gymA);
      await pool.query(
        `INSERT INTO envio_mensaje (id_gimnasio, id_miembro, id_canal, mensaje_copiado, estado, fecha_envio)
         VALUES ($1, $2, $3, 'No salio', 'FALLIDO', ($4::timestamptz AT TIME ZONE current_setting('TimeZone')))`,
        [gymA, id, idCanal, co('2026-11-17 08:00')]
      );
      const r = await enviar(id, 'vencida');
      expect(r.status).toBe(201);
      expect(r.body.clase).toBe('AVISO');
    });

    test('un aviso automatico de vencimiento de hoy si cuenta: 409 FRECUENCIA', async () => {
      const id = await crearMiembro(gymA, 'Con Aviso Automatico');
      const plan = await planVencido(id, gymA);
      await pool.query(
        `INSERT INTO alerta_vencimiento_enviada (id_miembro, id_plan_cobro, dias_restantes, enviado_at)
         VALUES ($1, $2, 0, ($3::timestamptz AT TIME ZONE current_setting('TimeZone')))`,
        [id, plan, co('2026-11-17 09:00')]
      );
      const r = await enviar(id, 'vencida');
      expect(r.status).toBe(409);
      expect(r.body.details).toMatchObject({ motivo: 'FRECUENCIA', clase: 'AVISO' });
    });
  });

  // ================================================================= campanas
  describe('campanas con la Ley 2300', () => {
    let ana, beto, carla, dani;
    const crearCampana = async (body, tk = tkAdminA) => (await llamar('POST', '/api/admin/campanas', tk, {
      nombre: `Campana ${crypto.randomBytes(2).toString('hex')}`, segmento: 'TODOS', mensaje: 'Hola {primer_nombre}', ...body,
    })).body.campana;
    const destinatarios = (idCampana) => todas(
      'SELECT id_miembro, estado_envio, motivo FROM campana_destinatario WHERE id_campana = $1 ORDER BY id_miembro', [idCampana]
    );

    beforeAll(async () => {
      // Un gimnasio propio para que el segmento TODOS sea solo esta gente.
      ana = await crearMiembro(gymB, 'Ana Acepta', { email: `ana-${sufijo}@prueba.local` });
      beto = await crearMiembro(gymB, 'Beto Correo', { email: `beto-${sufijo}@prueba.local` });
      carla = await crearMiembro(gymB, 'Carla NoAcepta');
      dani = await crearMiembro(gymB, 'Dani Contactado');
      await aceptar(ana, gymB, ['WHATSAPP', 'EMAIL']);
      await aceptar(beto, gymB, ['EMAIL']);
      await aceptar(dani, gymB, ['WHATSAPP']);
      // El plan de Dani vencio hace 2 dias: su aviso 'vencida' es un aviso de verdad.
      await planVencido(dani, gymB);
    });

    test('solo la reciben quienes aceptaron por ese canal; los demas quedan OMITIDO con su motivo', async () => {
      whatsappActivo = true;
      try {
        // A Dani ya le escribieron hoy (RQF-09, aviso de su plan).
        const previo = await llamar('POST', '/api/admin/notificaciones/enviado', tkAdminB, { idMiembro: dani, tipo: 'vencida', mensaje: 'Tu plan vence' });
        expect(previo.status).toBe(201);
        const c = await crearCampana({ canal: 'WHATSAPP' }, tkAdminB);
        const r = await llamar('POST', `/api/admin/campanas/${c.id_campana}/ejecutar`, tkAdminB);
        expect(r.status).toBe(200);
        expect(r.body.resumen).toMatchObject({ destinatarios: 4, enviados: 1, omitidos: 3, omitidosPorMotivo: { CANAL_NO_AUTORIZADO: 1, NO_AUTORIZA: 1, FRECUENCIA: 1 } });
        expect(await destinatarios(c.id_campana)).toEqual([
          { id_miembro: ana, estado_envio: 'ENVIADO', motivo: null },
          { id_miembro: beto, estado_envio: 'OMITIDO', motivo: 'CANAL_NO_AUTORIZADO' },
          { id_miembro: carla, estado_envio: 'OMITIDO', motivo: 'NO_AUTORIZA' },
          { id_miembro: dani, estado_envio: 'OMITIDO', motivo: 'FRECUENCIA' },
        ]);
        const e = await uno(
          `SELECT mensaje_copiado, (fecha_envio = ($2::timestamptz AT TIME ZONE current_setting('TimeZone'))) AS con_reloj
             FROM envio_mensaje WHERE id_campana = $1`, [c.id_campana, MARTES]
        );
        expect(e.mensaje_copiado).toMatch(/^Hola Ana\n\nSi ya no quieres recibir mensajes comerciales del gimnasio, entra aquí: .*\/baja\//);
        expect(e.con_reloj).toBe(true);
        const l = await llamar('GET', '/api/admin/campanas', tkAdminB);
        expect(l.body.campanas.find((x) => x.id_campana === c.id_campana)).toMatchObject({ omitidos: 3, enviados: 1 });
      } finally {
        whatsappActivo = false;
      }
    });

    test('por correo, esta misma semana, a Ana ya no (otro canal) y a Beto si', async () => {
      fijar(co('2026-11-18 10:00')); // miercoles de la misma semana
      const c = await crearCampana({ canal: 'EMAIL' }, tkAdminB);
      const r = await llamar('POST', `/api/admin/campanas/${c.id_campana}/ejecutar`, tkAdminB);
      // Ana: WhatsApp el martes (FRECUENCIA); Carla no acepto; Dani solo por WhatsApp.
      expect(r.body.resumen).toMatchObject({ enviados: 1, omitidosPorMotivo: { FRECUENCIA: 1, NO_AUTORIZA: 1, CANAL_NO_AUTORIZADO: 1 } });
      expect(correos.map((x) => x.to)).toContain(`beto-${sufijo}@prueba.local`);
      expect(correos.map((x) => x.to)).not.toContain(`ana-${sufijo}@prueba.local`);
    });

    test('fuera de horario, "Enviar ahora" la deja programada para el siguiente horario (202)', async () => {
      fijar(co('2026-11-21 16:00')); // sabado despues de las 3:00 p. m.
      const c = await crearCampana({ canal: 'WHATSAPP' }, tkAdminB);
      const r = await llamar('POST', `/api/admin/campanas/${c.id_campana}/ejecutar`, tkAdminB);
      expect(r.status).toBe(202);
      expect(r.body).toMatchObject({ programada: true, siguiente: co('2026-11-23 07:00').toISOString() });
      expect(r.body.message).toMatch(/quedó programada para el lunes 23 de noviembre a las 7:00 a\. m\./);
      expect(r.body.campana).toMatchObject({ estado: 'PROGRAMADA', tipo_disparo: 'PROGRAMADO', fecha_programada: '2026-11-23T07:00' });
      expect(await destinatarios(c.id_campana)).toEqual([]);
      await llamar('POST', `/api/admin/campanas/${c.id_campana}/cancelar`, tkAdminB);
    });

    test('programar en domingo o festivo: 400 FUERA_DE_HORARIO', async () => {
      // El primer domingo despues de hoy (fecha real, porque la base compara con NOW()).
      let d = 1;
      while (new Date(`${hoyMas(d)}T12:00:00Z`).getUTCDay() !== 0) d += 1;
      const r = await llamar('POST', '/api/admin/campanas', tkAdminB, {
        nombre: 'Domingo', segmento: 'TODOS', mensaje: 'Hola {nombre}', tipo_disparo: 'PROGRAMADO', fecha_programada: `${hoyMas(d)}T10:00`,
      });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('FUERA_DE_HORARIO');
      expect(r.body.error).toMatch(/fuera del horario permitido/);
    });

    test('GET /admin/campanas ya no ejecuta las vencidas; el scheduler si, y filtrando por gimnasio', async () => {
      fijar(co('2026-11-24 10:00'));
      const c = await crearCampana({ canal: 'EMAIL' }, tkAdminB);
      await pool.query("UPDATE campana SET tipo_disparo = 'PROGRAMADO', fecha_programada = NOW() - INTERVAL '1 minute' WHERE id_campana = $1", [c.id_campana]);
      await llamar('GET', '/api/admin/campanas', tkAdminB);
      expect((await uno('SELECT estado FROM campana WHERE id_campana = $1', [c.id_campana])).estado).toBe('PROGRAMADA');
      // ejecutarVencidas de otro gimnasio no la toca.
      expect(await campanasRouter.ejecutarVencidas(gymA)).toEqual([]);
      expect((await uno('SELECT estado FROM campana WHERE id_campana = $1', [c.id_campana])).estado).toBe('PROGRAMADA');
      // Fuera de horario el scheduler tampoco.
      fijar(co('2026-11-22 10:00'));
      expect(await campanasRouter.ejecutarVencidas(gymB)).toEqual([]);
      fijar(co('2026-11-24 10:00'));
      const r = await campanasRouter.ejecutarVencidas(gymB);
      expect(r.map((x) => x.id_campana)).toEqual([c.id_campana]);
      expect((await uno('SELECT estado FROM campana WHERE id_campana = $1', [c.id_campana])).estado).toBe('ENVIADA');
    });

    test('PENDIENTE por un proceso caido: el boton Reintentar y el scheduler los envian una sola vez', async () => {
      fijar(co('2026-12-01 10:00')); // otra semana
      const c = await crearCampana({ canal: 'EMAIL' }, tkAdminB);
      // Simula la caida: la campana quedo ENVIADA con Ana y Beto PENDIENTE.
      await pool.query("UPDATE campana SET estado = 'ENVIADA', fecha_ejecucion = NOW() - INTERVAL '1 hour' WHERE id_campana = $1", [c.id_campana]);
      for (const id of [ana, beto]) {
        await pool.query("INSERT INTO campana_destinatario (id_campana, id_miembro, estado_envio) VALUES ($1, $2, 'PENDIENTE')", [c.id_campana, id]);
      }
      const antes = correos.length;
      // Dos reintentos a la vez (el boton y el scheduler) no duplican.
      const [boton, job] = await Promise.all([
        llamar('POST', `/api/admin/campanas/${c.id_campana}/reintentar`, tkAdminB),
        campanasRouter.reanudarPendientes(gymB),
      ]);
      expect(boton.status).toBe(200);
      expect(Array.isArray(job)).toBe(true);
      expect(correos.length - antes).toBe(2);
      expect(await destinatarios(c.id_campana)).toEqual([
        { id_miembro: ana, estado_envio: 'ENVIADO', motivo: null },
        { id_miembro: beto, estado_envio: 'ENVIADO', motivo: null },
      ]);
      expect((await uno('SELECT count(*)::int AS n FROM envio_mensaje WHERE id_campana = $1', [c.id_campana])).n).toBe(2);
      // Ya no queda nada pendiente.
      expect((await llamar('POST', `/api/admin/campanas/${c.id_campana}/reintentar`, tkAdminB)).body.message).toMatch(/No hay destinatarios pendientes/);
    });

    test('WhatsApp a mano: doble clic no duplica la constancia; fuera de horario no deja y sigue PENDIENTE', async () => {
      fijar(co('2026-12-09 10:00')); // otra semana (el 8 es festivo)
      const c = await crearCampana({ canal: 'WHATSAPP' }, tkAdminB);
      const ej = await llamar('POST', `/api/admin/campanas/${c.id_campana}/ejecutar`, tkAdminB);
      expect(ej.body.resumen).toMatchObject({ pendientes: 2 }); // Ana y Dani, sin WhatsApp en el servidor

      fijar(co('2026-12-09 19:30'));
      const tarde = await llamar('POST', `/api/admin/campanas/${c.id_campana}/destinatarios/${ana}/enviado`, tkAdminB, {});
      expect(tarde.status).toBe(409);
      expect(tarde.body.details).toMatchObject({ motivo: 'FUERA_DE_HORARIO', siguiente: co('2026-12-10 07:00').toISOString() });
      expect((await destinatarios(c.id_campana)).find((d) => d.id_miembro === ana)).toMatchObject({ estado_envio: 'PENDIENTE', motivo: 'FUERA_DE_HORARIO' });

      fijar(co('2026-12-10 09:00'));
      const [a, b] = await Promise.all([
        llamar('POST', `/api/admin/campanas/${c.id_campana}/destinatarios/${ana}/enviado`, tkAdminB, {}),
        llamar('POST', `/api/admin/campanas/${c.id_campana}/destinatarios/${ana}/enviado`, tkAdminB, {}),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 201]);
      expect([a.body.duplicado, b.body.duplicado].sort()).toEqual([false, true]);
      expect(a.body.mensaje).toBe(b.body.mensaje);
      expect((await uno('SELECT count(*)::int AS n FROM envio_mensaje WHERE id_campana = $1 AND id_miembro = $2', [c.id_campana, ana])).n).toBe(1);
      // A Carla (no es destinataria pendiente: quedo OMITIDO) no se le puede enviar.
      const omitida = await llamar('POST', `/api/admin/campanas/${c.id_campana}/destinatarios/${carla}/enviado`, tkAdminB, {});
      expect(omitida.status).toBe(409);
    });

    // El envio a mano armaba el texto sin fecha_fin ni dias_sin_venir: salia
    // «llevas varios días sin venir… Tu plan vence el .» y no lo que el panel
    // habia mostrado en la lista.
    test('WhatsApp a mano: el texto que se registra es el de la lista, con los dias sin venir y el vencimiento del plan', async () => {
      fijar(co('2026-12-16 10:00')); // otra semana
      // Dani vino por ultima vez hace 12 dias; su plan vencio hace 2 (beforeAll).
      await pool.query(
        `INSERT INTO checkin (id_miembro, id_gimnasio, fecha_hora, metodo, valido)
         VALUES ($1, $2, NOW() - INTERVAL '12 days', 'MANUAL', TRUE)`,
        [dani, gymB]
      );
      // Y le quedo activo un plan mas viejo: el vigente es el que vence de ultimo.
      await planVencido(dani, gymB, { venceEn: -40 });
      const { vence } = await uno("SELECT to_char(CURRENT_DATE - 2, 'DD/MM/YYYY') AS vence");
      const c = await crearCampana({
        canal: 'WHATSAPP',
        mensaje: 'Hola {primer_nombre}, llevas {dias_sin_venir} días sin venir. Tu plan vence el {fecha_vencimiento}.',
      }, tkAdminB);
      await llamar('POST', `/api/admin/campanas/${c.id_campana}/ejecutar`, tkAdminB);

      const lista = await llamar('GET', `/api/admin/campanas/${c.id_campana}/destinatarios`, tkAdminB);
      const deLaLista = lista.body.destinatarios.find((d) => d.id_miembro === dani);
      expect(deLaLista).toMatchObject({ estado_envio: 'PENDIENTE' });
      expect(deLaLista.mensaje.startsWith(`Hola Dani, llevas 12 días sin venir. Tu plan vence el ${vence}.`)).toBe(true);

      const r = await llamar('POST', `/api/admin/campanas/${c.id_campana}/destinatarios/${dani}/enviado`, tkAdminB, {});
      expect(r.status).toBe(201);
      expect(r.body.mensaje).toBe(deLaLista.mensaje);
      const guardado = await uno('SELECT mensaje_copiado FROM envio_mensaje WHERE id_campana = $1 AND id_miembro = $2', [c.id_campana, dani]);
      expect(guardado.mensaje_copiado).toBe(deLaLista.mensaje);
    });

    // Sin el modulo de WhatsApp el servidor no envia: quien tiene telefono
    // queda PENDIENTE para el envio a mano. A quien no tiene un telefono
    // valido tampoco se le puede escribir a mano: queda FALLIDO de una vez.
    test('sin WhatsApp en el servidor, quien no tiene un telefono valido queda FALLIDO y los demas PENDIENTE; reintentar no duplica', async () => {
      fijar(co('2026-12-23 10:00')); // otra semana
      const fabio = await crearMiembro(gymB, 'Fabio SinTelefono');
      await aceptar(fabio, gymB, ['WHATSAPP']);
      await pool.query("UPDATE miembro SET telefono = '12345' WHERE id_miembro = $1", [fabio]);
      const enviadosAntes = whatsapps.length;

      const c = await crearCampana({ canal: 'WHATSAPP' }, tkAdminB);
      const ej = await llamar('POST', `/api/admin/campanas/${c.id_campana}/ejecutar`, tkAdminB);
      expect(ej.status).toBe(200);
      expect(ej.body.resumen).toMatchObject({ enviados: 0, fallidos: 1, pendientes: 2 }); // Ana y Dani esperan el envio a mano
      const filas = await destinatarios(c.id_campana);
      expect(filas.find((d) => d.id_miembro === fabio)).toEqual({ id_miembro: fabio, estado_envio: 'FALLIDO', motivo: 'SIN_TELEFONO' });
      expect(filas.filter((d) => d.estado_envio === 'PENDIENTE').map((d) => d.id_miembro).sort()).toEqual([ana, dani].sort());

      // Tres reintentos a la vez: Fabio sigue con una sola constancia y no sale ningun WhatsApp.
      const reintentos = await Promise.all([1, 2, 3].map(() => llamar('POST', `/api/admin/campanas/${c.id_campana}/reintentar`, tkAdminB)));
      expect(reintentos.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await todas('SELECT estado FROM envio_mensaje WHERE id_campana = $1 AND id_miembro = $2', [c.id_campana, fabio])).toEqual([{ estado: 'FALLIDO' }]);
      expect((await destinatarios(c.id_campana)).filter((d) => d.estado_envio === 'PENDIENTE')).toHaveLength(2);
      expect(whatsapps.length).toBe(enviadosAntes);
    });
  });

  // ============================================================ vencimientos
  describe('avisos de vencimiento (jobs/expiracion.js)', () => {
    let eva, idPlan;
    const { runJob } = require('../src/jobs/expiracion');
    const wa = { sendWhatsAppText: jest.fn(async () => {}) };
    const avisosDeEva = () => todas(
      `SELECT dias_restantes, (enviado_at = ($2::timestamptz AT TIME ZONE current_setting('TimeZone'))) AS con_reloj
         FROM alerta_vencimiento_enviada WHERE id_miembro = $1`, [eva, legal.ahora()]
    );

    beforeAll(async () => {
      const g = await crearGimnasio(`Prueba Ley 2300 C ${sufijo}`);
      await pool.query('UPDATE gimnasio SET dias_aviso_vencimiento = 3 WHERE id_gimnasio = $1', [g]);
      eva = await crearMiembro(g, 'Eva Vence'); // sin aceptar mensajes comerciales
      // Fechas relativas a CURRENT_DATE de la base, que es con lo que el job
      // cuenta los dias (no la fecha de Colombia calculada en JS).
      idPlan = (await uno(
        `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, activo)
         VALUES ($1, $2, 'MENSUAL', CURRENT_DATE - 28, CURRENT_DATE + 2, TRUE) RETURNING id_plan_cobro`,
        [eva, g]
      )).id_plan_cobro;
      // A Eva ya le escribieron hoy (martes) por WhatsApp desde el panel.
      const canal = await uno("INSERT INTO canal_comunicacion (id_gimnasio, tipo, activo) VALUES ($1, 'WHATSAPP', TRUE) RETURNING id_canal", [g]);
      await pool.query(
        `INSERT INTO envio_mensaje (id_gimnasio, id_miembro, id_canal, mensaje_copiado, estado, fecha_envio)
         VALUES ($1, $2, $3, 'Hola Eva', 'ENVIADO', ($4::timestamptz AT TIME ZONE current_setting('TimeZone')))`,
        [g, eva, canal.id_canal, co('2026-11-17 08:30')]
      );
    });

    const deEva = (r) => r.detalle.filter((x) => x.id === eva);

    test('domingo: no envia nada', async () => {
      fijar(co('2026-11-22 10:00'));
      const r = await runJob({ whatsappClient: wa });
      expect(r.fueraDeHorario).toBe(true);
      expect(wa.sendWhatsAppText).not.toHaveBeenCalled();
    });

    test('martes: ya se le escribio hoy, asi que espera (FRECUENCIA)', async () => {
      const r = await runJob({ whatsappClient: wa });
      expect(deEva(r)).toEqual([expect.objectContaining({ motivo: 'FRECUENCIA' })]);
      expect(await avisosDeEva()).toEqual([]);
    });

    test('miercoles: sale el aviso, sin pedir el permiso comercial, con la hora del reloj', async () => {
      fijar(co('2026-11-18 10:00'));
      wa.sendWhatsAppText.mockClear();
      const r = await runJob({ whatsappClient: wa });
      expect(deEva(r)).toEqual([expect.objectContaining({ status: 'enviado' })]);
      expect(wa.sendWhatsAppText).toHaveBeenCalledWith('573001234567', expect.any(String));
      expect(await avisosDeEva()).toEqual([{ dias_restantes: 2, con_reloj: true }]);
      expect(idPlan).toBeTruthy();
    });
  });
});
