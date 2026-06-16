import { useState } from 'react';

/**
 * Avatar del usuario: muestra foto de perfil si existe, o la inicial del nombre.
 */
export default function UserAvatar({ name, photoUrl, size = 40 }) {
  const [imgError, setImgError] = useState(false);
  const initial = name?.charAt(0)?.toUpperCase() || '?';
  const showPhoto = photoUrl && !imgError;

  if (showPhoto) {
    return (
      <img
        src={photoUrl}
        alt={name ? `Foto de ${name}` : 'Avatar'}
        className="dash-header__avatar dash-header__avatar--img"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className="dash-header__avatar"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
