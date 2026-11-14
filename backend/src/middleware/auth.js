const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const { mapRol } = require('../lib/auth-helpers');
const { AppError } = require('../lib/errors');

/**
 * Lee el estado actual de un usuario del personal. Mismo mapeo de rol que el
 * login (auth.js): id_rol 1/2/3 y RECEPCIONISTA si no tiene id_rol.
 */
async function buscarPersonalEnBD(payload) {
  const { rows } = await pool.query(
    `SELECT activo, id_gimnasio,
            CASE id_rol WHEN 1 THEN 'ADMINISTRADOR' WHEN 2 THEN 'RECEPCIONISTA'
                        WHEN 3 THEN 'ENTRENADOR' ELSE 'RECEPCIONISTA' END AS rol_nombre
       FROM usuario
      WHERE id_usuario = $1`,
    [payload.id]
  );
  return rows[0] || null;
}

let buscarPersonal = buscarPersonalEnBD;

/**
 * Solo para pruebas que simulan pool.query: reemplaza la lectura del usuario
 * del personal por una funcion (payload) => { activo, id_gimnasio, rol_nombre }.
 * Sin argumento vuelve a la lectura real.
 */
function establecerBusquedaPersonal(fn) {
  buscarPersonal = fn || buscarPersonalEnBD;
}

/**
 * Middleware que verifica el JWT en el header Authorization.
 * Si es válido, adjunta req.user con { id, email, role, gymId } para staff
 * o { idMiembro, documento, role: 'cliente', gymId } para miembros (app móvil).
 *
 * Al personal se le vuelve a leer en cada peticion (RQF-01, HU-04): si lo
 * desactivaron, ya no existe o lo pasaron a otro gimnasio, responde 401
 * ACCOUNT_DISABLED aunque su token siga vigente, y el rol sale de la BD, no
 * del token. Asi un admin desactivado o bajado de rol no puede deshacerlo con
 * su token viejo. Cuesta una consulta por clave primaria por peticion.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  // Los tokens del personal emitidos antes de RQF-02 no traen `exp` y
  // jwt.verify los aceptaria para siempre. Se rechazan para obligar a iniciar
  // sesion de nuevo y recibir uno que vence. El del miembro siempre trae `exp`
  // (30 dias), pero no se le exige aqui para no sacar a nadie de la app.
  if (payload.role !== 'cliente' && !payload.exp) {
    return res.status(401).json({ error: 'Tu sesión es anterior al cambio de seguridad. Inicia sesión de nuevo.', code: 'TOKEN_SIN_VENCIMIENTO' });
  }
  if (payload.role === 'cliente') {
    req.user = payload;
    return next();
  }

  let actual;
  try {
    actual = await buscarPersonal(payload);
  } catch (err) {
    console.error('[authenticate] Error leyendo al usuario:', err.code, err.message);
    return next(new AppError(503, 'No pudimos validar tu sesión. Intenta de nuevo.', 'DB_UNREACHABLE'));
  }
  if (!actual || !actual.activo || actual.id_gimnasio !== payload.gymId) {
    return res.status(401).json({ error: 'Tu cuenta está desactivada o ya no pertenece a este gimnasio.', code: 'ACCOUNT_DISABLED' });
  }
  req.user = { ...payload, role: mapRol(actual.rol_nombre) };
  return next();
}

/**
 * Middleware de autorización por rol.
 * Uso: authorize('admin') o authorize('admin', 'receptionist')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acceso denegado. Rol requerido: ${roles.join(' o ')}`,
      });
    }
    next();
  };
}

/**
 * Middleware específico para rutas de la app móvil del cliente.
 * El JWT del cliente tiene role='cliente' y NO tiene `id` (de staff),
 * sino `idMiembro`. Si llega un token de staff a una ruta /cliente/*,
 * respondemos 403 sin ambigüedad.
 */
function requireClient(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (req.user.role !== 'cliente' || !req.user.idMiembro) {
    return res.status(403).json({
      error: 'Esta ruta es solo para miembros del gimnasio.',
      code: 'CLIENT_ONLY',
    });
  }
  next();
}

module.exports = { authenticate, authorize, requireClient, establecerBusquedaPersonal };
