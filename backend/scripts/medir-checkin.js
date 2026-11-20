/**
 * scripts/medir-checkin.js
 *
 * RQNF-01: "el sistema debe procesar y confirmar cada check-in en un maximo de
 * 2 segundos". Mide el tiempo de respuesta de POST /api/admin/checkin con un
 * gimnasio de volumen realista (por defecto 200 miembros, con plan vigente y
 * 30 ingresos de historial cada uno).
 *
 * Levanta el router real de check-in en el mismo proceso, sobre la base de
 * datos de DB_* / DATABASE_URL, y lo llama por HTTP. Mide tres caminos:
 *
 *   documento       check-in manual (una consulta por documento)
 *   qr-directo      el QR guardado coincide con el leido
 *   qr-cifrado      el QR guardado esta cifrado: no coincide directo y el
 *                   backend descifra el QR de cada miembro del gimnasio (el
 *                   peor camino; lo miden los miembros del final de la lista)
 *
 * Seguridad: crea su propio gimnasio "Medicion RQNF-01" y lo borra al final
 * (todo cuelga de el con ON DELETE CASCADE). Solo corre contra una base LOCAL
 * (localhost o 127.0.0.1) y se niega a tocar cualquier otra.
 *
 * Uso (desde backend/, con una base local con las migraciones aplicadas):
 *
 *   DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=fitloyalty_test DB_USER=postgres \
 *   DB_PASSWORD=... DB_SSL=false JWT_SECRET=cualquiera \
 *   node scripts/medir-checkin.js [miembros] [repeticiones]
 *
 * Imprime una tabla con n, promedio, p50, p95 y maximo en ms, y termina con
 * codigo 1 si algun camino supera los 2000 ms en el p95.
 */
const crypto = require('crypto');
const express = require('express');

const MIEMBROS = Number(process.argv[2] || 200);
const REPETICIONES = Number(process.argv[3] || 60);
const LIMITE_MS = 2000;
const INGRESOS_POR_MIEMBRO = 30;

