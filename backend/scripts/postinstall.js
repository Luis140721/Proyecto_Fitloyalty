#!/usr/bin/env node
/**
 * scripts/postinstall.js
 *
 * Se ejecuta automaticamente despues de `npm install`. Garantiza que
 * Chrome y chrome-headless-shell esten descargados para Puppeteer.
 *
 * Por que existe:
 *   En Render free tier el cache de puppeteer a veces conserva el
 *   marker file pero NO el binario real (sobre todo despues de
 *   clearCache). Eso rompe `puppeteer.executablePath()` con
 *   "Browser was not found".
 *
 *   Ademas de chrome (full), instalamos chrome-headless-shell como
 *   fallback. Es mas pequeno (~80MB vs 250MB), arranca mas rapido,
 *   y suele sobrevivir mejor al cache de Render.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const log = (...a) => console.log('[postinstall]', ...a);

function listCache() {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const cacheDir = path.join(home, '.cache', 'puppeteer');
    log('Cache dir:', cacheDir);
    if (fs.existsSync(cacheDir)) {
        try {
            const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
            for (const e of entries) {
                const full = path.join(cacheDir, e.name);
                if (e.isDirectory()) {
                    log('  DIR ', full);
                    try {
                        const sub = fs.readdirSync(full);
                        log('       contiene:', sub.slice(0, 10).join(', '), sub.length > 10 ? `... (+${sub.length - 10})` : '');
                    } catch {}
                } else {
                    log('  FILE', full);
                }
            }
        } catch (e) {
            log('No se pudo leer cache:', e.message);
        }
    } else {
        log('Cache dir no existe');
    }
}

try {
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        log('puppeteer no instalado, saltando');
        process.exit(0);
    }

    const expectedPath = puppeteer.executablePath();
    log('Chrome esperado en:', expectedPath);

    listCache();

    if (fs.existsSync(expectedPath)) {
        log('Chrome (full) ya esta OK');
    } else {
        log('Chrome (full) NO encontrado, instalando...');
        try {
            execSync('npx puppeteer browsers install chrome', {
                stdio: 'inherit',
                cwd: path.dirname(__dirname),
                timeout: 240000,
            });
            log('Chrome (full) instalado OK');
        } catch (e) {
            log('Fallback chrome (full):', e.message);
        }
    }

    // Tambien instalamos chrome-headless-shell como plan B (mas pequeno)
    try {
        log('Instalando chrome-headless-shell como fallback...');
        execSync('npx puppeteer browsers install chrome-headless-shell', {
            stdio: 'inherit',
            cwd: path.dirname(__dirname),
            timeout: 240000,
        });
        log('chrome-headless-shell instalado OK');
    } catch (e) {
        log('chrome-headless-shell fallo (no es critico):', e.message);
    }

    listCache();
} catch (err) {
    console.error('[postinstall] Error general:', err.message);
}
process.exit(0);
