/**
 * Regresion: la fecha "Vence" del dashboard y del plan del miembro salia un
 * dia antes en Colombia con el backend en UTC (src/fechas.js).
 *
 * develop aun no tiene Vitest en el frontend: este archivo corre con el runner
 * de Node (`node --test tests/fechas.test.js` desde frontend/) y, cuando llegue
 * Vitest (su include es tests/**\/*.test.{js,jsx}), con Vitest sin tocarlo.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fechaDia, formatearFechaDia } from '../src/fechas.js';

const { describe, it } = process.env.VITEST ? await import('vitest') : await import('node:test');

// Colombia: UTC-5 todo el ano. Se fija antes de crear cualquier Date.
process.env.TZ = 'America/Bogota';

// Lo que manda la API por una columna DATE del 30/10/2026 segun la zona del servidor.
const DESDE_RENDER = '2026-10-30T00:00:00.000Z';   // servidor en UTC
const DESDE_BOGOTA = '2026-10-30T05:00:00.000Z';   // servidor en America/Bogota

describe('fechas solo-dia con el navegador en America/Bogota', () => {
  it('should move 30/10 to 29/10 when new Date() reads the API date in Colombia (control of the zone)', () => {
    // Act y Assert: si esto falla, la zona no quedo fijada y el resto no probaria nada.
    assert.equal(new Date(DESDE_RENDER).toLocaleDateString('es-CO'), '29/10/2026');
  });

  it('should show the day saved in the DB when the backend runs in UTC', () => {
    // Act y Assert
    assert.equal(formatearFechaDia(DESDE_RENDER), '30/10/2026');
  });

  it('should show the same day when the backend runs in Bogota or sends a plain AAAA-MM-DD', () => {
    // Act y Assert
    assert.equal(formatearFechaDia(DESDE_BOGOTA), '30/10/2026');
    assert.equal(formatearFechaDia('2026-10-30'), '30/10/2026');
  });

  it('should keep the year when the date is the 1st of January', () => {
    // Act y Assert
    assert.equal(formatearFechaDia('2027-01-01T00:00:00.000Z'), '1/1/2027');
  });

  it('should give the local midnight that the plan form expects when fechaDia gets an API date', () => {
    // Act
    const f = fechaDia(DESDE_RENDER);

    // Assert
    assert.deepEqual(
      [f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes()],
      [2026, 9, 30, 0, 0],
    );
  });

  it('should give null and an empty text when there is no valid date', () => {
    // Act y Assert: cada valor que no es una fecha
    for (const valor of [null, undefined, '', 'pronto', 20261030]) {
      assert.equal(fechaDia(valor), null);
      assert.equal(formatearFechaDia(valor), '');
    }
  });
});

describe('las paginas no pasan columnas DATE por new Date()', () => {
  // Columnas DATE que muestra el front (backend/migrations). sesion.fecha_inicio
  // es TIMESTAMP, pero el front no la usa.
  const COLUMNA_DATE = /new Date\([^)]*\b(fecha_inicio|fecha_fin|congelado_desde|fecha_nacimiento)\b/;
  // Ruta y no URL: con jsdom (Vitest) el URL global no es el de Node y fs lo rechaza.
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

  it('should use fechaDia or formatearFechaDia when a page shows a DATE column', () => {
    // Arrange
    const hallazgos = [];

    // Act: cada linea de src que pasa una columna DATE por new Date()
    for (const archivo of readdirSync(src, { recursive: true })) {
      if (!/\.jsx?$/.test(archivo)) continue;
      readFileSync(join(src, archivo), 'utf8')
        .split(/\r?\n/)
        .forEach((linea, i) => {
          if (COLUMNA_DATE.test(linea)) hallazgos.push(`src/${archivo.replace(/\\/g, '/')}:${i + 1}: ${linea.trim()}`);
        });
    }

    // Assert
    assert.deepEqual(hallazgos, []);
  });
});
