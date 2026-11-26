/**
 * scripts/medir-multigimnasio.js
 *
 * RQNF-05: "la arquitectura SaaS debe soportar el registro de multiples
 * gimnasios (multitenancy) sin degradacion del rendimiento". Mide los tiempos
 * de UN gimnasio mientras crece la cantidad de gimnasios en la misma base.
 *
 * Cada gimnasio tiene 200 miembros con plan vigente y 30 ingresos cada uno. Con
 * 1, 10 y 50 gimnasios (o los que se pidan) mide, por HTTP y con la aplicacion
 * completa (src/index.js):
 *
 *   check-in        POST /api/admin/checkin por documento
 *   miembros        GET  /api/admin/miembros (la lista del panel)
 *   dashboard       GET  /api/admin/dashboard
 *   campana         GET  /api/admin/notificaciones (los avisos del panel)
 *   todos a la vez  el dashboard de todos los gimnasios en paralelo
 *   registro        POST /api/auth/signup, con el que se crea cada gimnasio
 *
 * Seguridad: solo corre contra una base LOCAL (mira el destino real de la
 * conexion, no solo la URL) cuyo nombre termine en _medicion, y se niega con
 * cualquier otra. Borra los gimnasios que crea.
 *
 * Uso (desde backend/, con una base local con las migraciones aplicadas):
 *
 *   DATABASE_URL=postgres://usuario:clave@127.0.0.1:5432/fitloyalty_medicion \
 *   node scripts/medir-multigimnasio.js [gimnasios=1,10,50] [repeticiones=60]
 *
 * Resultado y lectura: docs/evidencias/rqnf-05-escalabilidad.md.
 */
process.env.ENABLE_WHATSAPP = 'false';
process.env.DB_SSL = 'false';
process.env.BREVO_API_KEY = ''; // el registro no envia correos en la medicion
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'medicion-local';
process.env.CHECKIN_VENTANA_SEG = '0';

const crypto = require('crypto');
const ConnectionParameters = require('pg/lib/connection-parameters');

const ESCALONES = String(process.argv[2] || '1,10,50').split(',').map(Number);
const REPETICIONES = Number(process.argv[3] || 60);
const MIEMBROS = 200;
const INGRESOS = 30;

const pool = require('../src/db/db');
const destino = new ConnectionParameters(pool.options);
if (!['localhost', '127.0.0.1', '::1'].includes(destino.host) || !/_medicion$/.test(destino.database)) {
  console.error(`Me niego: "${destino.host}/${destino.database}". Solo una base local cuyo nombre termine en _medicion.`);
  process.exit(2);
}
console.log = () => {}; // los avisos de las rutas (el login escribe uno) no van en la tabla
const escribir = (t = '') => process.stdout.write(`${t}\n`);

const { app } = require('../src/index');

const SUFIJO = crypto.randomBytes(3).toString('hex');
const gimnasios = [];

const registros = []; // tiempos de POST /api/auth/signup

/** Registra un gimnasio por la API, como cualquier cliente nuevo, y le carga los datos. */
async function crearGimnasio(base) {
  const n = gimnasios.length;
  const t0 = process.hrtime.bigint();
  const r = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gymName: `Medicion ${SUFIJO}-${n}`, gymPhone: '3001234567', gymEmail: `gym.${SUFIJO}.${n}@example.com`,
      ownerName: 'Medicion Local', ownerEmail: `dueno.${SUFIJO}.${n}@example.com`, password: `Clave-${SUFIJO}-${n}`,
    }),
  });
  registros.push(Number(process.hrtime.bigint() - t0) / 1e6);
  const cuerpo = await r.json();
  if (r.status !== 201) throw new Error(`El registro respondio ${r.status}: ${JSON.stringify(cuerpo)}`);
  const { rows: [g] } = await pool.query('SELECT id_gimnasio FROM gimnasio WHERE nombre = $1', [`Medicion ${SUFIJO}-${n}`]);
  await pool.query(
    `INSERT INTO miembro (id_gimnasio, nombre, documento, telefono, codigo_qr)
     SELECT $1, 'Miembro ' || i, $2 || lpad(i::text, 4, '0'), '3001112233', 'QR-' || $2 || '-' || i
       FROM generate_series(0, $3 - 1) i`,
    [g.id_gimnasio, `${SUFIJO}${n}x`, MIEMBROS]
  );
  await pool.query(
    `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin)
     SELECT id_miembro, id_gimnasio, 'MENSUAL', CURRENT_DATE - 5, CURRENT_DATE + 25 FROM miembro WHERE id_gimnasio = $1`,
    [g.id_gimnasio]
  );
  await pool.query(
    `INSERT INTO checkin (id_miembro, id_gimnasio, fecha_hora)
     SELECT m.id_miembro, m.id_gimnasio, NOW() - (d || ' days')::interval - interval '3 hours'
       FROM miembro m, generate_series(1, $2) d WHERE m.id_gimnasio = $1`,
    [g.id_gimnasio, INGRESOS]
  );
  gimnasios.push({
    id: g.id_gimnasio,
    documento: (i) => `${SUFIJO}${n}x${String(i).padStart(4, '0')}`,
    token: cuerpo.token,
  });
}

