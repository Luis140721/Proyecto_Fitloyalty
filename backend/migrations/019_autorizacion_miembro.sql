-- ============================================================================
-- 019_autorizacion_miembro.sql
--
-- RQNF-17: autorizaciones del miembro con historial, y representante legal de
-- los menores de edad (Ley 1581 de 2012, arts. 5, 6 y 7; Decreto 1377 de 2013,
-- arts. 6, 7, 8 y 12).
--
-- Hasta ahora el alta guardaba dos booleanos en miembro (acepto_terminos y
-- autorizo_datos, migracion 004): no decian cuando, con que texto ni por que
-- canal se dio la autorizacion, y no habia forma de pedir aparte la de los
-- datos sensibles (condiciones medicas y alergias) ni de registrar al
-- representante de un menor.
--
-- Con esta migracion:
--   - miembro.representante_*: datos del representante legal del menor
--     (nombre, tipo y numero de documento, parentesco y telefono). Son los
--     datos vigentes; la foto de cada autorizacion queda en el historial.
--   - autorizacion_miembro: una fila por cada vez que se otorga o se revoca
--     una autorizacion. Nunca se actualiza ni se borra una fila (salvo que se
--     borre el miembro o el gimnasio): la autorizacion vigente de cada tipo es
--     la ultima fila de ese tipo. Cada fila es la prueba que piden los arts. 7
--     y 8 del Decreto 1377: fecha, version del texto que se le mostro al titular,
--     canal (PANEL o APP) y el usuario del personal que la registro (NULL si
--     la dio el miembro desde la app).
--       tipo:  TERMINOS             aceptacion del contrato del gimnasio
--              TRATAMIENTO_DATOS    autorizacion de tratamiento (Ley 1581)
--              DATOS_SENSIBLES      autorizacion separada y opcional (art. 6)
--              REPRESENTANTE_MENOR  autorizacion del representante (art. 7);
--                                   en detalle va la foto de sus datos
--              MENSAJES_COMERCIALES reservado para la autorizacion de mensajes
--                                   comerciales (Ley 2300 de 2023)
--   - Los booleanos acepto_terminos y autorizo_datos se conservan por
--     compatibilidad: el alta los sigue llenando.
--
-- Datos que ya existen: los miembros con acepto_terminos o autorizo_datos en
-- TRUE reciben una fila de ese tipo con version 'v0' (texto anterior, sin
-- version), canal PANEL y la fecha de registro del miembro, marcada en
-- detalle como traida por esta migracion. Los datos sensibles NO se migran:
-- nunca se pidio una autorizacion separada para ellos, asi que no hay nada
-- que probar. Los miembros que ya tienen condiciones medicas o alergias
-- quedan sin autorizacion de datos sensibles; el panel lo avisa al abrirlos y
-- se borran al guardarlos sin marcar la autorizacion (decision documentada en
-- docs/evidencias/rqnf-17-datos-sensibles-menores.md). Esta migracion no borra
-- ningun dato.
--
-- ON DELETE CASCADE hacia miembro y gimnasio: el borrado permanente de un
-- miembro y el borrado de la cuenta (Ley 1581) se llevan su historial, como
-- congelacion_plan y contrato_enviado.
--
-- Idempotente (IF NOT EXISTS y NOT EXISTS en la carga de los datos viejos).
-- Corre igual sobre ConsultasDB y sobre las migraciones de Docker.
-- ============================================================================

ALTER TABLE miembro ADD COLUMN IF NOT EXISTS representante_nombre         VARCHAR(100);
ALTER TABLE miembro ADD COLUMN IF NOT EXISTS representante_tipo_documento VARCHAR(10);
ALTER TABLE miembro ADD COLUMN IF NOT EXISTS representante_documento      VARCHAR(20);
ALTER TABLE miembro ADD COLUMN IF NOT EXISTS representante_parentesco     VARCHAR(40);
ALTER TABLE miembro ADD COLUMN IF NOT EXISTS representante_telefono       VARCHAR(20);

CREATE TABLE IF NOT EXISTS autorizacion_miembro (
    id_autorizacion  SERIAL PRIMARY KEY,
    id_miembro       INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_gimnasio      INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    tipo             VARCHAR(30) NOT NULL,
    otorgada         BOOLEAN NOT NULL,
    version_texto    VARCHAR(20) NOT NULL,
    canal            VARCHAR(10) NOT NULL,
    registrada_por   INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    detalle          JSONB,
    fecha            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_autorizacion_tipo CHECK (tipo IN (
        'TERMINOS', 'TRATAMIENTO_DATOS', 'DATOS_SENSIBLES',
        'REPRESENTANTE_MENOR', 'MENSAJES_COMERCIALES')),
    CONSTRAINT ck_autorizacion_canal CHECK (canal IN ('PANEL', 'APP'))
);

-- La vigente de cada tipo: la ultima fila (fecha, y el id para desempatar).
CREATE INDEX IF NOT EXISTS idx_autorizacion_miembro_tipo
    ON autorizacion_miembro (id_miembro, tipo, fecha DESC, id_autorizacion DESC);

CREATE INDEX IF NOT EXISTS idx_autorizacion_miembro_gimnasio
    ON autorizacion_miembro (id_gimnasio, fecha DESC);

-- Datos viejos: los booleanos de la migracion 004 pasan al historial. Se
-- revisa que las columnas existan por si la base no paso por la 004.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'miembro' AND column_name = 'acepto_terminos') THEN
        INSERT INTO autorizacion_miembro (id_miembro, id_gimnasio, tipo, otorgada, version_texto, canal, detalle, fecha)
        SELECT m.id_miembro, m.id_gimnasio, 'TERMINOS', TRUE, 'v0', 'PANEL',
               '{"origen": "migracion_019", "nota": "acepto_terminos = TRUE antes de RQNF-17; fecha = fecha de registro"}'::jsonb,
               m.fecha_registro
          FROM miembro m
         WHERE m.acepto_terminos = TRUE
           AND NOT EXISTS (SELECT 1 FROM autorizacion_miembro a
                            WHERE a.id_miembro = m.id_miembro AND a.tipo = 'TERMINOS');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'miembro' AND column_name = 'autorizo_datos') THEN
        INSERT INTO autorizacion_miembro (id_miembro, id_gimnasio, tipo, otorgada, version_texto, canal, detalle, fecha)
        SELECT m.id_miembro, m.id_gimnasio, 'TRATAMIENTO_DATOS', TRUE, 'v0', 'PANEL',
               '{"origen": "migracion_019", "nota": "autorizo_datos = TRUE antes de RQNF-17; fecha = fecha de registro"}'::jsonb,
               m.fecha_registro
          FROM miembro m
         WHERE m.autorizo_datos = TRUE
           AND NOT EXISTS (SELECT 1 FROM autorizacion_miembro a
                            WHERE a.id_miembro = m.id_miembro AND a.tipo = 'TRATAMIENTO_DATOS');
    END IF;
END $$;
