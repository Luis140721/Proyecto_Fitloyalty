/**
 * Deja listos los datos sinteticos de las sesiones de RQNF-04, por la API:
 *   - una cuenta de administrador de prueba (la crea si no existe);
 *   - el miembro de prueba con documento 79123456 y plan vigente y pagado.
 * Se puede correr varias veces: lo que ya existe no se duplica.
 */
const API = 'http://127.0.0.1:3001/api';
const CUENTA = { email: 'admin.rqnf04@example.test', password: 'SesionRqnf04' };
const DOCUMENTO = '79123456';

async function pedir(method, ruta, body, token) {
  const res = await fetch(`${API}${ruta}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  return { status: res.status, datos };
}

const fechaLocal = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function main() {
  let r = await pedir('POST', '/auth/login', CUENTA);
  if (r.status !== 200) {
    r = await pedir('POST', '/auth/signup', {
      gymName: 'Gimnasio de Prueba RQNF-04',
      gymPhone: '3000000000',
      gymEmail: '',
      ownerName: 'Administrador de Prueba',
      ownerEmail: CUENTA.email,
      password: CUENTA.password,
    });
    if (r.status !== 200 && r.status !== 201) {
      throw new Error(`No se pudo crear la cuenta de prueba (HTTP ${r.status}): ${r.datos.error || r.datos.message || ''}`);
    }
    console.log('Cuenta de administrador de prueba creada.');
  } else {
    console.log('La cuenta de administrador de prueba ya existia.');
  }
  const token = r.datos.token;

  const busqueda = await pedir('GET', `/admin/miembros/lookup?documento=${DOCUMENTO}`, null, token);
  if (busqueda.status === 200 && busqueda.datos.miembro) {
    console.log(`El miembro de prueba ${DOCUMENTO} ya existia.`);
  } else {
    const hoy = new Date();
    const fin = new Date(hoy);
    fin.setDate(fin.getDate() + 30);
    const alta = await pedir('POST', '/admin/miembros', {
      nombre: 'Miembro de Prueba',
      tipo_documento: 'CC',
      documento: DOCUMENTO,
      telefono: '3000000000',
      tipo_plan: 'MENSUAL',
      fecha_inicio: fechaLocal(hoy),
      fecha_fin: fechaLocal(fin),
      valor_total: '100000',
      valor_pagado: '100000',
      estado_pago: 'PAGADO',
      metodo_pago: 'EFECTIVO',
      acepto_terminos: true,
      autorizo_datos: true,
    }, token);
    if (alta.status !== 201) {
      throw new Error(`No se pudo crear el miembro de prueba (HTTP ${alta.status}): ${alta.datos.error || ''}`);
    }
    console.log(`Miembro de prueba ${DOCUMENTO} creado, con plan vigente hasta ${fechaLocal(fin)}.`);
  }

  console.log('');
  console.log('Datos para entrar al panel (solo de prueba):');
  console.log(`  Correo:     ${CUENTA.email}`);
  console.log(`  Contrasena: ${CUENTA.password}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
