import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

/**
 * Normaliza el rol que devuelve el backend (`ADMINISTRADOR`, `RECEPCIONISTA`,
 * `ENTRENADOR`) a un slug estable que entiende el resto del front
 * (`admin` | `receptionist` | `trainer`).
 * Si el backend ya envía el slug en `role` o `rol`, lo respeta.
 */
function normalizeRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'receptionist';
  if (v === 'admin' || v === 'administrador') return 'admin';
  if (v === 'receptionist' || v === 'recepcionista' || v === 'recepción') return 'receptionist';
  if (v === 'trainer' || v === 'entrenador') return 'trainer';
  return v;
}

function normalizeUser(u) {
  if (!u) return u;
  const role = normalizeRole(u.role ?? u.rol ?? u.rol_nombre);
  return {
    ...u,
    role,
    // Mantener también el nombre del backend por si alguna página lo usa
    rol_nombre: u.rol_nombre ?? u.rol ?? role,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  // Datos del gimnasio al que pertenece la sesion (nombre, logo, estado).
  const [gym, setGym]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady]     = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('fitloyalty_token');
    if (!token) {
      setLoading(false);
      setReady(true);
      return;
    }
    api.get('/auth/me')
      .then(({ data }) => { setUser(normalizeUser(data.user)); setGym(data.gym || null); })
      .catch((err) => {
        /*
         * Un fallo de red no debe cerrar la sesion: puede ser un bajon de
         * conexion y el usuario sigue siendo quien dice ser. Pero si el
         * servidor responde que el token no sirve (401/403) o que ese usuario
         * ya no existe (404), el token esta muerto y hay que soltarlo.
         *
         * Antes el catch estaba vacio, asi que un token muerto se quedaba
         * guardado para siempre y la aplicacion devolvia al login una y otra
         * vez sin explicar por que.
         */
        if ([401, 403, 404].includes(err?.status)) {
          localStorage.removeItem('fitloyalty_token');
          setUser(null);
          setGym(null);
        }
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, []);

  const handleAuthResponse = useCallback((data) => {
    if (data.token) {
      localStorage.setItem('fitloyalty_token', data.token);
      setUser(normalizeUser(data.user));
      setGym(data.gym || null);
    }
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    return handleAuthResponse(data);
  }, [handleAuthResponse]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    return handleAuthResponse(data);
  }, [handleAuthResponse]);

  const acceptInvite = useCallback(async (token, password) => {
    const { data } = await api.post('/auth/accept-invite', { token, password });
    return handleAuthResponse(data);
  }, [handleAuthResponse]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    localStorage.removeItem('fitloyalty_token');
    setUser(null);
    setGym(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, gym, loading, ready, login, register, acceptInvite, logout, api }}>
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
