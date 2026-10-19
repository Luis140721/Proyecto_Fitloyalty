import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, getToken, setToken, clearToken, tokenVenceEn, SESION_EXPIRADA, TOKEN_KEY } from '../api';
import { useApiError } from '../components/ErrorBanner';

const AuthContext = createContext(null);

/**
 * Cierre de sesion por inactividad (RQF-02).
 *
 * Minutos sin actividad (mouse, teclado, toque o scroll) antes de cerrar la
 * sesion. Se configura con VITE_INACTIVIDAD_MIN al compilar; por defecto 30.
 * La ultima actividad se guarda en localStorage para que todas las pestanas
 * compartan el mismo reloj: usar el panel en una mantiene vivas las demas.
 */
const INACTIVIDAD_MIN = (() => {
  const n = Number(import.meta.env.VITE_INACTIVIDAD_MIN);
  return Number.isFinite(n) && n > 0 ? n : 30;
})();
const INACTIVIDAD_MS = INACTIVIDAD_MIN * 60 * 1000;
const ACTIVIDAD_KEY = 'fitloyalty_ultima_actividad';
const EVENTOS_ACTIVIDAD = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
// En captura para ver tambien el scroll de los paneles internos (no burbujea).
const OPCIONES_ESCUCHA = { passive: true, capture: true };
const REVISAR_CADA_MS = 15 * 1000;
// pointermove dispara decenas de veces por segundo: se guarda como mucho cada 10 s.
const GUARDAR_ACTIVIDAD_CADA_MS = 10 * 1000;

function leerActividad() {
  try { return Number(localStorage.getItem(ACTIVIDAD_KEY)) || null; } catch (_) { return null; }
}

function guardarActividad(ms) {
  try {
    if (ms) localStorage.setItem(ACTIVIDAD_KEY, String(ms));
    else localStorage.removeItem(ACTIVIDAD_KEY);
  } catch (_) {}
}

const AVISOS = {
  inactividad: `Tu sesión se cerró tras ${INACTIVIDAD_MIN} ${INACTIVIDAD_MIN === 1 ? 'minuto' : 'minutos'} sin actividad. Inicia sesión de nuevo.`,
  expirada: 'Tu sesión expiró. Inicia sesión de nuevo.',
};

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
  const { pushApiError, dismiss } = useApiError();
  // Id del aviso de "sesion cerrada" en el banner, para quitarlo al volver a entrar.
  const avisoRef = useRef(null);

  /**
   * Cierra la sesion sin pasar por el backend (el JWT es stateless) y, si hay
   * motivo, deja el aviso en el banner. El de inactividad queda fijo hasta
   * que lo cierren, porque el usuario no estaba mirando cuando ocurrio.
   */
  const cerrarSesion = useCallback((motivo) => {
    clearToken();
    guardarActividad(null);
    setUser(null);
    setGym(null);
    if (motivo && avisoRef.current === null) {
      avisoRef.current = pushApiError(
        { status: 401, code: motivo === 'inactividad' ? 'INACTIVITY_LOGOUT' : 'SESSION_EXPIRED', message: AVISOS[motivo] },
        { persistent: motivo === 'inactividad' },
      );
    }
  }, [pushApiError]);

  useEffect(() => {
    const token = getToken();
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
          clearToken();
          setUser(null);
          setGym(null);
        }
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, []);

  // Un 401 de cualquier peticion con el token vigente (api.js) cierra la sesion.
  useEffect(() => {
    const alExpirar = () => cerrarSesion('expirada');
    window.addEventListener(SESION_EXPIRADA, alExpirar);
    return () => window.removeEventListener(SESION_EXPIRADA, alExpirar);
  }, [cerrarSesion]);

  // Reloj de inactividad y vencimiento del token, solo con sesion abierta.
  useEffect(() => {
    if (!user) return undefined;

    const revisar = () => {
      // Otra pestana cerro la sesion: el token ya no esta.
      if (!getToken()) { cerrarSesion(null); return; }
      const vence = tokenVenceEn();
      if (vence && Date.now() >= vence) { cerrarSesion('expirada'); return; }
      const ultima = leerActividad();
      if (ultima && Date.now() - ultima >= INACTIVIDAD_MS) cerrarSesion('inactividad');
    };

    let ultimaEscritura = 0;
    const marcar = () => {
      const ahora = Date.now();
      if (ahora - ultimaEscritura < GUARDAR_ACTIVIDAD_CADA_MS) return;
      ultimaEscritura = ahora;
      guardarActividad(ahora);
    };

    // Al recargar la pagina se mira primero la ultima actividad guardada:
    // quien cerro el navegador hace mas de INACTIVIDAD_MIN no sigue adentro.
    revisar();
    if (!getToken()) return undefined;
    marcar();

    const alCambiarPestana = () => { if (document.visibilityState === 'visible') revisar(); };
    const alCambiarStorage = (e) => { if (e.key === TOKEN_KEY || e.key === ACTIVIDAD_KEY) revisar(); };
    EVENTOS_ACTIVIDAD.forEach((ev) => window.addEventListener(ev, marcar, OPCIONES_ESCUCHA));
    document.addEventListener('visibilitychange', alCambiarPestana);
    window.addEventListener('storage', alCambiarStorage);
    const intervalo = setInterval(revisar, REVISAR_CADA_MS);

    return () => {
      EVENTOS_ACTIVIDAD.forEach((ev) => window.removeEventListener(ev, marcar, OPCIONES_ESCUCHA));
      document.removeEventListener('visibilitychange', alCambiarPestana);
      window.removeEventListener('storage', alCambiarStorage);
      clearInterval(intervalo);
    };
  }, [user, cerrarSesion]);

  const handleAuthResponse = useCallback((data) => {
    if (data.token) {
      setToken(data.token);
      // Sesion nueva: el reloj de inactividad arranca ahora.
      guardarActividad(Date.now());
      if (avisoRef.current !== null) { dismiss(avisoRef.current); avisoRef.current = null; }
      setUser(normalizeUser(data.user));
      setGym(data.gym || null);
    }
    return data.user;
  }, [dismiss]);

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
    cerrarSesion(null);
  }, [cerrarSesion]);

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
