-- ============================================================================
-- 016_notificacion_destinatario.sql
--
-- Issue #46 y RQF-12: bandeja de mensajes de la app del miembro. Va despues de
-- la 015 (QR dinamico, retos y campanas) y no depende de ella.
--
-- 1. notificacion.destinatario
--
--    La tabla notificacion ya tiene id_miembro, pero esa columna tambien se usa
--    en avisos PARA EL ADMINISTRADOR SOBRE un miembro: lib/accesos.js guarda ahi
--    el acceso bloqueado y lib/retos.js el reto completado, y los dos los lee
--    la campana del panel (routes/notificaciones.js). Para guardar tambien
--    mensajes PARA EL MIEMBRO («¡Completaste el reto!», «El gimnasio cancelo el
--    reto») hace falta saber a quien va cada fila:
--
--      destinatario = 'GIMNASIO'  la ve el personal en la campana del panel
--      destinatario = 'MIEMBRO'   la ve el miembro en la app (GET /api/cliente/mensajes)
--
--    Con el DEFAULT, todas las filas que ya existen y todo el codigo que
--    inserta sin decir el destinatario siguen siendo del gimnasio.
--
--    El indice sirve a la bandeja del miembro: sus mensajes y cuantos no ha
--    leido.
--
-- 2. idx_reto_miembro_miembro: una sola definicion
--
--    La 015 lo crea como (id_miembro, estado), que sirve a la consulta del
--    check-in (retos EN_CURSO de un miembro) y a la de la app (retos de un
--    miembro). Una base que corrio la rama del PR #75 lo tiene como
--    (id_miembro) y el IF NOT EXISTS de la 015 no lo cambia: aqui se rehace.
--    En una base sin ese indice o que ya lo tiene bien, no hace nada.
--
-- La columna, el CHECK y los dos indices tambien estan en
-- ConsultasDB/Query_Inicial_Crear_Tablas.sql, con los mismos nombres, para que
-- una base creada con ese archivo y otra creada con estas migraciones queden
-- iguales.
--
-- Idempotente: en una base que ya tiene todo no cambia nada. En produccion
-- (ConsultasDB) y en Docker (migraciones; la 014 reconstruye notificacion antes,
-- por orden alfabetico) la tabla notificacion tiene la misma forma, asi que
-- esta migracion hace lo mismo en las dos.
-- ============================================================================

-- --------------------------------------------- 1. notificacion.destinatario
ALTER TABLE notificacion
    ADD COLUMN IF NOT EXISTS destinatario VARCHAR(10) NOT NULL DEFAULT 'GIMNASIO';

DO $$
BEGIN
    -- Mismo nombre que PostgreSQL le da al CHECK en ConsultasDB.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.notificacion'::regclass
                      AND conname = 'notificacion_destinatario_check') THEN
        ALTER TABLE notificacion
            ADD CONSTRAINT notificacion_destinatario_check
            CHECK (destinatario IN ('GIMNASIO', 'MIEMBRO'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notificacion_miembro_destinatario
    ON notificacion (id_miembro, destinatario, leida);

-- ------------------------------------------ 2. idx_reto_miembro_miembro
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public' AND indexname = 'idx_reto_miembro_miembro'
                  AND indexdef NOT LIKE '%(id_miembro, estado)%') THEN
        DROP INDEX public.idx_reto_miembro_miembro;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reto_miembro_miembro ON reto_miembro (id_miembro, estado);
