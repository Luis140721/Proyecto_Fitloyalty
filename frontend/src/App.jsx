import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TrialProvider } from './context/TrialContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterOwnerPage from './pages/RegisterOwnerPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import NotFoundPage from './pages/NotFoundPage';

import DashboardPage from './pages/DashboardPage';
import MiembrosPage from './pages/MiembrosPage';
import CheckinPage from './pages/CheckinPage';
import StaffPage from './pages/StaffPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TrialProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Retro-compatibilidad: /register → /register-owner */}
            <Route path="/register" element={<Navigate to="/register-owner" replace />} />
            <Route path="/register-owner" element={<RegisterOwnerPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            {/* Admin-protected routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminLayout><DashboardPage /></AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/miembros"
              element={
                <ProtectedRoute roles={['admin', 'receptionist']}>
                  <AdminLayout><MiembrosPage /></AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/checkin"
              element={
                <ProtectedRoute roles={['admin', 'receptionist']}>
                  <AdminLayout><CheckinPage /></AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/staff"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminLayout><StaffPage /></AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

            {/* 404 dedicada + catch-all que redirige a ella */}
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </TrialProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
