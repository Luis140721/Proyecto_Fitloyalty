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

/** Cabecera con el token del dueno que guardo auth.setup.js. */
function conSesion() {
  const { origins } = JSON.parse(readFileSync(SESION, 'utf8'));
  const item = origins.flatMap((o) => o.localStorage).find((i) => i.name === CLAVE_TOKEN);
  if (!item) throw new Error(`No hay ${CLAVE_TOKEN} en ${SESION}: corre los tests con el proyecto "setup" (pnpm test).`);
  return { Authorization: `Bearer ${item.value}` };
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
 * revisa la respuesta: es para los tests que la revisan ellos mismos.
 */
export function enviarAlta(request, { nombre = nombreUnico(), documento = documentoUnico(), plan = PLAN_VIGENTE } = {}) {
  return request.post(`${API_URL}/admin/miembros`, {
    headers: conSesion(),
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
export async function miembrosConDocumento(request, documento) {
  const respuesta = await request.get(`${API_URL}/admin/miembros`, {
    headers: conSesion(),
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
