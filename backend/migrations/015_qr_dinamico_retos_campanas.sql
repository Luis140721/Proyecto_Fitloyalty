-- ============================================================================
-- 015_qr_dinamico_retos_campanas.sql
--
-- Tres cosas, todas idempotentes y seguras sobre la base de produccion (que
-- salio de ConsultasDB/Query_Inicial_Crear_Tablas.sql):
--
-- 1. QR dinamico (check-in): gimnasio.qr_dinamico_obligatorio. Si es TRUE, el
--    check-in solo acepta el QR que cambia cada 30 segundos en la app del
--    miembro (o el documento); el QR fijo impreso o en captura deja de servir.
--    Por defecto FALSE, para no dejar sin entrar a nadie al desplegar.
--
-- 2. Retos (RQF-12): reto.creado_por y reto_miembro.fecha_inscripcion, que
--    produccion ya tiene y Docker no.
--
-- 3. Campanas (RQF-10): en produccion plantilla_mensaje, campana y
--    campana_destinatario ya tienen la forma que usa el codigo. En Docker
--    (migracion 002) tienen otra (cuerpo/asunto, tipo, estado BORRADOR...) y
--    ninguna ruta las usaba, asi que se reconstruyen con el DDL de ConsultasDB.
--    Si alguna tuviera filas, se renombra a <tabla>_002 en vez de borrarla.
--    Despues se agrega campana.canal (WHATSAPP o EMAIL) a las dos bases.
-- ============================================================================

-- ------------------------------------------------------------- 1. QR dinamico
ALTER TABLE gimnasio
    ADD COLUMN IF NOT EXISTS qr_dinamico_obligatorio BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------------ 2. Retos
ALTER TABLE reto
    ADD COLUMN IF NOT EXISTS creado_por INTEGER;

