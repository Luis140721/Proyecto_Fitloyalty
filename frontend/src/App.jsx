import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage          from './pages/LoginPage';
import RegisterPage       from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage  from './pages/ResetPasswordPage';
import LandingPage        from './pages/LandingPage';
import DashboardAdmin          from './pages/DashboardAdmin';
import CrearRecepcionistaPage   from './pages/CrearRecepcionistaPage';
import DashboardUsuario         from './pages/DashboardUsuario';
import ReporteAsistencia        from './pages/ReporteAsistencia';
import VistaMiembrosActivos     from './pages/VistaMiembrosActivos';

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

export default function App() {
  useEffect(() => {
    const sanitizeCopy = (event) => {
      const target = event.target;
      if (!target || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const selection = window.getSelection()?.toString();
      if (selection) {
        event.preventDefault();
        event.clipboardData.setData('text/plain', selection);
      }
    };

    document.addEventListener('copy', sanitizeCopy);
    return () => document.removeEventListener('copy', sanitizeCopy);
  }, []);

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
              <DashboardAdmin />
            </ProtectedRoute>
          }/>
          <Route path="/dashboard/reporte-sp" element={
            <ProtectedRoute roles={['admin']}>
              <ReporteAsistencia />
            </ProtectedRoute>
          }/>
          <Route path="/dashboard/crear-recepcionista" element={
            <ProtectedRoute roles={['admin']}>
              <CrearRecepcionistaPage />
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
          <Route path="/dashboard/vista-miembros" element={
            <ProtectedRoute roles={['admin', 'receptionist', 'member']}>
              <VistaMiembrosActivos />
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

          {/* Raíz y landing page */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
