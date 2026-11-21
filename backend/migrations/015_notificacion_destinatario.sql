-- ============================================================================
-- 015_notificacion_destinatario.sql
--
-- Issue #46 y RQF-12: bandeja de mensajes de la app del miembro.
--
-- La tabla notificacion ya tiene id_miembro, pero hoy esa columna tambien se
-- usa en avisos PARA EL ADMINISTRADOR SOBRE un miembro: lib/accesos.js guarda
-- ahi el acceso bloqueado que lee la campana (routes/notificaciones.js). Para
-- poder guardar tambien mensajes PARA EL MIEMBRO (por ejemplo, «¡Completaste el
-- reto!») hace falta saber a quien va cada fila:
--
--   destinatario = 'GIMNASIO'  la ve el personal en la campana del panel
--   destinatario = 'MIEMBRO'   la ve el miembro en la app (GET /api/cliente/mensajes)
--
-- Con el DEFAULT, todas las filas que ya existen y todo el codigo que inserta
-- sin decir el destinatario siguen siendo del gimnasio.
--
-- El indice sirve a la bandeja del miembro: sus mensajes y cuantos no ha leido.
--
-- La columna, el CHECK y el indice tambien estan en
-- ConsultasDB/Query_Inicial_Crear_Tablas.sql, con los mismos nombres y al
-- final de la tabla, para que una base creada con ese archivo y otra creada
-- con estas migraciones queden iguales.
--
-- Idempotente (IF NOT EXISTS y el CHECK solo si no existe): en una base que ya
-- tiene la columna no cambia nada. No depende de la 014: en Docker la 014
-- reconstruye notificacion antes (orden alfabetico) y esta le agrega la
-- columna; en produccion la tabla ya tiene la forma de ConsultasDB.
-- ============================================================================

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