ALTER TABLE reto_miembro
    ADD COLUMN IF NOT EXISTS fecha_inscripcion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'reto'::regclass AND contype = 'f'
           AND conname = 'reto_creado_por_fkey'
    ) THEN
        ALTER TABLE reto ADD CONSTRAINT reto_creado_por_fkey
            FOREIGN KEY (creado_por) REFERENCES usuario(id_usuario);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'reto'::regclass AND conname = 'reto_check'
    ) AND NOT EXISTS (SELECT 1 FROM reto WHERE fecha_fin < fecha_inicio) THEN
        ALTER TABLE reto ADD CONSTRAINT reto_check CHECK (fecha_fin >= fecha_inicio);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reto_gimnasio_fechas ON reto (id_gimnasio, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_reto_miembro_miembro ON reto_miembro (id_miembro, estado);

-- -------------------------------------------------------------- 3. Campanas
DO $$
DECLARE
    forma_docker BOOLEAN;
    con_filas    BOOLEAN;
    fk           RECORD;
    t            TEXT;
BEGIN
    -- La forma de produccion tiene plantilla_mensaje.contenido y campana.segmento.
    forma_docker := NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'plantilla_mensaje' AND column_name = 'contenido'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'campana' AND column_name = 'segmento'
    );

    IF forma_docker THEN
        -- Las FK que apuntan a estas tablas (envio_mensaje.id_campana e
        -- id_plantilla) se sueltan y se vuelven a crear al final.
        FOR fk IN
            SELECT c.conname, c.conrelid::regclass::text AS tabla
              FROM pg_constraint c
             WHERE c.contype = 'f'
               AND c.confrelid IN ('campana'::regclass, 'plantilla_mensaje'::regclass, 'campana_destinatario'::regclass)
               AND c.conrelid NOT IN ('campana'::regclass, 'plantilla_mensaje'::regclass, 'campana_destinatario'::regclass)
        LOOP
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tabla, fk.conname);
        END LOOP;

        FOREACH t IN ARRAY ARRAY['campana_destinatario', 'campana', 'plantilla_mensaje'] LOOP
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', t) INTO con_filas;
            IF con_filas THEN
                RAISE NOTICE '015: % tiene filas; se conserva como %_002', t, t;
                EXECUTE format('ALTER TABLE %I RENAME TO %I', t, t || '_002');
            ELSE
                EXECUTE format('DROP TABLE %I CASCADE', t);
            END IF;
        END LOOP;

        CREATE TABLE plantilla_mensaje (
            id_plantilla SERIAL PRIMARY KEY,
            id_gimnasio INTEGER NOT NULL,
            nombre VARCHAR(100) NOT NULL,
            contenido TEXT NOT NULL,
            activa BOOLEAN NOT NULL DEFAULT TRUE,
            fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            creada_por INTEGER,
            FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
            FOREIGN KEY (creada_por) REFERENCES usuario(id_usuario),
            UNIQUE (id_gimnasio, nombre)
        );

        CREATE TABLE campana (
            id_campana SERIAL PRIMARY KEY,
            id_gimnasio INTEGER NOT NULL,
            nombre VARCHAR(150) NOT NULL,
            segmento VARCHAR(50) NOT NULL,
            mensaje TEXT NOT NULL,
            id_plantilla INTEGER,
            tipo_disparo VARCHAR(20) NOT NULL,
            dias_inactividad INTEGER,
            fecha_programada TIMESTAMP,
            fecha_ejecucion TIMESTAMP,
            estado VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADA',
            activa BOOLEAN NOT NULL DEFAULT TRUE,
            creada_por INTEGER,
            fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
            FOREIGN KEY (id_plantilla) REFERENCES plantilla_mensaje(id_plantilla),
            FOREIGN KEY (creada_por) REFERENCES usuario(id_usuario),
            CHECK (tipo_disparo IN ('AUTOMATICO', 'MANUAL', 'PROGRAMADO')),
            CHECK (estado IN ('PROGRAMADA', 'ENVIADA', 'CANCELADA')),
            CHECK (segmento IN ('INACTIVOS', 'NUEVOS', 'PROXIMOS_A_VENCER', 'ETIQUETA', 'TODOS'))
        );

        CREATE TABLE campana_destinatario (
            id_campana_destinatario SERIAL PRIMARY KEY,
            id_campana INTEGER NOT NULL,
            id_miembro INTEGER NOT NULL,
            estado_envio VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
            fecha_envio TIMESTAMP,
            FOREIGN KEY (id_campana) REFERENCES campana(id_campana),
            FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
            UNIQUE (id_campana, id_miembro),
            CHECK (estado_envio IN ('PENDIENTE', 'ENVIADO', 'FALLIDO'))
        );
    END IF;

    -- envio_mensaje -> campana / plantilla_mensaje, con los nombres de produccion.
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'id_campana')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'envio_mensaje'::regclass AND contype = 'f'
                          AND confrelid = 'campana'::regclass) THEN
        UPDATE envio_mensaje e SET id_campana = NULL
         WHERE id_campana IS NOT NULL AND NOT EXISTS (SELECT 1 FROM campana c WHERE c.id_campana = e.id_campana);
        ALTER TABLE envio_mensaje ADD CONSTRAINT envio_mensaje_id_campana_fkey
            FOREIGN KEY (id_campana) REFERENCES campana(id_campana);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'id_plantilla')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'envio_mensaje'::regclass AND contype = 'f'
                          AND confrelid = 'plantilla_mensaje'::regclass) THEN
        UPDATE envio_mensaje e SET id_plantilla = NULL
         WHERE id_plantilla IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plantilla_mensaje p WHERE p.id_plantilla = e.id_plantilla);
        ALTER TABLE envio_mensaje ADD CONSTRAINT envio_mensaje_id_plantilla_fkey
            FOREIGN KEY (id_plantilla) REFERENCES plantilla_mensaje(id_plantilla);
    END IF;
END $$;

-- Canal de la campana: produccion no lo tenia (envio_mensaje guarda el canal de
-- cada envio, pero la campana necesita saber por donde salir).
ALTER TABLE campana
    ADD COLUMN IF NOT EXISTS canal VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'campana'::regclass AND conname = 'campana_canal_check') THEN
        ALTER TABLE campana ADD CONSTRAINT campana_canal_check CHECK (canal IN ('WHATSAPP', 'EMAIL'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campana_gimnasio ON campana (id_gimnasio);
CREATE INDEX IF NOT EXISTS idx_campana_programadas ON campana (estado, fecha_programada)
    WHERE activa = TRUE AND tipo_disparo = 'PROGRAMADO';
CREATE INDEX IF NOT EXISTS idx_campana_destinatario_campana ON campana_destinatario (id_campana, estado_envio);
