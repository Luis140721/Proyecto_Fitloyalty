-- 007_alerta_vencimiento_enviada.sql
--
-- Tabla anti-duplicados para el job automatico de avisos de vencimiento
-- (jobs/expiracion.js). Cada vez que mandamos un WhatsApp a un miembro
-- por vencimiento, registramos la combinacion (id_plan_cobro, dias_restantes)
-- para no mandarle otro igual si el cron corre dos veces el mismo dia o si
-- el admin dispara el job manualmente.

CREATE TABLE IF NOT EXISTS alerta_vencimiento_enviada (
    id_alerta         SERIAL PRIMARY KEY,
    id_miembro        INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_plan_cobro     INTEGER NOT NULL REFERENCES plan_cobro(id_plan_cobro) ON DELETE CASCADE,
    dias_restantes    INTEGER NOT NULL,
    enviado_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Anti-duplicado por (plan_cobro, dias_restantes). Asi, si mandamos el
    -- aviso a 3 dias y al dia siguiente queremos mandar el de "vence manana",
    -- son dos filas distintas y ambos pasan.
    CONSTRAINT uq_plan_dias UNIQUE (id_plan_cobro, dias_restantes)
);

CREATE INDEX IF NOT EXISTS idx_alerta_enviada_enviado_at
    ON alerta_vencimiento_enviada (enviado_at DESC);

COMMENT ON TABLE alerta_vencimiento_enviada IS
    'Registro de avisos automaticos de vencimiento enviados por WhatsApp. Se usa para evitar duplicados si el cron corre mas de una vez al dia o si el admin dispara manualmente el job.';
