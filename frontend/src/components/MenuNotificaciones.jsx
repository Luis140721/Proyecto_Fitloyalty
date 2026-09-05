import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import IconoWhatsapp from './IconoWhatsapp';

/**
 * components/MenuNotificaciones.jsx
 *
 * La campana del encabezado. Los avisos no son un buzon de mensajes: son cosas
 * que hay que hacer hoy (membresias vencidas, renovaciones proximas, miembros
 * que dejaron de venir), calculadas por el backend a partir de los datos
 * reales del gimnasio.
 *
 * Al tocar un aviso se va a Miembros con ese nombre ya buscado, que es lo que
 * uno quiere hacer despues de leerlo.
 */

const ETIQUETA_TIPO = {
  vencida: 'Vencida',
  'por-vencer': 'Renueva',
  riesgo: 'En riesgo',
};

export default function MenuNotificaciones() {
  const [abierto, setAbierto] = useState(false);
  const [avisos, setAvisos] = useState([]);
  const [cargando, setCargando] = useState(false);
  // Avisos a los que ya se les escribio en esta sesion, para marcarlos.
  const [enviados, setEnviados] = useState(() => new Set());
  const [error, setError] = useState('');
  const contenedorRef = useRef(null);
  const navigate = useNavigate();

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/admin/notificaciones');
      setAvisos(data.avisos || []);
    } catch (err) {
      setError('No pudimos cargar los avisos.');
    } finally {
      setCargando(false);
    }
  };

  // Se carga al montar para poder pintar el contador, y se refresca cada
  // dos minutos: son datos que cambian despacio.
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 120000);
    return () => clearInterval(t);
  }, []);

  // Cerrar al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  const irAlMiembro = (aviso) => {
    setAbierto(false);
    // El nombre va en el titulo; se manda como busqueda a la pantalla de miembros.
    navigate(`/admin/miembros?q=${encodeURIComponent(aviso.nombreMiembro || '')}`);
  };

  /**
   * Abre WhatsApp con el mensaje ya escrito. No se envia solo: se deja listo
   * para que la persona lo revise y le de enviar, que ademas es lo que exige
   * WhatsApp desde un enlace.
   *
   * El envio queda registrado en el sistema para poder demostrar que se
   * contacto al miembro, aunque la entrega la haga el telefono del gimnasio.
   */
  const escribirPorWhatsapp = async (aviso, e) => {
    e.stopPropagation();          // no navegar al miembro al mismo tiempo
    const url = `https://wa.me/${aviso.telefono}?text=${encodeURIComponent(aviso.mensaje || '')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setEnviados((prev) => new Set(prev).add(aviso.id));
    try {
      await api.post('/admin/notificaciones/enviado', {
        idMiembro: aviso.idMiembro,
        canal: 'WHATSAPP',
        tipo: aviso.tipo,
      });
    } catch (_) {
      // Si no se pudo dejar constancia, el mensaje igual se abrio: no vale
      // la pena interrumpir al usuario por el registro.
    }
  };

  return (
    <div className="menu-flotante" ref={contenedorRef}>
      <button
        className={`admin-header__action${avisos.length > 0 ? ' admin-header__action--badge' : ''}`}
        onClick={() => { setAbierto((a) => !a); if (!abierto) cargar(); }}
        aria-label={`Notificaciones${avisos.length ? ` (${avisos.length})` : ''}`}
        aria-expanded={abierto}
        title="Notificaciones"
      >
        <span className="material-symbols-outlined icon">notifications</span>
        {avisos.length > 0 && <span className="menu-flotante__contador">{avisos.length}</span>}
      </button>

      {abierto && (
        <div className="menu-flotante__panel anim-scale-in" role="dialog" aria-label="Notificaciones">
          <header className="menu-flotante__cabecera">
            <strong>Avisos</strong>
            <button className="btn btn-ghost btn-sm" onClick={cargar} disabled={cargando}>
              <span className="material-symbols-outlined icon">refresh</span>
            </button>
          </header>

          <div className="menu-flotante__cuerpo">
            {cargando && avisos.length === 0 && (
              <p className="menu-flotante__vacio">Cargando…</p>
            )}
            {error && <p className="menu-flotante__vacio">{error}</p>}
            {!cargando && !error && avisos.length === 0 && (
              <p className="menu-flotante__vacio">
                Todo al día. No hay membresías por vencer ni miembros en riesgo.
              </p>
            )}
            {avisos.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`aviso aviso--${a.tipo}`}
                onClick={() => irAlMiembro(a)}
              >
                <span className="material-symbols-outlined aviso__icono">{a.icono}</span>
                <span className="aviso__texto">
                  <strong>{a.titulo}</strong>
                  <small>{a.detalle}</small>
                </span>
                <span className="aviso__acciones">
                  <span className="aviso__etiqueta">{ETIQUETA_TIPO[a.tipo] || a.tipo}</span>
                  {a.telefono ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className={`aviso__wa${enviados.has(a.id) ? ' aviso__wa--enviado' : ''}`}
                      onClick={(e) => escribirPorWhatsapp(a, e)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') escribirPorWhatsapp(a, e); }}
                      title={`Escribirle a ${a.nombreMiembro} por WhatsApp`}
                    >
                      <IconoWhatsapp />
                      {enviados.has(a.id) ? 'Enviado' : 'WhatsApp'}
                    </span>
                  ) : (
                    <span className="aviso__sin-tel" title="Este miembro no tiene un teléfono válido registrado">
                      Sin teléfono
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
