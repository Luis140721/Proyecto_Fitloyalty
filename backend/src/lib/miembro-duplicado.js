/**
 * lib/miembro-duplicado.js
 *
 * RQF-03: en un gimnasio no hay dos miembros activos con el mismo documento ni
 * con el mismo correo (sin distinguir mayusculas).
 *
 * Se llama dentro de la transaccion que guarda. El candado
 * (pg_advisory_xact_lock, se suelta solo con el COMMIT o el ROLLBACK) hace que
 * dos peticiones con el mismo documento o correo pasen una detras de la otra:
 * la segunda busca cuando la primera ya termino (#87). Siempre primero el
 * documento y despues el correo, para que dos peticiones no se esperen entre si.
 */
const { AppError } = require('./errors');

const CAMPOS = [
  {
    campo: 'documento',
    candado: "SELECT pg_advisory_xact_lock(hashtext('miembro_documento'), hashtext($1))",
    buscar: 'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND documento = $2 AND activo = TRUE',
    error: () => new AppError(409, 'Ya existe un miembro activo con ese documento.', 'MEMBER_DOC_TAKEN'),
  },
  {
    campo: 'email',
    candado: "SELECT pg_advisory_xact_lock(hashtext('miembro_correo'), hashtext($1))",
    buscar: 'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND LOWER(email) = $2 AND activo = TRUE',
    error: () => new AppError(409, 'Ya existe un miembro activo con ese correo.', 'MEMBER_EMAIL_TAKEN'),
  },
];

const valorDe = (campo, v) => (campo === 'email' && v ? v.toLowerCase() : v);

/** 409 si otro miembro activo del gimnasio ya tiene ese documento o ese correo. */
async function exigirSinDuplicados(client, gymId, datos, excepto = null) {
  for (const { campo, candado, buscar, error } of CAMPOS) {
    const valor = valorDe(campo, datos[campo]);
    if (!valor) continue;
    await client.query(candado, [`${gymId}:${valor}`]);
    const { rows } = await client.query(
      excepto === null ? buscar : `${buscar} AND id_miembro <> $3`,
      excepto === null ? [gymId, valor] : [gymId, valor, excepto]
    );
    if (rows.length > 0) throw error();
  }
}

/** true si la edicion puede dejar a dos miembros activos con el mismo documento o correo. */
const puedeDuplicar = (d) => d.documento !== undefined || Boolean(d.email) || d.activo === true;

/**
 * Lo mismo al editar. Solo mira lo que cambia: la ficha manda siempre el
 * documento y el correo, y guardar otro dato de un miembro que ya venia repetido
 * no debe fallar. Reactivarlo cuenta como cambio. Un miembro que queda
 * desactivado no se revisa, igual que en el alta.
 */
async function exigirSinDuplicadosAlEditar(client, { id, gymId, d }) {
  const { rows } = await client.query(
    // FOR NO KEY UPDATE: basta para el UPDATE y no frena a quien solo apunta al miembro (check-in, planes).
    'SELECT documento, email, activo FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2 FOR NO KEY UPDATE',
    [id, gymId]
  );
  if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
  const actual = rows[0];
  const activo = d.activo === undefined ? actual.activo : d.activo;
  if (!activo) return;
  const seReactiva = !actual.activo;
  const datos = {};
  for (const { campo } of CAMPOS) {
    const final = d[campo] === undefined ? actual[campo] : d[campo];
    if (seReactiva || valorDe(campo, final) !== valorDe(campo, actual[campo])) datos[campo] = final;
  }
  await exigirSinDuplicados(client, gymId, datos, id);
}

/** El 409 de las restricciones unicas de la base (23505), o null si es otro error. */
function errorDeDuplicado(err) {
  if (err.code !== '23505') return null;
  return new AppError(409, 'Ya existe un miembro con ese documento, correo o código en este gimnasio (puede estar desactivado).', 'MEMBER_DUPLICATED');
}

module.exports = { exigirSinDuplicados, exigirSinDuplicadosAlEditar, puedeDuplicar, errorDeDuplicado };
