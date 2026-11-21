-- ============================================================================
-- 018_campana_destinatario_ley2300.sql
--
-- RQNF-16 (Ley 2300 de 2023) en las campañas (RQF-10): cada destinatario que
-- no se puede contactar queda registrado con su motivo, en vez de recibir el
-- mensaje o de desaparecer de la campaña.
--
--   campana_destinatario.estado_envio admite OMITIDO: el miembro cayo en el
--   segmento, pero la ley no deja escribirle por esta campaña.
--
--   campana_destinatario.motivo:
--     NO_AUTORIZA          no acepto mensajes comerciales (o se dio de baja)
--     CANAL_NO_AUTORIZADO  no autorizo el canal de la campaña
--     FRECUENCIA           ya se le contacto hoy, u otro canal esta semana
--     FUERA_DE_HORARIO     se cerro la franja permitida antes de enviarle; el
--                          destinatario sigue PENDIENTE y sale en la siguiente
--                          franja (reintento o scheduler)
--     SIN_TELEFONO, SIN_CORREO, ERROR_ENVIO
--                          motivos de un FALLIDO, para que el panel los muestre
--
-- La tabla viene de ConsultasDB en produccion y de la 015 en Docker, con el
-- mismo CHECK sin nombre sobre estado_envio. Se busca por su definicion, se
-- quita y se crea uno con nombre que admite OMITIDO.
--
-- Idempotente. Corre igual sobre ConsultasDB y sobre las migraciones de Docker.
-- ============================================================================

ALTER TABLE campana_destinatario ADD COLUMN IF NOT EXISTS motivo VARCHAR(30);

DO $$
DECLARE
    ck RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.campana_destinatario'::regclass
                      AND conname = 'ck_campana_destinatario_estado') THEN
        FOR ck IN
            SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.campana_destinatario'::regclass
               AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE '%estado_envio%'
        LOOP
            EXECUTE format('ALTER TABLE campana_destinatario DROP CONSTRAINT %I', ck.conname);
        END LOOP;
        ALTER TABLE campana_destinatario
            ADD CONSTRAINT ck_campana_destinatario_estado
            CHECK (estado_envio IN ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'OMITIDO'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.campana_destinatario'::regclass
                      AND conname = 'ck_campana_destinatario_motivo') THEN
        ALTER TABLE campana_destinatario
            ADD CONSTRAINT ck_campana_destinatario_motivo
            CHECK (motivo IS NULL OR motivo IN (
                'NO_AUTORIZA', 'CANAL_NO_AUTORIZADO', 'FRECUENCIA', 'FUERA_DE_HORARIO',
                'SIN_TELEFONO', 'SIN_CORREO', 'ERROR_ENVIO'));
    END IF;

    -- Un omitido siempre dice por que.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.campana_destinatario'::regclass
                      AND conname = 'ck_campana_destinatario_omitido') THEN
        ALTER TABLE campana_destinatario
            ADD CONSTRAINT ck_campana_destinatario_omitido
            CHECK (estado_envio <> 'OMITIDO' OR motivo IS NOT NULL);
    END IF;
END $$;
