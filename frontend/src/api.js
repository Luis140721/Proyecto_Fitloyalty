/**
 * api.js
 *
 * Cliente HTTP central del front. Usa axios con:
 *
 *   - baseURL configurable por import.meta.env.VITE_API_BASE.
 *   - interceptor de REQUEST: pega Authorization: Bearer <token> si existe.
 *   - interceptor de RESPONSE: extrae un objeto de error normalizado y lo
 *     rechaza. Asi TODOS los catch (err) del front pueden mirar err.status,
 *     err.code y err.message sin adivinar la forma del payload.
 *
 * Forma del error normalizado:
 *   {
 *     status:   <numero HTTP>,        // 0 si fue error de red/CORS
 *     code:     <string|null>,        // codigo del backend: BAD_CREDENTIALS, etc.
 *     message:  <string>,             // mensaje user-facing en espanol
 *     details:  <object|null>,
 *     isNetwork: <boolean>,
 *     raw:      <Error|unknown>
 *   }
 */
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE || (
  typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app')
    ? 'https://fitloyalty-api.onrender.com/api'
    : 'http://localhost:3001/api'
);

const TOKEN_KEY = 'fitloyalty_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
}

export function setToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (_) {}
}

export function clearToken() { setToken(null); }

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function buildError(error) {
  // 1) Sin respuesta del backend (red, CORS, timeout, etc.)
  if (!error.response) {
    const isNetwork =
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.message === 'Network Error';
    return {
      status: 0,
      code: isNetwork ? 'NETWORK' : (error.code || 'UNKNOWN'),
      message: isNetwork
        ? 'Sin conexion con el servidor. Verifica tu internet e intenta de nuevo.'
        : (error.message || 'Error desconocido'),
      details: null,
      isNetwork: true,
      raw: error,
    };
  }

  // 2) Respuesta del backend con error
  const { status, data } = error.response;
  const code = data && (data.code || data.error_code) || null;
  const message = (data && (data.error || data.message))
    || (status === 401 ? 'Sesion expirada o no autorizada' :
        status === 403 ? 'No tienes permiso para esta accion' :
        status === 404 ? 'Recurso no encontrado' :
        status === 409 ? 'Conflicto con un registro existente' :
        status === 400 ? 'Datos invalidos' :
        status === 402 ? 'Tu periodo de prueba expiro' :
        status === 413 ? 'Solicitud demasiado grande' :
        status === 429 ? 'Demasiadas solicitudes, espera un momento' :
        status >= 500 ? 'Error interno del servidor, intenta de nuevo' :
        'Error inesperado');

  return {
    status,
    code,
    message,
    details: data && data.details || null,
    isNetwork: false,
    raw: error,
  };
}

/**
 * Sesion expirada (RQF-02). Si una peticion que llevaba el token vigente
 * vuelve con 401, ese token ya no sirve (vencio o el usuario ya no existe):
 * se borra y se avisa a AuthContext con un evento para que limpie el estado
 * y ProtectedRoute mande al login. Login, registro, recuperacion e
 * invitacion responden 401 por credenciales malas aunque viajen con un token
 * valido (el interceptor de arriba lo pega a todo), asi que no cuentan.
 * Si el token cambio mientras la peticion iba (otro login en otra pestana),
 * no se toca el nuevo.
 */
export const SESION_EXPIRADA = 'fitloyalty:sesion-expirada';
const RUTAS_PUBLICAS_AUTH = /^\/?auth\/(login|signup|forgot-password|verify-reset-code|reset-password|accept-invite)/;

function avisarSiSesionExpirada(error) {
  if (!error.response || error.response.status !== 401) return;
  if (RUTAS_PUBLICAS_AUTH.test((error.config && error.config.url) || '')) return;
  const headers = (error.config && error.config.headers) || {};
  const enviado = headers.Authorization || headers.authorization;
  const token = getToken();
  if (!enviado || !token || enviado !== `Bearer ${token}`) return;
  clearToken();
  try { window.dispatchEvent(new CustomEvent(SESION_EXPIRADA)); } catch (_) {}
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    avisarSiSesionExpirada(error);
    return Promise.reject(buildError(error));
  }
);

/**
 * Momento (ms desde epoch) en que vence el JWT guardado, leido de su `exp`.
 * Devuelve null si no hay token o si no trae `exp`. Solo decodifica: la
 * firma la valida el backend.
 */
export function tokenVenceEn(token = getToken()) {
  if (!token) return null;
  try {
    const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(parte));
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch (_) {
    return null;
  }
}

/**
 * Helper para mostrar mensajes de error sin volver a escribir los mismos
 * if/else. Devuelve el mensaje user-facing que viene del backend, o el
 * generico si no llega uno util.
 */
export function describeError(err) {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  return err.message || 'Error desconocido';
}

export { TOKEN_KEY };