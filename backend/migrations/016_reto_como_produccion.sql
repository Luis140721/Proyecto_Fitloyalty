-- ============================================================================
-- 016_reto_como_produccion.sql
--
-- RQF-12 (retos de asistencia): el CRUD del administrador y el progreso en el
-- check-in escriben en reto y reto_miembro con las columnas de produccion
-- (ConsultasDB/Query_Inicial_Crear_Tablas.sql). La segmentacion ya existe en
-- las dos bases (reto.segmento_elegible, que en Docker agrego la 009), asi que
-- no hace falta una columna nueva de segmento. Lo que falta en Docker es:
--
--   Docker (002 + 009)                    Produccion (ConsultasDB)
--   reto: sin creado_por                  creado_por (FK a usuario)
--   reto: meta, premio, tipo              (no existen: meta_asistencias, recompensa)
--   reto: nombre VARCHAR(120)             nombre VARCHAR(100)
--   reto: sin CHECK de fechas             CHECK (fecha_fin >= fecha_inicio)
--   reto_miembro: sin fecha_inscripcion   fecha_inscripcion NOT NULL DEFAULT NOW
--   reto_miembro: progreso, completado    (no existen: checkins_acumulados, estado)
--
-- Las columnas viejas de Docker se pasan primero a las de produccion (solo
-- donde estas estan vacias) y despues se quitan: ningun codigo las lee ni las
-- escribe (cliente.js y routes/retos.js usan las de produccion) y en
-- produccion no existen.
--
-- Indices: los de produccion que Docker no tenia (idx_reto_gimnasio e
-- idx_reto_miembro_reto) e idx_reto_miembro_miembro, nuevo: el check-in busca
-- las inscripciones en curso de UN miembro, y el UNIQUE (id_reto, id_miembro)
-- empieza por id_reto. Este ultimo tambien queda en ConsultasDB.
--
-- Lo que no se toca: en Docker las FK de reto y reto_miembro tienen ON DELETE
-- CASCADE y en produccion no, y el orden de las columnas es otro. Cambiar las
-- FK obligaria a tocar el borrado de miembros (routes/miembros.js), que no es
-- de este requisito.
--
-- Idempotente: cada paso mira primero si ya esta hecho. En una base de
-- produccion solo crea el indice.
-- ============================================================================

-- ---------------------------------------------------------------- columnas de produccion
ALTER TABLE reto ADD COLUMN IF NOT EXISTS creado_por INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.reto'::regclass AND contype = 'f'
                      AND conname = 'reto_creado_por_fkey') THEN
        ALTER TABLE reto
            ADD CONSTRAINT reto_creado_por_fkey
            FOREIGN KEY (creado_por) REFERENCES usuario(id_usuario);
    END IF;
END $$;

ALTER TABLE reto_miembro
    ADD COLUMN IF NOT EXISTS fecha_inscripcion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------- columnas viejas de Docker
DO $$
BEGIN
    -- reto.meta -> meta_asistencias (el CHECK de la 009 exige que sea > 0)
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'reto' AND column_name = 'meta') THEN
        UPDATE reto SET meta_asistencias = GREATEST(meta, 1) WHERE meta_asistencias IS NULL;
        ALTER TABLE reto DROP COLUMN meta;
    END IF;

    -- reto.premio -> recompensa
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'reto' AND column_name = 'premio') THEN
        UPDATE reto SET recompensa = LEFT(premio, 200)
         WHERE recompensa IS NULL AND premio IS NOT NULL;
        ALTER TABLE reto DROP COLUMN premio;
    END IF;

    -- reto.tipo: todos los retos son de check-ins; produccion no la tiene.
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'reto' AND column_name = 'tipo') THEN
        ALTER TABLE reto DROP COLUMN tipo;
    END IF;

    -- reto_miembro.progreso -> checkins_acumulados
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'reto_miembro' AND column_name = 'progreso') THEN
        UPDATE reto_miembro SET checkins_acumulados = progreso
         WHERE checkins_acumulados = 0 AND progreso > 0;
        ALTER TABLE reto_miembro DROP COLUMN progreso;
    END IF;

    -- reto_miembro.completado -> estado
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'reto_miembro' AND column_name = 'completado') THEN
        UPDATE reto_miembro SET estado = 'COMPLETADO'
         WHERE completado = TRUE AND estado = 'EN_CURSO';
        ALTER TABLE reto_miembro DROP COLUMN completado;
    END IF;
END $$;

-- Retos de Docker anteriores a la 009: sin segmento (se abren a todos) y con el
-- porcentaje en 0 aunque tuvieran progreso.
UPDATE reto SET segmento_elegible = 'TODOS' WHERE segmento_elegible IS NULL;

UPDATE reto_miembro rm
   SET porcentaje_avance = LEAST(100, ROUND(rm.checkins_acumulados * 100.0 / r.meta_asistencias, 2))
  FROM reto r
 WHERE r.id_reto = rm.id_reto
   AND rm.porcentaje_avance = 0 AND rm.checkins_acumulados > 0 AND r.meta_asistencias > 0;

-- ---------------------------------------------------------------- NOT NULL, longitud y CHECK
DO $$
BEGIN
    -- NOT NULL como en produccion (la 009 lo dejaba pendiente si habia nulos).
    IF NOT EXISTS (SELECT 1 FROM reto WHERE meta_asistencias IS NULL) THEN
        ALTER TABLE reto ALTER COLUMN meta_asistencias SET NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM reto WHERE segmento_elegible IS NULL) THEN
        ALTER TABLE reto ALTER COLUMN segmento_elegible SET NOT NULL;
    END IF;

    -- nombre VARCHAR(100), solo si ningun nombre es mas largo.
    IF (SELECT character_maximum_length FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'reto' AND column_name = 'nombre') > 100
       AND NOT EXISTS (SELECT 1 FROM reto WHERE length(nombre) > 100) THEN
        ALTER TABLE reto ALTER COLUMN nombre TYPE VARCHAR(100);
    END IF;

    -- La fecha de fin no puede ser anterior a la de inicio. PostgreSQL llama
    -- reto_check a este CHECK en ConsultasDB (toca dos columnas); se busca por
    -- su definicion para no repetirlo.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.reto'::regclass AND contype = 'c'
                      AND pg_get_constraintdef(oid) ILIKE '%fecha_fin >= fecha_inicio%')
       AND NOT EXISTS (SELECT 1 FROM reto WHERE fecha_fin < fecha_inicio) THEN
        ALTER TABLE reto ADD CONSTRAINT reto_check CHECK (fecha_fin >= fecha_inicio);
    END IF;
END $$;

-- ---------------------------------------------------------------- indices
-- Los dos primeros son los de ConsultasDB, que Docker no tenia.
CREATE INDEX IF NOT EXISTS idx_reto_gimnasio ON reto (id_gimnasio);
CREATE INDEX IF NOT EXISTS idx_reto_miembro_reto ON reto_miembro (id_reto);
-- El del check-in (tambien en ConsultasDB).
CREATE INDEX IF NOT EXISTS idx_reto_miembro_miembro ON reto_miembro (id_miembro);
