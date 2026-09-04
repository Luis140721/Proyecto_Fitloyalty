import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';

/**
 * components/MenuPerfil.jsx
 *
 * El avatar del encabezado, que antes era solo una imagen. Al tocarlo se abre
 * la ficha de quien tiene la sesion: nombre, correo, rol y gimnasio; y desde
 * ahi se llega a Configuracion o se cierra sesion.
 */

const NOMBRE_ROL = {
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  trainer: 'Entrenador',
};

export default function MenuPerfil() {
  const { user, gym, logout } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

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

  const nombre = user?.name || user?.nombre || 'Usuario';
  const rol = NOMBRE_ROL[user?.role] || user?.rol_nombre || 'Usuario';
  const esAdmin = user?.role === 'admin';

  return (
    <div className="menu-flotante" ref={contenedorRef}>
      <button
        className="menu-perfil__disparador"
        onClick={() => setAbierto((a) => !a)}
        aria-label="Tu perfil"
        aria-expanded={abierto}
        title={nombre}
      >
        <UserAvatar user={user} size={36} />
      </button>

      {abierto && (
        <div className="menu-flotante__panel menu-flotante__panel--perfil anim-scale-in" role="dialog" aria-label="Tu perfil">
          <div className="menu-perfil__ficha">
            <UserAvatar user={user} size={52} />
            <div className="menu-perfil__datos">
              <strong>{nombre}</strong>
              <small>{user?.email}</small>
              <span className="menu-perfil__rol">{rol}</span>
            </div>
          </div>

          <dl className="menu-perfil__lista">
            <div>
              <dt>Gimnasio</dt>
              <dd>{gym?.name || '—'}</dd>
            </div>
            <div>
              <dt>Cuenta</dt>
              <dd>{gym?.active === false ? 'Inactiva' : 'Activa'}</dd>
            </div>
          </dl>

          <div className="menu-perfil__acciones">
            {esAdmin && (
              <Link to="/admin/config" className="btn btn-secondary btn-sm" onClick={() => setAbierto(false)}>
                <span className="material-symbols-outlined icon">settings</span>
                Configuración
              </Link>
            )}
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              <span className="material-symbols-outlined icon">logout</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
