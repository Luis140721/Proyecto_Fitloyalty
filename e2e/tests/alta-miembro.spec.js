const { test, expect } = require('@playwright/test');
const { MiembrosPage } = require('./support/miembros-page');
const { createMemberData } = require('./support/member-data');

const API_URL = `http://127.0.0.1:${process.env.API_PORT ?? '3001'}/api`;

test('registra un miembro y conserva el plan y el pago en PostgreSQL', async ({ page, request }, testInfo) => {
  const miembrosPage = new MiembrosPage(page);
  const member = createMemberData(testInfo);

  await miembrosPage.goto();
  await expect(page.getByRole('heading', { name: 'Miembros', exact: true })).toBeVisible();
  await miembrosPage.startRegistration();
  await miembrosPage.completeRegistration(member);

  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/admin/miembros') && response.request().method() === 'POST'
  );
  await miembrosPage.submit();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);

  const created = await createResponse.json();
  expect(created.miembro.nombre).toBe(member.name);
  expect(created.plan_cobro).toMatchObject({
    tipo_plan: 'MENSUAL',
    valor_total: member.planTotal,
    valor_pagado: member.planPaid,
    estado_pago: 'PAGADO',
  });

  await expect(page.getByRole('dialog', { name: '¡Miembro creado exitosamente!' })).toBeVisible();
  await page.getByRole('dialog', { name: '¡Miembro creado exitosamente!' })
    .getByRole('button', { name: 'Cerrar' })
    .last()
    .click();
  await expect(page.getByText(member.name, { exact: true }).first()).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('fitloyalty_token'));
  const persistedResponse = await request.get(
    `${API_URL}/admin/miembros/${created.miembro.id_miembro}/plan`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(persistedResponse.status()).toBe(200);

  const persisted = await persistedResponse.json();
  expect(Number(persisted.plan.valor_total)).toBe(member.planTotal);
  expect(Number(persisted.plan.valor_pagado)).toBe(member.planPaid);
  expect(persisted.plan.metodo_pago).toBe('TRANSFERENCIA');
  expect(persisted.plan.estado_pago).toBe('PAGADO');
});
