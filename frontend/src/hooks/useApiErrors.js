/**
 * hooks/useApiErrors.js
 *
 * Helper para envolver llamadas a la API con manejo de errores consistente.
 * Si la llamada falla, registra el error en el banner global y lo
 * propaga para que el caller pueda decidir si quiere mostrar mas detalle
 * local (por ejemplo, errores inline en un form).
 */
import { useApiError } from '../components/ErrorBanner';

export function useApiErrors() {
  const { pushApiError } = useApiError();
  return pushApiError;
}

/**
 * Wrapper generico para handlers async de submit. Captura errores de axios
 * ya normalizados (gracias a api.js) y los empuja al banner.
 *
 * Uso:
 *   const pushError = useApiErrors();
 *   const onSubmit = useApiHandler(async (form) => {
 *     await api.post('/auth/login', form);
 *     navigate('/admin');
 *   }, { onError: (err) => { setFieldError(err.code === 'BAD_CREDENTIALS' ? 'credenciales' : null); } });
 */
export function useApiHandler(handler, opts = {}) {
  const pushError = useApiErrors();
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      const persistent = Boolean(opts.persistent);
      pushError(err, { persistent });
      if (opts.onError) opts.onError(err);
      return null;
    }
  };
}