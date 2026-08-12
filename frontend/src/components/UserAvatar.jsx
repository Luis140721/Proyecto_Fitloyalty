import { useState } from 'react';

/**
 * Avatar: muestra foto si existe; si no, iniciales del nombre sobre fondo ultraviolet.
 */
export default function UserAvatar({ user, name, photoUrl, size = 40 }) {
  const [imgError, setImgError] = useState(false);

  const displayName = user?.name || user?.nombre || name || '';
  const photo = user?.photoUrl || user?.foto_url || photoUrl;
  const initials = (displayName || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  if (photo && !imgError) {
    return (
      <img
        src={photo}
        alt={displayName ? `Foto de ${displayName}` : 'Avatar'}
        className="avatar"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className="avatar avatar-primary"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}