-- ============================================================================
-- 009_auditoria_y_gamificacion.sql
--
-- RQNF-10 (el esquema evoluciona con migraciones): una base creada solo con
-- backend/migrations no tenia la tabla auditoria ni las columnas que el codigo
-- usa en la gamificacion, porque la base de produccion salio de
-- ConsultasDB/Query_Inicial_Crear_Tablas.sql. Las definiciones de aqui se
-- copian de ese archivo.
--
-- Quien lo usa:
--   - auditoria: DELETE /api/auth/account (routes/auth.js, borrado de la cuenta).
--   - hito_gamificacion, hito_miembro, reto y reto_miembro: GET /api/cliente/
--     gamificacion y /retos (routes/cliente.js). hito_miembro.mostrado_en_checkin
--     queda listo para el mensaje de hito en el check-in (RQF-11).
--
-- Todo es idempotente (IF NOT EXISTS y restricciones con el nombre que
-- PostgreSQL les dio en produccion), asi que en la base de produccion, que ya
-- tiene todo esto, no cambia nada.
--
-- No toca vista_miembros_activos: la recrea la 011 (filtrada por gimnasio). Como
-- migrate.js aplica las pendientes en orden alfabetico, en produccion esta 009
-- puede correr despues de la 011; si recreara la vista, volveria la fuga entre
-- gimnasios.
-- ============================================================================

-- ---------------------------------------------------------------- auditoria
CREATE TABLE IF NOT EXISTS auditoria (
    id_auditoria   SERIAL PRIMARY KEY,
    id_gimnasio    INTEGER,
    tabla_afectada VARCHAR(100) NOT NULL,
    id_registro    INTEGER,
    accion         VARCHAR(20) NOT NULL,
    id_usuario     INTEGER,
    detalle        JSONB,
    fecha_evento   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PROCESO'))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_fecha ON auditoria (tabla_afectada, fecha_evento DESC);

-- ---------------------------------------------------------------- columnas
-- Las que en produccion tienen valor por defecto se agregan igual. Las que son
-- NOT NULL sin valor por defecto se agregan sin NOT NULL y se endurecen abajo
-- solo si la tabla no tiene filas con nulos.
ALTER TABLE hito_gamificacion
    ADD COLUMN IF NOT EXISTS tipo_hito      VARCHAR(30),
    ADD COLUMN IF NOT EXISTS valor_objetivo INTEGER,
    ADD COLUMN IF NOT EXISTS mensaje        TEXT;

ALTER TABLE hito_miembro
    ADD COLUMN IF NOT EXISTS fecha_logro         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS mostrado_en_checkin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE reto
    ADD COLUMN IF NOT EXISTS meta_asistencias  INTEGER,
    ADD COLUMN IF NOT EXISTS recompensa        VARCHAR(200),
    ADD COLUMN IF NOT EXISTS segmento_elegible VARCHAR(50),
    ADD COLUMN IF NOT EXISTS estado            VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADO';

ALTER TABLE reto_miembro
    ADD COLUMN IF NOT EXISTS estado              VARCHAR(20) NOT NULL DEFAULT 'EN_CURSO',
    ADD COLUMN IF NOT EXISTS checkins_acumulados INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS porcentaje_avance   NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------- NOT NULL y restricciones
DO $$
DECLARE
    sin_nulos BOOLEAN;
    col RECORD;
BEGIN
    -- NOT NULL como en produccion, solo si no hay nulos (en produccion ya lo son).
    FOR col IN
        SELECT * FROM (VALUES
            ('hito_gamificacion', 'tipo_hito'),
            ('hito_gamificacion', 'valor_objetivo'),
            ('hito_gamificacion', 'mensaje'),
            ('reto', 'meta_asistencias'),
            ('reto', 'segmento_elegible')
        ) AS t(tabla, columna)
    LOOP
        EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM %I WHERE %I IS NULL)', col.tabla, col.columna)
            INTO sin_nulos;
        IF sin_nulos THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET NOT NULL', col.tabla, col.columna);
        END IF;
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Mismos nombres que PostgreSQL genero en produccion: si ya existen, no se repiten.
    FOR r IN
        SELECT * FROM (VALUES
            ('hito_gamificacion', 'hito_gamificacion_tipo_hito_check',
             'CHECK (tipo_hito IN (''RACHA'', ''TOTAL_ASISTENCIAS''))'),
            ('hito_gamificacion', 'hito_gamificacion_valor_objetivo_check',
             'CHECK (valor_objetivo > 0)'),
            ('hito_gamificacion', 'hito_gamificacion_id_gimnasio_tipo_hito_valor_objetivo_key',
             'UNIQUE (id_gimnasio, tipo_hito, valor_objetivo)'),
            ('reto', 'reto_meta_asistencias_check',
             'CHECK (meta_asistencias > 0)'),
            ('reto', 'reto_segmento_elegible_check',
             'CHECK (segmento_elegible IN (''TODOS'', ''INACTIVOS'', ''NUEVOS'', ''PROXIMOS_A_VENCER'', ''ETIQUETA''))'),
            ('reto', 'reto_estado_check',
             'CHECK (estado IN (''PROGRAMADO'', ''ACTIVO'', ''COMPLETADO'', ''CANCELADO''))'),
            ('reto_miembro', 'reto_miembro_estado_check',
             'CHECK (estado IN (''EN_CURSO'', ''COMPLETADO'', ''CANCELADO''))'),
            ('reto_miembro', 'reto_miembro_checkins_acumulados_check',
             'CHECK (checkins_acumulados >= 0)'),
            ('reto_miembro', 'reto_miembro_porcentaje_avance_check',
             'CHECK (porcentaje_avance >= 0 AND porcentaje_avance <= 100)')
        ) AS t(tabla, nombre, definicion)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
             WHERE c.conname = r.nombre AND c.conrelid = r.tabla::regclass
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', r.tabla, r.nombre, r.definicion);
        END IF;
    END LOOP;
END $$;
