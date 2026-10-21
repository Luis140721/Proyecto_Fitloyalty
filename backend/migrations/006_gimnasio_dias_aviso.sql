-- 006_gimnasio_dias_aviso.sql
--
-- Configuracion por gimnasio de las alertas automaticas de vencimiento
-- de membresia (manda WhatsApp a los miembros que estan a punto de vencer
-- o ya vencieron).
--
-- Por que este campo existe:
--   Cada gimnasio quiere un umbral distinto segun su operacion. Un gym con
--   renovacion mensual probablemente quiera avisar 3 dias antes; un gym con
--   planes trimestrales podria preferir 7 o 15 dias. Dejamos configurable
--   por gimnasio y con un default razonable (3 dias antes + el dia del
--   vencimiento).
--
--   dias_aviso_vencimiento INTEGER NOT NULL DEFAULT 3
--     - 3 -> avisa cuando faltan 3 dias para vencer
--     - Tambien avisa el mismo dia del vencimiento (un segundo aviso)
--     - Si el admin quiere desactivar las alertas automaticas, pone NULL
--       o 0 (interpretado como "desactivado" en el job).

ALTER TABLE gimnasio
    ADD COLUMN IF NOT EXISTS dias_aviso_vencimiento INTEGER NOT NULL DEFAULT 3;

COMMENT ON COLUMN gimnasio.dias_aviso_vencimiento IS
    'Dias antes del vencimiento para mandar WhatsApp de aviso. Default 3.';
