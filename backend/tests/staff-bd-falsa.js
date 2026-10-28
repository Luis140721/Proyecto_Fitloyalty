/**
 * BD falsa (fake) para las pruebas de routes/staff.js.
 *
 * Guarda en memoria las filas de gimnasio, usuario e invitacion_staff y
 * responde cada consulta de la ruta como lo haria PostgreSQL con esos datos.
 * Una consulta que no conoce lanza error, asi un cambio en el SQL no pasa en
 * silencio.
 *
 *  - `fallaCon`: regex de la consulta que simula la BD caida.
 *  - `esquema`: lo que responde la deteccion de columnas (information_schema).
 *    Por defecto, el esquema local: con fecha_creacion y sin la columna
 *    legacy `rol` de Neon.
 *
 * Lo que este fake NO ve: no interpreta los filtros del SQL (decide la
 * vigencia de una invitacion con su propio codigo) ni las transacciones (no
 * hay ROLLBACK). Eso lo cubre la capa BD contra PostgreSQL real.
 */
const ROLES = { 1: 'ADMINISTRADOR', 2: 'RECEPCIONISTA', 3: 'ENTRENADOR' };

function crearBdFalsa() {
  const bd = {
    gimnasios: [{ id_gimnasio: 7, nombre: 'Gym Demo', activo: true, trial_ends_at: null, id_dueno: 1 }],
    usuarios: [{ id_usuario: 1, id_gimnasio: 7, nombre: 'Luis Admin', email: 'luis@gym.co', id_rol: 1, activo: true, fecha_creacion: new Date('2026-01-01T00:00:00Z') }],
    invitaciones: [],
    esquema: { rol_exists: false, roles_exists: false, has_fecha_creacion: true, has_ultimo_acceso: false, has_rol_column: false },
    fallaCon: null,
  };
  const vigente = (i) => !i.fecha_aceptacion && !i.fecha_revocado && i.fecha_expiracion > new Date();
  const delGimnasio = (id) => bd.gimnasios.filter((g) => g.id_gimnasio === id);
  const rolNombre = (idRol) => ROLES[idRol] || `ROL_${idRol}`;
  // Como sqlIdDueno (auth-helpers.js): gimnasio.id_dueno o, si falta, el admin activo mas antiguo.
  const esDueno = (u) => {
    const gym = delGimnasio(u.id_gimnasio)[0] || {};
    const admins = bd.usuarios.filter((x) => x.id_gimnasio === u.id_gimnasio && x.id_rol === 1 && x.activo).map((x) => x.id_usuario);
    const dueno = gym.id_dueno ?? (admins.length ? Math.min(...admins) : null);
    return u.id_usuario === dueno;
  };
  const filaPersonal = (u) => ({ id_usuario: u.id_usuario, nombre: u.nombre, email: u.email, id_rol: u.id_rol, activo: u.activo, rol: rolNombre(u.id_rol), es_dueno: esDueno(u) });

  async function query(sql, params = []) {
    if (bd.fallaCon && bd.fallaCon.test(sql)) throw new Error('conexion perdida');
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql)) return { rows: [] };
    if (/information_schema/.test(sql)) return { rows: [{ ...bd.esquema }] };
    if (/SELECT id_gimnasio, activo, trial_ends_at FROM gimnasio/.test(sql)) return { rows: delGimnasio(params[0]) };
    if (/SELECT nombre FROM gimnasio/.test(sql)) return { rows: delGimnasio(params[0]).map(({ nombre }) => ({ nombre })) };
    if (/SELECT id_usuario FROM usuario WHERE LOWER\(email\) = \$1 AND id_gimnasio = \$2/.test(sql)) {
      const [email, gym] = params;
      return { rows: bd.usuarios.filter((u) => u.email.toLowerCase() === email && u.id_gimnasio === gym).map(({ id_usuario }) => ({ id_usuario })) };
    }
    // GET /admin/staff: solo las columnas que pide la consulta, mas rol y es_dueno.
    const lista = sql.match(/^SELECT ([\w, ]+?), CASE usuario\.id_rol[\s\S]*FROM usuario WHERE id_gimnasio = \$1 ORDER BY (\w+) DESC\s*$/);
    if (lista) {
      const columnas = lista[1].split(',').map((c) => c.trim());
      const orden = lista[2];
      return {
        rows: bd.usuarios
          .filter((u) => u.id_gimnasio === params[0])
          .sort((a, b) => b[orden] - a[orden])
          .map((u) => ({ ...Object.fromEntries(columnas.map((c) => [c, u[c]])), rol: rolNombre(u.id_rol), es_dueno: esDueno(u) })),
      };
    }
    // PATCH /admin/staff/:id: el usuario actual, solo si es del gimnasio.
    if (/SELECT id_usuario, id_rol, activo, COALESCE[\s\S]*FROM usuario\s+WHERE id_usuario = \$1 AND id_gimnasio = \$2/.test(sql)) {
      const u = bd.usuarios.find((x) => x.id_usuario === params[0] && x.id_gimnasio === params[1]);
      return { rows: u ? [{ id_usuario: u.id_usuario, id_rol: u.id_rol, activo: u.activo, es_dueno: esDueno(u) }] : [] };
    }
    const cambio = sql.match(/^\s*UPDATE usuario SET ([\s\S]+?)\s+WHERE id_usuario = \$(\d+) AND id_gimnasio = \$(\d+)/);
    if (cambio) {
      const u = bd.usuarios.find((x) => x.id_usuario === params[cambio[2] - 1] && x.id_gimnasio === params[cambio[3] - 1]);
      if (!u) return { rows: [] };
      for (const [, columna, n] of cambio[1].matchAll(/(\w+) = \$(\d+)/g)) u[columna] = params[n - 1];
      return { rows: [filaPersonal(u)] };
    }
    if (/SELECT id_invitacion FROM invitacion_staff/.test(sql)) {
      const [email, gym] = params;
      return { rows: bd.invitaciones.filter((i) => i.email === email && i.id_gimnasio === gym && vigente(i)).map(({ id_invitacion }) => ({ id_invitacion })) };
    }
    if (/INSERT INTO invitacion_staff/.test(sql)) {
      const [id_gimnasio, email, nombre, rol_asignado, token_hash, id_usuario_creador, fecha_expiracion] = params;
      const inv = {
        id_invitacion: bd.invitaciones.length + 1, id_gimnasio, email, nombre, rol_asignado, token_hash,
        id_usuario_creador, fecha_creacion: new Date(), fecha_expiracion, fecha_aceptacion: null, fecha_revocado: null,
      };
      bd.invitaciones.push(inv);
      return { rows: [{ id_invitacion: inv.id_invitacion, email, nombre, rol_asignado, fecha_creacion: inv.fecha_creacion, fecha_expiracion }] };
    }
    if (/FROM invitacion_staff\s+WHERE id_gimnasio = \$1\s+ORDER BY/.test(sql)) {
      return { rows: bd.invitaciones.filter((i) => i.id_gimnasio === params[0]).map((i) => ({ ...i, pendiente: vigente(i) })) };
    }
    if (/UPDATE invitacion_staff\s+SET fecha_revocado/.test(sql)) {
      const inv = bd.invitaciones.find((i) => i.id_invitacion === params[0] && i.id_gimnasio === params[1] && !i.fecha_aceptacion && !i.fecha_revocado);
      if (!inv) return { rows: [] };
      inv.fecha_revocado = new Date();
      return { rows: [{ id_invitacion: inv.id_invitacion, fecha_revocado: inv.fecha_revocado }] };
    }
    if (/FROM invitacion_staff i\s+INNER JOIN gimnasio g/.test(sql)) {
      const inv = bd.invitaciones.find((i) => i.token_hash === params[0]);
      return { rows: inv ? [{ ...inv, gym_nombre: delGimnasio(inv.id_gimnasio)[0].nombre }] : [] };
    }
    if (/FROM invitacion_staff\s+WHERE token_hash = \$1\s+FOR UPDATE/.test(sql)) {
      return { rows: bd.invitaciones.filter((i) => i.token_hash === params[0]) };
    }
    if (/INSERT INTO usuario/.test(sql)) {
      const columnas = sql.match(/INSERT INTO usuario \(([^)]+)\)/)[1].split(',').map((c) => c.trim());
      // activo y fecha_creacion los pone la BD por defecto.
      const usuario = { id_usuario: Math.max(0, ...bd.usuarios.map((u) => u.id_usuario)) + 1, activo: true, fecha_creacion: new Date() };
      columnas.forEach((c, n) => { usuario[c] = params[n]; });
      bd.usuarios.push(usuario);
      const { id_usuario, nombre, email, id_gimnasio, id_rol } = usuario;
      return { rows: [{ id_usuario, nombre, email, id_gimnasio, id_rol }] };
    }
    if (/UPDATE invitacion_staff\s+SET fecha_aceptacion/.test(sql)) {
      bd.invitaciones.find((i) => i.id_invitacion === params[1]).fecha_aceptacion = new Date();
      return { rows: [] };
    }
    throw new Error('Consulta inesperada: ' + sql.trim().slice(0, 60));
  }

  bd.query = query;
  bd.connect = async () => ({ query, release: () => {} });
  return bd;
}

module.exports = { crearBdFalsa };
