/**
 * lib/planes.js
 *
 * El plan de un miembro se guarda en `plan_cobro`. El esquema tambien tiene
 * `membresia`, `pago` y `plan_membresia` del diseno original, pero el alta de
 * miembros nunca escribio en ellas: quedaron vacias. Varias consultas leian de
 * ahi y por eso mostraban cero aunque el gimnasio estuviera lleno.
 *
 * Para no repetir el mismo subquery en cada archivo, aqui vive la definicion
 * de "el plan vigente de cada miembro".
 */

/*
 * Un miembro puede acumular varios planes con el tiempo (renovaciones); para
 * saber si esta al dia solo interesa el ultimo. DISTINCT ON se queda con la
 * primera fila de cada miembro segun el ORDER BY, que es la forma barata de
 * resolverlo en PostgreSQL.
 *
 * Se interpola en el SQL como si fuera una tabla:
 *   FROM ${ULTIMO_PLAN} pc  INNER JOIN miembro mb ON mb.id_miembro = pc.id_miembro
 */
const ULTIMO_PLAN = `(
  SELECT DISTINCT ON (id_miembro)
         id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin,
         valor_total, valor_pagado, estado_pago, proxima_fecha_cobro
    FROM plan_cobro
   WHERE activo = TRUE
   ORDER BY id_miembro, fecha_fin DESC NULLS LAST, id_plan_cobro DESC
)`;

module.exports = { ULTIMO_PLAN };
