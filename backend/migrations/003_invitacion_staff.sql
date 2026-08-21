CREATE TABLE IF NOT EXISTS invitacion_staff (
  id_invitacion SERIAL PRIMARY KEY,
  id_gimnasio INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
  email VARCHAR(150) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  rol_asignado VARCHAR(30) NOT NULL CHECK (rol_asignado IN ('RECEPCIONISTA','ADMINISTRADOR')),
  token_hash TEXT NOT NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion TIMESTAMP NOT NULL,
  fecha_aceptacion TIMESTAMP NULL,
  fecha_revocado TIMESTAMP NULL,
  id_usuario_creador INTEGER NOT NULL REFERENCES usuario(id_usuario)
);
CREATE INDEX IF NOT EXISTS idx_invitacion_gimnasio ON invitacion_staff(id_gimnasio);
CREATE INDEX IF NOT EXISTS idx_invitacion_token ON invitacion_staff(token_hash);
ALTER TABLE gimnasio ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE gimnasio ADD COLUMN IF NOT EXISTS plan_activo VARCHAR(20) NOT NULL DEFAULT 'TRIAL';
