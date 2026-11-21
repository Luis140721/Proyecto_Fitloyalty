/**
 * lib/contrato.js
 *
 * RQNF-18: lee de la base lo que el contrato de membresia tiene que informar
 * y deja constancia de cada entrega. El texto lo arma lib/mensajes.js
 * (datosContrato, seccionesContrato y contratoMembresia).
 *
 * Lo usan el envio por WhatsApp y la vista previa del panel
 * (routes/admin-contrato.js) y la app del miembro (GET /api/cliente/contrato),
 * asi que los dos canales entregan exactamente el mismo texto.
 */
const { leerVigentes, esMenorDeEdad } = require('./autorizaciones');
const { datosContrato, faltantesContrato, seccionesContrato, contratoMembresia } = require('./mensajes');

/**
 * Miembro, gimnasio y plan vigente. Siempre filtra por miembro Y gimnasio:
 * un miembro de otro gimnasio no existe para quien pregunta.
 * El plan vigente es el mismo que usa el resto del sistema: el activo con el
 * vencimiento mas lejano (miembros.js, cliente.js).
 */
async function cargarFilaContrato(db, idMiembro, gymId) {
  const { rows } = await db.query(
    `SELECT m.id_miembro, m.id_gimnasio, m.nombre, m.tipo_documento, m.documento, m.telefono,
            m.codigo_pais_telefono, m.fecha_registro, m.acepto_terminos, m.activo,
            to_char(m.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            m.representante_nombre, m.representante_tipo_documento, m.representante_documento,
            m.representante_parentesco, m.representante_telefono,
            g.nombre AS gym_nombre, g.nit AS gym_nit, g.direccion AS gym_direccion,
            g.telefono AS gym_telefono, g.email AS gym_email,
            g.dias_aviso_vencimiento AS gym_dias_aviso,
            pc.id_plan_cobro, pc.tipo_plan, pc.fecha_inicio, pc.fecha_fin, pc.valor_total,
            pc.valor_pagado, pc.metodo_pago, pc.estado_pago, pc.congelado_desde
       FROM miembro m
       JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
       LEFT JOIN LATERAL (
         SELECT p.id_plan_cobro, p.tipo_plan, p.fecha_inicio, p.fecha_fin, p.valor_total,
                p.valor_pagado, p.metodo_pago, p.estado_pago, p.congelado_desde
           FROM plan_cobro p
          WHERE p.id_miembro = m.id_miembro AND p.activo = TRUE
          ORDER BY p.fecha_fin DESC NULLS LAST, p.id_plan_cobro DESC
          LIMIT 1
       ) pc ON TRUE
      WHERE m.id_miembro = $1 AND m.id_gimnasio = $2`,
    [idMiembro, gymId]
  );
  return rows[0] || null;
}

/**
 * Arma el contrato de un miembro. Devuelve null si el miembro no es de ese
 * gimnasio. `faltantes` lista lo que la base no tiene y el contrato debe
 * informar; si no esta vacia, el contrato no se entrega.
 */
async function armarContrato(db, idMiembro, gymId) {
  const fila = await cargarFilaContrato(db, idMiembro, gymId);
  if (!fila) return null;
  // Al representante solo se le nombra mientras el miembro sea menor.
  fila.es_menor = esMenorDeEdad(fila);
  const vigentes = await leerVigentes(db, idMiembro, gymId);
  const datos = datosContrato(fila, vigentes);
  return {
    fila,
    datos,
    faltantes: faltantesContrato(datos),
    secciones: seccionesContrato(datos),
    texto: contratoMembresia(datos),
  };
}

/**
 * Constancia de que el miembro abrio el contrato en la app. Solo se guarda
 * una fila por cada texto distinto (si cambia el plan, cambia el texto y se
 * guarda otra): abrir la pantalla diez veces no llena la tabla.
 * Devuelve { id, creado_en, nueva }.
 */
async function registrarEntregaApp(db, { idMiembro, gymId, version, contenido }) {
  const { rows: previa } = await db.query(
    `SELECT id_contrato_enviado, creado_en FROM contrato_enviado
      WHERE id_miembro = $1 AND id_gimnasio = $2 AND canal = 'APP' AND md5(contenido) = md5($3)
      ORDER BY creado_en DESC LIMIT 1`,
    [idMiembro, gymId, contenido]
  );
  if (previa.length > 0) return { id: previa[0].id_contrato_enviado, creado_en: previa[0].creado_en, nueva: false };
  const { rows } = await db.query(
    `INSERT INTO contrato_enviado
       (id_miembro, id_gimnasio, enviado_por, telefono_destino, plantilla_version, exito, error_mensaje, canal, contenido)
     VALUES ($1, $2, NULL, NULL, $3, TRUE, NULL, 'APP', $4)
     RETURNING id_contrato_enviado, creado_en`,
    [idMiembro, gymId, version, contenido]
  );
  return { id: rows[0].id_contrato_enviado, creado_en: rows[0].creado_en, nueva: true };
}

module.exports = { cargarFilaContrato, armarContrato, registrarEntregaApp };
