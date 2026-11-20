/**
 * Fechas "solo dia": las columnas DATE de Postgres (fecha_inicio y fecha_fin
 * del plan, congelado_desde, las de congelacion_plan).
 *
 * `pg` convierte un DATE en un Date a la medianoche del servidor y el JSON lo
 * manda como instante UTC: con el backend en UTC (Render), el 30/10 llega como
 * "2026-10-30T00:00:00.000Z". `new Date(...)` en un navegador de Colombia
 * (UTC-5) lo pasa al 29/10 a las 19:00 y la fecha sale un dia antes. Con
 * "2026-10-30" a secas pasa lo mismo: el navegador lo lee como medianoche UTC.
 *
 * Aqui se toma el dia tal como viene (AAAA-MM-DD, con o sin hora) y se arma a
 * la medianoche local, sin pasar por la zona del navegador. Sirve mientras el
 * backend corra en UTC o al oeste (Render en UTC, desarrollo en Bogota).
 *
 * No es para instantes (TIMESTAMP como fecha_expiracion o fecha_hora): esos si
 * se muestran en la hora local del navegador.
 */

const DIA = /^(\d{4})-(\d{2})-(\d{2})/;

/** Date a la medianoche local del dia que trae `valor`, o null si no trae uno. */
export function fechaDia(valor) {
  const m = DIA.exec(valor);   // exec lo pasa a texto: null, numeros o un Date no casan
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** El dia de `valor` como toLocaleDateString('es-CO'), o '' si no trae uno. */
export function formatearFechaDia(valor) {
  const fecha = fechaDia(valor);
  return fecha ? fecha.toLocaleDateString('es-CO') : '';
}
