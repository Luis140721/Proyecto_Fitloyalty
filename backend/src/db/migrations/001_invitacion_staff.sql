-- ============================================================================
-- migrations/001_invitacion_staff.sql
--
-- Crea la tabla `invitacion_staff` para el flujo de invitacion de staff
-- por parte del admin. Una fila por invitacion; al aceptar, se crea el
-- usuario correspondiente y se rellenan `fecha_aceptacion` y `id_usuario_creado`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS invitacion_staff (
    id_invitacion     SERIAL PRIMARY KEY,
    id_gimnasio       INTEGER NOT NULL,
    email             VARCHAR(150) NOT NULL,
    nombre            VARCHAR(100) NOT NULL,
    rol_asignado      VARCHAR(30) NOT NULL DEFAULT 'RECEPCIONISTA',
    token_hash        VARCHAR(128) NOT NULL UNIQUE,
    invitado_por      INTEGER NOT NULL,
    fecha_creacion    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion  TIMESTAMP NOT NULL,
    fecha_aceptacion  TIMESTAMP,
    fecha_revocado    TIMESTAMP,
    id_usuario_creado INTEGER,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (invitado_por) REFERENCES usuario(id_usuario),
    FOREIGN KEY (id_usuario_creado) REFERENCES usuario(id_usuario),
    CHECK (rol_asignado IN ('RECEPCIONISTA', 'ADMINISTRADOR'))
);

CREATE INDEX IF NOT EXISTS idx_invitacion_gimnasio ON invitacion_staff(id_gimnasio);
CREATE INDEX IF NOT EXISTS idx_invitacion_email    ON invitacion_staff(LOWER(email));