const host = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).hostname
  : (process.env.DB_HOST || 'localhost');
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Me niego: la base es "${host}" y este script solo corre contra una base local.`);
  process.exit(2);
}
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'medicion-local';
// Cada miembro se mide una sola vez por camino; sin esto el antirrebote
// devolveria "duplicado" sin pasar por el camino completo.
process.env.CHECKIN_VENTANA_SEG = '0';

const pool = require('../src/db/db');
const checkinRouter = require('../src/routes/checkin');
const { errorHandler } = require('../src/middleware/errorHandler');
const { generarToken } = require('../src/lib/auth-helpers');

// Misma cifra que routes/miembros.js al dar de alta un miembro.
const QR_KEY = crypto.scryptSync(process.env.QR_ENCRYPTION_KEY || 'FitLoyalty2024SecretKey', 'salt', 32);
function cifrar(texto) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', QR_KEY, iv);
  return `${iv.toString('hex')}:${c.update(texto, 'utf8', 'hex') + c.final('hex')}`;
}

function percentil(ordenado, p) {
  const i = Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1);
  return ordenado[Math.max(0, i)];
}

async function preparar() {
  const sufijo = crypto.randomBytes(3).toString('hex');
  const { rows: [gym] } = await pool.query(
    `INSERT INTO gimnasio (nombre, telefono, trial_ends_at)
     VALUES ($1, '3000000000', NULL) RETURNING id_gimnasio`,
    [`Medicion RQNF-01 ${sufijo}`]
  );
  const gymId = gym.id_gimnasio;

  const { rows: [admin] } = await pool.query(
    `INSERT INTO usuario (id_gimnasio, nombre, email, password_hash, id_rol, rol)
     VALUES ($1, 'Medicion', $2, 'x', 1, 'ADMINISTRADOR') RETURNING id_usuario`,
    [gymId, `medicion.${sufijo}@example.com`]
  );

  // Miembros con el QR cifrado, como los deja el alta real. Los de la primera
  // mitad se miden por documento y por QR directo (se les guarda el QR plano
  // en una segunda columna de la prueba); los de la segunda, por QR cifrado.
  const planos = [];
  for (let i = 0; i < MIEMBROS; i += 1) {
    const plano = `QR-${sufijo}-${i}`;
    planos.push(plano);
    // Los de indice par guardan el QR plano (camino directo); los impares, cifrado.
    const guardado = i % 2 === 0 ? plano : cifrar(plano);
    await pool.query(
      `INSERT INTO miembro (id_gimnasio, nombre, documento, codigo_qr)
       VALUES ($1, $2, $3, $4)`,
      [gymId, `Miembro ${i}`, `${sufijo}${String(i).padStart(4, '0')}`, guardado]
    );
  }
  await pool.query(
    `INSERT INTO plan_cobro (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin)
     SELECT id_miembro, id_gimnasio, 'MENSUAL', CURRENT_DATE - 5, CURRENT_DATE + 25
       FROM miembro WHERE id_gimnasio = $1`,
    [gymId]
  );
  await pool.query(
    `INSERT INTO checkin (id_miembro, id_gimnasio, fecha_hora)
     SELECT m.id_miembro, m.id_gimnasio, NOW() - (g || ' days')::interval - interval '3 hours'
       FROM miembro m, generate_series(1, $2) g
      WHERE m.id_gimnasio = $1`,
    [gymId, INGRESOS_POR_MIEMBRO]
  );

  const token = generarToken({
    id_usuario: admin.id_usuario, nombre: 'Medicion', email: 'medicion@example.com',
    rol: 'ADMINISTRADOR', id_gimnasio: gymId,
  });
  return { gymId, token, planos };
}

async function limpiar(gymId) {
  // checkin apunta al usuario sin CASCADE, asi que sus filas se borran primero;
  // el resto cuelga de miembro o de gimnasio con ON DELETE CASCADE.
  await pool.query('DELETE FROM checkin WHERE id_gimnasio = $1', [gymId]);
  await pool.query('DELETE FROM usuario WHERE id_gimnasio = $1', [gymId]);
  await pool.query('DELETE FROM gimnasio WHERE id_gimnasio = $1', [gymId]);
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api', checkinRouter);
  app.use(errorHandler);
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const { gymId, token, planos } = await preparar();
  console.log(`Gimnasio de prueba ${gymId}: ${MIEMBROS} miembros, ${INGRESOS_POR_MIEMBRO} ingresos cada uno.\n`);

  const llamar = async (body) => {
    const t0 = process.hrtime.bigint();
    const r = await fetch(`${base}/api/admin/checkin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const json = await r.json().catch(() => ({}));
    return { ms, status: r.status, json };
  };

  const documento = (i) => {
    const sufijo = planos[0].split('-')[1];
    return `${sufijo}${String(i).padStart(4, '0')}`;
  };

  const pares = []; // indices pares: QR plano guardado
  const impares = []; // indices impares: QR cifrado guardado
  for (let i = 0; i < MIEMBROS; i += 1) (i % 2 === 0 ? pares : impares).push(i);
  // Para el camino cifrado se miden los ultimos: el backend recorre la lista
  // hasta encontrarlos, asi que son el peor caso.
  const ultimosImpares = impares.slice(-REPETICIONES);

  const escenarios = [
    ['documento', pares.slice(0, REPETICIONES), (i) => ({ documento: documento(i), metodo: 'MANUAL' })],
    ['qr-directo', pares.slice(-REPETICIONES), (i) => ({ codigo: planos[i], metodo: 'QR' })],
    ['qr-cifrado', ultimosImpares, (i) => ({ codigo: cifrar(planos[i]), metodo: 'QR' })],
  ];

  // Calentamiento: la primera llamada paga la conexion y la compilacion.
  await llamar({ documento: documento(pares[pares.length - 1]), metodo: 'MANUAL' });

  const resultados = [];
  let fallo = false;
  try {
    for (const [nombre, indices, cuerpo] of escenarios) {
      const tiempos = [];
      let errores = 0;
      for (const i of indices) {
        const r = await llamar(cuerpo(i));
        if (r.status !== 201 && r.status !== 200) errores += 1;
        else tiempos.push(r.ms);
      }
      tiempos.sort((a, b) => a - b);
      resultados.push({
        camino: nombre,
        n: tiempos.length,
        errores,
        promedio: tiempos.reduce((s, x) => s + x, 0) / (tiempos.length || 1),
        p50: percentil(tiempos, 50),
        p95: percentil(tiempos, 95),
        max: tiempos[tiempos.length - 1],
      });
    }
  } finally {
    server.close();
    await limpiar(gymId);
    await pool.end();
  }

  const f = (x) => (Number.isFinite(x) ? x.toFixed(1).padStart(8) : '       -');
  console.log('camino       n  errores  promedio      p50      p95      max   (ms)');
  for (const r of resultados) {
    console.log(`${r.camino.padEnd(11)} ${String(r.n).padStart(3)}  ${String(r.errores).padStart(7)}  ${f(r.promedio)} ${f(r.p50)} ${f(r.p95)} ${f(r.max)}`);
    if (r.errores > 0 || !(r.p95 <= LIMITE_MS)) fallo = true;
  }
  console.log(`\nLimite RQNF-01: ${LIMITE_MS} ms. ${fallo ? 'NO CUMPLE.' : 'CUMPLE en los tres caminos (p95).'}`);
  process.exit(fallo ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Error midiendo:', e);
  try { await pool.end(); } catch (_) { /* ya cerrado */ }
  process.exit(1);
});
