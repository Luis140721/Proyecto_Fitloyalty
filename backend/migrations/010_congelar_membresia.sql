-- ============================================================================
-- 010_congelar_membresia.sql
--
-- RQF-04 (estado Congelada): el administrador puede congelar la membresia de
-- un miembro y descongelarla despues; al descongelar, el vencimiento se corre
-- tantos dias como estuvo congelada.
--
-- La membresia real vive en plan_cobro (el alta de miembros nunca escribio en
-- membresia), asi que no se usa la tabla congelacion_membresia del diseno
-- original, que cuelga de membresia. En su lugar:
--   - plan_cobro.congelado_desde: fecha desde la que el plan esta congelado.
--     NULL = no esta congelado. Es lo que deben mirar las demas consultas
--     (lista de miembros, avisos de vencimiento, check-in).
--   - congelacion_plan: historial de cada congelamiento, con quien lo hizo,
--     quien lo levanto, cuantos dias duro y el motivo.
--
-- Idempotente (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE plan_cobro ADD COLUMN IF NOT EXISTS congelado_desde DATE;

CREATE TABLE IF NOT EXISTS congelacion_plan (
    id_congelacion   SERIAL PRIMARY KEY,
    id_plan_cobro    INTEGER NOT NULL REFERENCES plan_cobro(id_plan_cobro) ON DELETE CASCADE,
    id_miembro       INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_gimnasio      INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    fecha_inicio     DATE NOT NULL,
    fecha_fin        DATE,                -- NULL mientras siga congelada
    dias             INTEGER,             -- dias que se corrio el vencimiento al descongelar
    motivo           VARCHAR(200),
    congelada_por    INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    descongelada_por INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    creada_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_congelacion_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
    CONSTRAINT ck_congelacion_dias   CHECK (dias IS NULL OR dias >= 0)
);

-- Un plan solo puede tener un congelamiento abierto a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ux_congelacion_plan_abierta
    ON congelacion_plan (id_plan_cobro) WHERE fecha_fin IS NULL;

CREATE INDEX IF NOT EXISTS idx_congelacion_plan_miembro
    ON congelacion_plan (id_miembro, creada_en DESC);
