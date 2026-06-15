import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage          from './pages/LoginPage';
import RegisterPage       from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage  from './pages/ResetPasswordPage';
import DashboardUsuario   from './pages/DashboardUsuario';

// ─── Dashboards placeholder ─────────────────────────────────────────────────
// Cada uno será desarrollado en su propia sesión
function DashboardPlaceholder({ role, label }) {
  const { user, logout } = useAuth();
  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 24, fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ fontSize: 56 }}>🏋️</div>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b' }}>
          ¡Bienvenido, {user?.name}!
        </h1>
        <p style={{ color: '#64748b', marginTop: 6 }}>
          Dashboard de <strong style={{ color: '#f97316' }}>{label}</strong> — próximamente
        </p>
        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
          Rol: {user?.role} · Email: {user?.email}
        </p>
      </div>
      <button
        onClick={logout}
        style={{
          padding: '10px 24px', background: '#f97316', color: '#fff',
          border: 'none', borderRadius: 10, fontWeight: 600,
          cursor: 'pointer', fontSize: 15
        }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

// Redirige al dashboard correcto según el rol del usuario autenticado
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;
  switch (user.role) {
    case 'admin':        return <Navigate to="/dashboard/admin" replace />;
    case 'receptionist': return <Navigate to="/dashboard/receptionist" replace />;
    default:             return <Navigate to="/dashboard/member" replace />;
  }
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Públicas */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* Dashboards protegidos */}
          <Route path="/dashboard/admin" element={
            <ProtectedRoute roles={['admin']}>
              <DashboardPlaceholder label="Administrador" />
            </ProtectedRoute>
          }/>
          <Route path="/dashboard/receptionist" element={
            <ProtectedRoute roles={['admin', 'receptionist']}>
              <DashboardUsuario />
            </ProtectedRoute>
          }/>
          <Route path="/dashboard/member" element={
            <ProtectedRoute roles={['admin', 'receptionist', 'member']}>
              <DashboardUsuario />
            </ProtectedRoute>
          }/>

          {/* Sin acceso */}
          <Route path="/unauthorized" element={
            <div style={{ textAlign: 'center', padding: 60 }}>
              <h2>🚫 Sin acceso</h2>
              <p>No tienes permiso para ver esta página.</p>
              <a href="/login">Volver al login</a>
            </div>
          }/>

          {/* Raíz y catch-all */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
