-- 008_contrato_enviado.sql
--
-- Tabla de auditoria: cada vez que un admin envia el contrato de
-- membresia por WhatsApp a un miembro, queda registro. Asi el gym
-- tiene constancia legal de que entrego los terminos al miembro.
--
-- Columnas:
--   id_contrato_enviado   PK
--   id_miembro            a quien se le envio
--   id_gimnasio           desde que gimnasio
--   enviado_por           id_usuario del admin que disparo el envio
--   telefono_destino      telefono al que se mando (con prefijo 57)
--   plantilla_version     'v1' por ahora; permite cambiar el texto
--                         sin perder la trazabilidad del que se envio
--   exito                 true/false segun si el cliente WhatsApp
--                         reporto envio OK
--   error_mensaje         si fallo, que fallo
--   creado_en             timestamp

CREATE TABLE IF NOT EXISTS contrato_enviado (
    id_contrato_enviado   SERIAL PRIMARY KEY,
    id_miembro            INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_gimnasio           INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    enviado_por           INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    telefono_destino      VARCHAR(30) NOT NULL,
    plantilla_version     VARCHAR(20) NOT NULL DEFAULT 'v1',
    exito                 BOOLEAN NOT NULL DEFAULT FALSE,
    error_mensaje         TEXT,
    creado_en             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contrato_enviado_miembro
    ON contrato_enviado (id_miembro, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_enviado_gimnasio
    ON contrato_enviado (id_gimnasio, creado_en DESC);