async function borrarTodo() {
  const { rows } = await pool.query("SELECT id_gimnasio FROM gimnasio WHERE nombre LIKE $1", [`Medicion ${SUFIJO}%`]);
  for (const { id_gimnasio: id } of rows) {
    await pool.query('UPDATE gimnasio SET id_dueno = NULL WHERE id_gimnasio = $1', [id]);
    // Las tablas que apuntan al gimnasio o a su personal sin ON DELETE CASCADE.
    for (const tabla of ['checkin', 'plan_cobro', 'notificacion', 'auditoria', 'configuracion_gimnasio', 'miembro', 'usuario', 'gimnasio']) {
      await pool.query(`DELETE FROM ${tabla} WHERE id_gimnasio = $1`, [id]);
    }
  }
}

const percentil = (ord, p) => ord[Math.max(0, Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1))];

async function main() {
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const pedir = async (g, metodo, ruta, cuerpo) => {
    const t0 = process.hrtime.bigint();
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(g ? { Authorization: `Bearer ${g.token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    await r.text();
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, ok: r.status === 200 || r.status === 201, status: r.status };
  };
  const medir = async (fn, n = REPETICIONES) => {
    const tiempos = [];
    let errores = 0;
    for (let i = 0; i < n; i += 1) {
      const r = await fn(i);
      if (r.ok) tiempos.push(r.ms); else errores += 1;
    }
    return { tiempos, errores };
  };

  let errores = 0;
  const p95 = {};
  try {
    escribir(`PostgreSQL ${(await pool.query('SHOW server_version')).rows[0].server_version} · Node ${process.version} · ${MIEMBROS} miembros y ${MIEMBROS * INGRESOS} ingresos por gimnasio · ${REPETICIONES} repeticiones`);
    escribir('| Gimnasios | Miembros | Ingresos | Qué | n | Errores | Promedio | p50 | p95 | Máximo |');
    escribir('|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|');
    for (const total of ESCALONES) {
      while (gimnasios.length < total) await crearGimnasio(base);
      await pool.query('ANALYZE');
      const g = gimnasios[0];
      const casos = {
        'check-in': (i) => pedir(g, 'POST', '/api/admin/checkin', { documento: g.documento(i % MIEMBROS), metodo: 'MANUAL' }),
        miembros: () => pedir(g, 'GET', '/api/admin/miembros?page=0&pageSize=100'),
        dashboard: () => pedir(g, 'GET', '/api/admin/dashboard'),
        campana: () => pedir(g, 'GET', '/api/admin/notificaciones'),
      };
      for (const fn of Object.values(casos)) for (let i = 0; i < 5; i += 1) await fn(MIEMBROS - 1 - i); // calentamiento
      const filas = [];
      for (const [nombre, fn] of Object.entries(casos)) filas.push([nombre, await medir(fn)]);
      const juntos = { tiempos: [], errores: 0 };
      for (let ronda = 0; ronda < 5; ronda += 1) {
        for (const r of await Promise.all(gimnasios.map((x) => pedir(x, 'GET', '/api/admin/dashboard')))) {
          if (r.ok) juntos.tiempos.push(r.ms); else juntos.errores += 1;
        }
      }
      filas.push([`dashboard de los ${total} a la vez`, juntos]);
      filas.push(['registro de un gimnasio', { tiempos: registros.splice(0), errores: 0 }]);
      for (const [nombre, { tiempos, errores: e }] of filas) {
        errores += e;
        const o = [...tiempos].sort((a, b) => a - b);
        const f = (x) => (Number.isFinite(x) ? x.toFixed(1).replace('.', ',') : '—');
        (p95[nombre] ||= []).push(percentil(o, 95));
        escribir(`| ${total} | ${total * MIEMBROS} | ${total * MIEMBROS * INGRESOS} | ${nombre} | ${o.length} | ${e} | ${f(o.reduce((s, x) => s + x, 0) / o.length)} | ${f(percentil(o, 50))} | ${f(percentil(o, 95))} | ${f(o[o.length - 1])} |`);
      }
    }
  } finally {
    server.close();
    await borrarTodo();
    await pool.end();
  }
  escribir(`Errores: ${errores}`);
  process.exit(errores > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try { await borrarTodo(); } catch (_) { /* ya se aviso */ }
  process.exit(1);
});
