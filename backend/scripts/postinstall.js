#!/usr/bin/env node
/**
 * scripts/postinstall.js
 *
 * Se ejecuta automaticamente despues de `npm install` (definido en
 * package.json -> scripts.postinstall). Su unico trabajo es garantizar
 * que Chrome este descargado para Puppeteer.
 *
 * Por que existe:
 *   En Render free tier, el cache de puppeteer (~/.cache/puppeteer/) a
 *   veces conserva el marker file pero NO el binario de Chrome real
 *   (especialmente despues de un clearCache). Esto hace que
 *   `puppeteer.executablePath()` devuelva un path que apunta a un
 *   archivo inexistente, y Chrome falla con "Browser was not found".
 *
 *   Solucion: despues de instalar deps, forzar la descarga/verificacion
 *   del Chrome con el comando oficial de puppeteer. Si falla (sin red,
 *   etc.) no rompe el build (exit 0).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const log = (...a) => console.log('[postinstall]', ...a);

try {
    // Detecta la version de Chrome que Puppeteer espera
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        // puppeteer no instalado, no hacemos nada
        log('puppeteer no instalado, saltando');
        process.exit(0);
    }

    const expectedPath = puppeteer.executablePath();
    log('Chrome esperado en:', expectedPath);

    if (fs.existsSync(expectedPath)) {
        log('Chrome ya esta instalado, nada que hacer');
        process.exit(0);
    }

    log('Chrome NO encontrado, descargando...');
    execSync('npx puppeteer browsers install chrome', {
        stdio: 'inherit',
        cwd: path.dirname(__dirname),
    });
    log('Chrome instalado OK');
} catch (err) {
    // No rompemos el build si falla la descarga (sin red, etc.)
    console.error('[postinstall] Error al instalar Chrome:', err.message);
    console.error('[postinstall] El deploy continua, pero WhatsApp no funcionara hasta que se arregle.');
}
process.exit(0);
