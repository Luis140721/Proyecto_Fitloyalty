import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="boot-shell"><div className="spinner" /></div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // El backend puede devolver `role`, `rol` o `rol_nombre`.
  // El AuthContext ya normaliza a `user.role` ∈ {admin, receptionist, trainer}.
  const userRole = user.role || user.rol || user.rol_nombre;

  if (roles && !roles.includes(userRole)) {
    // Mantener al usuario en una ruta a la que sí tiene acceso,
    // en vez de devolverlo al landing. Solo lo mandamos a /login si
    // ni siquiera puede entrar al panel.
    return <Navigate to="/admin/checkin" replace />;
  }

  return children;
}
