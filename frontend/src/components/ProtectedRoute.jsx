import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles, children }) {
  const { user, loading, ready } = useAuth();
  const location = useLocation();

  // 1) Mientras revalidamos la sesión, mostrar spinner. NUNCA redirigir a /login
  //    aquí, porque si guardamos token en localStorage todavía estamos logueados.
  if (loading && !ready) {
    return <div className="boot-shell"><div className="spinner" /></div>;
  }

  // 2) Tras revalidar: si NO hay user (token inválido/expirado), a login.
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
