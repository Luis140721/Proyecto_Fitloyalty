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

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

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

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(buildError(error))
);

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