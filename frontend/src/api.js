import axios from 'axios';

// Una sola instancia compartida por toda la app.
// Lee la URL del backend desde VITE_API_BASE (inyectada por Vercel en build time).
// En desarrollo local, si la variable no existe, cae a '/api' (Vite proxy -> localhost:3001).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitloyalty_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
