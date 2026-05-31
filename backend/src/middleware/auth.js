const jwt = require('jsonwebtoken');

/**
 * Middleware que verifica el JWT en el header Authorization.
 * Si es válido, adjunta req.user con { id, email, role, gymId }.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
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

module.exports = { authenticate, authorize };
