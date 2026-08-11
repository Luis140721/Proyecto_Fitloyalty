import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// Instancia local con auth (no usamos el del AuthContext para simplificar uso fuera del provider).
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitloyalty_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const TrialContext = createContext(null);

export function TrialProvider({ children }) {
  const [trial, setTrial] = useState({ status: 'loading', reason: null, daysLeft: null, endsAt: null });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/billing/trial-status');
      setTrial({
        status: data.trial.reason || 'desconocido',
        active: data.trial.active,
        expired: data.trial.expired,
        daysLeft: data.trial.daysLeft,
        endsAt: data.trial.endsAt,
      });
    } catch (err) {
      if (err.response?.status === 401) {
        setTrial({ status: 'sin-sesion', active: false, expired: false });
      } else {
        setTrial({ status: 'error', active: false, expired: false });
      }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <TrialContext.Provider value={{ trial, refresh }}>
      {children}
    </TrialContext.Provider>
  );
}

export function useTrial() {
  const ctx = useContext(TrialContext);
  if (!ctx) throw new Error('useTrial debe usarse dentro de <TrialProvider>');
  return ctx;
}
