-- ============================================================================
-- 020_contrato_entrega.sql
--
-- RQNF-18: el contrato se entrega al miembro y queda constancia de cada
-- entrega, con el texto exacto que recibio (Ley 1480 de 2011, arts. 23 y 37).
--
-- contrato_enviado (migracion 008) solo registraba los envios por WhatsApp y
-- no guardaba el texto, asi que no habia forma de probar que se entrego. Con
-- esta migracion:
--   - canal: WHATSAPP (el envio de RQF-13) o APP (el miembro lo abrio en la
--     app, GET /api/cliente/contrato). Las filas que ya existen son envios por
--     WhatsApp: el DEFAULT las deja asi.
--   - contenido: el texto del contrato tal como se entrego. NULL en las filas
--     anteriores a esta migracion.
--   - telefono_destino deja de ser obligatorio, porque la entrega en la app no
--     va a un telefono; un CHECK lo sigue exigiendo para WHATSAPP.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP NOT NULL (no falla si ya se
-- quito) y las restricciones solo se crean si no existen.
-- Corre igual sobre ConsultasDB y sobre las migraciones de Docker (en las dos
-- la tabla sale de la 008).
-- ============================================================================

ALTER TABLE contrato_enviado ADD COLUMN IF NOT EXISTS canal VARCHAR(10) NOT NULL DEFAULT 'WHATSAPP';
ALTER TABLE contrato_enviado ADD COLUMN IF NOT EXISTS contenido TEXT;
ALTER TABLE contrato_enviado ALTER COLUMN telefono_destino DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.contrato_enviado'::regclass
                      AND conname = 'ck_contrato_enviado_canal') THEN
        ALTER TABLE contrato_enviado
            ADD CONSTRAINT ck_contrato_enviado_canal CHECK (canal IN ('WHATSAPP', 'APP'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.contrato_enviado'::regclass
                      AND conname = 'ck_contrato_enviado_telefono') THEN
        ALTER TABLE contrato_enviado
            ADD CONSTRAINT ck_contrato_enviado_telefono CHECK (canal <> 'WHATSAPP' OR telefono_destino IS NOT NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contrato_enviado_canal
    ON contrato_enviado (id_miembro, canal, creado_en DESC);
