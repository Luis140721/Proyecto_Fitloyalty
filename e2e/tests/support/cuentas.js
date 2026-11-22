import { randomInt, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { API_URL } from './entorno.js';

/**
 * Crea por API un gimnasio con su dueno, con correo y clave unicos, y devuelve
 * las credenciales para iniciar sesion por la UI. Asi el test no depende de
 * datos previos y puede correr en paralelo o dos veces seguidas.
 */
export async function crearDueno(request) {
  const sufijo = randomUUID().slice(0, 8);
  const cuenta = {
    nombre: `Sofia ${sufijo}`,
    correo: `login.${sufijo}@example.com`,
    clave: `clave${sufijo}1`,
  };
  const respuesta = await request.post(`${API_URL}/auth/signup`, {
    data: {
      gymName: `Gimnasio Login ${sufijo}`,
      gymPhone: '3001234567',
      ownerName: cuenta.nombre,
      ownerEmail: cuenta.correo,
      password: cuenta.clave,
    },
  });
  expect(respuesta.status(), await respuesta.text()).toBe(201);
  return cuenta;
}

/**
 * Cada test inicia sesion como si viniera de su propio equipo. El backend
 * limita el login a 5 intentos por minuto por IP (backend/src/index.js) y, con
 * `trust proxy`, toma la IP de X-Forwarded-For. Sin esto, la suite completa o
 * --repeat-each=5 agotaria el limite y los tests fallarian por orden de llegada.
 * Rango 198.18.0.0/15: reservado para pruebas, no es de nadie.
 */
export async function usarIpPropia(page) {
  const ip = `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': ip });
}
