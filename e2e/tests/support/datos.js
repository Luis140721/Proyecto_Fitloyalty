import { readFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { API_URL, CLAVE_TOKEN, SESION } from './entorno.js';

// Datos del Arrange por API, con el fixture `request` de Playwright. Todo lleva
// valores unicos: los tests corren en paralelo sobre el mismo gimnasio (el de
// auth.setup.js) y la BD conserva lo de corridas anteriores.
//
// El front llama al backend directo en API_URL (no hay proxy de Vite para /api),
// asi que las rutas van completas y con el token de la sesion guardada.

/**
 * Cabeceras con el token del dueno que guardo auth.setup.js.
 *
 * Connection: close, porque el `request` de Playwright reutiliza la conexion y
 * el servidor de Node la cierra tras 5 s sin uso (keepAliveTimeout). Si el test
 * pasa unos 5 s en la pantalla entre dos llamadas, la segunda puede salir por
 * una conexion que el backend esta cerrando: "socket hang up" (1 de 5 en la
 * suite completa). Es del test, no de la app: el navegador reintenta solo.
 */
function conSesion() {
  const { origins } = JSON.parse(readFileSync(SESION, 'utf8'));
  const item = origins.flatMap((o) => o.localStorage).find((i) => i.name === CLAVE_TOKEN);
  if (!item) throw new Error(`No hay ${CLAVE_TOKEN} en ${SESION}: corre los tests con el proyecto "setup" (pnpm test).`);
  return { Authorization: `Bearer ${item.value}`, Connection: 'close' };
}

// Fechas fijas: si el plan esta vigente o vencido no depende del dia de la corrida.
export const PLAN_VIGENTE = { tipo_plan: 'ANUAL', fecha_inicio: '2020-01-01', fecha_fin: '2099-12-31' };
export const PLAN_VENCIDO = { tipo_plan: 'MENSUAL', fecha_inicio: '2020-01-01', fecha_fin: '2020-01-31' };

/** Documento de 10 digitos que no existe en el gimnasio. */
export const documentoUnico = () => String(randomInt(1_000_000_000, 10_000_000_000));

/** Nombre unico de miembro: la BD conserva lo de corridas anteriores. */
export const nombreUnico = () => `Miembro E2E ${randomUUID().slice(0, 8)}`;

/**
 * POST /admin/miembros con su plan (plan_cobro), como la hace la recepcion. No
 * revisa la respuesta: es para los tests que la revisan ellos mismos. Por
 * defecto va al gimnasio de la sesion; `cabeceras` permite usar otro (crearGimnasio).
 */
export function enviarAlta(request, { nombre = nombreUnico(), documento = documentoUnico(), plan = PLAN_VIGENTE } = {}, cabeceras = conSesion()) {
  return request.post(`${API_URL}/admin/miembros`, {
    headers: cabeceras,
    data: {
      nombre,
      documento,
      telefono: '3001234567',
      ...plan,
      valor_total: '90000',
      valor_pagado: '90000',
      estado_pago: 'PAGADO',
      referencia_pago: `E2E-${documento}`,
      acepto_terminos: true,
      autorizo_datos: true,
    },
  });
}

/**
 * Gimnasio nuevo con su dueno, por API (como auth.setup.js), para el test que
 * necesita uno solo para el. Devuelve su id y las cabeceras con su token.
 */
export async function crearGimnasio(request) {
  const sufijo = randomUUID().slice(0, 8);
  const respuesta = await request.post(`${API_URL}/auth/signup`, {
    headers: { Connection: 'close' },
    data: {
      gymName: `Gimnasio E2E ${sufijo}`,
      gymPhone: '3001234567',
      ownerName: 'Recepcion E2E',
      ownerEmail: `dueno.${sufijo}@example.com`,
      password: `clave${sufijo}1`,
    },
  });
  expect(respuesta.status(), await respuesta.text()).toBe(201);
  const { token, gym } = await respuesta.json();
  return { id: gym.id, cabeceras: { Authorization: `Bearer ${token}`, Connection: 'close' } };
}

/** Alta de un miembro con su plan; falla si el backend no responde 201. */
export async function crearMiembro(request, plan = PLAN_VIGENTE) {
  const nombre = nombreUnico();
  const documento = documentoUnico();
  const respuesta = await enviarAlta(request, { nombre, documento, plan });
  expect(respuesta.status(), await respuesta.text()).toBe(201);
  const { miembro } = await respuesta.json();
  return { id: miembro.id_miembro, nombre, documento };
}

/** Miembros activos del gimnasio con ese documento (la busqueda de la lista). */
export async function miembrosConDocumento(request, documento, cabeceras = conSesion()) {
  const respuesta = await request.get(`${API_URL}/admin/miembros`, {
    headers: cabeceras,
    params: { q: documento, pageSize: 100 },
  });
  expect(respuesta.status(), await respuesta.text()).toBe(200);
  const { miembros } = await respuesta.json();
  return miembros.filter((m) => m.documento === documento);
}

/** Congela el plan vigente del miembro desde hoy (RQF-04). */
export async function congelarPlan(request, idMiembro) {
  const respuesta = await request.post(`${API_URL}/admin/miembros/${idMiembro}/congelar`, {
    headers: conSesion(),
    data: { motivo: 'Viaje (E2E)' },
  });
  expect(respuesta.status(), await respuesta.text()).toBe(200);
}

/** Ingresos guardados en la BD para ese documento (GET /admin/checkin). */
export async function ingresosDe(request, documento) {
  const respuesta = await request.get(`${API_URL}/admin/checkin`, { headers: conSesion(), params: { limit: 200 } });
  expect(respuesta.status(), await respuesta.text()).toBe(200);
  const { checkins } = await respuesta.json();
  return checkins.filter((c) => c.documento === documento);
}
