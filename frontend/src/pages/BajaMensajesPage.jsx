import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import LegalLayout from '../components/LegalLayout';

/**
 * pages/BajaMensajesPage.jsx  (ruta publica /baja/:token)
 *
 * RQNF-16 (Ley 2300 de 2023, art. 5): el enlace que va al final de cada
 * mensaje comercial. El miembro deja de recibirlos con un clic, sin iniciar
 * sesion. Abrir el enlace no cambia nada (los programas que muestran una vista
 * previa del enlace no dan de baja a nadie): la baja la hace el boton.
 *
 * Solo se muestra el primer nombre y el gimnasio. Los avisos de vencimiento
 * del plan no son comerciales y siguen llegando. La baja queda en el
 * historial de autorizaciones del miembro con el canal ENLACE
 * (backend/src/routes/preferencias.js).
 */
export default function BajaMensajesPage() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState('cargando'); // cargando | listo | hecho | invalido | error
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get(`/baja/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (!vivo) return;
        setDatos(data);
        setEstado(data.aceptaComerciales ? 'listo' : 'hecho');
      })
      .catch((err) => {
        if (!vivo) return;
        setEstado(err.status === 404 ? 'invalido' : 'error');
        setError(err.message || '');
      });
    return () => { vivo = false; };
  }, [token]);

  const darDeBaja = async () => {
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post(`/baja/${encodeURIComponent(token)}`);
      setDatos(data);
      setEstado('hecho');
    } catch (err) {
      setError(err.message || 'No pudimos guardar tu baja. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <LegalLayout
      title="Mensajes comerciales"
      subtitle="Puedes dejar de recibir promociones y mensajes comerciales de tu gimnasio cuando quieras (Ley 2300 de 2023)."
    >
      {estado === 'cargando' && <p>Cargando…</p>}

      {estado === 'invalido' && (
        <div className="legal-callout">
          <div className="legal-callout__title">
            <span className="material-symbols-outlined">link_off</span>
            El enlace no es válido
          </div>
          <p>Revisa que lo hayas copiado completo. También puedes dejar de recibir mensajes desde la app de tu gimnasio o pidiéndolo en recepción.</p>
        </div>
      )}

      {estado === 'error' && (
        <div className="alert alert-error" role="alert">
          <span className="material-symbols-outlined icon">error</span>
          <span>{error || 'No pudimos cargar el enlace. Intenta de nuevo en un momento.'}</span>
        </div>
      )}

      {estado === 'listo' && datos && (
        <>
          <p>
            Hola {datos.nombre}. Con este botón dejas de recibir mensajes comerciales de <strong>{datos.gimnasio}</strong>
            {' '}(promociones, campañas y mensajes para que vuelvas a entrenar).
          </p>
          <p>Los avisos sobre tu plan, como el de vencimiento, no son comerciales y te seguirán llegando.</p>
          {error && (
            <div className="alert alert-error" role="alert">
              <span className="material-symbols-outlined icon">error</span>
              <span>{error}</span>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={darDeBaja} disabled={enviando}>
              <span className="material-symbols-outlined icon">unsubscribe</span>
              {enviando ? 'Guardando…' : 'Dejar de recibir mensajes comerciales'}
            </button>
          </div>
        </>
      )}

      {estado === 'hecho' && datos && (
        <div className="legal-callout">
          <div className="legal-callout__title">
            <span className="material-symbols-outlined">check_circle</span>
            Listo, {datos.nombre}
          </div>
          <p>
            Ya no recibes mensajes comerciales de {datos.gimnasio}. Si cambias de opinión, puedes activarlos de nuevo desde
            la app FitLoyalty («Más» → «Mensajes del gimnasio») o en recepción.
          </p>
          <Link to="/" className="btn btn-ghost">Ir al inicio</Link>
        </div>
      )}
    </LegalLayout>
  );
}
