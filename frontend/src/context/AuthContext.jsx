import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Instancia de axios con base URL
const api = axios.create({ baseURL: '/api' });

// Interceptor: adjunta el token JWT a cada request automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitloyalty_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // Verificando sesión al iniciar

  // Al montar, intentar restaurar sesión desde el token guardado
  useEffect(() => {
    const token = localStorage.getItem('fitloyalty_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem('fitloyalty_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('fitloyalty_token', data.token);
    setUser(data.user);
    return data.user; // Para redirigir según el rol
  }, []);

  const register = useCallback(async (gymName, gymPhone, ownerFirstName, ownerLastName, ownerEmail, password) => {
    // Public signup: crear gimnasio + admin owner
    const ownerName = `${ownerFirstName.trim()} ${ownerLastName.trim()}`;
    const payload = { gymName, gymPhone, ownerName, ownerEmail, password };
    const { data } = await api.post('/auth/signup', payload);
    if (data.token) {
      localStorage.setItem('fitloyalty_token', data.token);
      setUser(data.user);
    }
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    localStorage.removeItem('fitloyalty_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, api }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export { api };
