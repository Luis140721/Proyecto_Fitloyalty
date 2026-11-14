// Recorrido de RQNF-06 contra una copia local aislada de FitLoyalty (ver docs/evidencias/rqnf-06-navegadores.md).
// Uso: RQNF06_BD=postgres://...@127.0.0.1:<puerto>/<base> RQNF06_DIR=<carpeta con los navegadores> \
//      node recorrido.js [chrome157 chrome156 edge157 firefox160 firefox159]
// Necesita puppeteer-core 24 y pg. Las capturas quedan en <RQNF06_DIR>/capturas y el resumen en resultados.json.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const { Client } = require(process.env.RQNF06_PG || 'pg');

const BASE = process.env.RQNF06_FRONT || 'http://localhost:5290';
const NAV = process.env.RQNF06_DIR || path.resolve(__dirname, '..');
const SALIDA = path.join(NAV, 'capturas');
// Solo una base local desechable con datos de seed_dev.js y seed_demo.js.
const BD = process.env.RQNF06_BD;
{
  const u = new URL(BD || 'x://');
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || u.searchParams.has('host')) {
    throw new Error('RQNF06_BD debe apuntar a una base local de prueba');
  }
}
const NAVEGADORES = {
  chrome157: { browser: 'chrome', exe: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  chrome156: { browser: 'chrome', exe: path.join(NAV, 'chrome-156/chrome-win64/chrome.exe') },
  edge157: { browser: 'chrome', exe: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', conectar: true },
  firefox160: { browser: 'firefox', exe: path.join(NAV, 'firefox-160.0/core/firefox.exe') },
  firefox159: { browser: 'firefox', exe: path.join(NAV, 'firefox-159.0.1/core/firefox.exe') },
};
const ORDEN = Object.keys(NAVEGADORES);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarTexto(page, texto, ms = 15000) {
  await page.waitForFunction((t) => document.body && document.body.innerText.includes(t), { timeout: ms }, texto);
}

async function campoPorEtiqueta(page, etiqueta, raiz = 'body') {
  const h = await page.evaluateHandle((et, r) => {
    const base = document.querySelector(r) || document.body;
    const l = [...base.querySelectorAll('label.field')].find((x) => (x.querySelector('.field-label')?.textContent || '').trim().startsWith(et));
    return l ? l.querySelector('input, select, textarea') : null;
  }, etiqueta, raiz);
  const el = h.asElement();
  if (!el) throw new Error(`No hay campo «${etiqueta}»`);
  return el;
}

async function escribir(el, texto) {
  // Enfocar en vez de hacer clic: un clic fuera de la vista puede caer en el fondo del modal y cerrarlo.
  await el.evaluate((e) => { e.scrollIntoView({ block: 'center' }); e.focus(); e.select && e.select(); });
  await el.press('Backspace');
  await el.type(texto, { delay: 15 });
}

async function listo(page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForFunction(() => !document.body.innerText.includes('Actualizando…') && !document.body.innerText.includes('Cargando'), { timeout: 20000 }).catch(() => {});
  await esperar(1200);
}

async function captura(page, clave, nombre) {
  await listo(page);
  const archivo = path.join(SALIDA, `${clave}-${nombre}.png`);
  await page.screenshot({ path: archivo });
  return path.basename(archivo);
}

// Se compara por id y no por fecha: fecha_hora es timestamp sin zona y una fecha de JS puede caer horas antes o después.
async function maxCheckin(bd) {
  const { rows } = await bd.query('SELECT COALESCE(MAX(id_checkin), 0) AS id FROM checkin');
  return Number(rows[0].id);
}

async function ultimoCheckin(bd, idMiembro, desdeId) {
  const { rows } = await bd.query(
    'SELECT metodo FROM checkin WHERE id_miembro = $1 AND id_checkin > $2 ORDER BY id_checkin DESC',
    [idMiembro, desdeId],
  );
  return { fila: rows[0] || null, filas: rows.length };
}

async function mensajeCheckin(page) {
  return page.evaluate(() => [...document.querySelectorAll('.alert, [class*="feedback"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' / ').slice(0, 160));
}

async function correr(clave, miembros, bd) {
  const cfg = NAVEGADORES[clave];
  const res = { navegador: clave, pasos: [], erroresConsola: [], capturas: [] };
  const paso = (nombre, ok, detalle = '') => { res.pasos.push({ nombre, ok, detalle }); console.log(`  ${ok ? 'OK ' : 'MAL'} ${nombre} ${detalle}`); };
  let browser;
  if (cfg.conectar) {
    // Edge sale con código 0 si Puppeteer lo lanza; se arranca aparte y se conecta por el puerto de depuración.
    const perfil = fs.mkdtempSync(path.join(NAV, 'perfil-'));
    const puerto = 9400 + ORDEN.indexOf(clave);
    spawn(cfg.exe, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--window-size=1366,768', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40 && !browser; i += 1) {
      await esperar(500);
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${puerto}`, defaultViewport: { width: 1366, height: 768 } }).catch(() => null);
    }
    if (!browser) throw new Error('No se pudo conectar con Edge');
  } else {
    browser = await puppeteer.launch({
      browser: cfg.browser,
      executablePath: cfg.exe,
      headless: true,
      defaultViewport: { width: 1366, height: 768 },
      args: cfg.browser === 'chrome' ? ['--no-first-run', '--no-default-browser-check', '--window-size=1366,768'] : [],
    });
  }
  res.version = await browser.version();
  console.log(`== ${clave}: ${res.version}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  page.on('console', (m) => { if (m.type() === 'error') res.erroresConsola.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => res.erroresConsola.push(`pageerror: ${String(e.message || e).slice(0, 300)}`));
  try {
    // Portada
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
    res.capturas.push(await captura(page, clave, 'portada'));
    paso('portada', true);

    // Inicio de sesión
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
    await (await page.$('input[type="email"]')).type('dev@fitloyalty.local', { delay: 10 });
    await (await page.$('input[placeholder="••••••••"]')).type('dev123456', { delay: 10 });
    res.capturas.push(await captura(page, clave, 'login'));
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith('/admin'), { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
    paso('login', true, 'redirige a /admin');

    // Dashboard con datos
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => [...document.querySelectorAll('.kpi-value')].some((k) => /\d/.test(k.textContent)), { timeout: 20000 });
    // Los indicadores cuentan desde 0 con una animación: se leen cuando dejan de cambiar.
    let kpis = '';
    for (let i = 0; i < 20; i += 1) {
      await esperar(700);
      const ahora = await page.$$eval('.kpi-value', (ks) => ks.map((k) => k.textContent.trim()).join(' | '));
      if (ahora === kpis) break;
      kpis = ahora;
    }
    res.capturas.push(await captura(page, clave, 'dashboard'));
    paso('dashboard', true, `KPI: ${kpis}`);

    // Miembros
    await page.goto(`${BASE}/admin/miembros`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('tr.member-row-clickable', { timeout: 20000 });
    const filas = (await page.$$('tr.member-row-clickable')).length;
    res.capturas.push(await captura(page, clave, 'miembros'));
    paso('miembros', filas > 0, `${filas} filas`);

    // Edición de un miembro: cambia el teléfono y guarda
    const edit = miembros.editar;
    const telefono = `30000001${String(ORDEN.indexOf(clave)).padStart(2, '0')}`;
    const fila = await page.evaluateHandle((doc) => [...document.querySelectorAll('tr.member-row-clickable')].find((tr) => tr.innerText.includes(doc)), edit.documento);
    await fila.asElement().click();
    await page.waitForSelector('#miembros-edit-form', { timeout: 15000 });
    await escribir(await page.$('#miembros-edit-form input[placeholder="3001234567"]'), telefono);
    // La captura muestra el modal con el teléfono nuevo escrito; la base confirma que se guardó.
    res.capturas.push(await captura(page, clave, 'edicion-miembro'));
    await page.waitForSelector('button[form="miembros-edit-form"]:not([disabled])', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('button[form="miembros-edit-form"]').click());
    await esperarTexto(page, 'Miembro actualizado.');
    const { rows: ed } = await bd.query('SELECT telefono FROM miembro WHERE id_miembro = $1', [edit.id_miembro]);
    paso('edición de miembro', ed[0]?.telefono === telefono, `teléfono en BD: ${ed[0]?.telefono}`);

    // Alta de miembro
    await page.goto(`${BASE}/admin/miembros`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Nuevo miembro')).click());
    await page.waitForSelector('form.auth-form input[placeholder="Nombre y apellido"]', { timeout: 15000 });
    const docNuevo = `77${Date.now().toString().slice(-7)}`;
    await escribir(await page.$('form.auth-form input[placeholder="Nombre y apellido"]'), `Prueba ${clave}`);
    await escribir(await page.$('form.auth-form input[placeholder="123456789"]'), docNuevo);
    await escribir(await page.$('form.auth-form input[placeholder="3001234567"]'), '3000000999');
    // El formulario va por secciones; la fecha de inicio arranca en hoy (MiembrosPage.jsx, hoyEnTexto).
    const seccion = async (nombre) => {
      await page.evaluate((n) => [...document.querySelectorAll('button[type="button"]')].find((b) => b.textContent.trim() === n).click(), nombre);
      await esperar(400);
    };
    await seccion('Plan y cobros');
    await escribir(await campoPorEtiqueta(page, 'Valor total del plan', 'form.auth-form'), '80000');
    await seccion('Términos');
    await page.waitForSelector('form.auth-form input[type="checkbox"]', { timeout: 10000 });
    // Términos y autorización de datos: las dos casillas son obligatorias.
    for (const casilla of await page.$$('form.auth-form input[type="checkbox"]')) {
      if (!(await casilla.evaluate((c) => c.checked))) await casilla.click();
    }
    await page.evaluate(() => [...document.querySelectorAll('form.auth-form button[type="submit"]')].find((b) => b.textContent.includes('Crear miembro')).click());
    await esperarTexto(page, 'Miembro creado exitosamente');
    const { rows: alta } = await bd.query('SELECT id_miembro FROM miembro WHERE documento = $1', [docNuevo]);
    res.capturas.push(await captura(page, clave, 'alta-miembro'));
    paso('alta de miembro', alta.length === 1, `documento ${docNuevo}`);

    // Check-in manual por documento con Enter
    await page.goto(`${BASE}/admin/checkin`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[placeholder="79123456"]', { timeout: 15000 });
    let desde = await maxCheckin(bd);
    await (await page.$('input[placeholder="79123456"]')).type(miembros.manual.documento, { delay: 15 });
    await page.keyboard.press('Enter');
    await esperarTexto(page, miembros.manual.nombre.split(' ')[0]);
    await esperar(1500);
    let ck = await ultimoCheckin(bd, miembros.manual.id_miembro, desde);
    let msg = await mensajeCheckin(page);
    res.capturas.push(await captura(page, clave, 'checkin-manual'));
    paso('check-in manual', ck.fila?.metodo === 'MANUAL' && ck.filas === 1 && !msg.includes('ya registro'), `filas nuevas: ${ck.filas}, método: ${ck.fila?.metodo || '-'}; pantalla: ${msg}`);

    // Check-in por QR: el lector escribe el código y Enter
    desde = await maxCheckin(bd);
    await page.goto(`${BASE}/admin/checkin`, { waitUntil: 'networkidle2' });
    const qr = await page.waitForSelector('input[placeholder="Escanea o pega el código QR aquí"]', { timeout: 15000 });
    await qr.type(miembros.qr.codigo_qr, { delay: 2 });
    await page.keyboard.press('Enter');
    await esperarTexto(page, miembros.qr.nombre.split(' ')[0]);
    await esperar(1500);
    ck = await ultimoCheckin(bd, miembros.qr.id_miembro, desde);
    msg = await mensajeCheckin(page);
    res.capturas.push(await captura(page, clave, 'checkin-qr'));
    paso('check-in QR', ck.fila?.metodo === 'QR' && ck.filas === 1 && !msg.includes('ya registro'), `filas nuevas: ${ck.filas}, método: ${ck.fila?.metodo || '-'}; pantalla: ${msg}`);

    // Configuración: cambia un valor y guarda
    await page.goto(`${BASE}/admin/config`, { waitUntil: 'networkidle2' });
    const num = await page.waitForSelector('input[type="number"]', { timeout: 15000 });
    const valor = String(10 + ORDEN.indexOf(clave));
    await escribir(num, valor);
    await page.evaluate(() => [...document.querySelectorAll('button[type="submit"]')].find((b) => b.textContent.includes('Guardar Configuración')).click());
    await esperarTexto(page, 'Configuración guardada exitosamente.');
    res.capturas.push(await captura(page, clave, 'configuracion'));
    paso('configuración', true, `primer campo numérico = ${valor}`);
  } catch (e) {
    paso('ERROR', false, e.message);
    try { await page.screenshot({ path: path.join(SALIDA, `${clave}-error.png`) }); } catch {}
  } finally {
    await browser.close();
  }
  return res;
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const claves = process.argv.slice(2).length ? process.argv.slice(2) : ORDEN;
  const bd = new Client({ connectionString: BD });
  await bd.connect();
  // Miembros activos con plan vigente; cada navegador usa los suyos para no chocar con la ventana antirrebote de 90 s.
  const { rows } = await bd.query(`
    SELECT m.id_miembro, m.nombre, m.documento, m.codigo_qr
      FROM miembro m
      JOIN LATERAL (SELECT fecha_fin FROM plan_cobro WHERE id_miembro = m.id_miembro ORDER BY fecha_fin DESC LIMIT 1) p ON TRUE
     WHERE m.activo AND p.fecha_fin >= CURRENT_DATE AND m.documento LIKE 'DEMO-%'
     ORDER BY p.fecha_fin DESC`);
  if (rows.length < ORDEN.length * 2) throw new Error(`Solo hay ${rows.length} miembros vigentes`);
  const resultados = [];
  for (const clave of claves) {
    const i = ORDEN.indexOf(clave);
    const miembros = { manual: rows[i * 2], qr: rows[i * 2 + 1], editar: rows[i * 2] };
    resultados.push(await correr(clave, miembros, bd).catch((e) => ({ navegador: clave, pasos: [{ nombre: 'ARRANQUE', ok: false, detalle: e.message.split('\n')[0] }], erroresConsola: [], capturas: [] })));
  }
  await bd.end();
  const archivo = path.join(NAV, 'resultados.json');
  const previos = fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')) : {};
  for (const r of resultados) previos[r.navegador] = r;
  fs.writeFileSync(archivo, JSON.stringify(previos, null, 2));
  console.log('Resultados en', archivo);
})().catch((e) => { console.error('FALLA', e); process.exit(1); });
