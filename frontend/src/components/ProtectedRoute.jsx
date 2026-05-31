import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Protege una ruta. Si el usuario no está autenticado, redirige a /login.
 * Si se pasa `roles`, verifica que el usuario tenga el rol necesario.
 *
 * Uso:
 *   <ProtectedRoute>                  → solo autenticado
 *   <ProtectedRoute roles={['admin']} → solo admins
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
