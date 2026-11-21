/**
 * RQNF-04: en la pantalla de Check-in el cursor arranca en el campo del QR.
 * Quien escribía ahí el documento recibía «Miembro no encontrado», porque se
 * mandaba como código QR. Ahora se registra por documento (src/lib/checkin.js).
 *
 * Corre con el runner de Node (`node --test tests/checkin.test.js` desde
 * frontend/) y con Vitest sin tocarlo, igual que tests/fechas.test.js.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarPayloadCheckin, pareceDocumento } from '../src/lib/checkin.js';

const { describe, it } = process.env.VITEST ? await import('vitest') : await import('node:test');

describe('documento escrito en el campo del QR', () => {
  it('se registra por documento y como ingreso manual', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: '79123456', documento: '', metodo: 'QR' }),
      { metodo: 'MANUAL', documento: '79123456' },
    );
  });

  it('quita los espacios de los extremos', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: '  79123456 ', metodo: 'QR' }),
      { metodo: 'MANUAL', documento: '79123456' },
    );
  });

  it('acepta un NIT con dígito de verificación', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: '900123456-7', metodo: 'QR' }),
      { metodo: 'MANUAL', documento: '900123456-7' },
    );
  });

  it('respeta el método elegido si no es QR', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: '79123456', metodo: 'CODIGOBARRAS' }),
      { metodo: 'CODIGOBARRAS', documento: '79123456' },
    );
    assert.deepEqual(
      armarPayloadCheckin({ codigo: '79123456', metodo: 'MANUAL' }),
      { metodo: 'MANUAL', documento: '79123456' },
    );
  });
});

describe('los códigos QR siguen yendo como código', () => {
  it('QR fijo «FL-<gimnasio>-<código>»', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: 'FL-1-A83T7U7', metodo: 'QR' }),
      { metodo: 'QR', codigo: 'FL-1-A83T7U7' },
    );
  });

  it('QR dinámico «FLD<id>T<código>», aunque termine en números', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: 'FLD43T12345678', metodo: 'QR' }),
      { metodo: 'QR', codigo: 'FLD43T12345678' },
    );
  });

  it('QR cifrado (hexadecimal con «:»), aunque solo tenga dígitos', () => {
    const cifrado = '12345678901234567890123456789012:4567890123456789';
    assert.deepEqual(
      armarPayloadCheckin({ codigo: cifrado, metodo: 'QR' }),
      { metodo: 'QR', codigo: cifrado },
    );
  });

  it('un número muy corto no se toma como documento', () => {
    assert.equal(pareceDocumento('123'), false);
    assert.deepEqual(armarPayloadCheckin({ codigo: '123', metodo: 'QR' }), { metodo: 'QR', codigo: '123' });
  });

  it('el campo del QR tiene prioridad sobre «O por documento» al pulsar «Registrar»', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: 'FL-1-A83T7U7', documento: '79123456', metodo: 'QR' }),
      { metodo: 'QR', codigo: 'FL-1-A83T7U7' },
    );
  });
});

describe('campo «O por documento»', () => {
  it('registra por documento como ingreso manual', () => {
    assert.deepEqual(
      armarPayloadCheckin({ documento: '79123456', metodo: 'QR' }),
      { metodo: 'MANUAL', documento: '79123456' },
    );
  });

  it('el Enter de ese campo usa el documento aunque haya un QR escrito', () => {
    assert.deepEqual(
      armarPayloadCheckin({ codigo: 'FL-1-A83T7U7', documento: '79123456', metodo: 'QR', porDocumento: true }),
      { metodo: 'MANUAL', documento: '79123456' },
    );
  });

  it('un documento con letras (pasaporte) se manda tal cual', () => {
    assert.deepEqual(
      armarPayloadCheckin({ documento: 'AB123456', metodo: 'QR' }),
      { metodo: 'MANUAL', documento: 'AB123456' },
    );
  });
});

describe('sin nada que registrar', () => {
  it('devuelve null con los dos campos vacíos o solo con espacios', () => {
    assert.equal(armarPayloadCheckin({ codigo: '', documento: '', metodo: 'QR' }), null);
    assert.equal(armarPayloadCheckin({ codigo: '   ', documento: ' ', metodo: 'QR' }), null);
    assert.equal(armarPayloadCheckin(), null);
  });

  it('el Enter de «O por documento» vacío no manda el QR', () => {
    assert.equal(armarPayloadCheckin({ codigo: 'FL-1-A83T7U7', documento: '', metodo: 'QR', porDocumento: true }), null);
  });
});

describe('la pantalla usa esta regla', () => {
  it('CheckinPage arma el envío con armarPayloadCheckin', () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const pagina = readFileSync(join(aqui, '..', 'src', 'pages', 'CheckinPage.jsx'), 'utf8');
    assert.match(pagina, /import \{ armarPayloadCheckin \} from '\.\.\/lib\/checkin'/);
    assert.match(pagina, /armarPayloadCheckin\(\{ codigo, documento, metodo, porDocumento \}\)/);
  });
});
