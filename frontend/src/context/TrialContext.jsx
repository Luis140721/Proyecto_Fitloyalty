import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api';

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
