-- ============================================================================
-- 012_alerta_abandono_como_produccion.sql
--
-- RQF-08 (alertas de abandono): el motor diario escribe en alerta_abandono, y
-- la tabla de la 002 no tiene la forma de produccion (ConsultasDB):
--
--   Docker (002)                     Produccion (ConsultasDB)
--   dias_inactividad                 dias_inactivo
--   activo BOOLEAN                   estado PENDIENTE / GESTIONADA / IGNORADA
--   atendido_por                     id_usuario
--   fecha_creacion                   fecha_alerta
--   (no existe)                      fecha_gestion
--
-- Se renombra y se agrega lo que falta SIN reconstruir la tabla, porque
-- envio_mensaje.id_alerta (migracion 014) tiene una FK hacia ella. Las alertas
-- ya existentes conservan su sentido: activo = TRUE pasa a PENDIENTE y
-- activo = FALSE pasa a GESTIONADA.
--
-- Tambien alinea configuracion_gimnasio con produccion: los umbrales por
-- defecto son 7 dias (amarilla) y 15 (roja), no 14 y 3, y la roja siempre es
-- mayor que la amarilla.
--
-- Idempotente: en una base que ya tiene la forma de produccion no cambia nada.
-- ============================================================================

DO $$
BEGIN
    -- dias_inactividad -> dias_inactivo
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alerta_abandono' AND column_name = 'dias_inactividad')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alerta_abandono' AND column_name = 'dias_inactivo') THEN
        ALTER TABLE alerta_abandono RENAME COLUMN dias_inactividad TO dias_inactivo;
    END IF;

    -- atendido_por -> id_usuario
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alerta_abandono' AND column_name = 'atendido_por')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alerta_abandono' AND column_name = 'id_usuario') THEN
        ALTER TABLE alerta_abandono RENAME COLUMN atendido_por TO id_usuario;
    END IF;

    -- fecha_creacion -> fecha_alerta
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alerta_abandono' AND column_name = 'fecha_creacion')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alerta_abandono' AND column_name = 'fecha_alerta') THEN
        ALTER TABLE alerta_abandono RENAME COLUMN fecha_creacion TO fecha_alerta;
    END IF;

    -- activo -> estado
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alerta_abandono' AND column_name = 'estado') THEN
        ALTER TABLE alerta_abandono ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE';
        ALTER TABLE alerta_abandono
            ADD CONSTRAINT alerta_abandono_estado_check
            CHECK (estado IN ('PENDIENTE', 'GESTIONADA', 'IGNORADA'));
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'alerta_abandono' AND column_name = 'activo') THEN
            UPDATE alerta_abandono SET estado = 'GESTIONADA' WHERE activo = FALSE;
            ALTER TABLE alerta_abandono DROP COLUMN activo;
        END IF;
    END IF;
END $$;

ALTER TABLE alerta_abandono ADD COLUMN IF NOT EXISTS fecha_gestion TIMESTAMP;

-- El motor busca las alertas pendientes de un gimnasio.
CREATE INDEX IF NOT EXISTS idx_alerta_abandono_pendientes
    ON alerta_abandono (id_gimnasio, id_miembro) WHERE estado = 'PENDIENTE';

-- Umbrales como en produccion.
ALTER TABLE configuracion_gimnasio ALTER COLUMN umbral_alerta_amarilla SET DEFAULT 7;
ALTER TABLE configuracion_gimnasio ALTER COLUMN umbral_alerta_roja SET DEFAULT 15;

-- Los valores 14 y 3 eran los del esquema viejo (la roja menor que la amarilla
-- no tiene sentido): se pasan a los de produccion.
UPDATE configuracion_gimnasio
   SET umbral_alerta_amarilla = 7, umbral_alerta_roja = 15
 WHERE umbral_alerta_amarilla = 14 AND umbral_alerta_roja = 3;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'configuracion_gimnasio'::regclass
                      AND contype = 'c'
                      AND pg_get_constraintdef(oid) ILIKE '%umbral_alerta_roja >%')
       AND NOT EXISTS (SELECT 1 FROM configuracion_gimnasio
                        WHERE umbral_alerta_roja <= umbral_alerta_amarilla) THEN
        ALTER TABLE configuracion_gimnasio
            ADD CONSTRAINT configuracion_gimnasio_roja_mayor_check
            CHECK (umbral_alerta_roja > umbral_alerta_amarilla);
    END IF;
END $$;
